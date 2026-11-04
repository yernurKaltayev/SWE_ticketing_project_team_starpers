"""Shared FastAPI dependencies: database session, current user, role and event guards."""

import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ForbiddenError, NotFoundError, UnauthorizedError
from app.core.security import InvalidTokenError, decode_access_token
from app.db.session import SessionFactory
from app.models.event import Event
from app.models.user import OrganizerProfile, StaffAssignment, StaffRole, User, UserRole

_bearer = HTTPBearer(auto_error=False, description="JWT access token")


async def get_db() -> AsyncIterator[AsyncSession]:
    """One session per request. It does not commit: services call `await db.commit()`.

    Committing here would run after the response may already have been sent, so a failed
    commit could not be reported to the client. Anything uncommitted is rolled back on close.
    """
    async with SessionFactory() as session:
        yield session


DbSession = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if credentials is None:
        raise UnauthorizedError()
    try:
        user_id = decode_access_token(credentials.credentials)
    except InvalidTokenError as exc:
        raise UnauthorizedError(
            "The access token is invalid or expired.", code="invalid_token"
        ) from exc

    user = await db.get(User, user_id)
    if user is None:
        raise UnauthorizedError("The access token is invalid or expired.", code="invalid_token")
    if user.is_suspended:
        raise ForbiddenError("This account is suspended.", code="account_suspended")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_role(*roles: UserRole) -> Callable[[User], Awaitable[User]]:
    """Dependency factory: `user: Annotated[User, Depends(require_role(UserRole.organizer))]`.

    Checks the global role only. `organizer_staff` is not a global role: staff are ordinary
    users with a StaffAssignment, so guard their endpoints with `require_event_access`.
    """

    async def dependency(user: CurrentUser) -> User:
        if user.role not in roles:
            raise ForbiddenError(code="insufficient_role")
        return user

    return dependency


async def check_event_access(
    db: AsyncSession, user: User, event_id: uuid.UUID, *staff_roles: StaffRole
) -> Event:
    """Return the event if `user` may act on it, otherwise raise.

    Allowed: platform admins, the owning organizer, and staff assigned to the event. If
    `staff_roles` is given, staff must hold one of them, or be a manager. With no
    `staff_roles`, any assignment is enough.

    Call this directly when the event ID is not a path parameter (e.g. in a request body).
    """
    event = await db.get(Event, event_id)
    if event is None:
        raise NotFoundError("The event was not found.", code="event_not_found")

    if user.role == UserRole.platform_admin:
        return event

    owner_user_id = await db.scalar(
        select(OrganizerProfile.user_id).where(OrganizerProfile.id == event.organizer_id)
    )
    if owner_user_id == user.id:
        return event

    assigned_role = await db.scalar(
        select(StaffAssignment.role).where(
            StaffAssignment.event_id == event_id, StaffAssignment.user_id == user.id
        )
    )
    if assigned_role is not None and (
        not staff_roles or assigned_role == StaffRole.manager or assigned_role in staff_roles
    ):
        return event

    raise ForbiddenError("You do not have access to this event.", code="event_access_denied")


def require_event_access(*staff_roles: StaffRole) -> Callable[..., Awaitable[Event]]:
    """Dependency factory for routes with an `{event_id}` path parameter. Yields the Event.

    `event: Annotated[Event, Depends(require_event_access(StaffRole.checkin))]`
    """

    async def dependency(event_id: uuid.UUID, db: DbSession, user: CurrentUser) -> Event:
        return await check_event_access(db, user, event_id, *staff_roles)

    return dependency
