"""P16: campaigns, server-side discounts, atomic redemption, Campaign QR and reporting."""

import asyncio
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlparse
from uuid import UUID

import pytest
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Event, OrganizerProfile, User, Venue
from app.models.event import EventStatus, EventVisibility, PaidSalesStatus
from app.models.order import Order
from app.models.promo import (
    DiscountType,
    PromoCode,
    PromoRedemption,
    PromoRedemptionStatus,
    PromotionalCampaign,
)
from app.models.user import UserRole
from app.services import promo_service
from app.services.order_service import expire_due_orders
from tests.factories import auth_header, make_event, make_organizer, make_ticket_type, make_user

API = "/api/v1"
NOW = datetime.now(UTC)


@pytest.fixture
async def scene(db):
    owner, profile = await make_organizer(db)
    event = await make_event(
        db,
        profile,
        status=EventStatus.published,
        paid_sales_status=PaidSalesStatus.active,
        capacity=50,
    )
    vip = await make_ticket_type(
        db, event, name="VIP", price_amount=1_000_000, is_free=False, quantity_total=10
    )
    standard = await make_ticket_type(
        db, event, name="Std", price_amount=300_000, is_free=False, quantity_total=10
    )
    buyer = await make_user(db)
    stranger = await make_user(db)
    await db.commit()
    return {
        "event_id": event.id,
        "event": event,
        "vip_id": vip.id,
        "std_id": standard.id,
        "vip": vip,
        "h": {
            "owner": auth_header(owner),
            "buyer": auth_header(buyer),
            "stranger": auth_header(stranger),
        },
    }


def _campaign(**overrides):
    body = {
        "name": "Launch",
        "discount_type": "percent",
        "discount_value": 20,
        "valid_from": (NOW - timedelta(days=1)).isoformat(),
        "valid_to": (NOW + timedelta(days=5)).isoformat(),
        "max_redemptions": 2,
        "ticket_type_ids": [],
    }
    return body | overrides


async def _create(client, s, **overrides) -> dict:
    response = await client.post(
        f"{API}/events/{s['event_id']}/campaigns",
        json=_campaign(**overrides),
        headers=s["h"]["owner"],
    )
    assert response.status_code == 201, response.text
    return response.json()


def _order(s, ticket_type_id, quantity=1, promo=None):
    body = {
        "event_id": str(s["event_id"]),
        "items": [{"ticket_type_id": str(ticket_type_id), "quantity": quantity}],
        "attendees": [
            {"full_name": f"G{i}", "email": f"g{i}@example.com"} for i in range(quantity)
        ],
    }
    if promo is not None:
        body["promo_code"] = promo
    return body


async def test_create_campaign_generates_code_qr_and_requires_access(client, scene):
    s = scene
    created = await _create(client, s, ticket_type_ids=[str(s["vip_id"])])
    assert len(created["code"]) == 8 and created["code"].isupper()
    assert created["redemptions_count"] == 0 and created["is_enabled"] is True
    assert created["ticket_type_ids"] == [str(s["vip_id"])]

    qr = await client.get(f"{API}/campaigns/{created['id']}/qr", headers=s["h"]["owner"])
    assert qr.status_code == 200
    assert qr.headers["content-type"] == "image/png"
    assert qr.content.startswith(b"\x89PNG")

    listed = await client.get(f"{API}/events/{s['event_id']}/campaigns", headers=s["h"]["owner"])
    assert listed.json()["total"] == 1

    for path in (f"/campaigns/{created['id']}", f"/campaigns/{created['id']}/report"):
        assert (await client.get(API + path, headers=s["h"]["stranger"])).status_code == 403
    denied = await client.post(
        f"{API}/events/{s['event_id']}/campaigns", json=_campaign(), headers=s["h"]["buyer"]
    )
    assert denied.status_code == 403


