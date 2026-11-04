"""Money is an integer count of minor units (tiyn; 1 KZT = 100 tiyn) plus a currency.

Never use floats for money. DB columns are `bigint` + `char(3)`; API fields are integers
in tiyn. `Money` is for arithmetic and display inside services.
"""

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from typing import Self

DEFAULT_CURRENCY = "KZT"
MINOR_UNITS_PER_MAJOR = 100


@dataclass(frozen=True, slots=True, order=False)
class Money:
    amount: int
    currency: str = DEFAULT_CURRENCY

    def __post_init__(self) -> None:
        if isinstance(self.amount, bool) or not isinstance(self.amount, int):
            raise TypeError("Money.amount must be an integer number of minor units")
        if len(self.currency) != 3 or not self.currency.isupper():
            raise ValueError("currency must be a 3-letter uppercase ISO 4217 code")

    @classmethod
    def from_major(cls, value: Decimal | int | str, currency: str = DEFAULT_CURRENCY) -> Self:
        """`Money.from_major("1500.50")` -> 150050 tiyn. Rejects fractions of a tiyn."""
        if isinstance(value, float):
            raise TypeError("pass a Decimal, int or str, not a float")
        minor = Decimal(value) * MINOR_UNITS_PER_MAJOR
        if minor != minor.to_integral_value():
            raise ValueError(f"{value} has more precision than the minor unit")
        return cls(int(minor), currency)

    @classmethod
    def zero(cls, currency: str = DEFAULT_CURRENCY) -> Self:
        return cls(0, currency)

    @property
    def major(self) -> Decimal:
        return Decimal(self.amount) / MINOR_UNITS_PER_MAJOR

    def percent(self, percent: Decimal | int | str) -> "Money":
        """Share of this amount, rounded half-up to the minor unit (fees, % discounts)."""
        if isinstance(percent, float):
            raise TypeError("pass a Decimal, int or str, not a float")
        share = Decimal(self.amount) * Decimal(percent) / 100
        return Money(int(share.quantize(Decimal(1), rounding=ROUND_HALF_UP)), self.currency)

    def _same_currency(self, other: "Money") -> None:
        if self.currency != other.currency:
            raise ValueError(f"cannot combine {self.currency} and {other.currency}")

    def __add__(self, other: "Money") -> "Money":
        self._same_currency(other)
        return Money(self.amount + other.amount, self.currency)

    def __sub__(self, other: "Money") -> "Money":
        self._same_currency(other)
        return Money(self.amount - other.amount, self.currency)

    def __mul__(self, quantity: int) -> "Money":
        if not isinstance(quantity, int):
            raise TypeError("Money can only be multiplied by an integer quantity")
        return Money(self.amount * quantity, self.currency)

    def __lt__(self, other: "Money") -> bool:
        self._same_currency(other)
        return self.amount < other.amount

    def __le__(self, other: "Money") -> bool:
        self._same_currency(other)
        return self.amount <= other.amount

    def __str__(self) -> str:
        return f"{self.major:,.2f} {self.currency}"
