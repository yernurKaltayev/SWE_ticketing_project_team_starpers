from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class HoldIn(BaseModel):
    seat_ids: list[UUID]


class HoldOut(BaseModel):
    hold_ids: list[UUID]
    expires_at: datetime
