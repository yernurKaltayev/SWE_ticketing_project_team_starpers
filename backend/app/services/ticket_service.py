"""Ticket issuance, lookup and artifacts [P8].

`issue_tickets()` is the interface P5/P6 call once an order is confirmed. It runs in the
caller's transaction and does not commit.
"""

import secrets
import uuid
from collections import defaultdict
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import check_event_access
from app.core.errors import ConflictError, ForbiddenError, NotFoundError, UnprocessableError
from app.core.pagination import Page, PageParams, paginate
from app.models.event import Event
from app.models.notification import NotificationType
from app.models.order import Attendee, Order, OrderItem, OrderStatus
from app.models.ticket import Ticket, TicketStatus
from app.models.ticket_type import TicketType
from app.models.user import User
from app.models.venue import Venue
from app.schemas.ticket import SeatRef, TicketOut
from app.services.audit_service import audit
from app.services.notification_service import notify
from app.services.ticket_pdf import TicketPdfData, render_ticket_pdf
from app.services.ticket_qr import encode_qr_payload, render_qr_png

ISSUABLE_ORDER_STATUSES = {OrderStatus.paid, OrderStatus.free_confirmed}
# No 0/O/1/I: ticket numbers get read aloud and typed at the door.
_NUMBER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def new_ticket_number() -> str:
    chars = "".join(secrets.choice(_NUMBER_ALPHABET) for _ in range(8))
    return f"BF-{chars[:4]}-{chars[4:]}"


async def _tickets_of_order(db: AsyncSession, order_id: uuid.UUID) -> list[Ticket]:
    rows = await db.scalars(
        select(Ticket)
        .join(OrderItem, OrderItem.id == Ticket.order_item_id)
        .where(OrderItem.order_id == order_id)
        .order_by(Ticket.issued_at, Ticket.ticket_number)
    )
    return list(rows)


def _assign_attendees(
    items: Sequence[OrderItem], attendees: Sequence[Attendee]
) -> dict[uuid.UUID, list[Attendee]]:
    """Give each ticket an attendee: ones linked to the item first, then unlinked ones in order."""
    linked: dict[uuid.UUID, list[Attendee]] = defaultdict(list)
    unlinked: list[Attendee] = []
    for attendee in attendees:
        if attendee.order_item_id is None:
            unlinked.append(attendee)
        else:
            linked[attendee.order_item_id].append(attendee)

    assigned: dict[uuid.UUID, list[Attendee]] = {}
    spare = iter(unlinked)
    for item in items:
        chosen = linked[item.id][: item.quantity]
        while len(chosen) < item.quantity:
            extra = next(spare, None)
            if extra is None:
                raise UnprocessableError(
                    "The order has fewer attendees than tickets.", code="attendees_missing"
                )
            chosen.append(extra)
        assigned[item.id] = chosen
    return assigned


async def issue_tickets(db: AsyncSession, order: Order) -> list[Ticket]:
    """Create one ticket per attendee of a paid or free-confirmed order.

    Idempotent: a duplicate payment webhook gets the tickets already issued back, never a
    second set. The order row is locked so two concurrent calls cannot both issue.
    """
    await db.execute(select(Order.id).where(Order.id == order.id).with_for_update())
    existing = await _tickets_of_order(db, order.id)
    if existing:
        return existing
    if order.status not in ISSUABLE_ORDER_STATUSES:
        raise UnprocessableError(
            "Tickets can only be issued for a paid or confirmed order.",
            code="order_not_confirmed",
        )

    items = list(
        await db.scalars(
            select(OrderItem)
            .where(OrderItem.order_id == order.id)
            .order_by(OrderItem.created_at, OrderItem.id)
        )
    )
    attendees = list(
        await db.scalars(
            select(Attendee)
            .where(Attendee.order_id == order.id)
            .order_by(Attendee.created_at, Attendee.id)
        )
    )
    attendees_by_item = _assign_attendees(items, attendees)

    tickets: list[Ticket] = []
    for item in items:
        for attendee in attendees_by_item[item.id]:
            ticket_id = uuid.uuid4()
            tickets.append(
                Ticket(
                    id=ticket_id,
                    ticket_number=new_ticket_number(),
                    order_item_id=item.id,
                    event_id=order.event_id,
                    ticket_type_id=item.ticket_type_id,
                    attendee_id=attendee.id,
                    seat_id=item.seat_id,
                    section_name=item.section_name,
                    row_label=item.row_label,
                    seat_number=item.seat_number,
                    qr_token=encode_qr_payload(ticket_id),
                )
            )
    db.add_all(tickets)
    await db.flush()

    audit(
        db,
        action_type="tickets.issued",
        entity_type="order",
        entity_id=order.id,
        event_id=order.event_id,
        description=f"Issued {len(tickets)} ticket(s) for order {order.order_number}",
        metadata={"ticket_numbers": [t.ticket_number for t in tickets]},
    )
    if order.buyer_user_id is not None:
        buyer = await db.get(User, order.buyer_user_id)
        if buyer is not None:
            await notify(
                db,
                NotificationType.ticket_delivery,
                buyer,
                {"order_id": str(order.id), "ticket_ids": [str(t.id) for t in tickets]},
            )
    return tickets


