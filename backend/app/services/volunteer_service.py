"""Volunteer check-in accounts [P1 + P15].

An organizer creates a volunteer from the event's staff page. The server generates the login and
password and returns them once. A volunteer is an ordinary `User` with role `volunteer` and a
single `StaffAssignment(role=checkin)`. `app.core.deps.get_current_user` keeps them on the check-in
endpoints, and `check_event_access` keeps them on their own event.

After the event (or when the organizer removes them), the account is *anonymized*, not deleted:
check-in records and the append-only audit log reference the user ID, so the row must stay. The
assignment, tokens, email, name and password are wiped and it can never sign in again.
"""

import asyncio
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import ConflictError, NotFoundError
from app.core.security import hash_password
from app.db.base import utcnow
from app.models.event import Event, EventStatus
from app.models.user import (
    EmailToken,
    PhoneVerification,
    StaffAssignment,
    StaffRole,
    User,
    UserRole,
)
from app.schemas.user import VolunteerCredentialsOut, VolunteerOut
from app.services.audit_service import audit
from app.services.auth_service import revoke_all_refresh_tokens

FORMER_VOLUNTEER_NAME = "Former volunteer"
# No 0/O/1/I/L: the organizer reads these out or copies them by hand.
_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"


@dataclass(frozen=True)
class _Credentials:
    login: str
    password: str


def _random(length: int) -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(length))


def _new_password() -> str:
    # Three dash-separated groups of four: ~58 bits, easy to type on a phone.
    return "-".join(_random(4) for _ in range(3))


def expires_at(event: Event) -> datetime:
    """When the purge job anonymizes the event's volunteers."""
    return event.ends_at + timedelta(hours=get_settings().volunteer_grace_hours)


def _ensure_open(event: Event) -> None:
    if event.status == EventStatus.cancelled or expires_at(event) <= utcnow():
        raise ConflictError(
            "Volunteers can no longer be added: the event is over or cancelled.",
            code="event_ended",
        )


async def _hash(password: str) -> str:
    # Argon2 is slow on purpose; keep it off the event loop (see auth_service).
    return await asyncio.to_thread(hash_password, password)


async def create_volunteer(
    db: AsyncSession, event: Event, actor: User, full_name: str
) -> VolunteerCredentialsOut:
    settings = get_settings()
    _ensure_open(event)

    count = await db.scalar(
        select(func.count())
        .select_from(StaffAssignment)
        .join(User, User.id == StaffAssignment.user_id)
        .where(StaffAssignment.event_id == event.id, User.role == UserRole.volunteer)
    )
    if (count or 0) >= settings.volunteers_per_event_max:
        raise ConflictError(
            "This event already has the maximum number of volunteers.",
            code="volunteer_limit_reached",
        )

    credentials = _Credentials(
        login=f"v-{_random(8)}@{settings.volunteer_email_domain}", password=_new_password()
    )
    user = User(
        email=credentials.login,
        password_hash=await _hash(credentials.password),
        full_name=full_name,
        role=UserRole.volunteer,
        email_verified_at=utcnow(),  # nobody reads this address; the organizer vouches for it
    )
    db.add(user)
    await db.flush()
    db.add(
        StaffAssignment(
            event_id=event.id, user_id=user.id, role=StaffRole.checkin, assigned_by=actor.id
        )
    )
    audit(
        db,
        action_type="volunteer_created",
        entity_type="user",
        entity_id=user.id,
        description=f"Created volunteer account {user.id} for check-in",
        actor=actor,
        event_id=event.id,
    )
    await db.commit()
    return VolunteerCredentialsOut(
        user_id=user.id,
        full_name=user.full_name,
        login=credentials.login,
        password=credentials.password,
        expires_at=expires_at(event),
    )


async def list_volunteers(db: AsyncSession, event: Event) -> list[VolunteerOut]:
    rows = await db.scalars(
        select(User)
        .join(StaffAssignment, StaffAssignment.user_id == User.id)
        .where(StaffAssignment.event_id == event.id, User.role == UserRole.volunteer)
        .order_by(User.created_at, User.id)
    )
    return [
        VolunteerOut(
            user_id=user.id,
            full_name=user.full_name,
            login=user.email,
            created_at=user.created_at,
            last_login_at=user.last_login_at,
            expires_at=expires_at(event),
        )
        for user in rows
    ]


