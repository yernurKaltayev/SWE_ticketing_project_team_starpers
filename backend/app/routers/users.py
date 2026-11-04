"""/me, /organizers/me, event staff [P1 Yernur]"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.core.deps import CurrentUser, DbSession, require_event_access, require_role
from app.models.event import Event
from app.models.user import OrganizerProfile, StaffAssignment, StaffRole, User, UserRole
from app.schemas.user import (
    OrganizerProfileOut,
    OrganizerProfileUpdate,
    StaffAssignIn,
    StaffAssignmentOut,
    UserOut,
    UserUpdate,
)
from app.services import user_service

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


@router.get("/organizers/me", response_model=OrganizerProfileOut)
async def get_my_organizer_profile(user: Organizer, db: DbSession) -> OrganizerProfile:
    return await user_service.get_organizer_profile(db, user)


@router.patch("/organizers/me", response_model=OrganizerProfileOut)
async def update_my_organizer_profile(
    data: OrganizerProfileUpdate, user: Organizer, db: DbSession
) -> OrganizerProfile:
    return await user_service.update_organizer_profile(db, user, data)


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
