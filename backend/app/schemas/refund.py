from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class RefundIn(BaseModel):
    reason: str


class RefundOut(BaseModel):
    id: UUID
    order_id: UUID
    amount: int
    currency: str
    reason: str
    status: str
    completed_at: datetime | None
