from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class CampaignIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    discount_type: Literal["percent", "fixed"]
    # Whole percent (1-100) for `percent`; tiyn for `fixed`.
    discount_value: int = Field(gt=0)
    valid_from: datetime
    valid_to: datetime
    max_redemptions: int = Field(ge=1, le=1_000_000)
    # Empty list: the code applies to every ticket type of the event.
    ticket_type_ids: list[UUID] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def check_rules(self) -> "CampaignIn":
        if self.discount_type == "percent" and self.discount_value > 100:
            raise ValueError("a percent discount cannot exceed 100")
        if self.valid_from.tzinfo is None or self.valid_to.tzinfo is None:
            raise ValueError("valid_from and valid_to need a time zone")
        if self.valid_to <= self.valid_from:
            raise ValueError("valid_to must be after valid_from")
        return self


class CampaignUpdate(BaseModel):
    """Partial update: only the fields sent are changed."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    valid_from: datetime | None = None
    valid_to: datetime | None = None
    max_redemptions: int | None = Field(default=None, ge=1, le=1_000_000)
    is_enabled: bool | None = None


class CampaignOut(BaseModel):
    id: UUID
    event_id: UUID
    name: str
    discount_type: Literal["percent", "fixed"]
    discount_value: int
    valid_from: datetime
    valid_to: datetime
    max_redemptions: int
    ticket_type_ids: list[UUID]
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
    code: str = Field(min_length=1, max_length=64)
    # One entry per ticket: repeat an ID to price several tickets of that type.
    ticket_type_ids: list[UUID] = Field(min_length=1, max_length=100)


class PromoValidateOut(BaseModel):
    valid: bool
    discount_amount: int
    reason: str | None
