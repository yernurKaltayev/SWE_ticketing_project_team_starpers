"""Pure P4 hold state/validation rules, independent of the database."""

from datetime import UTC, datetime, timedelta

HOLD_DURATION = timedelta(minutes=10)


def now_utc() -> datetime:
    return datetime.now(UTC)


def is_active(status: str, expires_at: datetime, now: datetime) -> bool:
    if expires_at.tzinfo is None or now.tzinfo is None:
        raise ValueError("hold times must have timezone information")
    return status == "held" and expires_at > now


def category_matches(seat_category: str | None, ticket_category: str | None) -> bool:
    """Null categories may only be paired with null categories (GA/unclassified)."""
    if seat_category is None or ticket_category is None:
        return seat_category is None and ticket_category is None
    return str(seat_category).strip().casefold() == str(ticket_category).strip().casefold()


def must_release(status: str, expires_at: datetime, now: datetime) -> bool:
    return status == "held" and expires_at <= now
