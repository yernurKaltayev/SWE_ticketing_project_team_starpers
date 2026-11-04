from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class TicketTypeIn(BaseModel):
    name: str
    description: str | None = None
    price_amount: int = 0  # tiyn
    quantity_total: int
    sales_start: datetime | None = None
    sales_end: datetime | None = None
    max_per_order: int = 10
    is_hidden: bool = False
    price_category: str | None = None


class TicketTypeUpdate(BaseModel):
    """Partial update: only the fields sent are changed."""

    name: str | None = None
    description: str | None = None
    price_amount: int | None = None
    quantity_total: int | None = None
    sales_start: datetime | None = None
    sales_end: datetime | None = None
    max_per_order: int | None = None
    is_hidden: bool | None = None
    price_category: str | None = None


class TicketTypeOut(TicketTypeIn):
    id: UUID
    available: int
    reserved: int
    sold: int
    refunded: int
    checked_in: int


class AvailabilityOut(BaseModel):
    """Public view of a ticket type: no sales counters beyond what is left to buy."""

    ticket_type_id: UUID
    name: str
    price_amount: int
    currency: str
    available: int
    on_sale: bool
