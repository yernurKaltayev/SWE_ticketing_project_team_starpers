from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AfterValidator, BaseModel, EmailStr, model_validator

from app.schemas.common import KazakhstanPhone, Name, OrmModel, Phone


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
    phone: KazakhstanPhone | None = None


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
    """Identify the staff member by account ID or by the email they signed up with (F7)."""

    user_id: UUID | None = None
    email: EmailStr | None = None
    role: Literal["manager", "checkin", "support"]

    @model_validator(mode="after")
    def _exactly_one_identifier(self) -> "StaffAssignIn":
        if (self.user_id is None) == (self.email is None):
            raise ValueError("Provide exactly one of user_id or email.")
        return self


class StaffAssignmentOut(OrmModel):
    id: UUID
    event_id: UUID
    user_id: UUID
    role: str


class StaffMemberOut(BaseModel):
    """One row of an event's staff list, with enough identity to recognise the person."""

    user_id: UUID
    email: EmailStr
    full_name: str
    role: str
    assigned_at: datetime


class StaffEventOut(BaseModel):
    """An event the signed-in user may work on: owned, or assigned through staff (F7 app)."""

    event_id: UUID
    title: str
    starts_at: datetime
    ends_at: datetime
    timezone: str
    status: str
    venue_name: str
    venue_city: str
    role: Literal["owner", "manager", "checkin", "support"]
    can_check_in: bool
