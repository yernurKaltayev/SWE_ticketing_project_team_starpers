"""Profile updates and per-event staff [P1]."""

import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError
from app.models.event import Event
from app.models.user import OrganizerProfile, StaffAssignment, StaffRole, User
from app.schemas.user import OrganizerProfileUpdate, StaffAssignIn, UserUpdate
from app.services.audit_service import audit


async def update_user(db: AsyncSession, user: User, data: UserUpdate) -> User:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    await db.commit()
    return user


async def get_organizer_profile(db: AsyncSession, user: User) -> OrganizerProfile:
    profile = await db.scalar(select(OrganizerProfile).where(OrganizerProfile.user_id == user.id))
    if profile is None:
        raise NotFoundError("The organizer profile was not found.", code="organizer_not_found")
    return profile


async def update_organizer_profile(
    db: AsyncSession, user: User, data: OrganizerProfileUpdate
) -> OrganizerProfile:
    profile = await get_organizer_profile(db, user)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)
    await db.commit()
    return profile


async def assign_staff(
    db: AsyncSession, event: Event, actor: User, data: StaffAssignIn
) -> StaffAssignment:
    if await db.get(User, data.user_id) is None:
        raise NotFoundError("The user was not found.", code="user_not_found")

    assignment = StaffAssignment(
        event_id=event.id, user_id=data.user_id, role=StaffRole(data.role), assigned_by=actor.id
    )
    db.add(assignment)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise ConflictError(
            "This user is already on the event's staff.", code="staff_already_assigned"
        ) from exc

    audit(
        db,
        action_type="staff_assigned",
        entity_type="staff_assignment",
        entity_id=assignment.id,
        description=f"Assigned user {data.user_id} as {data.role}",
        actor=actor,
        event_id=event.id,
    )
    await db.commit()
    return assignment


async def remove_staff(db: AsyncSession, event: Event, actor: User, user_id: uuid.UUID) -> None:
    assignment = await db.scalar(
        select(StaffAssignment).where(
            StaffAssignment.event_id == event.id, StaffAssignment.user_id == user_id
        )
    )
    if assignment is None:
        raise NotFoundError("This user is not on the event's staff.", code="staff_not_found")

    await db.delete(assignment)
    audit(
        db,
        action_type="staff_removed",
        entity_type="staff_assignment",
        entity_id=assignment.id,
        description=f"Removed user {user_id} ({assignment.role.value})",
        actor=actor,
        event_id=event.id,
    )
    await db.commit()
