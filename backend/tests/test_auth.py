import pytest

from app.models.token import TokenPurpose
from app.services import auth as auth_service

ATTENDEE = {
    "email": "Aigerim@example.kz",
    "password": "correct horse battery",
    "full_name": "Aigerim S.",
}
ORGANIZER = {
    "email": "organizer@example.kz",
    "password": "another good password",
    "full_name": "Concert Hall KZ",
    "role": "organizer",
}


async def register(client, payload):
    return await client.post("/api/v1/auth/register", json=payload)


async def login(client, payload):
    response = await client.post(
        "/api/v1/auth/login", json={"email": payload["email"], "password": payload["password"]}
    )
    return response


def auth_header(tokens: dict) -> dict:
    return {"Authorization": f"Bearer {tokens['access_token']}"}


async def issue_token(session_factory, email: str, purpose: TokenPurpose) -> str:
    async with session_factory() as session:
        user = await auth_service.get_user_by_email(session, email)
        raw_token = await auth_service.issue_verification_token(session, user, purpose)
        await session.commit()
    return raw_token


async def test_register_normalizes_email_and_defaults_to_attendee(client):
    response = await register(client, ATTENDEE)
    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "aigerim@example.kz"
    assert body["role"] == "attendee"
    assert body["is_email_verified"] is False
    assert "hashed_password" not in body


async def test_duplicate_email_is_rejected(client):
    await register(client, ATTENDEE)
    response = await register(client, {**ATTENDEE, "email": "AIGERIM@example.kz"})
    assert response.status_code == 409


@pytest.mark.parametrize("role", ["platform_admin", "event_admin"])
async def test_privileged_roles_cannot_be_self_registered(client, role):
    response = await register(client, {**ATTENDEE, "role": role})
    assert response.status_code == 422


async def test_login_returns_token_pair_and_me_resolves_user(client):
    await register(client, ATTENDEE)
    response = await login(client, ATTENDEE)
    assert response.status_code == 200
    tokens = response.json()
    assert tokens["token_type"] == "bearer"
    assert tokens["expires_in"] > 0

    me = await client.get("/api/v1/users/me", headers=auth_header(tokens))
    assert me.status_code == 200
    assert me.json()["email"] == "aigerim@example.kz"


async def test_login_with_wrong_password_is_unauthorized(client):
    await register(client, ATTENDEE)
    response = await client.post(
        "/api/v1/auth/login", json={"email": ATTENDEE["email"], "password": "wrong password"}
    )
    assert response.status_code == 401


async def test_me_requires_a_token(client):
    assert (await client.get("/api/v1/users/me")).status_code == 401
    bad = {"Authorization": "Bearer not-a-jwt"}
    assert (await client.get("/api/v1/users/me", headers=bad)).status_code == 401


async def test_refresh_rotates_and_retires_the_old_token(client):
    await register(client, ATTENDEE)
    tokens = (await login(client, ATTENDEE)).json()

    rotated = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert rotated.status_code == 200
    assert rotated.json()["refresh_token"] != tokens["refresh_token"]

    reused = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert reused.status_code == 401


async def test_logout_revokes_the_refresh_token(client):
    await register(client, ATTENDEE)
    tokens = (await login(client, ATTENDEE)).json()

    logout = await client.post(
        "/api/v1/auth/logout", json={"refresh_token": tokens["refresh_token"]}
    )
    assert logout.status_code == 200

    response = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert response.status_code == 401


async def test_email_verification_marks_the_account_verified(client, session_factory):
    await register(client, ATTENDEE)
    raw_token = await issue_token(
        session_factory, ATTENDEE["email"], TokenPurpose.email_verification
    )

    response = await client.post("/api/v1/auth/verify-email", json={"token": raw_token})
    assert response.status_code == 200
    assert response.json()["is_email_verified"] is True

    replayed = await client.post("/api/v1/auth/verify-email", json={"token": raw_token})
    assert replayed.status_code == 400


async def test_password_reset_replaces_the_password(client, session_factory):
    await register(client, ATTENDEE)
    raw_token = await issue_token(session_factory, ATTENDEE["email"], TokenPurpose.password_reset)

    response = await client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": raw_token, "new_password": "a brand new password"},
    )
    assert response.status_code == 200

    assert (await login(client, ATTENDEE)).status_code == 401
    fresh = await client.post(
        "/api/v1/auth/login",
        json={"email": ATTENDEE["email"], "password": "a brand new password"},
    )
    assert fresh.status_code == 200


async def test_password_reset_request_does_not_reveal_unknown_accounts(client):
    response = await client.post(
        "/api/v1/auth/password-reset/request", json={"email": "nobody@example.kz"}
    )
    assert response.status_code == 200


async def test_organizer_profile_is_created_and_updated_by_its_owner(client):
    await register(client, ORGANIZER)
    tokens = (await login(client, ORGANIZER)).json()
    headers = auth_header(tokens)

    assert (
        await client.get("/api/v1/users/me/organizer-profile", headers=headers)
    ).status_code == 404

    payload = {
        "display_name": "Concert Hall KZ",
        "contact_email": "box-office@example.kz",
        "contact_phone": "+7 700 000 0000",
        "description": "Live music venue in Almaty",
    }
    created = await client.put(
        "/api/v1/users/me/organizer-profile", json=payload, headers=headers
    )
    assert created.status_code == 200
    assert created.json()["display_name"] == "Concert Hall KZ"
    assert created.json()["is_identity_verified"] is False

    updated = await client.put(
        "/api/v1/users/me/organizer-profile",
        json={**payload, "display_name": "Concert Hall Almaty"},
        headers=headers,
    )
    assert updated.status_code == 200
    assert updated.json()["id"] == created.json()["id"]
    assert updated.json()["display_name"] == "Concert Hall Almaty"


async def test_role_boundaries_are_enforced(client):
    await register(client, ATTENDEE)
    headers = auth_header((await login(client, ATTENDEE)).json())

    profile = await client.get("/api/v1/users/me/organizer-profile", headers=headers)
    assert profile.status_code == 403
    assert (await client.get("/api/v1/users", headers=headers)).status_code == 403


async def test_short_password_is_rejected(client):
    response = await register(client, {**ATTENDEE, "password": "short"})
    assert response.status_code == 422
