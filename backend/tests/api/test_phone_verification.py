"""Starting Telegram phone verification [P1]."""

import re
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlparse

import pytest
from pydantic import SecretStr
from sqlalchemy import select

from app.core.config import get_settings
from app.core.security import hash_token
from app.models.user import PhoneVerification
from tests.factories import auth_header, make_user

URL = "/api/v1/me/phone-verification"


@pytest.fixture
def bot(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "telegram_bot_token", SecretStr("123:test-token"))
    monkeypatch.setattr(settings, "telegram_bot_username", "biletflow_test_bot")


async def test_status_says_unavailable_without_a_bot(client, db):
    user = await make_user(db, phone="+77011234567")
    response = await client.get(URL, headers=auth_header(user))
    assert response.status_code == 200
    assert response.json() == {"available": False}


async def test_status_says_available_with_a_bot(client, db, bot):
    user = await make_user(db, phone="+77011234567")
    response = await client.get(URL, headers=auth_header(user))
    assert response.json() == {"available": True}


async def test_start_without_a_bot_is_503(client, db):
    user = await make_user(db, phone="+77011234567")
    response = await client.post(URL, headers=auth_header(user))
    assert response.status_code == 503
    assert response.json()["code"] == "telegram_unavailable"


async def test_start_without_a_phone_is_409(client, db, bot):
    user = await make_user(db, phone=None)
    response = await client.post(URL, headers=auth_header(user))
    assert response.status_code == 409
    assert response.json()["code"] == "phone_missing"


async def test_start_needs_a_signed_in_user(client, bot):
    assert (await client.post(URL)).status_code == 401


async def test_start_returns_a_deep_link(client, db, bot):
    user = await make_user(db, phone="+77011234567")

    response = await client.post(URL, headers=auth_header(user))

    assert response.status_code == 201
    body = response.json()
    link_pattern = r"https://t\.me/biletflow_test_bot\?start=[A-Za-z0-9_-]{20,64}"
    assert re.fullmatch(link_pattern, body["link"])
    expires = datetime.fromisoformat(body["expires_at"])
    assert abs(expires - (datetime.now(UTC) + timedelta(minutes=15))) < timedelta(seconds=30)
    token = parse_qs(urlparse(body["link"]).query)["start"][0]
    row = await db.scalar(select(PhoneVerification).where(PhoneVerification.user_id == user.id))
    assert row.token_hash == hash_token(token)
    assert row.token_hash != token


async def test_starting_again_replaces_the_open_request(client, db, bot):
    user = await make_user(db, phone="+77011234567")

    await client.post(URL, headers=auth_header(user))
    await client.post(URL, headers=auth_header(user))

    rows = (
        await db.scalars(select(PhoneVerification).where(PhoneVerification.user_id == user.id))
    ).all()
    assert len(rows) == 2
    assert [row.used_at is None for row in rows].count(True) == 1
