"""P2 Events: public discovery, organizer management, and publication lifecycle."""

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.deps import (
    CurrentUser,
    DbSession,
    require_event_access,
    require_role,
)
from app.core.errors import ForbiddenError, UnauthorizedError
from app.core.pagination import Page, Pagination
from app.core.security import InvalidTokenError, decode_access_token
from app.models.event import Event
from app.models.user import StaffRole, User, UserRole
from app.schemas.event import EventCreate, EventOut, EventUpdate
from app.services import event_service

router = APIRouter(tags=["events"])
Organizer = Annotated[User, Depends(require_role(UserRole.organizer))]
ManagedEvent = Annotated[Event, Depends(require_event_access(StaffRole.manager))]
_optional_bearer = HTTPBearer(auto_error=False)


async def _optional_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_optional_bearer)],
) -> User | None:
    if credentials is None:
        return None
    try:
        user_id = decode_access_token(credentials.credentials)
    except InvalidTokenError as exc:
        raise UnauthorizedError("Invalid access token.", code="invalid_token") from exc
    user = await db.get(User, user_id)
    if user is None:
        raise UnauthorizedError("Invalid access token.", code="invalid_token")
    if user.is_suspended:
        raise ForbiddenError("Account is suspended.", code="account_suspended")
    return user


OptionalUser = Annotated[User | None, Depends(_optional_user)]


@router.get("/events", response_model=Page[EventOut])
async def list_public_events(
    db: DbSession,
    page: Pagination,
    q: str | None = None,
    category: str | None = None,
    city: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> Page[EventOut]:
    return await event_service.public_events(
        db, page, q=q, category=category, city=city,
        date_from=date_from, date_to=date_to,
    )


@router.post("/events", response_model=EventOut, status_code=status.HTTP_201_CREATED)
async def create_event(data: EventCreate, user: Organizer, db: DbSession) -> EventOut:
    return await event_service.create_event(db, user, data)


@router.get("/organizers/me/events", response_model=Page[EventOut])
async def own_events(user: Organizer, db: DbSession, page: Pagination) -> Page[EventOut]:
    return await event_service.own_events(db, user, page)


@router.get("/events/by-token/{share_token}", response_model=EventOut)
async def event_by_token(share_token: str, db: DbSession) -> EventOut:
    return await event_service.event_by_token(db, share_token)


@router.get("/events/{event_id}", response_model=EventOut)
async def get_event(event_id: uuid.UUID, db: DbSession, user: OptionalUser) -> EventOut:
    return await event_service.event_details(db, event_id, user)


@router.patch("/events/{event_id}", response_model=EventOut)
async def patch_event(
    data: EventUpdate, event: ManagedEvent, user: CurrentUser, db: DbSession,
) -> EventOut:
    return await event_service.update_event(db, event.id, user, data)


@router.post("/events/{event_id}/publish", response_model=EventOut)
async def publish_event(event: ManagedEvent, user: CurrentUser, db: DbSession) -> EventOut:
    return await event_service.publish_event(db, event.id, user)


@router.post("/events/{event_id}/unpublish", response_model=EventOut)
async def unpublish_event(event: ManagedEvent, user: CurrentUser, db: DbSession) -> EventOut:
    return await event_service.unpublish_event(db, event.id, user)


@router.post("/events/{event_id}/duplicate", response_model=EventOut,
             status_code=status.HTTP_201_CREATED)
async def duplicate_event(event: ManagedEvent, user: CurrentUser, db: DbSession) -> EventOut:
    return await event_service.duplicate_event(db, event.id, user)


@router.post("/events/{event_id}/cancel", response_model=EventOut)
async def cancel_event(event: ManagedEvent, user: CurrentUser, db: DbSession) -> EventOut:
    return await event_service.cancel_event(db, event.id, user)
