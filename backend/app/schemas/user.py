from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AfterValidator, BaseModel, EmailStr

from app.schemas.common import Name, OrmModel, Phone


class UserOut(OrmModel):
    id: UUID
    email: EmailStr
    full_name: str
    phone: str | None
    role: str
    email_verified_at: datetime | None


def _reject_null[T](value: T | None) -> T:
    if value is None:
        raise ValueError("must not be null")
    return value


# For PATCH bodies, where an omitted field is left unchanged. Defaults skip validators, so `None`
# here means "omitted" and an explicit null is refused: the column behind the field is required.
NotNull = AfterValidator(_reject_null)


class UserUpdate(BaseModel):
    full_name: Annotated[Name | None, NotNull] = None
    phone: Phone | None = None


class OrganizerProfileUpdate(BaseModel):
    organization_name: Annotated[Name | None, NotNull] = None
    contact_email: Annotated[EmailStr | None, NotNull] = None
    contact_phone: Annotated[Phone | None, NotNull] = None


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
