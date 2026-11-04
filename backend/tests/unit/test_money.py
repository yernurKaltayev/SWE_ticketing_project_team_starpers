from decimal import Decimal

import pytest

from app.core.money import Money


def test_from_major_converts_to_tiyn():
    assert Money.from_major("1500.50").amount == 150050
    assert Money.from_major(15000).amount == 1500000


def test_from_major_rejects_fractions_of_a_tiyn():
    with pytest.raises(ValueError, match="precision"):
        Money.from_major("1.005")


@pytest.mark.parametrize(
    "build", [lambda: Money(1.5), lambda: Money.from_major(1.5), lambda: Money(True)]
)
def test_floats_and_bools_are_rejected(build):
    with pytest.raises(TypeError):
        build()


def test_invalid_currency_is_rejected():
    with pytest.raises(ValueError, match="currency"):
        Money(100, "kzt")


def test_arithmetic():
    assert Money(100) + Money(50) == Money(150)
    assert Money(100) - Money(150) == Money(-50)
    assert Money(250) * 3 == Money(750)
    assert Money(100) < Money(101)


@pytest.mark.parametrize(
    "operation",
    [
        lambda a, b: a + b,
        lambda a, b: a - b,
        lambda a, b: a < b,
        lambda a, b: a <= b,
    ],
)
def test_mixing_currencies_is_rejected(operation):
    with pytest.raises(ValueError, match="cannot combine"):
        operation(Money(100, "KZT"), Money(100, "USD"))


@pytest.mark.parametrize(
    ("amount", "percent", "expected"),
    [
        (10000, 3, 300),
        (10050, "2.5", 251),  # 251.25 rounds down
        (150, Decimal("1"), 2),  # 1.5 rounds half-up
        (50, 1, 1),  # 0.5 rounds half-up, not to even
        (0, 3, 0),
    ],
)
def test_percent_rounds_half_up(amount, percent, expected):
    assert Money(amount).percent(percent).amount == expected


def test_display():
    assert str(Money(150050)) == "1,500.50 KZT"
    assert Money(150050).major == Decimal("1500.50")
