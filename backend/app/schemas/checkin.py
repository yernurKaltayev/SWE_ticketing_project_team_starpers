from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.ticket import TicketOut


class VerifyIn(BaseModel):
    event_id: UUID
    qr_payload: str = Field(min_length=1, max_length=2048)


class VerifyOut(BaseModel):
    result: Literal[
        "accepted", "already_used", "invalid", "refunded", "wrong_event", "not_a_ticket"
    ]
    ticket: TicketOut | None
    message: str


class UndoCheckInIn(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class CheckInStatsOut(BaseModel):
    registered: int
    checked_in: int
