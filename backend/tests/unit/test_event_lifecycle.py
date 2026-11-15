from datetime import UTC, datetime, timedelta

import pytest

from app.models.event import EventStatus
from app.services.event_lifecycle import classify

START = datetime(2026, 12, 1, 18, 0, tzinfo=UTC)
END = START + timedelta(hours=2)


@pytest.mark.parametrize(
    ("status", "now", "expected"),
    [
        (EventStatus.published, START - timedelta(seconds=1), "upcoming"),
        (EventStatus.published, START, "active"),
        (EventStatus.published, END - timedelta(seconds=1), "active"),
        (EventStatus.published, END, "completed"),
        (EventStatus.published, END + timedelta(days=30), "completed"),
        (EventStatus.cancelled, START - timedelta(days=1), "cancelled"),
        (EventStatus.cancelled, END + timedelta(days=1), "cancelled"),
        (EventStatus.draft, START - timedelta(days=1), "upcoming"),
        (EventStatus.suspended, START + timedelta(minutes=1), "active"),
        ("cancelled", START, "cancelled"),
    ],
)
def test_classify(status, now, expected):
    assert classify(status, START, END, now) == expected
