"""P11: admin search, suspension, reports, settings, monitors and CSV export."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.core.money import Money
from app.models import (
    AuditLog,
    EventReport,
    PaidSalesActivation,
    Payment,
    PlatformSetting,
    RefreshToken,
    Refund,
    SupportCase,
)
from app.models.event import EventStatus, PaidSalesStatus
from app.models.payment import ActivationStatus, PaymentKind, PaymentProviderName, PaymentStatus
from app.models.refund import RefundStatus
from app.models.support import SupportAudience, SupportCategory
from app.models.user import UserRole
from app.services.admin_service import csv_safe
from app.services.payments import fees
from app.services.ticket_type_service import _registration_open
from tests.factories import auth_header, make_event, make_order, make_organizer, make_user

PREFIX = "/api/v1"
ADMIN = f"{PREFIX}/admin"

GET_ROUTES = [
    "/users",
    "/events",
    "/orders",
    "/payments",
    "/activations",
    "/refunds",
    "/disputes",
    "/support/cases",
    "/campaigns",
    "/reports",
    "/settings",
    "/exports/orders.csv",
]


async def _admin(db):
    return await make_user(db, role=UserRole.platform_admin)


async def _published_event(db, **overrides):
    return await make_event(db, status=EventStatus.published, **overrides)


async def _actions(db, action_type):
    rows = await db.scalars(select(AuditLog).where(AuditLog.action_type == action_type))
    return list(rows)


# ------------------------------------------------------------------- access control


@pytest.mark.parametrize("route", GET_ROUTES)
async def test_admin_routes_reject_anonymous_and_non_admins(client, db, route):
    organizer, _ = await make_organizer(db)
    attendee = await make_user(db)
    assert (await client.get(ADMIN + route)).status_code == 401
    for user in (attendee, organizer):
        response = await client.get(ADMIN + route, headers=auth_header(user))
        assert response.status_code == 403, route
        assert response.json()["code"] == "insufficient_role"


async def test_admin_mutations_reject_non_admins(client, db):
    attendee = await make_user(db)
    event = await _published_event(db)
    headers = auth_header(attendee)
    body = {"suspended": True, "reason": "x"}
    assert (
        await client.post(f"{ADMIN}/users/{attendee.id}/suspend", json=body, headers=headers)
    ).status_code == 403
    assert (
        await client.post(f"{ADMIN}/events/{event.id}/suspend", json=body, headers=headers)
    ).status_code == 403
    assert (
        await client.patch(
            f"{ADMIN}/settings", json={"settings": {"hold_minutes": 5}}, headers=headers
        )
    ).status_code == 403


# ----------------------------------------------------------------------- search


async def test_user_search_filters_and_paginates(client, db):
    admin = await _admin(db)
    tag = uuid.uuid4().hex[:8]
    for index in range(3):
        await make_user(db, email=f"find-{tag}-{index}@example.com")
    await make_user(db, email=f"other-{tag}@example.com", role=UserRole.organizer)

    response = await client.get(
        f"{ADMIN}/users", params={"q": f"find-{tag}", "limit": 2}, headers=auth_header(admin)
    )
    body = response.json()
    assert response.status_code == 200
    assert body["total"] == 3 and len(body["items"]) == 2
    assert "password_hash" not in body["items"][0]

    response = await client.get(
        f"{ADMIN}/users", params={"q": tag, "role": "organizer"}, headers=auth_header(admin)
    )
    assert [u["email"] for u in response.json()["items"]] == [f"other-{tag}@example.com"]


async def test_event_order_payment_search(client, db):
    admin = await _admin(db)
    event = await _published_event(db, title=f"Needle {uuid.uuid4().hex[:6]}")
    order = await make_order(db, event, buyer_email="needle-buyer@example.com")
    payment = Payment(
        order_id=order.id,
        kind=PaymentKind.ticket,
        provider=PaymentProviderName.sandbox,
        provider_ref="needle-ref-1",
        status=PaymentStatus.succeeded,
        amount=1000,
    )
    db.add(payment)
    await db.flush()
    headers = auth_header(admin)

    found = await client.get(f"{ADMIN}/events", params={"q": event.title}, headers=headers)
    assert [e["id"] for e in found.json()["items"]] == [str(event.id)]
    found = await client.get(f"{ADMIN}/orders", params={"q": "needle-buyer"}, headers=headers)
    assert [o["id"] for o in found.json()["items"]] == [str(order.id)]
    found = await client.get(f"{ADMIN}/payments", params={"q": "needle-ref"}, headers=headers)
    assert [p["id"] for p in found.json()["items"]] == [str(payment.id)]
    found = await client.get(
        f"{ADMIN}/payments", params={"q": "needle-ref", "status": "failed"}, headers=headers
    )
    assert found.json()["total"] == 0


# ------------------------------------------------------------- user suspension


async def test_suspending_a_user_blocks_access_and_revokes_sessions(client, db):
    admin = await _admin(db)
    user = await make_user(db)
    token = RefreshToken(
        user_id=user.id,
        token_hash=uuid.uuid4().hex,
        expires_at=datetime.now(UTC) + timedelta(days=1),
    )
    db.add(token)
    await db.flush()

    response = await client.post(
        f"{ADMIN}/users/{user.id}/suspend",
        json={"suspended": True, "reason": "fraud"},
        headers=auth_header(admin),
    )
    assert response.status_code == 200 and response.json()["is_suspended"] is True
    await db.refresh(token)  # the revoke is a bulk UPDATE; reload the row
    assert token.revoked_at is not None
    blocked = await client.get(f"{PREFIX}/me", headers=auth_header(user))
    assert blocked.status_code == 403 and blocked.json()["code"] == "account_suspended"
    assert len(await _actions(db, "user.suspended")) == 1

    response = await client.post(
        f"{ADMIN}/users/{user.id}/suspend",
        json={"suspended": False, "reason": "appeal accepted"},
        headers=auth_header(admin),
    )
    assert response.json()["is_suspended"] is False
    assert (await client.get(f"{PREFIX}/me", headers=auth_header(user))).status_code == 200
    assert len(await _actions(db, "user.resumed")) == 1


async def test_admin_cannot_suspend_self_or_another_admin(client, db):
    admin, other = await _admin(db), await _admin(db)
    for target in (admin, other):
        response = await client.post(
            f"{ADMIN}/users/{target.id}/suspend",
            json={"suspended": True, "reason": "x"},
            headers=auth_header(admin),
        )
        assert response.status_code == 409
    response = await client.post(
        f"{ADMIN}/users/{uuid.uuid4()}/suspend",
        json={"suspended": True, "reason": "x"},
        headers=auth_header(admin),
    )
    assert response.status_code == 404


async def test_suspension_requires_a_reason(client, db):
    admin, user = await _admin(db), await make_user(db)
    response = await client.post(
        f"{ADMIN}/users/{user.id}/suspend",
        json={"suspended": True, "reason": ""},
        headers=auth_header(admin),
    )
    assert response.status_code == 422


# ------------------------------------------------------------ event suspension


async def test_suspending_an_event_hides_it_and_stops_sales(client, db):
    admin = await _admin(db)
    _, profile = await make_organizer(db)
    event = await make_event(
        db, profile, status=EventStatus.published, paid_sales_status=PaidSalesStatus.active
    )
    activation = PaidSalesActivation(event_id=event.id, status=ActivationStatus.active)
    db.add(activation)
    await db.flush()
    assert (await client.get(f"{PREFIX}/events/{event.id}")).status_code == 200

    response = await client.post(
        f"{ADMIN}/events/{event.id}/suspend",
        json={"suspended": True, "reason": "reported"},
        headers=auth_header(admin),
    )
    assert response.status_code == 200
    assert response.json()["status"] == "suspended"
    assert event.paid_sales_status == PaidSalesStatus.suspended
    assert activation.status == ActivationStatus.suspended
    assert (await client.get(f"{PREFIX}/events/{event.id}")).status_code == 404
    assert not _registration_open(event, datetime.now(UTC))
    assert len(await _actions(db, "event.suspended")) == 1

    response = await client.post(
        f"{ADMIN}/events/{event.id}/suspend",
        json={"suspended": False, "reason": "cleared"},
        headers=auth_header(admin),
    )
    assert response.status_code == 200 and response.json()["status"] == "published"
    assert (await client.get(f"{PREFIX}/events/{event.id}")).status_code == 200
    assert len(await _actions(db, "event.resumed")) == 1


async def test_only_published_events_can_be_suspended(client, db):
    admin = await _admin(db)
    draft = await make_event(db)
    published = await _published_event(db)
    headers = auth_header(admin)
    body = {"suspended": True, "reason": "x"}
    assert (
        await client.post(f"{ADMIN}/events/{draft.id}/suspend", json=body, headers=headers)
    ).status_code == 409
    lift = {"suspended": False, "reason": "x"}
    assert (
        await client.post(f"{ADMIN}/events/{published.id}/suspend", json=lift, headers=headers)
    ).status_code == 409


async def test_paid_sales_can_be_suspended_on_their_own(client, db):
    admin = await _admin(db)
    event = await make_event(
        db, status=EventStatus.published, paid_sales_status=PaidSalesStatus.active
    )
    activation = PaidSalesActivation(event_id=event.id, status=ActivationStatus.active)
    db.add(activation)
    await db.flush()

    response = await client.post(
        f"{ADMIN}/events/{event.id}/paid-sales/suspend",
        json={"suspended": True, "reason": "chargebacks"},
        headers=auth_header(admin),
    )
    assert response.status_code == 200
    assert event.status == EventStatus.published
    assert event.paid_sales_status == PaidSalesStatus.suspended
    assert activation.status == ActivationStatus.suspended
    assert activation.suspended_reason == "chargebacks"

    again = await client.post(
        f"{ADMIN}/events/{event.id}/paid-sales/suspend",
        json={"suspended": True, "reason": "twice"},
        headers=auth_header(admin),
    )
    assert again.status_code == 409


# --------------------------------------------------------------------- reports


async def test_event_reports_are_created_and_reviewed(client, db):
    admin, reporter = await _admin(db), await make_user(db)
    event = await _published_event(db)

    response = await client.post(
        f"{PREFIX}/events/{event.id}/reports",
        json={"reason": "Looks like a scam"},
        headers=auth_header(reporter),
    )
    assert response.status_code == 201
    report_id = response.json()["id"]
    assert response.json()["status"] == "open"
    assert (
        await client.post(f"{PREFIX}/events/{event.id}/reports", json={"reason": "x"})
    ).status_code == 401

    listed = await client.get(
        f"{ADMIN}/reports", params={"status": "open"}, headers=auth_header(admin)
    )
    assert report_id in [r["id"] for r in listed.json()["items"]]

    reviewed = await client.patch(
        f"{ADMIN}/reports/{report_id}",
        json={"status": "actioned"},
        headers=auth_header(admin),
    )
    assert reviewed.status_code == 200 and reviewed.json()["status"] == "actioned"
    assert len(await _actions(db, "event_report.actioned")) == 1
    assert (
        await client.patch(
            f"{ADMIN}/reports/{uuid.uuid4()}",
            json={"status": "dismissed"},
            headers=auth_header(admin),
        )
    ).status_code == 404


async def test_draft_events_cannot_be_reported(client, db):
    reporter = await make_user(db)
    draft = await make_event(db)
    response = await client.post(
        f"{PREFIX}/events/{draft.id}/reports", json={"reason": "x"}, headers=auth_header(reporter)
    )
    assert response.status_code == 404
    assert await db.scalar(select(EventReport).where(EventReport.event_id == draft.id)) is None


# -------------------------------------------------------------------- settings


async def test_settings_defaults_update_and_flow_through(client, db):
    admin = await _admin(db)
    headers = auth_header(admin)

    defaults = (await client.get(f"{ADMIN}/settings", headers=headers)).json()["settings"]
    assert defaults["hold_minutes"] == 10
    assert set(defaults) == {
        "activation_fee_amount",
        "processing_fee_percent",
        "payout_delay_days",
        "hold_minutes",
    }

    response = await client.patch(
        f"{ADMIN}/settings",
        json={
            "settings": {"hold_minutes": 25, "processing_fee_percent": 5, "payout_delay_days": 7}
        },
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["settings"]["hold_minutes"] == 25
    assert await fees.hold_duration(db) == timedelta(minutes=25)
    assert (await fees.processing_fee(db, Money(10_000))).amount == 500
    assert await fees.payout_delay_days(db) == 7
    row = await db.get(PlatformSetting, "hold_minutes")
    assert row.updated_by == admin.id
    audit_rows = await _actions(db, "settings.updated")
    assert audit_rows[0].meta["after"]["hold_minutes"] == 25


@pytest.mark.parametrize(
    "settings",
    [
        {"hold_minutes": 0},
        {"hold_minutes": "10"},
        {"hold_minutes": True},
        {"processing_fee_percent": 101},
        {"processing_fee_percent": -1},
        {"activation_fee_amount": 0},
        {"payout_delay_days": -1},
        {"made_up": 1},
    ],
)
async def test_invalid_settings_are_rejected_without_saving(client, db, settings):
    admin = await _admin(db)
    response = await client.patch(
        f"{ADMIN}/settings", json={"settings": settings}, headers=auth_header(admin)
    )
    assert response.status_code == 422
    assert response.json()["code"] in {"invalid_setting", "unknown_setting"}
    assert await db.scalar(select(PlatformSetting)) is None


async def test_one_bad_value_saves_nothing(client, db):
    admin = await _admin(db)
    response = await client.patch(
        f"{ADMIN}/settings",
        json={"settings": {"hold_minutes": 30, "payout_delay_days": -5}},
        headers=auth_header(admin),
    )
    assert response.status_code == 422
    assert await db.get(PlatformSetting, "hold_minutes") is None


# -------------------------------------------------------------------- monitors


async def test_monitors_list_refunds_failures_disputes_and_escalations(client, db):
    admin = await _admin(db)
    organizer, _ = await make_organizer(db)
    event = await _published_event(db)
    order = await make_order(db, event)
    failed_payment = Payment(
        order_id=order.id,
        kind=PaymentKind.ticket,
        provider=PaymentProviderName.sandbox,
        provider_ref=f"fail-{uuid.uuid4().hex[:8]}",
        status=PaymentStatus.failed,
        amount=5000,
        failure_reason="card_declined",
    )
    db.add(failed_payment)
    await db.flush()
    refund = Refund(
        order_id=order.id,
        payment_id=failed_payment.id,
        amount=5000,
        reason="requested",
        initiated_by=admin.id,
        status=RefundStatus.failed,
    )
    attendee_case = SupportCase(
        requester_id=(await make_user(db)).id,
        audience=SupportAudience.attendee_case,
        category=SupportCategory.refund,
        subject="Where is my refund",
    )
    organizer_case = SupportCase(
        requester_id=organizer.id,
        audience=SupportAudience.organizer_case,
        category=SupportCategory.technical,
        subject="Cannot publish",
    )
    db.add_all([refund, attendee_case, organizer_case])
    await db.flush()
    headers = auth_header(admin)

    failures = await client.get(f"{ADMIN}/payments", params={"status": "failed"}, headers=headers)
    assert [p["id"] for p in failures.json()["items"]] == [str(failed_payment.id)]
    assert failures.json()["items"][0]["failure_reason"] == "card_declined"

    refunds = await client.get(f"{ADMIN}/refunds", params={"status": "failed"}, headers=headers)
    assert [r["id"] for r in refunds.json()["items"]] == [str(refund.id)]
    none = await client.get(f"{ADMIN}/refunds", params={"status": "pending"}, headers=headers)
    assert none.json()["total"] == 0

    disputes = (await client.get(f"{ADMIN}/disputes", headers=headers)).json()
    assert [r["id"] for r in disputes["failed_refunds"]] == [str(refund.id)]
    assert [c["id"] for c in disputes["payment_cases"]] == [str(attendee_case.id)]

    escalated = await client.get(f"{ADMIN}/support/cases", headers=headers)
    assert [c["id"] for c in escalated.json()["items"]] == [str(organizer_case.id)]


async def test_activations_listing_filters_by_status(client, db):
    admin = await _admin(db)
    event = await _published_event(db)
    db.add(PaidSalesActivation(event_id=event.id, status=ActivationStatus.suspended))
    await db.flush()
    headers = auth_header(admin)
    suspended = await client.get(
        f"{ADMIN}/activations", params={"status": "suspended"}, headers=headers
    )
    assert [a["event_id"] for a in suspended.json()["items"]] == [str(event.id)]
    assert (
        await client.get(f"{ADMIN}/activations", params={"status": "bogus"}, headers=headers)
    ).status_code == 422


# ------------------------------------------------------------------------- CSV


async def test_csv_export_escapes_formulas(client, db):
    admin = await _admin(db)
    await make_user(db, email="csv-victim@example.com", full_name='=HYPERLINK("http://evil")')
    response = await client.get(f"{ADMIN}/exports/users.csv", headers=auth_header(admin))
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert 'filename="users.csv"' in response.headers["content-disposition"]
    lines = response.text.splitlines()
    assert lines[0] == "id,email,full_name,role,is_suspended,created_at"
    victim = next(line for line in lines if "csv-victim@example.com" in line)
    assert "'=HYPERLINK" in victim
    assert ",=HYPERLINK" not in victim


async def test_unknown_csv_kind_is_404(client, db):
    admin = await _admin(db)
    response = await client.get(f"{ADMIN}/exports/secrets.csv", headers=auth_header(admin))
    assert response.status_code == 404


def test_csv_safe_defuses_formula_prefixes():
    for value in ("=1+1", "+1", "-1", "@SUM(A1)", "\tx", "\rx"):
        assert csv_safe(value).startswith("'")
    assert csv_safe("plain") == "plain"
    assert csv_safe(None) == ""
    assert csv_safe(42) == "42"
