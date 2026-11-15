"""P14: download event information as an iCalendar (.ics) file."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.deps import DbSession
from app.core.errors import ForbiddenError, UnauthorizedError
from app.core.security import InvalidTokenError, decode_access_token
from app.models.user import User
from app.services.calendar_service import export_event_calendar

router = APIRouter(tags=["calendar"])
_optional_bearer = HTTPBearer(auto_error=False)


async def _optional_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_optional_bearer)],
) -> User | None:
    """Anonymous access is allowed; supplied credentials must be valid."""
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


@router.get("/events/{event_id}/calendar.ics", response_class=Response)
async def event_calendar(
    event_id: uuid.UUID,
    db: DbSession,
    user: OptionalUser,
    share_token: str | None = None,
) -> Response:
    """Return an RFC 5545 calendar file; cancellation remains downloadable."""
    content = await export_event_calendar(db, event_id, user=user, share_token=share_token)
    return Response(
        content=content,
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="event-{event_id}.ics"',
            "Cache-Control": "no-store",
        },
    )
