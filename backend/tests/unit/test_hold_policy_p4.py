from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas.seat_p4 import HoldCreateP4
from app.services.hold_policy_p4 import HOLD_DURATION, category_matches, is_active, must_release

NOW = datetime(2026, 11, 7, 12, 0, tzinfo=UTC)


def test_hold_duration_is_ten_minutes():
    assert timedelta(minutes=10) == HOLD_DURATION


def test_active_hold_expires_at_boundary():
    assert is_active("held", NOW + HOLD_DURATION, NOW)
    assert not is_active("held", NOW, NOW)
    assert not is_active("released", NOW + HOLD_DURATION, NOW)


def test_lazy_expiration_is_idempotent():
    assert must_release("held", NOW, NOW)
    assert not must_release("expired", NOW, NOW)
    assert not must_release("sold", NOW, NOW)


def test_missing_timezone_is_rejected():
    with pytest.raises(ValueError):
        is_active("held", NOW.replace(tzinfo=None), NOW)


def test_price_categories_match_case_insensitively():
    assert category_matches(" VIP ", "vip")
    assert category_matches(None, None)
    assert not category_matches("VIP", "Standard")
    assert not category_matches(None, "VIP")


def test_hold_rejects_duplicate_seats():
    seat = uuid4()
    with pytest.raises(ValidationError):
        HoldCreateP4(ticket_type_id=uuid4(), seat_ids=[seat, seat])


def test_hold_requires_at_least_one_seat():
    with pytest.raises(ValidationError):
        HoldCreateP4(ticket_type_id=uuid4(), seat_ids=[])


def test_hold_rejects_above_maximum():
    with pytest.raises(ValidationError):
        HoldCreateP4(ticket_type_id=uuid4(), seat_ids=[uuid4() for _ in range(11)])
