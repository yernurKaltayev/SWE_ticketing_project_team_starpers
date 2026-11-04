from decimal import Decimal
from typing import Literal
from uuid import UUID

from app.schemas.common import OrmModel


class VenueOut(OrmModel):
    id: UUID
    name: str
    address: str
    city: str
    lat: Decimal | None
    lng: Decimal | None


class LayoutOut(OrmModel):
    id: UUID
    venue_id: UUID
    name: str


class SeatStatusOut(OrmModel):
    seat_id: UUID
    section_name: str
    row_label: str
    number: int
    price_category: str
    is_accessible: bool
    status: Literal["available", "held", "sold"]


class SeatMapOut(OrmModel):
    event_id: UUID
    layout_id: UUID
    seats: list[SeatStatusOut]
