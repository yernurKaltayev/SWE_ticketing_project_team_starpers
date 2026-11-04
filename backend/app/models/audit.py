"""Append-only audit log [P12]. Write through `app.services.audit_service.audit`."""

import uuid
from datetime import datetime

from sqlalchemy import Index, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JsonObject, UUIDPrimaryKey, fk, utcnow


class AuditLog(UUIDPrimaryKey, Base):
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_logs_entity", "entity_type", "entity_id"),
        Index("ix_audit_logs_event_occurred", "event_id", "occurred_at"),
    )

    occurred_at: Mapped[datetime] = mapped_column(default=utcnow, server_default=func.now())
    actor_id: Mapped[uuid.UUID | None] = fk("users.id")
    actor_role: Mapped[str]  # a UserRole value, or "system" for background jobs
    action_type: Mapped[str]
    entity_type: Mapped[str]
    entity_id: Mapped[str]  # text, because platform_settings is keyed by name, not UUID
    event_id: Mapped[uuid.UUID | None] = fk("events.id", index=False)
    description: Mapped[str]
    # `metadata` is reserved on declarative classes, so only the column uses that name.
    meta: Mapped[JsonObject] = mapped_column("metadata")
