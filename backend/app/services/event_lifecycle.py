"""Event lifecycle classification [P12]. Derived from dates, never stored."""

from datetime import datetime
from typing import Literal

from app.models.event import EventStatus

Lifecycle = Literal["upcoming", "active", "completed", "cancelled"]


def classify(
    status: EventStatus | str, starts_at: datetime, ends_at: datetime, now: datetime
) -> Lifecycle:
    """Cancelled wins; otherwise the dates decide (so drafts and suspended events are
    classified by date too, while the stored `status` is reported separately)."""
    if str(getattr(status, "value", status)) == EventStatus.cancelled.value:
        return "cancelled"
    if now >= ends_at:
        return "completed"
    if now >= starts_at:
        return "active"
    return "upcoming"
