from typing import Literal
from uuid import UUID

from pydantic import BaseModel

from app.schemas.ticket import TicketOut


class VerifyIn(BaseModel):
    event_id: UUID
    qr_payload: str


class VerifyOut(BaseModel):
    result: Literal[
        "accepted", "already_used", "invalid", "refunded", "wrong_event", "not_a_ticket"
    ]
    ticket: TicketOut | None
    message: str


class UndoCheckInIn(BaseModel):
    reason: str


class CheckInStatsOut(BaseModel):
    registered: int
    checked_in: int
