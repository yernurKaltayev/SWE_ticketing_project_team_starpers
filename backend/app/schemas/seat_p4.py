"""P4 API types. Kept separate from the pre-existing P0 schemas until reconciled."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class VenueSummaryP4(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    address: str | None = None
    city: str | None = None


class LayoutSummaryP4(BaseModel):
    id: UUID
    venue_id: UUID
    name: str


class SeatP4(BaseModel):
    id: UUID
    section: str
    row: str
    label: str
    price_category: str | None = None
    accessible: bool = False
    status: Literal["available", "held", "sold"]


class SeatMapP4(BaseModel):
    event_id: UUID
    venue_id: UUID
    layout_id: UUID
    seats: list[SeatP4]


class HoldCreateP4(BaseModel):
    ticket_type_id: UUID
    seat_ids: list[UUID] = Field(min_length=1, max_length=10)

    @field_validator("seat_ids")
    @classmethod
    def seats_must_be_distinct(cls, ids: list[UUID]) -> list[UUID]:
        if len(ids) != len(set(ids)):
            raise ValueError("seat_ids must be distinct")
        return ids


class HoldResponseP4(BaseModel):
    id: UUID
    event_id: UUID
    seat_ids: list[UUID]
    status: Literal["held", "released", "expired", "sold"]
    expires_at: datetime
