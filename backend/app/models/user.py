"""Identity [P1]: users, tokens, organizer profiles, per-event staff."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import UniqueConstraint
from sqlalchemy.dialects.postgresql import CITEXT
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, FalseByDefault, Timestamps, UUIDPrimaryKey, fk, pg_enum


class UserRole(enum.StrEnum):
    attendee = "attendee"
    organizer = "organizer"
    platform_admin = "platform_admin"


class EmailTokenPurpose(enum.StrEnum):
    verify = "verify"
    reset = "reset"


class VerificationStatus(enum.StrEnum):
    unverified = "unverified"
    pending = "pending"
    verified = "verified"
    rejected = "rejected"


class StaffRole(enum.StrEnum):
    manager = "manager"
    checkin = "checkin"
    support = "support"


class User(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(CITEXT, unique=True)
    password_hash: Mapped[str]
    full_name: Mapped[str]
    phone: Mapped[str | None]
    role: Mapped[UserRole] = mapped_column(
        pg_enum(UserRole, "user_role"), default=UserRole.attendee, server_default="attendee"
    )
    email_verified_at: Mapped[datetime | None]
    is_suspended: Mapped[FalseByDefault]
    last_login_at: Mapped[datetime | None]


class RefreshToken(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "refresh_tokens"

    user_id: Mapped[uuid.UUID] = fk("users.id")
    token_hash: Mapped[str] = mapped_column(unique=True)
    expires_at: Mapped[datetime]
    revoked_at: Mapped[datetime | None]


class EmailToken(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "email_tokens"

    user_id: Mapped[uuid.UUID] = fk("users.id")
    purpose: Mapped[EmailTokenPurpose] = mapped_column(
        pg_enum(EmailTokenPurpose, "email_token_purpose")
    )
    token_hash: Mapped[str] = mapped_column(unique=True)
    expires_at: Mapped[datetime]
    used_at: Mapped[datetime | None]


class OrganizerProfile(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "organizer_profiles"

    user_id: Mapped[uuid.UUID] = fk("users.id", index=False, unique=True)
    organization_name: Mapped[str]
    contact_email: Mapped[str]
    contact_phone: Mapped[str]
    verification_status: Mapped[VerificationStatus] = mapped_column(
        pg_enum(VerificationStatus, "verification_status"),
        default=VerificationStatus.unverified,
        server_default="unverified",
    )
    terms_accepted_at: Mapped[datetime | None]


class StaffAssignment(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "staff_assignments"
    __table_args__ = (UniqueConstraint("event_id", "user_id"),)

    event_id: Mapped[uuid.UUID] = fk("events.id")
    user_id: Mapped[uuid.UUID] = fk("users.id")
    role: Mapped[StaffRole] = mapped_column(pg_enum(StaffRole, "staff_role"))
    assigned_by: Mapped[uuid.UUID] = fk("users.id")
