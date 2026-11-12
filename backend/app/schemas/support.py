from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, StringConstraints

from app.schemas.common import OrmModel

SupportCategoryName = Literal[
    "ticket_delivery",
    "payment",
    "refund",
    "seating",
    "event_info",
    "check_in",
    "account",
    "technical",
]
SupportStatusName = Literal["open", "in_progress", "waiting_customer", "resolved"]

MessageBody = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)
]
Subject = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class CaseCreate(BaseModel):
    category: SupportCategoryName
    subject: Subject
    event_id: UUID | None = None
    order_id: UUID | None = None
    ticket_id: UUID | None = None
    message: MessageBody


class CaseUpdate(BaseModel):
    """Only the fields that are sent are applied. Send `assignee_id: null` to unassign."""

    status: SupportStatusName | None = None
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
    body: MessageBody


class SupportMessageOut(OrmModel):
    id: UUID
    case_id: UUID
    author_id: UUID
    body: str
    created_at: datetime
