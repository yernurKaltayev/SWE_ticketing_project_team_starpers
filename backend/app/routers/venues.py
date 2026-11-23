"""P4 venue discovery and seating layouts, plus P2 organizer-created venues.
Shared /api/v1 prefix added by main.py."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status

from app.core.deps import DbSession, require_role
from app.models.user import User, UserRole
from app.models.venue import Venue
from app.schemas.seat_p4 import LayoutSummaryP4, VenueSummaryP4
from app.schemas.venue import VenueCreate, VenueOut
from app.services import seat_service, venue_service

router = APIRouter(tags=["venues"])
VenueAuthor = Annotated[User, Depends(require_role(UserRole.organizer, UserRole.platform_admin))]


@router.get("/venues", response_model=list[VenueSummaryP4])
async def list_venues(db: DbSession):
    return await seat_service.list_venues(db)


@router.post("/venues", response_model=VenueOut, status_code=status.HTTP_201_CREATED)
async def create_venue(
    data: VenueCreate, _user: VenueAuthor, db: DbSession, response: Response
) -> Venue:
    venue, created = await venue_service.create_venue(db, data)
    if not created:
        response.status_code = status.HTTP_200_OK
    return venue


@router.get("/venues/{venue_id}", response_model=VenueSummaryP4)
async def get_venue(venue_id: UUID, db: DbSession):
    return await seat_service.get_venue(db, venue_id)


@router.get("/venues/{venue_id}/layouts", response_model=list[LayoutSummaryP4])
async def list_layouts(venue_id: UUID, db: DbSession):
    return await seat_service.list_layouts(db, venue_id)
