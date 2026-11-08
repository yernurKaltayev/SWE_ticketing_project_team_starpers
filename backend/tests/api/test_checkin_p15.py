"""P15: QR verification, atomic single-use check-in, Campaign QR rejection, undo and stats."""

import asyncio
import uuid

import pytest
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Attendee,
    AuditLog,
    CheckInRecord,
    Event,
    Order,
    OrderItem,
    OrganizerProfile,
    StaffAssignment,
    Ticket,
    TicketType,
    User,
    Venue,
)
from app.models.checkin import CheckInResult
from app.models.ticket import TicketStatus
from app.models.user import StaffRole
from app.schemas.checkin import VerifyIn
from app.services import checkin_service
from app.services.ticket_qr import encode_qr_payload
from tests.factories import auth_header, make_event, make_organizer, make_staff, make_ticket

API = "/api/v1"


async def _sold_ticket(db, event, **overrides) -> Ticket:
    ticket = await make_ticket(db, event, **overrides)
    ticket_type = await db.get(TicketType, ticket.ticket_type_id)
    ticket_type.qty_sold = 1
    await db.flush()
    return ticket


@pytest.fixture
async def scene(db):
    owner, profile = await make_organizer(db)
    event = await make_event(db, profile)
    other_event = await make_event(db, profile)
    ticket = await _sold_ticket(db, event)
    scanner = await make_staff(db, event, StaffRole.checkin)
    support = await make_staff(db, event, StaffRole.support)
    other_scanner = await make_staff(db, other_event, StaffRole.checkin)
    await db.commit()
    return {
        "event_id": event.id,
        "event": event,
        "other_event_id": other_event.id,
        "other_event": other_event,
        "ticket_id": ticket.id,
        "ticket": ticket,
        "payload": encode_qr_payload(ticket.id),
        "h": {
            "owner": auth_header(owner),
            "scanner": auth_header(scanner),
            "support": auth_header(support),
            "other_scanner": auth_header(other_scanner),
        },
    }


async def _scan(client, s, payload=None, event_id=None, who="scanner"):
    response = await client.post(
        f"{API}/checkin/verify",
        json={"event_id": str(event_id or s["event_id"]), "qr_payload": payload or s["payload"]},
        headers=s["h"][who],
    )
    assert response.status_code == 200, response.text
    return response.json()


async def test_ticket_checks_in_once_then_is_rejected(client, db, scene):
    s = scene
    first = await _scan(client, s)
    assert first["result"] == "accepted"
    assert first["ticket"]["id"] == str(s["ticket_id"])
    assert first["ticket"]["status"] == "checked_in"

    second = await _scan(client, s, who="owner")
    assert second["result"] == "already_used"
    assert "already" in second["message"]

    records = list(
        await db.scalars(select(CheckInRecord).where(CheckInRecord.ticket_id == s["ticket_id"]))
    )
    assert len(records) == 1 and records[0].result == CheckInResult.accepted
    ticket_type = await db.get(TicketType, s["ticket"].ticket_type_id)
    await db.refresh(ticket_type)
    assert ticket_type.qty_checked_in == 1


async def test_campaign_qr_and_garbage_are_not_tickets(client, scene):
    s = scene
    campaign = await _scan(client, s, payload="https://api.example.com/c/AbCdEf123")
    assert campaign["result"] == "not_a_ticket" and campaign["ticket"] is None
    assert (await _scan(client, s, payload="hello"))["result"] == "not_a_ticket"


async def test_forged_and_unknown_ticket_payloads_are_invalid(client, scene):
    s = scene
    prefix, ticket_hex, signature = s["payload"].split(".")
    forged = f"{prefix}.{ticket_hex}.{'0' * len(signature)}"
    assert (await _scan(client, s, payload=forged))["result"] == "invalid"
    unknown = encode_qr_payload(uuid.uuid4())
    assert (await _scan(client, s, payload=unknown))["result"] == "invalid"
    assert (await _scan(client, s, payload=f"{prefix}.garbage"))["result"] == "invalid"


async def test_wrong_event_reveals_no_ticket(client, db, scene):
    s = scene
    result = await _scan(client, s, event_id=s["other_event_id"], who="other_scanner")
    assert result["result"] == "wrong_event" and result["ticket"] is None
    ticket = await db.get(Ticket, s["ticket_id"])
    await db.refresh(ticket)
    assert ticket.status == TicketStatus.valid


async def test_refunded_and_cancelled_tickets_are_rejected(client, db, scene):
    s = scene
    refunded = await _sold_ticket(db, s["event"], status=TicketStatus.refunded)
    cancelled = await _sold_ticket(db, s["event"], status=TicketStatus.cancelled)
    await db.commit()
    result = await _scan(client, s, payload=encode_qr_payload(refunded.id))
    assert result["result"] == "refunded"
    result = await _scan(client, s, payload=encode_qr_payload(cancelled.id))
    assert result["result"] == "invalid" and "cancelled" in result["message"]


