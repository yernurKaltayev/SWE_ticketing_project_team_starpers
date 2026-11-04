import re
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select, update

from app.core.config import get_settings
from app.core.security import create_access_token, hash_password, hash_token
from app.models.user import EmailToken, OrganizerProfile, RefreshToken, User
from app.services import email_verification
from tests.factories import auth_header, make_user, unique

PREFIX = "/api/v1"
PASSWORD = "correct-horse-battery"


@pytest.fixture(autouse=True)
def outbox(monkeypatch) -> list[dict[str, str]]:
    sent: list[dict[str, str]] = []

    async def fake_send(to: str, subject: str, body: str) -> None:
        sent.append({"to": to, "subject": subject, "body": body})

    monkeypatch.setattr(email_verification, "send_email", fake_send)
    return sent


def token_in(email: dict[str, str]) -> str:
    match = re.search(r"\?token=(\S+)", email["body"])
    assert match
    return match.group(1)


def new_email() -> str:
    return f"{unique('user')}@example.com"


async def register(client, email: str, role: str = "attendee"):
    return await client.post(
        f"{PREFIX}/auth/register",
        json={"email": email, "password": PASSWORD, "full_name": "Aida", "role": role},
    )


async def login(client, email: str, password: str = PASSWORD):
    return await client.post(f"{PREFIX}/auth/login", json={"email": email, "password": password})


async def verified_user(db, **overrides) -> User:
    return await make_user(
        db,
        password_hash=hash_password(PASSWORD),
        email_verified_at=datetime.now(UTC),
        **overrides,
    )


async def signed_in(client, db) -> tuple[User, dict]:
    user = await verified_user(db)
    response = await login(client, user.email)
    assert response.status_code == 200
    return user, response.json()


async def refresh(client, token: str):
    return await client.post(f"{PREFIX}/auth/refresh", json={"refresh_token": token})


# Register


async def test_register_creates_an_unverified_account_and_emails_a_link(client, db, outbox):
    email = new_email()
    response = await register(client, email)

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == email
    assert body["role"] == "attendee"
    assert body["email_verified_at"] is None
    assert "password" not in str(body)

    assert [message["to"] for message in outbox] == [email]
    assert get_settings().web_base_url in outbox[0]["body"]
    user = await db.scalar(select(User).where(User.email == email))
    assert user.password_hash != PASSWORD


async def test_email_tokens_are_stored_hashed(client, db, outbox):
    await register(client, new_email())
    raw = token_in(outbox[0])
    assert await db.scalar(select(EmailToken).where(EmailToken.token_hash == raw)) is None
    assert await db.scalar(select(EmailToken).where(EmailToken.token_hash == hash_token(raw)))


async def test_an_organizer_gets_a_profile_and_an_attendee_does_not(client, db):
    organizer = (await register(client, new_email(), "organizer")).json()
    attendee = (await register(client, new_email(), "attendee")).json()

    profiles = select(func.count()).select_from(OrganizerProfile)
    assert await db.scalar(profiles.where(OrganizerProfile.user_id == organizer["id"])) == 1
    assert await db.scalar(profiles.where(OrganizerProfile.user_id == attendee["id"])) == 0


async def test_duplicate_email_is_a_conflict_whatever_the_case(client):
    email = new_email()
    await register(client, email)

    response = await register(client, email.upper())

    assert response.status_code == 409
    assert response.json()["code"] == "email_taken"


@pytest.mark.parametrize(
    "change",
    [
        {"role": "platform_admin"},
        {"password": "short"},
        {"password": "x" * 129},
        {"email": "not-an-email"},
        {"full_name": "   "},
    ],
)
async def test_register_rejects_invalid_input(client, change):
    body = {"email": new_email(), "password": PASSWORD, "full_name": "Aida", "role": "attendee"}
    response = await client.post(f"{PREFIX}/auth/register", json=body | change)
    assert response.status_code == 422


# Verify email


async def test_verify_email_then_sign_in(client, outbox):
    email = new_email()
    await register(client, email)

    before = await login(client, email)
    assert before.status_code == 403
    assert before.json()["code"] == "email_not_verified"

    response = await client.post(f"{PREFIX}/auth/verify-email", json={"token": token_in(outbox[0])})
    assert response.status_code == 200

    tokens = (await login(client, email)).json()
    me = await client.get(
        f"{PREFIX}/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}
    )
    assert me.json()["email_verified_at"] is not None


async def test_a_verification_token_works_once(client, outbox):
    await register(client, new_email())
    body = {"token": token_in(outbox[0])}

    assert (await client.post(f"{PREFIX}/auth/verify-email", json=body)).status_code == 200
    second = await client.post(f"{PREFIX}/auth/verify-email", json=body)

    assert second.status_code == 422
    assert second.json()["code"] == "invalid_email_token"


