"""P4 venue discovery and seating layouts. Shared /api/v1 prefix added by main.py."""
from uuid import UUID

from fastapi import APIRouter

from app.core.deps import DbSession
from app.schemas.seat_p4 import LayoutSummaryP4, VenueSummaryP4
from app.services import seat_service

router = APIRouter(tags=["venues"])


@router.get("/venues", response_model=list[VenueSummaryP4])
async def list_venues(db: DbSession):
    return await seat_service.list_venues(db)


@router.get("/venues/{venue_id}", response_model=VenueSummaryP4)
async def get_venue(venue_id: UUID, db: DbSession):
    return await seat_service.get_venue(db, venue_id)


@router.get("/venues/{venue_id}/layouts", response_model=list[LayoutSummaryP4])
async def list_layouts(venue_id: UUID, db: DbSession):
    return await seat_service.list_layouts(db, venue_id)
