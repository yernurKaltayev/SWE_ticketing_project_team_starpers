"""Payments, paid-sales activation and payouts [P6]. All money movement is simulated."""

import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import (
    Base,
    Currency,
    FalseByDefault,
    MoneyAmount,
    Timestamps,
    TrueByDefault,
    UUIDPrimaryKey,
    ZeroMoney,
    fk,
    pg_enum,
)


class PaymentKind(enum.StrEnum):
    ticket = "ticket"
    activation_fee = "activation_fee"


class PaymentProviderName(enum.StrEnum):
    sandbox = "sandbox"


class PaymentStatus(enum.StrEnum):
    pending = "pending"
    succeeded = "succeeded"
    failed = "failed"
    cancelled = "cancelled"


class ActivationStatus(enum.StrEnum):
    incomplete = "incomplete"
    active = "active"
    suspended = "suspended"


class PayoutStatus(enum.StrEnum):
    pending = "pending"
    scheduled = "scheduled"
    paid = "paid"
    failed = "failed"


class Payment(UUIDPrimaryKey, Timestamps, Currency, Base):
    __tablename__ = "payments"
    __table_args__ = (
        # Webhook idempotency: a repeated provider event cannot create a second payment.
        UniqueConstraint("provider", "provider_ref"),
        CheckConstraint(
            "(kind = 'ticket' AND order_id IS NOT NULL) "
            "OR (kind = 'activation_fee' AND activation_id IS NOT NULL)",
            name="kind_has_target",
        ),
    )

    order_id: Mapped[uuid.UUID | None] = fk("orders.id")
    activation_id: Mapped[uuid.UUID | None] = fk("paid_sales_activations.id")
    kind: Mapped[PaymentKind] = mapped_column(pg_enum(PaymentKind, "payment_kind"))
    provider: Mapped[PaymentProviderName] = mapped_column(
        pg_enum(PaymentProviderName, "payment_provider")
    )
    provider_ref: Mapped[str]
    status: Mapped[PaymentStatus] = mapped_column(
        pg_enum(PaymentStatus, "payment_status"),
        default=PaymentStatus.pending,
        server_default="pending",
    )
    amount: Mapped[MoneyAmount]
    fee_amount: Mapped[ZeroMoney]
    is_simulated: Mapped[TrueByDefault]
    failure_reason: Mapped[str | None]
    raw_event: Mapped[dict[str, Any] | None] = mapped_column(JSONB)


class PayoutAccount(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "payout_accounts"

    organizer_id: Mapped[uuid.UUID] = fk("organizer_profiles.id")
    bank_name: Mapped[str]
    iban_encrypted: Mapped[str]
    holder_name: Mapped[str]
    is_verified: Mapped[FalseByDefault]
    is_simulated: Mapped[TrueByDefault]


class PaidSalesActivation(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "paid_sales_activations"

    event_id: Mapped[uuid.UUID] = fk("events.id", index=False, unique=True)
    identity_verified: Mapped[FalseByDefault]
    payout_account_id: Mapped[uuid.UUID | None] = fk("payout_accounts.id")
    # Added after both tables exist: payments and activations reference each other.
    activation_payment_id: Mapped[uuid.UUID | None] = fk("payments.id", use_alter=True)
    terms_accepted_at: Mapped[datetime | None]
    status: Mapped[ActivationStatus] = mapped_column(
        pg_enum(ActivationStatus, "activation_status"),
        default=ActivationStatus.incomplete,
        server_default="incomplete",
    )
    suspended_reason: Mapped[str | None]
    activated_at: Mapped[datetime | None]


class Payout(UUIDPrimaryKey, Timestamps, Currency, Base):
    __tablename__ = "payouts"

    organizer_id: Mapped[uuid.UUID] = fk("organizer_profiles.id")
    event_id: Mapped[uuid.UUID] = fk("events.id")
    gross: Mapped[MoneyAmount]
    fees: Mapped[MoneyAmount]
    refunds: Mapped[MoneyAmount]
    net: Mapped[MoneyAmount]
    status: Mapped[PayoutStatus] = mapped_column(
        pg_enum(PayoutStatus, "payout_status"),
        default=PayoutStatus.pending,
        server_default="pending",
    )
    scheduled_for: Mapped[datetime | None]
    paid_at: Mapped[datetime | None]
