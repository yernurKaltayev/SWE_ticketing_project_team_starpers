"""In-app notifications and their email delivery state [P9]."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import Index, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Counter, JsonObject, Timestamps, UUIDPrimaryKey, fk, pg_enum


class NotificationType(enum.StrEnum):
    account_verification = "account_verification"
    purchase_confirmation = "purchase_confirmation"
    payment_failed = "payment_failed"
    ticket_delivery = "ticket_delivery"
    event_update = "event_update"
    event_cancelled = "event_cancelled"
    refund_completed = "refund_completed"
    payout_status = "payout_status"
    support_message = "support_message"
    support_assigned = "support_assigned"
    support_status = "support_status"


class EmailStatus(enum.StrEnum):
    pending = "pending"
    sent = "sent"
    failed = "failed"


class Notification(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "notifications"
    __table_args__ = (
        # The email worker scans pending rows oldest first (migration p9_notifications).
        Index(
            "ix_notifications_email_pending",
            "created_at",
            postgresql_where=text("email_status = 'pending'"),
        ),
        Index("ix_notifications_user_id_created_at", "user_id", "created_at"),
    )

    user_id: Mapped[uuid.UUID] = fk("users.id")
    type: Mapped[NotificationType] = mapped_column(pg_enum(NotificationType, "notification_type"))
    title: Mapped[str]
    body: Mapped[str]
    payload: Mapped[JsonObject]
    read_at: Mapped[datetime | None]
    email_status: Mapped[EmailStatus] = mapped_column(
        pg_enum(EmailStatus, "email_status"), default=EmailStatus.pending, server_default="pending"
    )
    email_attempts: Mapped[Counter]
