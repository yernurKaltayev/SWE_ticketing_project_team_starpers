"""`audit()`: the single write path to the audit log [P12]."""

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from app.models.user import User

SYSTEM_ACTOR = "system"


def audit(
    db: AsyncSession,
    *,
    action_type: str,
    entity_type: str,
    entity_id: uuid.UUID | str,
    description: str,
    actor: User | None = None,
    event_id: uuid.UUID | None = None,
    metadata: dict[str, Any] | None = None,
) -> AuditLog:
    """Add an audit entry to the caller's transaction, so it commits with the change itself.

    Pass `actor=None` for background jobs. `metadata` must be JSON-serializable.
    """
    entry = AuditLog(
        actor_id=actor.id if actor else None,
        actor_role=actor.role.value if actor else SYSTEM_ACTOR,
        action_type=action_type,
        entity_type=entity_type,
        entity_id=str(entity_id),
        event_id=event_id,
        description=description,
        meta=metadata or {},
    )
    db.add(entry)
    return entry