@pytest.mark.parametrize(
    "overrides",
    [
        {"discount_type": "percent", "discount_value": 101},
        {"discount_value": 0},
        {"max_redemptions": 0},
        {"valid_to": (NOW - timedelta(days=2)).isoformat()},
        {"ticket_type_ids": ["00000000-0000-0000-0000-000000000001"]},
    ],
)
async def test_invalid_campaigns_are_rejected(client, scene, overrides):
    response = await client.post(
        f"{API}/events/{scene['event_id']}/campaigns",
        json=_campaign(**overrides),
        headers=scene["h"]["owner"],
    )
    assert response.status_code == 422


async def test_validate_computes_discount_on_server(client, scene):
    s = scene
    percent = await _create(client, s, ticket_type_ids=[str(s["vip_id"])])
    fixed = await _create(client, s, discount_type="fixed", discount_value=500_000)

    async def check(code, ids, event_id=None):
        response = await client.post(
            f"{API}/promo/validate",
            json={
                "event_id": str(event_id or s["event_id"]),
                "code": code,
                "ticket_type_ids": [str(i) for i in ids],
            },
        )
        assert response.status_code == 200, response.text
        return response.json()

    # 20 % of the VIP line only; the standard ticket is not covered.
    vip_and_std = await check(percent["code"].lower(), [s["vip_id"], s["std_id"]])
    assert vip_and_std == {"valid": True, "discount_amount": 200_000, "reason": None}
    assert (await check(percent["code"], [s["std_id"]]))["reason"] == "promo_not_applicable"
    # Fixed discount once per order, capped at the applicable subtotal.
    assert (await check(fixed["code"], [s["std_id"]]))["discount_amount"] == 300_000
    assert (await check(fixed["code"], [s["vip_id"], s["vip_id"]]))["discount_amount"] == 500_000
    assert (await check("NOPE1234", [s["vip_id"]]))["reason"] == "promo_not_found"
    other = await check(percent["code"], [s["vip_id"]], event_id=UUID(int=1))
    assert other["reason"] == "promo_not_found"


async def test_disabled_expired_and_not_started_codes(client, db, scene):
    s = scene
    disabled = await _create(client, s)
    patched = await client.patch(
        f"{API}/campaigns/{disabled['id']}", json={"is_enabled": False}, headers=s["h"]["owner"]
    )
    assert patched.status_code == 200 and patched.json()["is_enabled"] is False
    future = await _create(
        client,
        s,
        valid_from=(NOW + timedelta(days=1)).isoformat(),
        valid_to=(NOW + timedelta(days=2)).isoformat(),
    )
    expired = await _create(client, s)
    row = await db.get(PromotionalCampaign, UUID(expired["id"]))
    row.valid_from, row.valid_to = NOW - timedelta(days=3), NOW - timedelta(days=1)
    await db.commit()

    for campaign, reason in (
        (disabled, "promo_disabled"),
        (future, "promo_not_started"),
        (expired, "promo_expired"),
    ):
        response = await client.post(
            f"{API}/orders",
            json=_order(s, s["vip_id"], promo=campaign["code"]),
            headers=s["h"]["buyer"],
        )
        assert response.status_code == 422, response.text
        assert response.json()["code"] == reason


async def test_checkout_applies_discount_and_exhausts_campaign(client, db, scene):
    s = scene
    campaign = await _create(client, s, max_redemptions=1)
    first = await client.post(
        f"{API}/orders", json=_order(s, s["vip_id"], 2, campaign["code"]), headers=s["h"]["buyer"]
    )
    assert first.status_code == 201, first.text
    order = first.json()
    assert order["subtotal"] == 2_000_000
    assert order["discount_amount"] == 400_000
    assert order["total"] == 1_600_000

    second = await client.post(
        f"{API}/orders", json=_order(s, s["vip_id"], 1, campaign["code"]), headers=s["h"]["buyer"]
    )
    assert second.status_code == 422
    assert second.json()["code"] == "promo_exhausted"
    await db.refresh(s["vip"])
    assert s["vip"].qty_reserved == 2  # the rejected checkout reserved nothing

    lowered = await client.patch(
        f"{API}/campaigns/{campaign['id']}", json={"max_redemptions": 1}, headers=s["h"]["owner"]
    )
    assert lowered.status_code == 200
    too_low = await client.patch(
        f"{API}/campaigns/{campaign['id']}", json={"max_redemptions": 0}, headers=s["h"]["owner"]
    )
    assert too_low.status_code == 422