async def _get_volunteer(db: AsyncSession, event: Event, user_id: uuid.UUID) -> User:
    user = await db.scalar(
        select(User)
        .join(StaffAssignment, StaffAssignment.user_id == User.id)
        .where(
            StaffAssignment.event_id == event.id,
            User.id == user_id,
            User.role == UserRole.volunteer,
        )
    )
    if user is None:
        raise NotFoundError("This volunteer was not found.", code="volunteer_not_found")
    return user


async def reset_password(
    db: AsyncSession, event: Event, actor: User, user_id: uuid.UUID
) -> VolunteerCredentialsOut:
    _ensure_open(event)
    user = await _get_volunteer(db, event, user_id)
    password = _new_password()
    user.password_hash = await _hash(password)
    # Sign out every device the old password was used on. Access tokens already issued run out
    # within access_token_ttl_minutes, as with an ordinary password reset.
    await revoke_all_refresh_tokens(db, user.id)
    audit(
        db,
        action_type="volunteer_password_reset",
        entity_type="user",
        entity_id=user.id,
        description=f"Issued a new password for volunteer {user.id}",
        actor=actor,
        event_id=event.id,
    )
    await db.commit()
    return VolunteerCredentialsOut(
        user_id=user.id,
        full_name=user.full_name,
        login=user.email,
        password=password,
        expires_at=expires_at(event),
    )


async def purge_volunteer(db: AsyncSession, user: User, *, actor: User | None, reason: str) -> None:
    """Anonymize a volunteer account. Idempotent; the caller commits."""
    if user.role != UserRole.volunteer or user.deleted_at is not None:
        return

    event_id = await db.scalar(
        select(StaffAssignment.event_id).where(StaffAssignment.user_id == user.id).limit(1)
    )
    await db.execute(delete(StaffAssignment).where(StaffAssignment.user_id == user.id))
    await db.execute(delete(EmailToken).where(EmailToken.user_id == user.id))
    await db.execute(delete(PhoneVerification).where(PhoneVerification.user_id == user.id))
    # Refresh tokens are revoked, not deleted: they are harmless once revoked and the user's
    # sign-ins stay traceable.
    await revoke_all_refresh_tokens(db, user.id)

    user.email = f"deleted-{user.id}@{get_settings().volunteer_email_domain}"
    user.full_name = FORMER_VOLUNTEER_NAME
    user.phone = None
    user.phone_verified_at = None
    user.telegram_chat_id = None
    # A hash of a random secret nobody keeps: no password can ever match it.
    user.password_hash = await _hash(secrets.token_urlsafe(32))
    user.is_suspended = True
    user.deleted_at = utcnow()

    audit(
        db,
        action_type="volunteer_removed",
        entity_type="user",
        entity_id=user.id,
        description=f"Anonymized volunteer account {user.id} ({reason})",
        actor=actor,
        event_id=event_id,
        metadata={"reason": reason},
    )


async def remove_volunteer(db: AsyncSession, event: Event, actor: User, user_id: uuid.UUID) -> None:
    user = await _get_volunteer(db, event, user_id)
    await purge_volunteer(db, user, actor=actor, reason="removed_by_organizer")
    await db.commit()


async def due_volunteer_ids(db: AsyncSession) -> list[uuid.UUID]:
    """Volunteers to anonymize now: their event is over (plus grace) or cancelled, or they have
    lost their assignment some other way."""
    cutoff = utcnow() - timedelta(hours=get_settings().volunteer_grace_hours)
    assigned_to_live_event = (
        select(StaffAssignment.user_id)
        .join(Event, Event.id == StaffAssignment.event_id)
        .where(Event.status != EventStatus.cancelled, Event.ends_at > cutoff)
    )
    rows = await db.scalars(
        select(User.id).where(
            User.role == UserRole.volunteer,
            User.deleted_at.is_(None),
            User.id.not_in(assigned_to_live_event),
        )
    )
    return list(rows)
