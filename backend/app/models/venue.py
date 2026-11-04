"""Venues and predefined seating layouts [P4]."""

import uuid
from decimal import Decimal

from sqlalchemy import Numeric, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, FalseByDefault, Timestamps, UUIDPrimaryKey, fk


class Venue(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "venues"

    name: Mapped[str]
    address: Mapped[str]
    city: Mapped[str] = mapped_column(index=True)
    lat: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    lng: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))


class VenueLayout(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "venue_layouts"

    venue_id: Mapped[uuid.UUID] = fk("venues.id")
    name: Mapped[str]


class VenueSection(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "venue_sections"

    layout_id: Mapped[uuid.UUID] = fk("venue_layouts.id")
    name: Mapped[str]
    price_category: Mapped[str]


class VenueRow(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "venue_rows"

    section_id: Mapped[uuid.UUID] = fk("venue_sections.id")
    label: Mapped[str]
    position: Mapped[int]


class Seat(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "seats"
    __table_args__ = (UniqueConstraint("row_id", "number"),)

    row_id: Mapped[uuid.UUID] = fk("venue_rows.id")
    number: Mapped[int]
    is_accessible: Mapped[FalseByDefault]
    price_category: Mapped[str]
