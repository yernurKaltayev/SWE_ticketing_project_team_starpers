"""/events/{event_id}/analytics [P13 Yernur]. Read-only."""

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.deps import DbSession, require_event_access
from app.models.event import Event
from app.models.user import StaffRole
from app.schemas.analytics import AnalyticsOut
from app.services import analytics_service

router = APIRouter(tags=["analytics"])

# Owner, manager staff and platform admins. Check-in and support staff do not see sales figures.
ManagedEvent = Annotated[Event, Depends(require_event_access(StaffRole.manager))]


@router.get("/events/{event_id}/analytics", response_model=AnalyticsOut)
async def event_analytics(
    event: ManagedEvent,
    db: DbSession,
    date_from: datetime | None = Query(None, description="Orders at or after (ISO 8601)"),
    date_to: datetime | None = Query(None, description="Orders before (ISO 8601)"),
    ticket_type_id: uuid.UUID | None = Query(None, description="Only this ticket type"),
) -> AnalyticsOut:
    return await analytics_service.event_analytics(
        db, event, date_from=date_from, date_to=date_to, ticket_type_id=ticket_type_id
    )
