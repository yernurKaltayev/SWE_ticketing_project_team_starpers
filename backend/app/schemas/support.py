from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

from app.schemas.common import OrmModel


class CaseCreate(BaseModel):
    category: str
    subject: str
    event_id: UUID | None = None
    order_id: UUID | None = None
    ticket_id: UUID | None = None
    message: str


class CaseUpdate(BaseModel):
    status: Literal["open", "in_progress", "waiting_customer", "resolved"] | None = None
    assignee_id: UUID | None = None


class CaseOut(OrmModel):
    id: UUID
    requester_id: UUID
    audience: str
    category: str
    status: str
    assignee_id: UUID | None
    event_id: UUID | None
    order_id: UUID | None
    ticket_id: UUID | None
    subject: str
    created_at: datetime


class MessageIn(BaseModel):
    body: str


class SupportMessageOut(OrmModel):
    id: UUID
    case_id: UUID
    author_id: UUID
    body: str
    created_at: datetime
