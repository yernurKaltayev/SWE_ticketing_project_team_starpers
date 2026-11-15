"""/events/{event_id}/history [P12 Yernur]. Read-only: the audit log is append-only."""

from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query

from app.core.deps import DbSession, require_event_access
from app.core.pagination import Pagination
from app.models.event import Event
from app.models.user import StaffRole
from app.schemas.audit import AuditEntryOut, HistoryOut
from app.services import audit_service
from app.services.audit_categories import CATEGORIES
from app.services.event_lifecycle import classify

router = APIRouter(tags=["history"])

# Owner, manager staff and platform admins. Check-in and support staff do not see history.
ManagedEvent = Annotated[Event, Depends(require_event_access(StaffRole.manager))]


@router.get("/events/{event_id}/history", response_model=HistoryOut)
async def event_history(
    event: ManagedEvent,
    db: DbSession,
    page: Pagination,
    date_from: datetime | None = Query(None, description="Entries at or after (ISO 8601)"),
    date_to: datetime | None = Query(None, description="Entries before (ISO 8601)"),
    action_type: str | None = Query(None, max_length=100, description="Exact action name"),
    category: str | None = Query(
        None, max_length=50, description=f"One of: {', '.join(CATEGORIES)}"
    ),
) -> Any:
    """Works for every event status, so completed and cancelled events stay readable."""
    result = await audit_service.history(
        db,
        event.id,
        page,
        date_from=date_from,
        date_to=date_to,
        action_type=action_type,
        category=category,
    )
    return HistoryOut(
        event_status=event.status.value,
        lifecycle=classify(event.status, event.starts_at, event.ends_at, datetime.now(UTC)),
        items=[AuditEntryOut.model_validate(row) for row in result.items],
        total=result.total,
        limit=result.limit,
        offset=result.offset,
    )
