from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class CampaignIn(BaseModel):
    name: str
    discount_type: Literal["percent", "fixed"]
    discount_value: int
    valid_from: datetime
    valid_to: datetime
    max_redemptions: int
    ticket_type_ids: list[UUID]


class CampaignUpdate(BaseModel):
    """Partial update: only the fields sent are changed."""

    name: str | None = None
    valid_from: datetime | None = None
    valid_to: datetime | None = None
    max_redemptions: int | None = None
    is_enabled: bool | None = None


class CampaignOut(CampaignIn):
    id: UUID
    event_id: UUID
    code: str
    redemptions_count: int
    is_enabled: bool
    qr_url: str


class CampaignReportOut(BaseModel):
    redemptions: int
    orders: int
    tickets_sold: int
    gross_revenue: int
    discount: int
    net_revenue: int


class PromoValidateIn(BaseModel):
    event_id: UUID
    code: str
    ticket_type_ids: list[UUID]


class PromoValidateOut(BaseModel):
    valid: bool
    discount_amount: int
    reason: str | None