async def _owner_user_id(db: AsyncSession, ticket: Ticket) -> uuid.UUID | None:
    return await db.scalar(
        select(Order.buyer_user_id)
        .join(OrderItem, OrderItem.order_id == Order.id)
        .where(OrderItem.id == ticket.order_item_id)
    )


async def get_accessible_ticket(db: AsyncSession, user: User, ticket_id: uuid.UUID) -> Ticket:
    """The ticket, if `user` bought it or has access to its event. Otherwise raise."""
    ticket = await db.get(Ticket, ticket_id)
    if ticket is None:
        raise NotFoundError("The ticket was not found.", code="ticket_not_found")
    if await _owner_user_id(db, ticket) == user.id:
        return ticket
    try:
        await check_event_access(db, user, ticket.event_id)
    except ForbiddenError as exc:
        raise ForbiddenError(
            "You do not have access to this ticket.", code="ticket_access_denied"
        ) from exc
    return ticket


def _qr_url(ticket: Ticket) -> str:
    return f"{get_settings().api_v1_prefix}/tickets/{ticket.id}/qr"


def _pdf_url(ticket: Ticket) -> str:
    return f"{get_settings().api_v1_prefix}/tickets/{ticket.id}/pdf"


async def to_ticket_out(db: AsyncSession, tickets: Sequence[Ticket]) -> list[TicketOut]:
    type_rows = await db.execute(
        select(TicketType.id, TicketType.name).where(
            TicketType.id.in_({t.ticket_type_id for t in tickets})
        )
    )
    type_names = {row.id: row.name for row in type_rows}
    attendee_rows = await db.execute(
        select(Attendee.id, Attendee.full_name).where(
            Attendee.id.in_({t.attendee_id for t in tickets})
        )
    )
    attendee_names = {row.id: row.full_name for row in attendee_rows}
    return [
        TicketOut(
            id=t.id,
            ticket_number=t.ticket_number,
            event_id=t.event_id,
            ticket_type=type_names[t.ticket_type_id],
            attendee_name=attendee_names[t.attendee_id],
            seat=(
                SeatRef(
                    seat_id=t.seat_id,
                    section_name=t.section_name or "",
                    row_label=t.row_label or "",
                    seat_number=t.seat_number or 0,
                )
                if t.seat_id is not None
                else None
            ),
            status=t.status.value,
            qr_url=_qr_url(t),
            pdf_url=_pdf_url(t),
        )
        for t in tickets
    ]


async def list_user_tickets(db: AsyncSession, user: User, params: PageParams) -> Page[TicketOut]:
    stmt = (
        select(Ticket)
        .join(OrderItem, OrderItem.id == Ticket.order_item_id)
        .join(Order, Order.id == OrderItem.order_id)
        .where(Order.buyer_user_id == user.id)
        .order_by(Ticket.issued_at.desc(), Ticket.id)
    )
    page = await paginate(db, stmt, params)
    return Page[TicketOut](
        items=await to_ticket_out(db, page.items) if page.items else [],
        total=page.total,
        limit=page.limit,
        offset=page.offset,
    )


def _require_usable(ticket: Ticket) -> None:
    if ticket.status in (TicketStatus.cancelled, TicketStatus.refunded):
        raise ConflictError(
            f"This ticket is {ticket.status.value} and can no longer be used.",
            code="ticket_not_valid",
        )


def get_qr_png(ticket: Ticket) -> bytes:
    _require_usable(ticket)
    return render_qr_png(ticket.qr_token)


async def get_ticket_pdf(db: AsyncSession, ticket: Ticket) -> bytes:
    _require_usable(ticket)
    event = await db.get(Event, ticket.event_id)
    venue = await db.get(Venue, event.venue_id) if event else None
    type_name = await db.scalar(
        select(TicketType.name).where(TicketType.id == ticket.ticket_type_id)
    )
    attendee_name = await db.scalar(
        select(Attendee.full_name).where(Attendee.id == ticket.attendee_id)
    )
    if event is None or venue is None or type_name is None or attendee_name is None:
        raise NotFoundError("The ticket details are incomplete.", code="ticket_not_found")
    seat_label = (
        f"Section {ticket.section_name}, row {ticket.row_label}, seat {ticket.seat_number}"
        if ticket.seat_id is not None
        else None
    )
    return render_ticket_pdf(
        TicketPdfData(
            ticket_number=ticket.ticket_number,
            qr_payload=ticket.qr_token,
            event_title=event.title,
            venue=f"{venue.name}, {venue.address}, {venue.city}",
            starts_at=event.starts_at,
            timezone=event.timezone,
            ticket_type=type_name,
            attendee_name=attendee_name,
            seat_label=seat_label,
        )
    )