async def test_full_discount_makes_a_free_confirmed_order(client, scene):
    s = scene
    campaign = await _create(client, s, discount_value=100)
    response = await client.post(
        f"{API}/orders", json=_order(s, s["std_id"], 1, campaign["code"]), headers=s["h"]["buyer"]
    )
    assert response.status_code == 201, response.text
    assert response.json()["status"] == "free_confirmed"
    assert response.json()["total"] == 0
    assert len(response.json()["tickets"]) == 1


async def test_expired_order_releases_the_slot(client, db, scene):
    s = scene
    campaign = await _create(client, s, max_redemptions=1)
    created = await client.post(
        f"{API}/orders", json=_order(s, s["vip_id"], 1, campaign["code"]), headers=s["h"]["buyer"]
    )
    assert created.status_code == 201
    row = await db.get(PromotionalCampaign, UUID(campaign["id"]))
    await db.refresh(row)
    assert row.redemptions_count == 1

    order = await db.get(Order, UUID(created.json()["id"]))
    order.expires_at = NOW - timedelta(minutes=1)
    await db.commit()
    assert await expire_due_orders(db) >= 1
    await db.refresh(row)
    assert row.redemptions_count == 0
    redemption = await db.scalar(
        select(PromoRedemption).where(PromoRedemption.order_id == order.id)
    )
    assert redemption is not None and redemption.status == PromoRedemptionStatus.released

    again = await client.post(
        f"{API}/orders", json=_order(s, s["vip_id"], 1, campaign["code"]), headers=s["h"]["buyer"]
    )
    assert again.status_code == 201, again.text


async def test_report_counts_only_completed_orders(client, db, scene):
    s = scene
    campaign = await _create(client, s, discount_value=100, max_redemptions=5)
    free = await client.post(
        f"{API}/orders", json=_order(s, s["std_id"], 2, campaign["code"]), headers=s["h"]["buyer"]
    )
    assert free.json()["status"] == "free_confirmed"
    # A second, still-pending order would not count; make one with a partial campaign.
    partial = await _create(client, s, discount_value=10, max_redemptions=5)
    pending = await client.post(
        f"{API}/orders", json=_order(s, s["vip_id"], 1, partial["code"]), headers=s["h"]["buyer"]
    )
    assert pending.json()["status"] == "pending"

    report = await client.get(f"{API}/campaigns/{campaign['id']}/report", headers=s["h"]["owner"])
    assert report.status_code == 200
    assert report.json() == {
        "redemptions": 1,
        "orders": 1,
        "tickets_sold": 2,
        "gross_revenue": 600_000,
        "discount": 600_000,
        "net_revenue": 0,
    }
    partial_report = await client.get(
        f"{API}/campaigns/{partial['id']}/report", headers=s["h"]["owner"]
    )
    assert partial_report.json()["redemptions"] == 1
    assert partial_report.json()["orders"] == 0


