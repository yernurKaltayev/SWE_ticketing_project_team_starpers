"""Profile updates and per-event staff [P1]."""

import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError
from app.models.event import Event, EventStatus
from app.models.user import OrganizerProfile, StaffAssignment, StaffRole, User, UserRole
from app.models.venue import Venue
from app.schemas.user import (
    OrganizerProfileUpdate,
    StaffAssignIn,
    StaffEventOut,
    StaffMemberOut,
    UserUpdate,
)
from app.services.audit_service import audit
from app.services.volunteer_service import purge_volunteer


async def update_user(db: AsyncSession, user: User, data: UserUpdate) -> User:
    changes = data.model_dump(exclude_unset=True)
    # A verification proves ownership of one number; a different number starts unverified.
    if "phone" in changes and changes["phone"] != user.phone:
        user.phone_verified_at = None
    for field, value in changes.items():
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
    if data.user_id is not None:
        target = await db.get(User, data.user_id)
    else:
        # users.email is citext, so this match ignores case.
        target = await db.scalar(select(User).where(User.email == data.email))
    if target is None or target.deleted_at is not None:
        raise NotFoundError("The user was not found.", code="user_not_found")
    if target.role == UserRole.volunteer:
        # A volunteer account belongs to the one event it was created for.
        raise ConflictError(
            "Volunteer accounts cannot be added to other events.",
            code="volunteer_not_assignable",
        )

    assignment = StaffAssignment(
        event_id=event.id, user_id=target.id, role=StaffRole(data.role), assigned_by=actor.id
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
        description=f"Assigned user {target.id} as {data.role}",
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

    target = await db.get_one(User, user_id)
    if target.role == UserRole.volunteer:
        # Removing a volunteer from their only event ends the account.
        await purge_volunteer(db, target, actor=actor, reason="removed_by_organizer")
        await db.commit()
        return

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


async def list_staff(db: AsyncSession, event: Event) -> list[StaffMemberOut]:
    rows = await db.execute(
        select(StaffAssignment, User)
        .join(User, User.id == StaffAssignment.user_id)
        # Volunteers have their own list: GET /events/{id}/volunteers.
        .where(StaffAssignment.event_id == event.id, User.role != UserRole.volunteer)
        .order_by(StaffAssignment.created_at, StaffAssignment.id)
    )
    return [
        StaffMemberOut(
            user_id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=assignment.role.value,
            assigned_at=assignment.created_at,
        )
        for assignment, user in rows
    ]


# Roles that may scan tickets; mirrors check_event_access(..., StaffRole.checkin).
_CHECK_IN_ROLES = {"owner", StaffRole.manager.value, StaffRole.checkin.value}


async def list_staff_events(db: AsyncSession, user: User) -> list[StaffEventOut]:
    """Events this user works on: their own (as organizer) and their staff assignments.

    Drafts are left out because they cannot have tickets. Platform admins get no implicit
    entries here: the Event Admin app must not grant platform-wide capabilities.
    """
    columns = (Event, Venue.name, Venue.city)
    owned = await db.execute(
        select(*columns)
        .join(Venue, Venue.id == Event.venue_id)
        .join(OrganizerProfile, OrganizerProfile.id == Event.organizer_id)
        .where(OrganizerProfile.user_id == user.id, Event.status != EventStatus.draft)
    )
    assigned = await db.execute(
        select(*columns, StaffAssignment.role)
        .join(Venue, Venue.id == Event.venue_id)
        .join(StaffAssignment, StaffAssignment.event_id == Event.id)
        .where(StaffAssignment.user_id == user.id, Event.status != EventStatus.draft)
    )
    roles: dict[uuid.UUID, tuple[Event, str, str, str]] = {}
    for event, venue_name, venue_city, role in assigned:
        roles[event.id] = (event, venue_name, venue_city, role.value)
    for event, venue_name, venue_city in owned:
        roles[event.id] = (event, venue_name, venue_city, "owner")  # ownership wins
    items = [
        StaffEventOut(
            event_id=event.id,
            title=event.title,
            starts_at=event.starts_at,
            ends_at=event.ends_at,
            timezone=event.timezone,
            status=event.status.value,
            venue_name=venue_name,
            venue_city=venue_city,
            role=role,  # type: ignore[arg-type]  # one of the StaffEventOut literals
            can_check_in=role in _CHECK_IN_ROLES,
        )
        for event, venue_name, venue_city, role in roles.values()
    ]
    return sorted(items, key=lambda item: (item.starts_at, item.title))