async def test_only_checkin_staff_owner_or_admin_may_scan(client, scene):
    s = scene
    for who in ("support", "other_scanner"):
        response = await client.post(
            f"{API}/checkin/verify",
            json={"event_id": str(s["event_id"]), "qr_payload": s["payload"]},
            headers=s["h"][who],
        )
        assert response.status_code == 403, who


async def test_undo_restores_ticket_and_allows_new_check_in(client, db, scene):
    s = scene
    assert (await _scan(client, s))["result"] == "accepted"
    url = f"{API}/checkin/{s['ticket_id']}/undo"

    denied = await client.post(url, json={"reason": "x"}, headers=s["h"]["support"])
    assert denied.status_code == 403
    assert (
        await client.post(url, json={"reason": ""}, headers=s["h"]["scanner"])
    ).status_code == 422

    undone = await client.post(
        url, json={"reason": "Scanned wrong guest"}, headers=s["h"]["scanner"]
    )
    assert undone.status_code == 200, undone.text
    assert undone.json()["status"] == "valid"
    again = await client.post(url, json={"reason": "twice"}, headers=s["h"]["scanner"])
    assert again.status_code == 409 and again.json()["code"] == "not_checked_in"

    record = await db.scalar(select(CheckInRecord).where(CheckInRecord.ticket_id == s["ticket_id"]))
    assert record.result == CheckInResult.reverted and record.revert_reason == "Scanned wrong guest"
    audit = await db.scalar(
        select(AuditLog).where(
            AuditLog.entity_id == str(s["ticket_id"]), AuditLog.action_type == "checkin.reverted"
        )
    )
    assert audit is not None

    assert (await _scan(client, s))["result"] == "accepted"
    missing = await client.post(
        f"{API}/checkin/{uuid.uuid4()}/undo",
        json={"reason": "x"},
        headers=s["h"]["owner"],
    )
    assert missing.status_code == 404


async def test_stats_count_registered_and_checked_in(client, db, scene):
    s = scene
    await _sold_ticket(db, s["event"])
    await _sold_ticket(db, s["event"], status=TicketStatus.refunded)
    await db.commit()
    await _scan(client, s)
    url = f"{API}/events/{s['event_id']}/checkin/stats"
    stats = await client.get(url, headers=s["h"]["scanner"])
    assert stats.status_code == 200
    assert stats.json() == {"registered": 2, "checked_in": 1}
    assert (await client.get(url, headers=s["h"]["other_scanner"])).status_code == 403


async def test_concurrent_scans_admit_a_ticket_once(engine):
    """Five scanners on the same ticket at once, each in its own transaction: one admits."""
    async with AsyncSession(engine, expire_on_commit=False) as setup:
        event = await make_event(setup)
        ticket = await _sold_ticket(setup, event)
        staff = await make_staff(setup, event, StaffRole.checkin)
        await setup.commit()
    payload = encode_qr_payload(ticket.id)

    async def scan() -> str:
        async with AsyncSession(engine, expire_on_commit=False) as session:
            user = await session.get(User, staff.id)
            out = await checkin_service.verify_and_check_in(
                session, user, VerifyIn(event_id=event.id, qr_payload=payload)
            )
            return out.result

    try:
        results = await asyncio.gather(*(scan() for _ in range(5)))
        assert sorted(results) == ["accepted"] + ["already_used"] * 4
    finally:
        async with AsyncSession(engine) as cleanup:
            order_id = await cleanup.scalar(
                select(OrderItem.order_id).where(OrderItem.id == ticket.order_item_id)
            )
            organizer_user = await cleanup.scalar(
                select(OrganizerProfile.user_id).where(OrganizerProfile.id == event.organizer_id)
            )
            for statement in (
                delete(AuditLog).where(AuditLog.event_id == event.id),
                delete(CheckInRecord).where(CheckInRecord.event_id == event.id),
                delete(Ticket).where(Ticket.event_id == event.id),
                delete(Attendee).where(Attendee.order_id == order_id),
                delete(OrderItem).where(OrderItem.order_id == order_id),
                delete(Order).where(Order.id == order_id),
                delete(TicketType).where(TicketType.event_id == event.id),
            ):
                await cleanup.execute(statement)
            await cleanup.execute(
                delete(StaffAssignment).where(StaffAssignment.event_id == event.id)
            )
            await cleanup.execute(delete(Event).where(Event.id == event.id))
            await cleanup.execute(delete(Venue).where(Venue.id == event.venue_id))
            await cleanup.execute(
                delete(OrganizerProfile).where(OrganizerProfile.id == event.organizer_id)
            )
            await cleanup.execute(delete(User).where(User.id.in_((staff.id, organizer_user))))
            await cleanup.commit()
