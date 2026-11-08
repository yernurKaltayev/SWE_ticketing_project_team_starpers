from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class PaymentOut(BaseModel):
    id: UUID
    kind: Literal["ticket", "activation_fee"]
    status: str
    amount: int
    fee_amount: int
    currency: str
    is_simulated: bool
    checkout_url: str | None
    failure_reason: str | None


class ActivationOut(BaseModel):
    event_id: UUID
    status: Literal["incomplete", "active", "suspended"]
    identity_verified: bool
    payout_account_id: UUID | None
    activation_fee_paid: bool
    terms_accepted_at: datetime | None
    missing_steps: list[str]
    is_simulated: bool


class ActivationUpdate(BaseModel):
    payout_account_id: UUID | None = None
    accept_terms: bool | None = None


class PayoutAccountIn(BaseModel):
    bank_name: str = Field(min_length=1, max_length=200)
    iban: str = Field(min_length=15, max_length=42)
    holder_name: str = Field(min_length=1, max_length=200)

    @field_validator("iban")
    @classmethod
    def valid_iban(cls, value: str) -> str:
        """ISO 13616 mod-97 checksum, e.g. KZ86125KZT5004100100. Spaces are allowed."""
        iban = value.replace(" ", "").upper()
        if not (15 <= len(iban) <= 34 and iban[:2].isalpha() and iban.isalnum()):
            raise ValueError("not an IBAN")
        digits = "".join(str(int(char, 36)) for char in iban[4:] + iban[:4])
        if int(digits) % 97 != 1:
            raise ValueError("IBAN checksum is wrong")
        return iban


class PayoutAccountOut(BaseModel):
    id: UUID
    bank_name: str
    iban_last4: str
    holder_name: str
    is_verified: bool
    is_simulated: bool


class PayoutOut(BaseModel):
    id: UUID
    event_id: UUID
    gross: int
    fees: int
    refunds: int
    net: int
    currency: str
    status: str
    scheduled_for: datetime | None
    paid_at: datetime | None


class FinancialSummaryOut(BaseModel):
    gross: int
    fees: int
    refunds: int
    estimated_payout: int
    currency: str
    is_simulated: bool


class SimulatePaymentIn(BaseModel):
    """SANDBOX control. Decides what the simulated provider reports; no card data."""

    outcome: Literal["succeeded", "failed"]
    failure_reason: str | None = Field(default=None, max_length=200)
