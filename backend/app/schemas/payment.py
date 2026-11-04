from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


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
    bank_name: str
    iban: str
    holder_name: str


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
