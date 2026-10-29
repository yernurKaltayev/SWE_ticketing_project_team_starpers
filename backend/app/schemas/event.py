from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, EmailStr, Field, model_validator
from pydantic.alias_generators import to_camel


class WireModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="forbid", str_strip_whitespace=True
    )


PositiveInt = Annotated[int, Field(strict=True, gt=0, le=1_000_000)]
Money = Annotated[int, Field(strict=True, ge=0, le=100_000_000)]


class TicketTypeWrite(WireModel):
    id: str = Field(default="", max_length=36)
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)
    price: Money = 0
    quantity: PositiveInt
    # Legacy UI sends this field. Services explicitly ignore it; inventory is server-owned.
    sold: int = Field(default=0, ge=0)
    per_order_limit: int = Field(default=6, strict=True, ge=1, le=20)
    hidden: bool = False
    sale_starts_at: AwareDatetime | None = None
    sale_ends_at: AwareDatetime | None = None

    @model_validator(mode="after")
    def sale_window(self):
        if self.sale_starts_at and self.sale_ends_at and self.sale_ends_at <= self.sale_starts_at:
            raise ValueError("sale end must be after sale start")
        return self


class EventWrite(WireModel):
    title: str = Field(min_length=1, max_length=120)
    summary: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=20_000)
    category: Literal["music", "tech", "sports", "arts", "education", "business", "community"]
    city: str = Field(min_length=1, max_length=100)
    venue_name: str = Field(min_length=1, max_length=255)
    venue_address: str = Field(min_length=1, max_length=500)
    starts_at: AwareDatetime
    ends_at: AwareDatetime
    visibility: Literal["public", "unlisted", "private"] = "public"
    poster_hue: int = Field(default=45, ge=0, le=360)
    registration_starts_at: AwareDatetime | None = None
    registration_ends_at: AwareDatetime | None = None
    ticket_types: list[TicketTypeWrite] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def dates(self):
        if self.ends_at <= self.starts_at:
            raise ValueError("event end must be after event start")
        start, end = self.registration_starts_at, self.registration_ends_at
        if start and end and end <= start:
            raise ValueError("registration end must be after registration start")
        if (end and end > self.starts_at) or (start and start >= self.starts_at):
            raise ValueError("registration must close by event start")
        ids = [t.id for t in self.ticket_types if t.id]
        if len(ids) != len(set(ids)):
            raise ValueError("ticket type IDs must be unique")
        return self


class EventRead(EventWrite):
    id: UUID
    organizer_id: UUID
    organizer_name: str
    status: Literal["draft", "published", "cancelled", "suspended"]
    paid_sales_active: bool
    created_at: datetime
    updated_at: datetime


class ActivationRequest(WireModel):
    payout_iban: str = Field(pattern=r"^KZ\d{2}[A-Z0-9]{16}$")
    terms_accepted: Literal[True]


class SuspensionRequest(WireModel):
    suspended: bool


class CheckoutRequest(WireModel):
    selection: dict[UUID, Annotated[int, Field(strict=True, ge=0, le=20)]] = Field(
        min_length=1, max_length=20
    )
    promo_code: str | None = Field(default=None, max_length=20)
    outcome: Literal["approve", "decline"] = "approve"
    idempotency_key: str = Field(min_length=8, max_length=80)


class QuoteRequest(WireModel):
    selection: dict[UUID, Annotated[int, Field(strict=True, ge=0, le=20)]] = Field(
        min_length=1, max_length=20
    )
    promo_code: str | None = Field(default=None, max_length=20)


class PromoWrite(WireModel):
    code: str = Field(pattern=r"^[A-Z0-9_-]{3,20}$")
    kind: Literal["percent", "fixed"]
    value: PositiveInt
    max_redemptions: PositiveInt
    campaign_name: str = Field(default="", max_length=255)

    @model_validator(mode="after")
    def discount(self):
        if self.kind == "percent" and self.value > 100:
            raise ValueError("percentage discount cannot exceed 100")
        return self


class PromoRead(PromoWrite):
    id: UUID
    event_id: UUID
    redemptions: int
    active: bool


class PromoStatusRequest(WireModel):
    active: bool


class PriceQuote(WireModel):
    subtotal: int
    discount: int
    total: int
    promo: PromoRead | None


class OrderItemRead(WireModel):
    ticket_type_id: UUID
    name: str
    quantity: int
    unit_price: int


class OrderRead(WireModel):
    id: UUID
    event_id: UUID
    user_id: UUID
    buyer_name: str
    buyer_email: str
    items: list[OrderItemRead]
    subtotal: int
    discount: int
    total: int
    promo_code: str | None
    status: Literal["paid", "failed", "refunded"]
    created_at: datetime


class TicketRead(WireModel):
    id: UUID
    code: str
    order_id: UUID
    event_id: UUID
    user_id: UUID
    ticket_type_name: str
    holder_name: str
    holder_email: str
    status: Literal["valid", "checked_in", "cancelled", "refunded"]
    issued_at: datetime


class CheckoutRead(WireModel):
    order: OrderRead
    tickets: list[TicketRead]


class OrderWithTickets(CheckoutRead):
    event: EventRead


class TicketWithEvent(WireModel):
    ticket: TicketRead
    event: EventRead


class AuditRead(WireModel):
    id: UUID
    event_id: UUID
    at: datetime
    actor: str
    action: str


class StaffRequest(WireModel):
    email: EmailStr


class CheckInRequest(WireModel):
    code: str = Field(min_length=1, max_length=200)
