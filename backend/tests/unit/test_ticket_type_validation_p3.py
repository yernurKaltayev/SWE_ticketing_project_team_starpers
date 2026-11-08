"""Fast schema checks: no running database required."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.schemas.ticket_type_p3 import TicketTypeCreate, TicketTypeUpdate


def ticket(**changes):
    return {"name": "General", "quantity_total": 20, "is_free": True, **changes}


def test_free_ticket_must_have_zero_price():
    with pytest.raises(ValidationError):
        TicketTypeCreate.model_validate(ticket(price_amount="100"))


def test_paid_ticket_requires_positive_price():
    with pytest.raises(ValidationError):
        TicketTypeCreate.model_validate(ticket(is_free=False, price_amount=0))


def test_valid_paid_ticket_and_currency_normalization():
    item = TicketTypeCreate.model_validate(
        ticket(is_free=False, price_amount="100.50", currency="kzt")
    )
    assert item.price_amount == Decimal("100.50")
    assert item.currency == "KZT"


def test_reject_bad_quantities_and_order_limit():
    for kwargs in ({"quantity_total": 0}, {"max_per_order": 21}, {"max_per_order": 0}):
        data = ticket()
        data.update(kwargs)
        with pytest.raises(ValidationError):
            TicketTypeCreate.model_validate(data)


def test_sales_dates_must_be_aware_and_ordered():
    now = datetime.now(UTC)
    for kwargs in (
        {"sales_start": now.replace(tzinfo=None)},
        {"sales_end": now.replace(tzinfo=None)},
        {"sales_start": now, "sales_end": now - timedelta(days=1)},
    ):
        with pytest.raises(ValidationError):
            TicketTypeCreate.model_validate(ticket(**kwargs))


def test_update_tracks_explicit_null_so_it_can_be_validated_against_full_state():
    value = TicketTypeUpdate.model_validate({"sales_start": None, "price_amount": None})
    assert value.model_dump(exclude_unset=True) == {"sales_start": None, "price_amount": None}
