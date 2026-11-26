"""/me, /organizers/me, event staff [P1 Yernur]"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.core.config import get_settings
from app.core.deps import CurrentUser, DbSession, require_event_access, require_role
from app.models.event import Event
from app.models.user import OrganizerProfile, StaffAssignment, StaffRole, User, UserRole
from app.schemas.user import (
    OrganizerProfileOut,
    OrganizerProfileUpdate,
    PhoneVerificationStartOut,
    PhoneVerificationStatusOut,
    StaffAssignIn,
    StaffAssignmentOut,
    StaffEventOut,
    StaffMemberOut,
    UserOut,
    UserUpdate,
    VolunteerCreate,
    VolunteerCredentialsOut,
    VolunteerOut,
)
from app.services import phone_verification, user_service, volunteer_service

router = APIRouter(tags=["users"])

Organizer = Annotated[User, Depends(require_role(UserRole.organizer))]
# Naming the role matters: require_event_access() with no roles would admit any staff member.
ManagedEvent = Annotated[Event, Depends(require_event_access(StaffRole.manager))]


@router.get("/me", response_model=UserOut)
async def get_me(user: CurrentUser) -> User:
    return user


@router.patch("/me", response_model=UserOut)
async def update_me(data: UserUpdate, user: CurrentUser, db: DbSession) -> User:
    return await user_service.update_user(db, user, data)


@router.get("/me/phone-verification", response_model=PhoneVerificationStatusOut)
async def phone_verification_status(_user: CurrentUser) -> PhoneVerificationStatusOut:
    return PhoneVerificationStatusOut(available=get_settings().telegram_enabled)


@router.post(
    "/me/phone-verification",
    response_model=PhoneVerificationStartOut,
    status_code=status.HTTP_201_CREATED,
)
async def start_phone_verification(user: CurrentUser, db: DbSession) -> PhoneVerificationStartOut:
    link, expires_at = await phone_verification.start(db, user, get_settings())
    return PhoneVerificationStartOut(link=link, expires_at=expires_at)


@router.get("/me/staff-events", response_model=list[StaffEventOut])
async def my_staff_events(user: CurrentUser, db: DbSession) -> list[StaffEventOut]:
    return await user_service.list_staff_events(db, user)


@router.get("/organizers/me", response_model=OrganizerProfileOut)
async def get_my_organizer_profile(user: Organizer, db: DbSession) -> OrganizerProfile:
    return await user_service.get_organizer_profile(db, user)


@router.patch("/organizers/me", response_model=OrganizerProfileOut)
async def update_my_organizer_profile(
    data: OrganizerProfileUpdate, user: Organizer, db: DbSession
) -> OrganizerProfile:
    return await user_service.update_organizer_profile(db, user, data)


@router.get("/events/{event_id}/staff", response_model=list[StaffMemberOut])
async def list_staff(event: ManagedEvent, db: DbSession) -> list[StaffMemberOut]:
    return await user_service.list_staff(db, event)


@router.post(
    "/events/{event_id}/staff",
    response_model=StaffAssignmentOut,
    status_code=status.HTTP_201_CREATED,
)
async def assign_staff(
    data: StaffAssignIn, event: ManagedEvent, user: CurrentUser, db: DbSession
) -> StaffAssignment:
    return await user_service.assign_staff(db, event, user, data)


@router.delete("/events/{event_id}/staff/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_staff(
    user_id: uuid.UUID, event: ManagedEvent, actor: CurrentUser, db: DbSession
) -> None:
    await user_service.remove_staff(db, event, actor, user_id)


# Volunteer check-in accounts: created here, scoped to this event, anonymized after it.


@router.get("/events/{event_id}/volunteers", response_model=list[VolunteerOut])
async def list_volunteers(event: ManagedEvent, db: DbSession) -> list[VolunteerOut]:
    return await volunteer_service.list_volunteers(db, event)


@router.post(
    "/events/{event_id}/volunteers",
    response_model=VolunteerCredentialsOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_volunteer(
    data: VolunteerCreate, event: ManagedEvent, actor: CurrentUser, db: DbSession
) -> VolunteerCredentialsOut:
    return await volunteer_service.create_volunteer(db, event, actor, data.full_name)


@router.post(
    "/events/{event_id}/volunteers/{user_id}/reset-password",
    response_model=VolunteerCredentialsOut,
)
async def reset_volunteer_password(
    user_id: uuid.UUID, event: ManagedEvent, actor: CurrentUser, db: DbSession
) -> VolunteerCredentialsOut:
    return await volunteer_service.reset_password(db, event, actor, user_id)


@router.delete("/events/{event_id}/volunteers/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_volunteer(
    user_id: uuid.UUID, event: ManagedEvent, actor: CurrentUser, db: DbSession
) -> None:
    await volunteer_service.remove_volunteer(db, event, actor, user_id)
