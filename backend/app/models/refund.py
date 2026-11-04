"""Refunds [P7]."""

import enum
import uuid
from datetime import datetime

from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Currency, MoneyAmount, Timestamps, UUIDPrimaryKey, fk, pg_enum


class RefundStatus(enum.StrEnum):
    pending = "pending"
    completed = "completed"
    failed = "failed"


class Refund(UUIDPrimaryKey, Timestamps, Currency, Base):
    __tablename__ = "refunds"

    order_id: Mapped[uuid.UUID] = fk("orders.id")
    payment_id: Mapped[uuid.UUID] = fk("payments.id")
    amount: Mapped[MoneyAmount]
    reason: Mapped[str]
    initiated_by: Mapped[uuid.UUID] = fk("users.id")
    status: Mapped[RefundStatus] = mapped_column(
        pg_enum(RefundStatus, "refund_status"),
        default=RefundStatus.pending,
        server_default="pending",
    )
    provider_ref: Mapped[str | None]
    completed_at: Mapped[datetime | None]
