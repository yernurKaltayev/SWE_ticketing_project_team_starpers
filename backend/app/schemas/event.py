"""Request and response schemas for P2 events."""

from datetime import datetime
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, model_validator


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

    @model_validator(mode="after")
    def validate_event(self) -> "EventCreate":
        if not self.title.strip() or not self.category.strip():
            raise ValueError("title and category must not be blank")
        if self.capacity <= 0:
            raise ValueError("capacity must be positive")
        try:
            ZoneInfo(self.timezone)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("timezone must be a valid IANA time zone") from exc
        for name in ("starts_at", "ends_at", "registration_opens_at", "registration_closes_at"):
            value = getattr(self, name)
            if value is not None and (value.tzinfo is None or value.utcoffset() is None):
                raise ValueError(f"{name} must include a UTC offset")
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be after starts_at")
        if (
            self.registration_opens_at is not None
            and self.registration_closes_at is not None
            and self.registration_opens_at > self.registration_closes_at
        ):
            raise ValueError("registration_opens_at must not be after registration_closes_at")
        if self.registration_closes_at is not None and self.registration_closes_at > self.ends_at:
            raise ValueError("registration must close by the end of the event")
        if self.seating_mode == "assigned" and self.layout_id is None:
            raise ValueError("assigned seating requires layout_id")
        return self


class EventUpdate(BaseModel):
    """PATCH schema: omitted fields stay unchanged; required fields cannot be null."""

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


class RefundPolicyOut(BaseModel):
    summary: str
    refundable_until: datetime | None = None


class EventOut(EventCreate):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    status: str
    paid_sales_status: str
    share_token: str
    images: list[str]
    # Set by the organizer through PUT /events/{id}/refund-policy (P7); null until then.
    refund_policy: RefundPolicyOut | None = None


class ImageUploadIn(BaseModel):
    filename: str
    content_type: str


class ImageUploadOut(BaseModel):
    upload_url: str
    image_url: str


class RefundPolicyIn(BaseModel):
    summary: str = Field(min_length=1, max_length=2000)
    refundable_until: datetime | None = None
