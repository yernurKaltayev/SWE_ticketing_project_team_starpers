from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class EventCreate(BaseModel):
    title: str
    description: str
    category: str
    venue_id: UUID
    layout_id: UUID | None = None
    starts_at: datetime
    ends_at: datetime
    timezone: str
    visibility: Literal["public", "unlisted", "private"] = "public"
    seating_mode: Literal["general_admission", "assigned"] = "general_admission"
    capacity: int
    registration_opens_at: datetime | None = None
    registration_closes_at: datetime | None = None


class EventUpdate(BaseModel):
    """Partial update: only the fields sent are changed."""

    title: str | None = None
    description: str | None = None
    category: str | None = None
    venue_id: UUID | None = None
    layout_id: UUID | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    timezone: str | None = None
    visibility: Literal["public", "unlisted", "private"] | None = None
    seating_mode: Literal["general_admission", "assigned"] | None = None
    capacity: int | None = None
    registration_opens_at: datetime | None = None
    registration_closes_at: datetime | None = None


class EventOut(EventCreate):
    id: UUID
    status: str
    paid_sales_status: str
    share_token: str
    images: list[str]


class ImageUploadIn(BaseModel):
    filename: str
    content_type: str


class ImageUploadOut(BaseModel):
    upload_url: str
    image_url: str


class RefundPolicyIn(BaseModel):
    summary: str
    refundable_until: datetime | None = None
