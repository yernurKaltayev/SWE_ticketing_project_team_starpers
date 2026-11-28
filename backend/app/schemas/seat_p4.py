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


class LayoutSectionIn(BaseModel):
    """One block of the hall: the same number of seats in each of its rows."""

    name: str = Field(min_length=1, max_length=60)
    price_category: str = Field(min_length=1, max_length=40)
    rows: int = Field(ge=1, le=30)
    seats_per_row: int = Field(ge=1, le=50)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("name is required")
        return value

    @field_validator("price_category")
    @classmethod
    def normalise_category(cls, value: str) -> str:
        value = value.strip().lower()
        if not value:
            raise ValueError("price_category is required")
        return value


class LayoutCreateP4(BaseModel):
    """A hall plan built from sections; rows are numbered 1..N from the stage back."""

    name: str = Field(min_length=1, max_length=80)
    sections: list[LayoutSectionIn] = Field(min_length=1, max_length=8)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("name is required")
        return value

    @field_validator("sections")
    @classmethod
    def check_sections(cls, sections: list[LayoutSectionIn]) -> list[LayoutSectionIn]:
        names = [s.name.lower() for s in sections]
        if len(names) != len(set(names)):
            raise ValueError("section names must be distinct")
        if sum(s.rows * s.seats_per_row for s in sections) > MAX_LAYOUT_SEATS:
            raise ValueError(f"a layout holds at most {MAX_LAYOUT_SEATS} seats")
        return sections


MAX_LAYOUT_SEATS = 2000
