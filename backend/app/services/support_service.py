"""Support cases and message threads [P10].

Who takes part in a case:
- the requester (the user who opened it);
- platform admins, on every case;
- for an attendee case attached to an event: the event's owner, its managers and its
  support staff. These, and admins, are the case's *handlers*.

Organizer cases (an organizer asking about their own event or account) and attendee
cases without an event are handled by platform admins only.

Anyone else is told the case does not exist (404), so case IDs cannot be probed.
"""

import uuid
from typing import Any, Literal

from sqlalchemy import Select, and_, func, or_, select, tuple_, union
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ForbiddenError, NotFoundError, UnprocessableError
from app.core.pagination import Page, PageParams, paginate
from app.db.base import utcnow
from app.models.event import Event
from app.models.notification import NotificationType
from app.models.order import Attendee, Order
from app.models.support import (
    SupportAudience,
    SupportCase,
    SupportCategory,
    SupportMessage,
    SupportStatus,
)
from app.models.ticket import Ticket
from app.models.user import OrganizerProfile, StaffAssignment, StaffRole, User, UserRole
from app.schemas.support import CaseCreate, CaseUpdate
from app.services.audit_service import audit
from app.services.notification_service import notify

MESSAGE_PAGE_LIMIT = 200
HANDLER_STAFF_ROLES = (StaffRole.manager, StaffRole.support)

CaseRole = Literal["requester", "handler"]


# --- access -----------------------------------------------------------------------------


def _handled_event_ids(user_id: uuid.UUID) -> Select[Any]:
    """IDs of events whose attendee cases `user_id` handles: owned, or staffed as support/manager"""
    owned = (
        select(Event.id)
        .join(OrganizerProfile, OrganizerProfile.id == Event.organizer_id)
        .where(OrganizerProfile.user_id == user_id)
    )
    staffed = select(StaffAssignment.event_id).where(
        StaffAssignment.user_id == user_id, StaffAssignment.role.in_(HANDLER_STAFF_ROLES)
    )
    return select(union(owned, staffed).subquery().c[0])


def _handled_by(user: User) -> Any:
    """SQL condition: the case is one `user` handles."""
    if user.role == UserRole.platform_admin:
        return True
    return and_(
        SupportCase.audience == SupportAudience.attendee_case,
        SupportCase.event_id.in_(_handled_event_ids(user.id)),
    )


async def is_handler(db: AsyncSession, case: SupportCase, user: User) -> bool:
    if user.is_suspended:
        return False
    if user.role == UserRole.platform_admin:
        return True
    if case.audience != SupportAudience.attendee_case or case.event_id is None:
        return False
    events = _handled_event_ids(user.id).subquery()
    handled = await db.scalar(
        select(func.count()).select_from(events).where(events.c[0] == case.event_id)
    )
    return bool(handled)


async def _load_case(db: AsyncSession, user: User, case_id: uuid.UUID) -> tuple[SupportCase, bool]:
    """Return the case and whether `user` handles it. Non-participants get 404."""
    case = await db.get(SupportCase, case_id)
    if case is None:
        raise NotFoundError("Support case not found.", code="support_case_not_found")
    handler = await is_handler(db, case, user)
    if case.requester_id != user.id and not handler:
        raise NotFoundError("Support case not found.", code="support_case_not_found")
    return case, handler


# --- context ----------------------------------------------------------------------------


def _mismatch() -> UnprocessableError:
    return UnprocessableError(
        "The event, order and ticket given do not belong together.",
        code="support_context_mismatch",
    )


