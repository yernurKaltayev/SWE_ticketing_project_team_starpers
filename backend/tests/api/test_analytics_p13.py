"""P13: organizer analytics from authoritative rows."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select

from app.models import Attendee, CheckInRecord, Order, OrderItem, Refund, Ticket
from app.models.order import OrderStatus
from app.models.promo import (
    DiscountType,
    PromoCode,
    PromoRedemption,
    PromoRedemptionStatus,
    PromotionalCampaign,
)
from app.models.refund import RefundStatus
from app.models.ticket import TicketStatus
from app.models.user import StaffRole, UserRole
from app.services.analytics_service import percent, share
from tests.factories import (
    auth_header,
    make_event,
    make_order,
    make_organizer,
    make_staff,
    make_ticket_type,
    make_user,
    unique,
)

API = "/api/v1"
NOW = datetime.now(UTC)


def _url(event) -> str:
    return f"{API}/events/{event.id}/analytics"


async def _sale(
    db,
    event,
    ticket_type,
    *,
    qty=1,
    price=100_000,
    discount=0,
    status=OrderStatus.paid,
    created_at=None,
    ticket_status=TicketStatus.valid,
):
    """One order with one line of `qty` tickets of `ticket_type`."""
    subtotal = price * qty
    order = await make_order(
        db,
        event,
        status=status,
        subtotal=subtotal,
        discount_amount=discount,
        total=subtotal - discount,
        **({"created_at": created_at} if created_at else {}),
    )
    item = OrderItem(
        order_id=order.id,
        ticket_type_id=ticket_type.id,
        unit_price=price,
        quantity=qty,
        line_total=subtotal,
    )
    db.add(item)
    await db.flush()
    attendee = Attendee(order_id=order.id, full_name="Guest", email="g@example.com")
    db.add(attendee)
    await db.flush()
    tickets = []
    for _ in range(qty):
        ticket = Ticket(
            ticket_number=unique("TKT"),
            order_item_id=item.id,
            event_id=event.id,
            ticket_type_id=ticket_type.id,
            attendee_id=attendee.id,
            qr_token=unique("qr"),
            status=ticket_status,
        )
        db.add(ticket)
        tickets.append(ticket)
    await db.flush()
    return order, tickets


@pytest.fixture
async def scene(db):
    owner, profile = await make_organizer(db)
    event = await make_event(db, profile, capacity=100)
    vip = await make_ticket_type(db, event, name="VIP", price_amount=100_000, quantity_total=20)
    std = await make_ticket_type(db, event, name="Standard", price_amount=50_000, quantity_total=50)
    return {"owner": owner, "event": event, "vip": vip, "std": std}


# ---------------------------------------------------------------------- access


async def test_requires_sign_in(client, scene):
    assert (await client.get(_url(scene["event"]))).status_code == 401


async def test_access_rules(client, db, scene):
    event = scene["event"]
    admin = await make_user(db, role=UserRole.platform_admin)
    manager = await make_staff(db, event, StaffRole.manager)
    for allowed in (scene["owner"], manager, admin):
        assert (await client.get(_url(event), headers=auth_header(allowed))).status_code == 200
    other_owner, _ = await make_organizer(db)
    for denied in (
        await make_user(db),
        other_owner,
        await make_staff(db, event, StaffRole.checkin),
        await make_staff(db, event, StaffRole.support),
    ):
        response = await client.get(_url(event), headers=auth_header(denied))
        assert response.status_code == 403
        assert response.json()["code"] == "event_access_denied"


async def test_unknown_event_is_404(client, db):
    admin = await make_user(db, role=UserRole.platform_admin)
    response = await client.get(
        f"{API}/events/{uuid.uuid4()}/analytics", headers=auth_header(admin)
    )
    assert response.status_code == 404


# ----------------------------------------------------------------------- totals


async def test_empty_event_is_all_zeros(client, scene):
    body = (await client.get(_url(scene["event"]), headers=auth_header(scene["owner"]))).json()
    assert body["capacity"] == 100 and body["sold"] == 0 and body["remaining"] == 100
    assert body["percent_sold"] == 0.0 and body["checkin_percent"] == 0.0
    assert (body["gross"], body["discounts"], body["refunds"], body["net"]) == (0, 0, 0, 0)
    assert body["sales_over_time"] == [] and body["campaigns"] == []
    assert [r["sold"] for r in body["by_ticket_type"]] == [0, 0]


async def test_mixed_scene_totals(client, db, scene):
    event, vip, std = scene["event"], scene["vip"], scene["std"]
    vip.qty_reserved = 3  # a checkout in progress holds inventory
    await _sale(db, event, vip, qty=2, price=100_000, discount=20_000)  # paid
    await _sale(db, event, std, qty=1, price=0, status=OrderStatus.free_confirmed)
    refunded, _ = await _sale(
        db,
        event,
        std,
        qty=1,
        price=50_000,
        status=OrderStatus.refunded,
        ticket_status=TicketStatus.refunded,
    )
    db.add(
        Refund(
            order_id=refunded.id,
            payment_id=(await _payment(db, refunded)).id,
            amount=50_000,
            reason="r",
            initiated_by=scene["owner"].id,
            status=RefundStatus.completed,
        )
    )
    for status in (
        OrderStatus.pending,
        OrderStatus.cancelled,
        OrderStatus.expired,
        OrderStatus.failed,
    ):
        await _sale(db, event, std, qty=5, status=status, ticket_status=TicketStatus.cancelled)
    await db.flush()

    body = (await client.get(_url(event), headers=auth_header(scene["owner"]))).json()
    assert body["sold"] == 3  # 2 VIP + 1 free standard; refunded/cancelled tickets excluded
    assert body["remaining"] == 100 - 3 - 3
    assert body["percent_sold"] == 3.0
    assert body["gross"] == 200_000 + 0 + 50_000
    assert body["discounts"] == 20_000
    assert body["refunds"] == 50_000
    assert body["net"] == 250_000 - 20_000 - 50_000
    by_type = {r["name"]: r for r in body["by_ticket_type"]}
    assert by_type["VIP"]["sold"] == 2 and by_type["VIP"]["revenue"] == 180_000
    assert by_type["Standard"]["sold"] == 1


async def _payment(db, order):
    from app.models.payment import Payment, PaymentKind, PaymentProviderName, PaymentStatus

    payment = Payment(
        order_id=order.id,
        kind=PaymentKind.ticket,
        provider=PaymentProviderName.sandbox,
        provider_ref=unique("ref"),
        status=PaymentStatus.succeeded,
        amount=order.total,
    )
    db.add(payment)
    await db.flush()
    return payment


async def test_ticket_type_filter_splits_order_level_amounts(client, db, scene):
    event, vip, std = scene["event"], scene["vip"], scene["std"]
    order = await make_order(
        db, event, status=OrderStatus.paid, subtotal=150_000, discount_amount=15_000, total=135_000
    )
    for tt, price in ((vip, 100_000), (std, 50_000)):
        db.add(
            OrderItem(
                order_id=order.id,
                ticket_type_id=tt.id,
                unit_price=price,
                quantity=1,
                line_total=price,
            )
        )
    await db.flush()
    headers = auth_header(scene["owner"])
    full = (await client.get(_url(event), headers=headers)).json()
    only_vip = (
        await client.get(_url(event), params={"ticket_type_id": str(vip.id)}, headers=headers)
    ).json()
    only_std = (
        await client.get(_url(event), params={"ticket_type_id": str(std.id)}, headers=headers)
    ).json()
    assert (only_vip["gross"], only_vip["discounts"]) == (100_000, 10_000)
    assert (only_std["gross"], only_std["discounts"]) == (50_000, 5_000)
    assert only_vip["gross"] + only_std["gross"] == full["gross"]
    assert only_vip["discounts"] + only_std["discounts"] == full["discounts"]
    assert only_vip["capacity"] == vip.quantity_total
    assert [r["name"] for r in only_vip["by_ticket_type"]] == ["VIP"]


async def test_foreign_ticket_type_is_404(client, db, scene):
    other = await make_event(db)
    foreign = await make_ticket_type(db, other)
    response = await client.get(
        _url(scene["event"]),
        params={"ticket_type_id": str(foreign.id)},
        headers=auth_header(scene["owner"]),
    )
    assert response.status_code == 404
    assert response.json()["code"] == "ticket_type_not_found"


# ----------------------------------------------------------------- time series


async def test_days_use_the_event_timezone_and_zero_fill(client, db, scene):
    event, std = scene["event"], scene["std"]  # Asia/Almaty, UTC+5
    base = datetime(2026, 3, 10, 20, 0, tzinfo=UTC)  # 01:00 on the 11th in Almaty
    await _sale(db, event, std, qty=1, price=50_000, created_at=base)
    await _sale(db, event, std, qty=2, price=50_000, created_at=base + timedelta(days=2))
    body = (
        await client.get(
            _url(event),
            params={
                "date_from": (base - timedelta(days=1)).isoformat(),
                "date_to": (base + timedelta(days=3)).isoformat(),
            },
            headers=auth_header(scene["owner"]),
        )
    ).json()
    points = {p["date"]: p for p in body["sales_over_time"]}
    assert points["2026-03-11"]["tickets"] == 1 and points["2026-03-11"]["revenue"] == 50_000
    assert "2026-03-10" in points and points["2026-03-10"]["tickets"] == 0
    assert points["2026-03-12"]["tickets"] == 0
    assert points["2026-03-13"]["tickets"] == 2
    dates = [p["date"] for p in body["sales_over_time"]]
    assert dates == sorted(dates) and len(dates) == len(set(dates))


async def test_date_range_is_inclusive_start_exclusive_end(client, db, scene):
    event, std = scene["event"], scene["std"]
    start = datetime(2026, 5, 1, 6, 0, tzinfo=UTC)
    for hours in (0, 1, 2):
        await _sale(db, event, std, qty=1, price=10_000, created_at=start + timedelta(hours=hours))
    body = (
        await client.get(
            _url(event),
            params={
                "date_from": start.isoformat(),
                "date_to": (start + timedelta(hours=2)).isoformat(),
            },
            headers=auth_header(scene["owner"]),
        )
    ).json()
    assert body["gross"] == 20_000
    assert sum(p["tickets"] for p in body["sales_over_time"]) == 2


async def test_reversed_range_is_422(client, scene):
    response = await client.get(
        _url(scene["event"]),
        params={
            "date_from": NOW.isoformat(),
            "date_to": (NOW - timedelta(days=1)).isoformat(),
        },
        headers=auth_header(scene["owner"]),
    )
    assert response.status_code == 422 and response.json()["code"] == "invalid_date_range"


# -------------------------------------------------------------------- campaigns


async def test_campaigns_count_only_completed_applied_redemptions(client, db, scene):
    event, std = scene["event"], scene["std"]
    campaign = PromotionalCampaign(
        event_id=event.id,
        name="Early bird",
        discount_type=DiscountType.fixed,
        discount_value=10_000,
        valid_from=NOW - timedelta(days=1),
        valid_to=NOW + timedelta(days=1),
        max_redemptions=10,
        redemptions_count=3,
        qr_token=unique("qr"),
    )
    db.add(campaign)
    await db.flush()
    code = PromoCode(campaign_id=campaign.id, code=unique("CODE"))
    db.add(code)
    await db.flush()

    async def redeem(status, order_status, red_status=PromoRedemptionStatus.applied):
        order, _ = await _sale(
            db, event, std, qty=1, price=50_000, discount=10_000, status=order_status
        )
        db.add(
            PromoRedemption(
                promo_code_id=code.id,
                campaign_id=campaign.id,
                order_id=order.id,
                discount_amount=10_000,
                status=red_status,
            )
        )

    await redeem(None, OrderStatus.paid)
    await redeem(None, OrderStatus.pending)  # slot taken, not a sale yet
    await redeem(None, OrderStatus.expired, PromoRedemptionStatus.released)
    await db.flush()
    body = (await client.get(_url(event), headers=auth_header(scene["owner"]))).json()
    assert body["campaigns"] == [
        {
            "campaign_id": str(campaign.id),
            "name": "Early bird",
            "redemptions": 1,
            "revenue": 40_000,
        }
    ]


# --------------------------------------------------------------------- check-in


async def test_checkin_numbers(client, db, scene):
    event, std = scene["event"], scene["std"]
    _, tickets = await _sale(db, event, std, qty=4, price=50_000)
    staff = await make_staff(db, event, StaffRole.checkin)
    tickets[0].status = TicketStatus.checked_in
    tickets[1].status = TicketStatus.checked_in
    db.add(CheckInRecord(ticket_id=tickets[0].id, event_id=event.id, staff_user_id=staff.id))
    await db.flush()
    body = (await client.get(_url(event), headers=auth_header(scene["owner"]))).json()
    assert (body["sold"], body["checked_in"], body["absent"]) == (4, 2, 2)
    assert body["checkin_percent"] == 50.0

    tickets[1].status = TicketStatus.valid  # check-in reverted
    await db.flush()
    body = (await client.get(_url(event), headers=auth_header(scene["owner"]))).json()
    assert (body["checked_in"], body["absent"]) == (1, 3)


# ------------------------------------------------------------------- invariants


async def test_endpoint_does_not_write(client, db, scene):
    event, std = scene["event"], scene["std"]
    await _sale(db, event, std, qty=2)
    counts = {
        model: await db.scalar(select(func.count()).select_from(model))
        for model in (Order, OrderItem, Ticket, Refund, CheckInRecord)
    }
    stamp = await db.scalar(select(func.max(Order.updated_at)))
    await client.get(_url(event), headers=auth_header(scene["owner"]))
    after = {model: await db.scalar(select(func.count()).select_from(model)) for model in counts}
    assert after == counts
    assert await db.scalar(select(func.max(Order.updated_at))) == stamp


async def test_financials_match_the_payout_summary(client, db, scene):
    from app.services.payments.payout import _totals

    event, std = scene["event"], scene["std"]
    order, _ = await _sale(db, event, std, qty=2, price=50_000)
    await _payment(db, order)
    gross_paid, _, refunds = await _totals(db, event.id)
    body = (await client.get(_url(event), headers=auth_header(scene["owner"]))).json()
    assert body["gross"] == gross_paid and body["refunds"] == refunds


# ------------------------------------------------------------------------ units


@pytest.mark.parametrize(
    ("amount", "part", "whole", "expected"),
    [
        (15_000, 100_000, 150_000, 10_000),
        (15_000, 50_000, 150_000, 5_000),
        (1, 1, 2, 1),
        (1, 1, 3, 0),
        (100, 0, 100, 0),
        (100, 50, 0, 0),
    ],
)
def test_share_rounds_half_up(amount, part, whole, expected):
    assert share(amount, part, whole) == expected


def test_percent():
    assert percent(1, 3) == 33.3
    assert percent(5, 0) == 0.0
