from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class RefundIn(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class RefundOut(BaseModel):
    id: UUID
    order_id: UUID
    amount: int
    currency: str
    reason: str
    status: str
    completed_at: datetime | None
