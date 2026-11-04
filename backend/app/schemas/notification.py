from datetime import datetime
from typing import Any
from uuid import UUID

from app.schemas.common import OrmModel


class NotificationOut(OrmModel):
    id: UUID
    type: str
    title: str
    body: str
    payload: dict[str, Any]
    read_at: datetime | None
    created_at: datetime
