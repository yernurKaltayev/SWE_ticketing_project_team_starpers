"""`audit()`: the single write path to the audit log [P12]."""

import json
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import ColumnElement, Select, and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import UnprocessableError
from app.core.pagination import Page, PageParams, paginate
from app.models.audit import AuditLog
from app.models.user import User
from app.services.audit_categories import CATEGORIES, NAMES, PREFIXES

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
    try:
        json.dumps(metadata or {})
    except TypeError as exc:  # a raw UUID/datetime would only fail later, at flush time
        raise TypeError(f"audit metadata for {action_type!r} must be JSON-serializable") from exc
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


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _category_clause(category: str) -> ColumnElement[bool]:
    parts: list[ColumnElement[bool]] = []
    if names := NAMES.get(category):
        parts.append(AuditLog.action_type.in_(names))
    parts.extend(
        AuditLog.action_type.startswith(prefix, autoescape=True)
        for prefix in PREFIXES.get(category, ())
    )
    return or_(*parts)


def history_stmt(
    event_id: uuid.UUID,
    *,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    action_type: str | None = None,
    category: str | None = None,
) -> Select[Any]:
    """Audit entries for one event, newest first. `date_from` is inclusive, `date_to` exclusive."""
    if date_from and date_to and _aware(date_from) > _aware(date_to):
        raise UnprocessableError("date_from must not be after date_to.", code="invalid_date_range")
    if category is not None and category not in CATEGORIES:
        raise UnprocessableError(
            f"Unknown category '{category}'.",
            code="unknown_category",
            details={"categories": list(CATEGORIES)},
        )
    conditions: list[ColumnElement[bool]] = [AuditLog.event_id == event_id]
    if date_from:
        conditions.append(AuditLog.occurred_at >= _aware(date_from))
    if date_to:
        conditions.append(AuditLog.occurred_at < _aware(date_to))
    if action_type:
        conditions.append(AuditLog.action_type == action_type)
    if category:
        conditions.append(_category_clause(category))
    return (
        select(AuditLog).where(and_(*conditions)).order_by(AuditLog.occurred_at.desc(), AuditLog.id)
    )


async def history(
    db: AsyncSession, event_id: uuid.UUID, params: PageParams, **filters: Any
) -> Page[Any]:
    return await paginate(db, history_stmt(event_id, **filters), params)
