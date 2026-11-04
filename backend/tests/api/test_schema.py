"""The database itself must refuse double-booking and similar states, whatever the code does."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError, IntegrityError

from app.db.base import Base
from app.models import (
    AuditLog,
    CheckInRecord,
    Payment,
    PromoCode,
    PromotionalCampaign,
    SeatHold,
    User,
)
from app.models.event import EventStatus
from app.models.payment import PaymentKind, PaymentProviderName
from app.models.promo import DiscountType
from app.models.seat_hold import SeatHoldStatus
from app.models.ticket import TicketStatus
from app.services.audit_service import audit
from tests.factories import (
    make_event,
    make_order,
    make_seat,
    make_ticket,
    make_ticket_type,
    make_user,
    unique,
)

SOON = datetime.now(UTC) + timedelta(minutes=10)


async def _insert_fails(db, row) -> None:
    with pytest.raises(IntegrityError):
        async with db.begin_nested():
            db.add(row)
            await db.flush()


async def test_migrations_create_every_model_table(db):
    rows = await db.scalars(text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'"))
    assert set(Base.metadata.tables) <= set(rows)


async def test_defaults_are_applied_on_insert(db):
    event = await make_event(db)
    assert event.status == EventStatus.draft
    assert len(event.share_token) > 16
    ticket_type = await make_ticket_type(db, event)
    assert ticket_type.currency == "KZT"


async def test_email_is_unique_case_insensitively(db):
    await make_user(db, email="Same@Example.com")
    await _insert_fails(
        db, User(email="same@example.com", password_hash="x", full_name="Duplicate")
    )
    found = await db.scalar(select(User).where(User.email == "SAME@example.com"))
    assert found is not None


async def test_a_seat_cannot_have_two_active_holds(db):
    event = await make_event(db)
    seat = await make_seat(db, event)
    hold = SeatHold(event_id=event.id, seat_id=seat.id, session_id="a", expires_at=SOON)
    db.add(hold)
    await db.flush()

    await _insert_fails(
        db, SeatHold(event_id=event.id, seat_id=seat.id, session_id="b", expires_at=SOON)
    )


async def test_a_released_seat_can_be_held_again(db):
    event = await make_event(db)
    seat = await make_seat(db, event)
    db.add(
        SeatHold(
            event_id=event.id,
            seat_id=seat.id,
            session_id="a",
            expires_at=SOON,
            status=SeatHoldStatus.released,
        )
    )
    db.add(SeatHold(event_id=event.id, seat_id=seat.id, session_id="b", expires_at=SOON))
    await db.flush()


async def test_a_hold_needs_an_owner(db):
    event = await make_event(db)
    seat = await make_seat(db, event)
    await _insert_fails(db, SeatHold(event_id=event.id, seat_id=seat.id, expires_at=SOON))


async def test_a_seat_cannot_be_sold_twice_but_can_be_resold_after_a_refund(db):
    event = await make_event(db)
    seat = await make_seat(db, event)
    first = await make_ticket(db, event, seat_id=seat.id)

    with pytest.raises(IntegrityError):
        async with db.begin_nested():
            await make_ticket(db, event, seat_id=seat.id)

    first.status = TicketStatus.refunded
    await db.flush()
    await make_ticket(db, event, seat_id=seat.id)


async def test_general_admission_tickets_do_not_conflict(db):
    event = await make_event(db)
    await make_ticket(db, event)
    await make_ticket(db, event)


async def test_inventory_cannot_be_oversold(db):
    event = await make_event(db)
    ticket_type = await make_ticket_type(db, event, quantity_total=5)

    with pytest.raises(DBAPIError, match="not_oversold"):
        async with db.begin_nested():
            ticket_type.qty_sold = 4
            ticket_type.qty_reserved = 2
            await db.flush()


async def test_a_ticket_has_one_live_check_in(db):
    event = await make_event(db)
    staff = await make_user(db)
    ticket = await make_ticket(db, event)
    values = {"ticket_id": ticket.id, "event_id": event.id, "staff_user_id": staff.id}
    first = CheckInRecord(**values)
    db.add(first)
    await db.flush()

    await _insert_fails(db, CheckInRecord(**values))

    first.reverted_at = datetime.now(UTC)
    await db.flush()
    db.add(CheckInRecord(**values))
    await db.flush()


def _ticket_payment(order_id, provider_ref: str) -> Payment:
    return Payment(
        order_id=order_id,
        kind=PaymentKind.ticket,
        provider=PaymentProviderName.sandbox,
        provider_ref=provider_ref,
        amount=1000,
    )


async def test_a_provider_payment_is_recorded_once(db):
    order = await make_order(db, await make_event(db))
    reference = unique("ref")
    payment = _ticket_payment(order.id, reference)
    db.add(payment)
    await db.flush()
    assert payment.is_simulated is True

    await _insert_fails(db, _ticket_payment(order.id, reference))


async def test_a_payment_needs_a_target(db):
    await _insert_fails(db, _ticket_payment(None, unique("ref")))


async def test_promo_codes_are_case_insensitive_and_redemptions_are_capped(db):
    event = await make_event(db)
    campaign = PromotionalCampaign(
        event_id=event.id,
        name="Launch",
        discount_type=DiscountType.percent,
        discount_value=10,
        valid_from=SOON,
        valid_to=SOON + timedelta(days=1),
        max_redemptions=1,
        applicable_ticket_type_ids=[uuid4()],
        qr_token=unique("qr"),
    )
    db.add(campaign)
    await db.flush()
    db.add(PromoCode(campaign_id=campaign.id, code="SPRING"))
    await db.flush()

    await _insert_fails(db, PromoCode(campaign_id=campaign.id, code="spring"))

    with pytest.raises(DBAPIError, match="not_over_redeemed"):
        async with db.begin_nested():
            campaign.redemptions_count = 2
            await db.flush()


async def test_audit_records_actor_and_context(db):
    actor = await make_user(db)
    event = await make_event(db)

    audit(
        db,
        action_type="event.publish",
        entity_type="event",
        entity_id=event.id,
        description="Published",
        actor=actor,
        event_id=event.id,
        metadata={"from": "draft"},
    )
    await db.flush()

    entry = await db.scalar(select(AuditLog).where(AuditLog.event_id == event.id))
    assert entry.actor_id == actor.id
    assert entry.actor_role == "attendee"
    assert entry.entity_id == str(event.id)
    assert entry.meta == {"from": "draft"}


async def test_audit_without_an_actor_is_a_system_entry(db):
    entry = audit(
        db,
        action_type="hold.expire",
        entity_type="seat_hold",
        entity_id="key",
        description="Expired",
    )
    await db.flush()
    assert entry.actor_id is None
    assert entry.actor_role == "system"