async def test_campaign_link_redirects_with_code_and_hides_values(client, db, scene):
    s = scene
    campaign = await _create(client, s)
    row = await db.get(PromotionalCampaign, UUID(campaign["id"]))
    link = promo_service.campaign_link(row)
    assert link.endswith(f"/c/{row.qr_token}")
    assert campaign["code"] not in link  # opaque token only: no code, price or discount
    assert promo_service.is_campaign_link(link)
    assert not promo_service.is_campaign_link("BFT1.abc.def")

    response = await client.get(f"/c/{row.qr_token}", follow_redirects=False)
    assert response.status_code == 302
    target = urlparse(response.headers["location"])
    assert target.path == f"/events/{s['event_id']}"
    assert parse_qs(target.query) == {"promo": [campaign["code"]]}

    await client.patch(
        f"{API}/campaigns/{campaign['id']}", json={"is_enabled": False}, headers=s["h"]["owner"]
    )
    disabled = await client.get(f"/c/{row.qr_token}", follow_redirects=False)
    assert parse_qs(urlparse(disabled.headers["location"]).query) == {
        "promo_status": ["promo_disabled"]
    }
    assert (await client.get("/c/unknown-token", follow_redirects=False)).status_code == 404


async def test_campaign_link_for_unlisted_event_carries_share_token(client, db, scene):
    s = scene
    event = s["event"]
    await db.refresh(event)
    event.visibility = EventVisibility.unlisted
    await db.commit()
    campaign = await _create(client, s)
    row = await db.get(PromotionalCampaign, UUID(campaign["id"]))
    response = await client.get(f"/c/{row.qr_token}", follow_redirects=False)
    query = parse_qs(urlparse(response.headers["location"]).query)
    assert query["share"] == [event.share_token]


async def test_concurrent_redemptions_never_exceed_the_limit(engine):
    """N parallel claims on a campaign with k slots: exactly k succeed (real transactions)."""
    async with AsyncSession(engine, expire_on_commit=False) as setup:
        user = User(
            email=f"race-{NOW.timestamp()}@example.com",
            password_hash="x",
            full_name="Race",
            role=UserRole.organizer,
        )
        setup.add(user)
        await setup.flush()
        profile = OrganizerProfile(
            user_id=user.id, organization_name="R", contact_email=user.email, contact_phone="1"
        )
        venue = Venue(name="V", address="A", city="C")
        setup.add_all((profile, venue))
        await setup.flush()
        event = Event(
            organizer_id=profile.id,
            title="Race",
            description="",
            category="other",
            venue_id=venue.id,
            starts_at=NOW + timedelta(days=1),
            ends_at=NOW + timedelta(days=2),
            timezone="Asia/Almaty",
            capacity=10,
            refund_policy={},
        )
        setup.add(event)
        await setup.flush()
        campaign = PromotionalCampaign(
            event_id=event.id,
            name="Race",
            discount_type=DiscountType.percent,
            discount_value=10,
            valid_from=NOW - timedelta(days=1),
            valid_to=NOW + timedelta(days=1),
            max_redemptions=3,
            qr_token=f"race-{event.id.hex}",
        )
        setup.add(campaign)
        await setup.commit()

    async def attempt() -> bool:
        async with AsyncSession(engine) as session:
            won = await promo_service.claim_slot(session, campaign.id, datetime.now(UTC))
            await asyncio.sleep(0.01)  # hold the row lock while the others queue up
            await session.commit()
            return won

    try:
        results = await asyncio.gather(*(attempt() for _ in range(10)))
        assert sum(results) == 3
        async with AsyncSession(engine) as check:
            fresh = await check.get(PromotionalCampaign, campaign.id)
            assert fresh is not None and fresh.redemptions_count == 3
    finally:
        async with AsyncSession(engine) as cleanup:
            await cleanup.execute(delete(PromoCode).where(PromoCode.campaign_id == campaign.id))
            await cleanup.execute(
                delete(PromotionalCampaign).where(PromotionalCampaign.id == campaign.id)
            )
            await cleanup.execute(delete(Event).where(Event.id == event.id))
            await cleanup.execute(delete(Venue).where(Venue.id == venue.id))
            await cleanup.execute(delete(OrganizerProfile).where(OrganizerProfile.id == profile.id))
            await cleanup.execute(delete(User).where(User.id == user.id))
            await cleanup.commit()