async def _resolve_context(
    db: AsyncSession, user: User, payload: CaseCreate
) -> tuple[uuid.UUID | None, uuid.UUID | None, uuid.UUID | None]:
    """Check the attached ticket/order/event and fill in what can be derived from them.

    A ticket or order that belongs to someone else is reported as missing, not forbidden.
    """
    event_id, order_id, ticket_id = payload.event_id, payload.order_id, payload.ticket_id

    if ticket_id is not None:
        row = (
            await db.execute(
                select(Ticket, Order, Attendee)
                .join(Attendee, Attendee.id == Ticket.attendee_id)
                .join(Order, Order.id == Attendee.order_id)
                .where(Ticket.id == ticket_id)
            )
        ).first()
        owns = row is not None and (
            row.Order.buyer_user_id == user.id or row.Attendee.email.lower() == user.email.lower()
        )
        if row is None or not owns:
            raise NotFoundError("The ticket was not found.", code="ticket_not_found")
        if order_id is not None and order_id != row.Order.id:
            raise _mismatch()
        if event_id is not None and event_id != row.Ticket.event_id:
            raise _mismatch()
        return row.Ticket.event_id, row.Order.id, ticket_id

    if order_id is not None:
        order = await db.get(Order, order_id)
        if order is None or order.buyer_user_id != user.id:
            raise NotFoundError("The order was not found.", code="order_not_found")
        if event_id is not None and event_id != order.event_id:
            raise _mismatch()
        return order.event_id, order_id, None

    if event_id is not None and await db.get(Event, event_id) is None:
        raise NotFoundError("The event was not found.", code="event_not_found")
    return event_id, None, None


async def _audience_for(
    db: AsyncSession, user: User, event_id: uuid.UUID | None
) -> SupportAudience:
    if user.role != UserRole.organizer:
        return SupportAudience.attendee_case
    if event_id is None:
        return SupportAudience.organizer_case
    owner_user_id = await db.scalar(
        select(OrganizerProfile.user_id)
        .join(Event, Event.organizer_id == OrganizerProfile.id)
        .where(Event.id == event_id)
    )
    # An organizer buying a ticket to someone else's event is an attendee there.
    if owner_user_id == user.id:
        return SupportAudience.organizer_case
    return SupportAudience.attendee_case


# --- side effects -----------------------------------------------------------------------


def _context(case: SupportCase) -> dict[str, Any]:
    return {"case_id": str(case.id), "status": case.status.value}


async def _notify_user(
    db: AsyncSession, kind: NotificationType, user_id: uuid.UUID | None, case: SupportCase
) -> None:
    if user_id is None:
        return
    recipient = await db.get(User, user_id)
    if recipient is not None:
        await notify(db, kind, recipient, _context(case))


def _set_status(
    db: AsyncSession, case: SupportCase, new: SupportStatus, actor: User, reason: str
) -> None:
    old = case.status
    case.status = new
    audit(
        db,
        action_type="support.status_changed",
        entity_type="support_case",
        entity_id=case.id,
        event_id=case.event_id,
        actor=actor,
        description=f"Support case status changed from {old.value} to {new.value} ({reason}).",
        metadata={"from": old.value, "to": new.value, "reason": reason},
    )


# --- cases ------------------------------------------------------------------------------


async def create_case(db: AsyncSession, user: User, payload: CaseCreate) -> SupportCase:
    event_id, order_id, ticket_id = await _resolve_context(db, user, payload)
    case = SupportCase(
        requester_id=user.id,
        audience=await _audience_for(db, user, event_id),
        category=SupportCategory(payload.category),
        status=SupportStatus.open,
        event_id=event_id,
        order_id=order_id,
        ticket_id=ticket_id,
        subject=payload.subject,
    )
    db.add(case)
    await db.flush()
    db.add(SupportMessage(case_id=case.id, author_id=user.id, body=payload.message))
    audit(
        db,
        action_type="support.case_created",
        entity_type="support_case",
        entity_id=case.id,
        event_id=event_id,
        actor=user,
        description=f"Support case opened ({case.category.value}): {case.subject}",
        metadata={"audience": case.audience.value, "category": case.category.value},
    )
    await db.commit()
    return case


async def list_cases(
    db: AsyncSession,
    user: User,
    params: PageParams,
    *,
    status: SupportStatus | None = None,
    event_id: uuid.UUID | None = None,
    role: CaseRole | None = None,
) -> Page[Any]:
    own = SupportCase.requester_id == user.id
    handled = _handled_by(user)
    visible = {"requester": own, "handler": handled}.get(role or "", or_(own, handled))

    stmt = select(SupportCase).where(visible)
    if status is not None:
        stmt = stmt.where(SupportCase.status == status)
    if event_id is not None:
        stmt = stmt.where(SupportCase.event_id == event_id)
    stmt = stmt.order_by(SupportCase.updated_at.desc(), SupportCase.id.desc())
    return await paginate(db, stmt, params)


