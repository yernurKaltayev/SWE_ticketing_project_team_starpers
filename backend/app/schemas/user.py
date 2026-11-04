from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr

from app.schemas.common import OrmModel


class UserOut(OrmModel):
    id: UUID
    email: EmailStr
    full_name: str
    phone: str | None
    role: str
    email_verified_at: datetime | None


class UserUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None


class OrganizerProfileUpdate(BaseModel):
    organization_name: str | None = None
    contact_email: EmailStr | None = None
    contact_phone: str | None = None


class OrganizerProfileOut(OrmModel):
    id: UUID
    organization_name: str
    contact_email: EmailStr
    contact_phone: str
    verification_status: str
    terms_accepted_at: datetime | None


class StaffAssignIn(BaseModel):
    user_id: UUID
    role: Literal["manager", "checkin", "support"]


class StaffAssignmentOut(OrmModel):
    id: UUID
    event_id: UUID
    user_id: UUID
    role: str