async def test_an_expired_verification_token_is_rejected(client, db, outbox):
    await register(client, new_email())
    raw = token_in(outbox[0])
    await db.execute(
        update(EmailToken)
        .where(EmailToken.token_hash == hash_token(raw))
        .values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
    )

    response = await client.post(f"{PREFIX}/auth/verify-email", json={"token": raw})

    assert response.status_code == 422


async def test_a_reset_token_cannot_verify_an_email(client, db, outbox):
    user = await make_user(db, password_hash=hash_password(PASSWORD))
    await client.post(f"{PREFIX}/auth/forgot-password", json={"email": user.email})

    response = await client.post(f"{PREFIX}/auth/verify-email", json={"token": token_in(outbox[0])})

    assert response.status_code == 422


async def test_resend_replaces_the_previous_link(client, outbox):
    email = new_email()
    await register(client, email)

    response = await client.post(f"{PREFIX}/auth/resend-verification", json={"email": email})
    assert response.status_code == 200
    first, second = outbox

    old = await client.post(f"{PREFIX}/auth/verify-email", json={"token": token_in(first)})
    new = await client.post(f"{PREFIX}/auth/verify-email", json={"token": token_in(second)})
    assert old.status_code == 422
    assert new.status_code == 200


async def test_resend_looks_the_same_for_unknown_and_verified_addresses(client, db, outbox):
    verified = await verified_user(db)
    pending = new_email()
    await register(client, pending)
    outbox.clear()

    responses = [
        await client.post(f"{PREFIX}/auth/resend-verification", json={"email": email})
        for email in (new_email(), verified.email, pending)
    ]

    assert {response.status_code for response in responses} == {200}
    assert len({response.text for response in responses}) == 1
    assert [message["to"] for message in outbox] == [pending]


# Sign in


async def test_login_returns_working_tokens_and_records_the_time(client, db):
    user, tokens = await signed_in(client, db)

    me = await client.get(
        f"{PREFIX}/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}
    )

    assert me.status_code == 200
    assert me.json()["id"] == str(user.id)
    assert tokens["token_type"] == "bearer"
    assert user.last_login_at is not None


async def test_login_ignores_email_case(client, db):
    user = await verified_user(db)
    assert (await login(client, user.email.upper())).status_code == 200


async def test_wrong_password_and_unknown_email_look_the_same(client, db):
    user = await verified_user(db)

    wrong = await login(client, user.email, "wrong-password")
    unknown = await login(client, new_email())

    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()
    assert wrong.json()["code"] == "invalid_credentials"


async def test_a_suspended_user_cannot_sign_in(client, db):
    user = await verified_user(db, is_suspended=True)

    response = await login(client, user.email)

    assert response.status_code == 403
    assert response.json()["code"] == "account_suspended"


async def test_account_state_is_hidden_from_someone_without_the_password(client, db):
    suspended = await verified_user(db, is_suspended=True)
    unverified = await make_user(db, password_hash=hash_password(PASSWORD))

    for user in (suspended, unverified):
        assert (await login(client, user.email, "wrong-password")).status_code == 401


# Rate limits


async def test_login_is_rate_limited_per_account(client, db):
    user = await verified_user(db)
    limit = get_settings().auth_rate_limit_per_account
    for _ in range(limit):
        assert (await login(client, user.email, "wrong-password")).status_code == 401

    blocked = await login(client, user.email)

    assert blocked.status_code == 429
    assert blocked.json()["code"] == "too_many_requests"
    assert int(blocked.headers["Retry-After"]) > 0
    # Other accounts are unaffected.
    assert (await login(client, new_email())).status_code == 401


async def test_login_is_rate_limited_per_ip_across_accounts(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "auth_rate_limit_per_ip", 3)
    for _ in range(3):
        assert (await login(client, new_email())).status_code == 401

    assert (await login(client, new_email())).status_code == 429


async def test_forgot_password_is_rate_limited(client, db, outbox):
    user = await verified_user(db)
    limit = get_settings().auth_rate_limit_per_account
    body = {"email": user.email}
    for _ in range(limit):
        assert (await client.post(f"{PREFIX}/auth/forgot-password", json=body)).status_code == 200

    response = await client.post(f"{PREFIX}/auth/forgot-password", json=body)

    assert response.status_code == 429
    assert len(outbox) == limit


# Refresh and sign out


async def test_refresh_rotates_the_token(client, db):
    _, tokens = await signed_in(client, db)

    response = await refresh(client, tokens["refresh_token"])

    assert response.status_code == 200
    rotated = response.json()
    assert rotated["refresh_token"] != tokens["refresh_token"]
    me = await client.get(
        f"{PREFIX}/me", headers={"Authorization": f"Bearer {rotated['access_token']}"}
    )
    assert me.status_code == 200


