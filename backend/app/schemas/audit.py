from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import OrmModel


class AuditEntryOut(OrmModel):
    id: UUID
    occurred_at: datetime
    actor_id: UUID | None
    actor_role: str
    action_type: str
    entity_type: str
    entity_id: str
    description: str
    metadata: dict[str, Any] = Field(validation_alias="meta")


class HistoryOut(BaseModel):
    """One page of an event's audit trail plus where the event is in its lifecycle."""

    event_status: str
    lifecycle: Literal["upcoming", "active", "completed", "cancelled"]
    items: list[AuditEntryOut]
    total: int
    limit: int
    offset: int
