"""Ticket verification and online check-in [P15, SRS 4.8].

`verify_and_check_in` answers every scan with a clear result instead of an error, because the
scanner screen must always show the staff member what to do:

- `accepted`      — the ticket was valid and is now checked in (atomically, exactly once)
- `already_used`  — the ticket was checked in before
- `refunded`      — the order was refunded (P7)
- `invalid`       — forged/garbled ticket QR, unknown ticket, or a cancelled ticket
- `wrong_event`   — a genuine ticket for another event
- `not_a_ticket`  — a Campaign QR (P16) or any other non-ticket code

The check-in itself is one `UPDATE tickets SET status='checked_in' WHERE id=:id AND
status='valid'`, so two scanners racing on the same ticket admit it once. A unique partial
index on checkin_records (one live record per ticket) backs this up in the database.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import check_event_access
from app.core.errors import ConflictError, NotFoundError
from app.models.checkin import CheckInRecord, CheckInResult
from app.models.ticket import Ticket, TicketStatus
from app.models.ticket_type import TicketType
from app.models.user import StaffRole, User
from app.schemas.checkin import CheckInStatsOut, VerifyIn, VerifyOut
from app.schemas.ticket import TicketOut
from app.services.audit_service import audit
from app.services.ticket_qr import PREFIX, decode_qr_payload
from app.services.ticket_service import to_ticket_out
from app.services.ticket_type_service import check_in_inventory

_MESSAGES = {
    "accepted": "Valid ticket. Admit the attendee.",
    "already_used": "This ticket was already used for entry.",
    "refunded": "This ticket was refunded and is not valid.",
    "invalid": "This is not a valid ticket.",
    "cancelled": "This ticket was cancelled and is not valid.",
    "wrong_event": "This ticket is for a different event.",
    "not_a_ticket": "This QR code is not a ticket (it may be a promotional code).",
}


def _result(result: str, ticket: TicketOut | None = None, message_key: str | None = None):
    return VerifyOut(
        result=result,  # type: ignore[arg-type]  # one of the VerifyOut literals
        ticket=ticket,
        message=_MESSAGES[message_key or result],
    )


async def _ticket_out(db: AsyncSession, ticket: Ticket) -> TicketOut:
    return (await to_ticket_out(db, [ticket]))[0]


async def verify_and_check_in(
    db: AsyncSession, user: User, data: VerifyIn, now: datetime | None = None
) -> VerifyOut:
    now = now or datetime.now(UTC)
    # Staff may only scan for an event they are assigned to (check-in role) or own.
    await check_event_access(db, user, data.event_id, StaffRole.checkin)

    payload = data.qr_payload.strip()
    if not payload.startswith(f"{PREFIX}."):
        # Campaign QR codes are https links (P16); nothing else is a ticket either.
        return _result("not_a_ticket")
    ticket_id = decode_qr_payload(payload)
    if ticket_id is None:
        return _result("invalid")
    ticket = await db.get(Ticket, ticket_id)
    if ticket is None:
        return _result("invalid")
    if ticket.event_id != data.event_id:
        # No ticket details for another event's ticket: staff of this event may not see them.
        return _result("wrong_event")

    admitted = await db.scalar(
        update(Ticket)
        .where(Ticket.id == ticket.id, Ticket.status == TicketStatus.valid)
        .values(status=TicketStatus.checked_in)
        .returning(Ticket.id)
        .execution_options(synchronize_session=False)
    )
    await db.refresh(ticket)
    if admitted is None:
        out = await _ticket_out(db, ticket)
        if ticket.status == TicketStatus.checked_in:
            return _result("already_used", out)
        if ticket.status == TicketStatus.refunded:
            return _result("refunded", out)
        return _result("invalid", out, message_key="cancelled")

    db.add(
        CheckInRecord(
            ticket_id=ticket.id,
            event_id=ticket.event_id,
            staff_user_id=user.id,
            checked_in_at=now,
            result=CheckInResult.accepted,
        )
    )
    if not await check_in_inventory(db, ticket.ticket_type_id, 1):
        raise ConflictError("Check-in counters are inconsistent.", code="inventory_inconsistent")
    audit(
        db,
        action_type="checkin.accepted",
        entity_type="ticket",
        entity_id=ticket.id,
        event_id=ticket.event_id,
        actor=user,
        description=f"Checked in ticket {ticket.ticket_number}",
    )
    await db.commit()
    return _result("accepted", await _ticket_out(db, ticket))


async def undo_check_in(
    db: AsyncSession, user: User, ticket_id: uuid.UUID, reason: str, now: datetime | None = None
) -> TicketOut:
    """Revert an accidental check-in. Audited; the ticket becomes valid again."""
    now = now or datetime.now(UTC)
    ticket = await db.get(Ticket, ticket_id)
    if ticket is None:
        raise NotFoundError("Ticket not found.", code="ticket_not_found")
    await check_event_access(db, user, ticket.event_id, StaffRole.checkin)

    reverted = await db.scalar(
        update(Ticket)
        .where(Ticket.id == ticket.id, Ticket.status == TicketStatus.checked_in)
        .values(status=TicketStatus.valid)
        .returning(Ticket.id)
        .execution_options(synchronize_session=False)
    )
    if reverted is None:
        raise ConflictError("This ticket is not checked in.", code="not_checked_in")
    record = await db.scalar(
        select(CheckInRecord)
        .where(CheckInRecord.ticket_id == ticket.id, CheckInRecord.reverted_at.is_(None))
        .with_for_update()
    )
    if record is not None:
        record.reverted_at = now
        record.reverted_by = user.id
        record.revert_reason = reason
        record.result = CheckInResult.reverted
    await db.execute(
        update(TicketType)
        .where(TicketType.id == ticket.ticket_type_id, TicketType.qty_checked_in > 0)
        .values(qty_checked_in=TicketType.qty_checked_in - 1)
    )
    audit(
        db,
        action_type="checkin.reverted",
        entity_type="ticket",
        entity_id=ticket.id,
        event_id=ticket.event_id,
        actor=user,
        description=f"Undid check-in of ticket {ticket.ticket_number}",
        metadata={"reason": reason},
    )
    await db.commit()
    await db.refresh(ticket)
    return await _ticket_out(db, ticket)


async def stats(db: AsyncSession, event_id: uuid.UUID) -> CheckInStatsOut:
    """Registered = tickets that can still be used or were used; checked_in = used."""
    registered, checked_in = (
        await db.execute(
            select(
                func.count(Ticket.id).filter(
                    Ticket.status.in_((TicketStatus.valid, TicketStatus.checked_in))
                ),
                func.count(Ticket.id).filter(Ticket.status == TicketStatus.checked_in),
            ).where(Ticket.event_id == event_id)
        )
    ).one()
    return CheckInStatsOut(registered=int(registered), checked_in=int(checked_in))
