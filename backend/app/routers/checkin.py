"""/checkin/* [P15 Dima]

Online check-in only (no offline sync). Access: event owner, platform admin, or staff with the
`checkin` role (managers included).
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.deps import CurrentUser, DbSession, require_event_access
from app.models.event import Event
from app.models.user import StaffRole
from app.schemas.checkin import CheckInStatsOut, UndoCheckInIn, VerifyIn, VerifyOut
from app.schemas.ticket import TicketOut
from app.services import checkin_service

router = APIRouter(tags=["checkin"])

CheckInEvent = Annotated[Event, Depends(require_event_access(StaffRole.checkin))]


@router.post("/checkin/verify", response_model=VerifyOut)
async def verify(data: VerifyIn, user: CurrentUser, db: DbSession) -> VerifyOut:
    try:
        return await checkin_service.verify_and_check_in(db, user, data)
    except Exception:
        await db.rollback()
        raise


@router.post("/checkin/{ticket_id}/undo", response_model=TicketOut)
async def undo(
    ticket_id: uuid.UUID, data: UndoCheckInIn, user: CurrentUser, db: DbSession
) -> TicketOut:
    try:
        return await checkin_service.undo_check_in(db, user, ticket_id, data.reason)
    except Exception:
        await db.rollback()
        raise


@router.get("/events/{event_id}/checkin/stats", response_model=CheckInStatsOut)
async def checkin_stats(event: CheckInEvent, db: DbSession) -> CheckInStatsOut:
    return await checkin_service.stats(db, event.id)
