"""P14: read-only iCalendar export for BiletFlow events.

The calendar sequence is the number of committed event lifecycle/change audit
entries (P2 writes them in the same transaction as the event change). This
avoids a redundant revision column or a schema migration.
"""

import secrets
import uuid
from datetime import UTC, date
from urllib.parse import quote
from zoneinfo import ZoneInfo

from icalendar import Calendar, Timezone
from icalendar import Event as ICalEvent
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import check_event_access
from app.core.errors import ForbiddenError, NotFoundError
from app.models.audit import AuditLog
from app.models.event import Event, EventStatus, EventVisibility
from app.models.user import User
from app.models.venue import Venue

# Creation is the initial edition (SEQUENCE 0); each subsequent change adds 1.
_CALENDAR_CHANGE_ACTIONS = (
    "event_updated",
    "event_published",
    "event_unpublished",
    "event_cancelled",
)


def _calendar_url(event: Event) -> str:
    """A frontend event page; never put a private share token in a public URL."""
    base = get_settings().web_base_url.rstrip("/")
    if event.visibility == EventVisibility.unlisted:
        return f"{base}/events/by-token/{quote(event.share_token, safe='')}"
    return f"{base}/events/{event.id}"


def _make_calendar(event: Event, venue: Venue, sequence: int) -> bytes:
    """Serialize an RFC 5545 VCALENDAR with explicit local timezone rules."""
    timezone = ZoneInfo(event.timezone)
    starts_at = event.starts_at.astimezone(timezone)
    ends_at = event.ends_at.astimezone(timezone)
    changed_at = event.updated_at.astimezone(UTC)

    calendar = Calendar()
    calendar.add("prodid", "-//BiletFlow//Event Calendar//EN")
    calendar.add("version", "2.0")
    calendar.add("calscale", "GREGORIAN")
    calendar.add("method", "PUBLISH")

    # UTC timestamps use a trailing Z rather than a TZID. Non-UTC event times
    # retain their IANA TZID and include the applicable standard/DST rules.
    if event.timezone not in {"UTC", "Etc/UTC"}:
        first_year = max(1, min(starts_at.year, ends_at.year) - 1)
        last_year = min(9999, max(starts_at.year, ends_at.year) + 1)
        calendar.add_component(
            Timezone.from_tzinfo(
                timezone,
                tzid=event.timezone,
                first_date=date(first_year, 1, 1),
                last_date=date(last_year, 12, 31),
            )
        )

    entry = ICalEvent()
    entry.add("uid", f"{event.id}@biletflow.kz")
    entry.add("sequence", sequence)
    entry.add("dtstamp", changed_at)
    entry.add("last-modified", changed_at)
    entry.add("dtstart", starts_at)
    entry.add("dtend", ends_at)
    entry.add("summary", event.title)
    entry.add("description", event.description)
    entry.add("location", f"{venue.name}, {venue.address}, {venue.city}")
    entry.add("url", _calendar_url(event))
    status = "CONFIRMED"
    if event.status == EventStatus.cancelled:
        status = "CANCELLED"
    elif event.status == EventStatus.draft:
        status = "TENTATIVE"
    entry.add("status", status)
    calendar.add_component(entry)
    return calendar.to_ical()


async def export_event_calendar(
    db: AsyncSession,
    event_id: uuid.UUID,
    *,
    user: User | None = None,
    share_token: str | None = None,
) -> bytes:
    """Fetch a visible event and return its iCalendar file (no DB writes).

    Public events can be downloaded anonymously. Unlisted events require their
    share token or event-level access; private events and drafts require
    event-level access. Cancelled public events remain downloadable, allowing
    previously imported events to receive their cancellation status.
    """
    event = await db.get(Event, event_id)
    if event is None:
        raise NotFoundError("The event was not found.", code="event_not_found")

    public = event.visibility == EventVisibility.public and event.status in {
        EventStatus.published,
        EventStatus.cancelled,
    }
    unlisted_token_valid = (
        event.visibility == EventVisibility.unlisted
        and event.status in {EventStatus.published, EventStatus.cancelled}
        and share_token is not None
        and event.share_token is not None
        and share_token != ""
        and secrets.compare_digest(share_token, event.share_token)
    )
    if not (public or unlisted_token_valid):
        if user is None:
            raise NotFoundError("The event was not found.", code="event_not_found")
        try:
            await check_event_access(db, user, event_id)
        except ForbiddenError as exc:
            raise NotFoundError("The event was not found.", code="event_not_found") from exc

    venue = await db.get(Venue, event.venue_id)
    if venue is None:
        raise NotFoundError("The event venue was not found.", code="venue_not_found")

    # All of these actions are written by P2 transactionally with the change.
    # AuditLog is append-only, giving each event a stable, monotonic sequence.
    revisions = await db.scalar(
        select(func.count(AuditLog.id)).where(
            AuditLog.event_id == event.id,
            AuditLog.entity_type == "event",
            AuditLog.entity_id == str(event.id),
            AuditLog.action_type.in_(_CALENDAR_CHANGE_ACTIONS),
        )
    )
    return _make_calendar(event, venue, int(revisions or 0))
