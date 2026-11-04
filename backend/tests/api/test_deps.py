import uuid
from datetime import timedelta
from typing import Annotated

import pytest
from fastapi import Depends, FastAPI

from app.core.deps import CurrentUser, require_event_access, require_role
from app.core.security import create_access_token
from app.models import Event, User
from app.models.user import StaffRole, UserRole
from tests.factories import auth_header, make_event, make_organizer, make_staff, make_user


@pytest.fixture
def routes(app: FastAPI) -> FastAPI:
    @app.get("/_test/me")
    async def me(user: CurrentUser):
        return {"id": str(user.id)}

    @app.get("/_test/admin")
    async def admin(_: Annotated[User, Depends(require_role(UserRole.platform_admin))]):
        return {}

    @app.get("/_test/events/{event_id}")
    async def any_staff(event: Annotated[Event, Depends(require_event_access())]):
        return {"id": str(event.id)}

    @app.get("/_test/events/{event_id}/checkin")
    async def checkin_only(
        event: Annotated[Event, Depends(require_event_access(StaffRole.checkin))],
    ):
        return {"id": str(event.id)}

    return app


async def test_missing_token_is_unauthorized(routes, client):
    response = await client.get("/_test/me")
    assert response.status_code == 401
    assert response.json()["code"] == "unauthorized"
    assert response.headers["WWW-Authenticate"] == "Bearer"


async def test_valid_token_returns_the_user(routes, client, db):
    user = await make_user(db)
    response = await client.get("/_test/me", headers=auth_header(user))
    assert response.status_code == 200
    assert response.json() == {"id": str(user.id)}


async def test_expired_token_is_rejected(routes, client, db):
    user = await make_user(db)
    token = create_access_token(user.id, expires_in=timedelta(seconds=-1))
    response = await client.get("/_test/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert response.json()["code"] == "invalid_token"


async def test_token_of_a_deleted_user_is_rejected(routes, client):
    token = create_access_token(uuid.uuid4())
    response = await client.get("/_test/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


async def test_suspended_user_is_rejected(routes, client, db):
    user = await make_user(db, is_suspended=True)
    response = await client.get("/_test/me", headers=auth_header(user))
    assert response.status_code == 403
    assert response.json()["code"] == "account_suspended"


async def test_require_role(routes, client, db):
    admin = await make_user(db, role=UserRole.platform_admin)
    attendee = await make_user(db)
    assert (await client.get("/_test/admin", headers=auth_header(admin))).status_code == 200
    denied = await client.get("/_test/admin", headers=auth_header(attendee))
    assert denied.status_code == 403
    assert denied.json()["code"] == "insufficient_role"


async def test_owner_and_admin_can_access_the_event(routes, client, db):
    owner, profile = await make_organizer(db)
    admin = await make_user(db, role=UserRole.platform_admin)
    event = await make_event(db, profile)
    for user in (owner, admin):
        response = await client.get(f"/_test/events/{event.id}", headers=auth_header(user))
        assert response.status_code == 200


async def test_another_organizer_cannot_access_the_event(routes, client, db):
    other, _ = await make_organizer(db)
    event = await make_event(db)
    response = await client.get(f"/_test/events/{event.id}", headers=auth_header(other))
    assert response.status_code == 403
    assert response.json()["code"] == "event_access_denied"


async def test_staff_of_another_event_cannot_access_the_event(routes, client, db):
    staff = await make_staff(db, await make_event(db), StaffRole.manager)
    event = await make_event(db)
    response = await client.get(f"/_test/events/{event.id}", headers=auth_header(staff))
    assert response.status_code == 403


@pytest.mark.parametrize(
    ("role", "any_staff_status", "checkin_status"),
    [
        (StaffRole.manager, 200, 200),
        (StaffRole.checkin, 200, 200),
        (StaffRole.support, 200, 403),
    ],
)
async def test_staff_roles(routes, client, db, role, any_staff_status, checkin_status):
    event = await make_event(db)
    headers = auth_header(await make_staff(db, event, role))
    assert (await client.get(f"/_test/events/{event.id}", headers=headers)).status_code == (
        any_staff_status
    )
    response = await client.get(f"/_test/events/{event.id}/checkin", headers=headers)
    assert response.status_code == checkin_status


async def test_unknown_event_is_not_found(routes, client, db):
    user = await make_user(db)
    response = await client.get(f"/_test/events/{uuid.uuid4()}", headers=auth_header(user))
    assert response.status_code == 404
    assert response.json()["code"] == "event_not_found"
