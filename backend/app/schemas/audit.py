from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import Field

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
