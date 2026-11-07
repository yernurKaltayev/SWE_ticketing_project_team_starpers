"""P3 ticket-type inputs and outputs.

These are intentionally in a separate module until they can be reconciled with
backend/app/schemas/ticket_type.py from the live repository.
"""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class TicketTypeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    price_amount: Decimal = Field(default=Decimal("0"), ge=0, max_digits=12, decimal_places=2)
    currency: str = "KZT"
    quantity_total: int = Field(gt=0)
    is_free: bool = True
    sales_start: datetime | None = None
    sales_end: datetime | None = None
    max_per_order: int = Field(default=10, gt=0)
    is_hidden: bool = False
    price_category: str | None = None

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("name must not be blank")
        return value

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, value: str) -> str:
        value = value.strip().upper()
        if len(value) != 3 or not value.isalpha():
            raise ValueError("currency must be a three-letter ISO code")
        return value

    @model_validator(mode="after")
    def validate_configuration(self) -> "TicketTypeCreate":
        if self.is_free and self.price_amount != 0:
            raise ValueError("free tickets must have a zero price")
        if not self.is_free and self.price_amount <= 0:
            raise ValueError("paid tickets must have a positive price")
        if self.max_per_order > self.quantity_total:
            raise ValueError("max_per_order cannot exceed total quantity")
        for key in ("sales_start", "sales_end"):
            value = getattr(self, key)
            if value is not None and (value.tzinfo is None or value.utcoffset() is None):
                raise ValueError(f"{key} must include a UTC offset")
        if self.sales_start and self.sales_end and self.sales_start >= self.sales_end:
            raise ValueError("sales_start must be before sales_end")
        return self


class TicketTypeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    price_amount: Decimal | None = None
    currency: str | None = None
    quantity_total: int | None = None
    is_free: bool | None = None
    sales_start: datetime | None = None
    sales_end: datetime | None = None
    max_per_order: int | None = None
    is_hidden: bool | None = None
    price_category: str | None = None


class TicketTypeOut(TicketTypeCreate):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    event_id: UUID
    qty_reserved: int
    qty_sold: int
    qty_refunded: int
    qty_checked_in: int
    qty_available: int


class PublicTicketAvailability(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    is_free: bool
    price_amount: Decimal
    currency: str
    max_per_order: int
    quantity_available: int
    sales_open: bool


class EventAvailability(BaseModel):
    event_id: UUID
    registration_open: bool
    ticket_types: list[PublicTicketAvailability]
