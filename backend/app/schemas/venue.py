from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, StringConstraints

from app.schemas.common import Name, OrmModel


class VenueCreate(BaseModel):
    """A venue an organizer types in the event editor. It joins the shared venue list."""

    name: Name
    address: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
    city: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


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