async def test_reusing_a_rotated_token_ends_every_session(client, db):
    _, tokens = await signed_in(client, db)
    rotated = (await refresh(client, tokens["refresh_token"])).json()

    reused = await refresh(client, tokens["refresh_token"])

    assert reused.status_code == 401
    assert reused.json()["code"] == "invalid_refresh_token"
    assert (await refresh(client, rotated["refresh_token"])).status_code == 401


async def test_refresh_tokens_are_stored_hashed(client, db):
    _, tokens = await signed_in(client, db)
    raw = tokens["refresh_token"]
    assert await db.scalar(select(RefreshToken).where(RefreshToken.token_hash == raw)) is None


async def test_unknown_refresh_token_is_rejected(client):
    assert (await refresh(client, "nonsense")).status_code == 401


async def test_expired_refresh_token_is_rejected(client, db):
    _, tokens = await signed_in(client, db)
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.token_hash == hash_token(tokens["refresh_token"]))
        .values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
    )

    assert (await refresh(client, tokens["refresh_token"])).status_code == 401


async def test_a_suspended_user_cannot_refresh(client, db):
    user, tokens = await signed_in(client, db)
    user.is_suspended = True
    await db.flush()

    response = await refresh(client, tokens["refresh_token"])

    assert response.status_code == 403
    assert response.json()["code"] == "account_suspended"


async def test_an_access_token_is_not_a_refresh_token(client, db):
    _, tokens = await signed_in(client, db)
    assert (await refresh(client, tokens["access_token"])).status_code == 401


async def test_logout_revokes_the_refresh_token(client, db):
    user, tokens = await signed_in(client, db)

    response = await client.post(
        f"{PREFIX}/auth/logout",
        json={"refresh_token": tokens["refresh_token"]},
        headers=auth_header(user),
    )

    assert response.status_code == 204
    assert (await refresh(client, tokens["refresh_token"])).status_code == 401


async def test_logout_keeps_other_sessions(client, db):
    user, first = await signed_in(client, db)
    second = (await login(client, user.email)).json()

    await client.post(
        f"{PREFIX}/auth/logout",
        json={"refresh_token": first["refresh_token"]},
        headers=auth_header(user),
    )

    assert (await refresh(client, second["refresh_token"])).status_code == 200


async def test_logout_cannot_revoke_another_users_token(client, db):
    _, tokens = await signed_in(client, db)
    other = await make_user(db)

    response = await client.post(
        f"{PREFIX}/auth/logout",
        json={"refresh_token": tokens["refresh_token"]},
        headers=auth_header(other),
    )

    assert response.status_code == 204
    assert (await refresh(client, tokens["refresh_token"])).status_code == 200


async def test_logout_needs_an_access_token(client):
    response = await client.post(f"{PREFIX}/auth/logout", json={"refresh_token": "x"})
    assert response.status_code == 401


async def test_an_expired_access_token_is_rejected(client, db):
    user = await make_user(db)
    token = create_access_token(user.id, expires_in=timedelta(seconds=-1))

    response = await client.get(f"{PREFIX}/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401
    assert response.json()["code"] == "invalid_token"


# Password reset


async def test_password_reset_changes_the_password_and_ends_sessions(client, db, outbox):
    user, tokens = await signed_in(client, db)
    await client.post(f"{PREFIX}/auth/forgot-password", json={"email": user.email})
    assert outbox[0]["to"] == user.email

    response = await client.post(
        f"{PREFIX}/auth/reset-password",
        json={"token": token_in(outbox[0]), "new_password": "a-brand-new-password"},
    )

    assert response.status_code == 200
    assert (await login(client, user.email)).status_code == 401
    assert (await login(client, user.email, "a-brand-new-password")).status_code == 200
    assert (await refresh(client, tokens["refresh_token"])).status_code == 401


async def test_forgot_password_looks_the_same_for_unknown_addresses(client, db, outbox):
    user = await verified_user(db)

    known = await client.post(f"{PREFIX}/auth/forgot-password", json={"email": user.email})
    unknown = await client.post(f"{PREFIX}/auth/forgot-password", json={"email": new_email()})

    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()
    assert len(outbox) == 1


async def test_a_reset_token_works_once(client, db, outbox):
    user = await verified_user(db)
    await client.post(f"{PREFIX}/auth/forgot-password", json={"email": user.email})
    body = {"token": token_in(outbox[0]), "new_password": "a-brand-new-password"}

    assert (await client.post(f"{PREFIX}/auth/reset-password", json=body)).status_code == 200
    second = await client.post(f"{PREFIX}/auth/reset-password", json=body)

    assert second.status_code == 422
    assert second.json()["code"] == "invalid_email_token"


async def test_a_verification_token_cannot_reset_a_password(client, outbox):
    await register(client, new_email())

    response = await client.post(
        f"{PREFIX}/auth/reset-password",
        json={"token": token_in(outbox[0]), "new_password": "a-brand-new-password"},
    )

    assert response.status_code == 422
