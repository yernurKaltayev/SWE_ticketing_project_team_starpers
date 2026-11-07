"""Behavior tests for the P4 service's expiry/release paths.

Use a deterministic fake for SQL rows so counter/idempotence logic can be
checked without a running DB; the separate PG tests establish DB uniqueness.
"""
from collections import Counter
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest

pytest.importorskip("app.models.event")  # P0/P2 models must be present in actual repo
from app.services import seat_service

pytestmark = pytest.mark.asyncio
NOW = datetime(2026, 11, 7, 12, 0, tzinfo=UTC)


class Result:
    def __init__(self, rows):
        self.rows = list(rows)

    def scalars(self):
        return self

    def all(self):
        return self.rows

    def first(self):
        return self.rows[0] if self.rows else None


class FakeDB:
    def __init__(self, group):
        self.group = group
        self.commits = 0
        self.ops = []

    async def scalar(self, stmt):
        return SimpleNamespace(id=self.group.event_id)  # mocked event row lock

    async def execute(self, stmt, params):
        sql = str(stmt).strip().lower()
        self.ops.append(sql)
        g = self.group
        if sql.startswith("select id from p4_hold_groups"):
            rows = [g.id] if g.status == "held" and g.expires_at <= params["now"] else []
            return Result(rows[:params.get("limit", 1_000_000)])
        if sql.startswith("select user_id, status, expires_at from p4_hold_groups"):
            if params["hold_id"] != g.id or params["event_id"] != g.event_id:
                return Result([])
            return Result([SimpleNamespace(user_id=g.user_id, status=g.status,
                                           expires_at=g.expires_at)])
        if sql.startswith("select ticket_type_id, count(*)"):
            counts = Counter(s.ticket_type_id for s in g.seats if s.status == "held")
            return Result(list(counts.items()))
        if sql.startswith("update p4_hold_seats set status ="):
            terminal = "expired" if "'expired'" in sql else "released"
            for seat in g.seats:
                if seat.status == "held":
                    seat.status = terminal
            return Result([])
        if sql.startswith("update p4_hold_groups set status ="):
            terminal = "expired" if "'expired'" in sql else "released"
            if g.status == "held":
                g.status = terminal
            return Result([])
        raise AssertionError(f"Unexpected P4 query: {sql}")

    async def commit(self):
        self.commits += 1


def group_at(expiry):
    return SimpleNamespace(id=uuid4(), event_id=uuid4(), user_id=uuid4(),
                           expires_at=expiry, status="held",
                           seats=[SimpleNamespace(ticket_type_id=uuid4(), status="held"),
                                  SimpleNamespace(ticket_type_id=uuid4(), status="held")])


async def test_expiration_releases_inventory_once(monkeypatch):
    group = group_at(NOW - timedelta(seconds=1))
    db = FakeDB(group)
    released = []

    async def fake_release(_db, ticket_id, count):
        released.append((ticket_id, count))
        return True

    monkeypatch.setattr(seat_service, "release_inventory", fake_release)
    assert await seat_service._expire_event(db, group.event_id, NOW) == 1
    assert group.status == "expired"
    assert all(seat.status == "expired" for seat in group.seats)
    assert len(released) == 2
    assert await seat_service._expire_event(db, group.event_id, NOW) == 0
    assert len(released) == 2


async def test_release_is_owner_scoped_and_idempotent(monkeypatch):
    group = group_at(NOW + timedelta(minutes=5))
    db = FakeDB(group)
    released = []

    async def fake_release(_db, ticket_id, count):
        released.append((ticket_id, count))
        return True

    monkeypatch.setattr(seat_service, "release_inventory", fake_release)
    with pytest.raises(seat_service.NotFoundError):
        await seat_service.release_hold(db, group.event_id, group.id, uuid4(), now=NOW)
    assert not released
    await seat_service.release_hold(db, group.event_id, group.id, group.user_id, now=NOW)
    assert group.status == "released"
    assert len(released) == 2
    assert db.commits == 1
    await seat_service.release_hold(db, group.event_id, group.id, group.user_id, now=NOW)
    assert len(released) == 2
    assert db.commits == 2


async def test_release_of_expired_hold_only_decrements_once(monkeypatch):
    group = group_at(NOW - timedelta(seconds=1))
    db = FakeDB(group)
    released = []

    async def fake_release(_db, ticket_id, count):
        released.append((ticket_id, count))
        return True

    monkeypatch.setattr(seat_service, "release_inventory", fake_release)
    await seat_service.release_hold(db, group.event_id, group.id, group.user_id, now=NOW)
    assert group.status == "expired"
    assert len(released) == 2
    await seat_service.release_hold(db, group.event_id, group.id, group.user_id, now=NOW)
    assert len(released) == 2