async def get_case(db: AsyncSession, user: User, case_id: uuid.UUID) -> SupportCase:
    case, _ = await _load_case(db, user, case_id)
    return case


async def update_case(
    db: AsyncSession, user: User, case_id: uuid.UUID, payload: CaseUpdate
) -> SupportCase:
    case, handler = await _load_case(db, user, case_id)
    if not handler:
        raise ForbiddenError(
            "Only support staff of the event or a platform admin can change this case.",
            code="support_handler_required",
        )

    status_changed = False
    if payload.status is not None and SupportStatus(payload.status) != case.status:
        _set_status(db, case, SupportStatus(payload.status), user, "manual")
        status_changed = True

    new_assignee: User | None = None
    assignee_changed = False
    if "assignee_id" in payload.model_fields_set and payload.assignee_id != case.assignee_id:
        if payload.assignee_id is not None:
            new_assignee = await db.get(User, payload.assignee_id)
            if new_assignee is None or not await is_handler(db, case, new_assignee):
                raise UnprocessableError(
                    "The assignee must be support staff of the event or a platform admin.",
                    code="invalid_assignee",
                )
        previous = case.assignee_id
        case.assignee_id = payload.assignee_id
        assignee_changed = True
        audit(
            db,
            action_type="support.assigned",
            entity_type="support_case",
            entity_id=case.id,
            event_id=case.event_id,
            actor=user,
            description=(
                f"Support case assigned to {payload.assignee_id}."
                if payload.assignee_id
                else "Support case unassigned."
            ),
            metadata={
                "from": str(previous) if previous else None,
                "to": str(payload.assignee_id) if payload.assignee_id else None,
            },
        )

    if not (status_changed or assignee_changed):
        return case

    if status_changed and case.requester_id != user.id:
        await _notify_user(db, NotificationType.support_status, case.requester_id, case)
    if new_assignee is not None and new_assignee.id != user.id:
        await notify(db, NotificationType.support_assigned, new_assignee, _context(case))
    await db.commit()
    return case


# --- messages ---------------------------------------------------------------------------


async def list_messages(
    db: AsyncSession, user: User, case_id: uuid.UUID, after: uuid.UUID | None = None
) -> list[SupportMessage]:
    """Oldest first. Pass the last message ID seen as `after` to poll for new ones."""
    case, _ = await _load_case(db, user, case_id)
    stmt = select(SupportMessage).where(SupportMessage.case_id == case.id)
    if after is not None:
        cursor = await db.get(SupportMessage, after)
        if cursor is None or cursor.case_id != case.id:
            raise UnprocessableError(
                "`after` must be the ID of a message in this case.", code="invalid_after_cursor"
            )
        stmt = stmt.where(
            tuple_(SupportMessage.created_at, SupportMessage.id)
            > tuple_(cursor.created_at, cursor.id)
        )
    stmt = stmt.order_by(SupportMessage.created_at, SupportMessage.id).limit(MESSAGE_PAGE_LIMIT)
    return list(await db.scalars(stmt))


async def post_message(
    db: AsyncSession, user: User, case_id: uuid.UUID, body: str
) -> SupportMessage:
    case, handler = await _load_case(db, user, case_id)
    message = SupportMessage(case_id=case.id, author_id=user.id, body=body)
    db.add(message)

    # The requester's own messages count as the customer's, even if they also handle it.
    if case.requester_id == user.id:
        if case.status in (SupportStatus.waiting_customer, SupportStatus.resolved):
            _set_status(db, case, SupportStatus.in_progress, user, "customer_reply")
        recipient_id = case.assignee_id
    else:
        if handler and case.status == SupportStatus.open:
            _set_status(db, case, SupportStatus.in_progress, user, "staff_reply")
        recipient_id = case.requester_id

    case.updated_at = utcnow()
    await db.flush()
    if recipient_id != user.id:
        await _notify_user(db, NotificationType.support_message, recipient_id, case)
    await db.commit()
    return message
