from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel

from app.schemas.common import OrmModel


class SuspendIn(BaseModel):
    suspended: bool
    reason: str


class SettingsOut(BaseModel):
    settings: dict[str, Any]


class SettingsUpdate(BaseModel):
    settings: dict[str, Any]


class EventReportIn(BaseModel):
    reason: str


class EventReportOut(OrmModel):
    id: UUID
    event_id: UUID
    reporter_id: UUID
    reason: str
    status: str


class EventReportUpdate(BaseModel):
    status: Literal["reviewed", "dismissed", "actioned"]
