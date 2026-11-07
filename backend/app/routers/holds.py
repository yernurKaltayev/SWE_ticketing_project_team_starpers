"""P4 assigned-seat availability and hold endpoints.

DO NOT include this router alongside a second router defining the same paths.
"""

from uuid import UUID

from fastapi import APIRouter, status
from sqlalchemy.exc import IntegrityError

from app.core.deps import CurrentUser, DbSession
from app.core.errors import ConflictError
from app.schemas.seat_p4 import HoldCreateP4, HoldResponseP4, SeatMapP4
from app.services import seat_service

router = APIRouter(tags=["seat-holds"])


@router.get("/events/{event_id}/seat-map", response_model=SeatMapP4)
async def seat_map(event_id: UUID, db: DbSession):
    return await seat_service.seat_map(db, event_id)


@router.post(
    "/events/{event_id}/holds", response_model=HoldResponseP4, status_code=status.HTTP_201_CREATED
)
async def create_hold(event_id: UUID, data: HoldCreateP4, user: CurrentUser, db: DbSession):
    try:
        return await seat_service.create_hold(db, event_id, user.id, data)
    except IntegrityError as exc:
        await db.rollback()
        raise ConflictError(
            "One or more seats were just reserved.", code="seats_unavailable"
        ) from exc
    except Exception:
        await db.rollback()
        raise


@router.delete("/events/{event_id}/holds/{hold_id}", status_code=status.HTTP_204_NO_CONTENT)
async def release_hold(event_id: UUID, hold_id: UUID, user: CurrentUser, db: DbSession):
    try:
        await seat_service.release_hold(db, event_id, hold_id, user.id)
    except Exception:
        await db.rollback()
        raise
