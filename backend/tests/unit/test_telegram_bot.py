"""The Telegram bot's side of phone verification [P1]."""

import json
from datetime import timedelta
from itertools import count
from typing import Any

import httpx
import pytest

from app.core.security import hash_token
from app.db.base import utcnow
from app.models.user import PhoneVerification
from app.services.phone_verification import handle_update
from app.services.telegram import BotReply, TelegramApi, TelegramError
from tests.factories import make_user, unique

CHAT = 555_000_111
_ids = count(1)


def update(*, chat_id: int = CHAT, from_id: int = CHAT, text: str | None = None, contact=None):
    message: dict[str, Any] = {
        "message_id": next(_ids),
        "chat": {"id": chat_id, "type": "private"},
        "from": {"id": from_id, "is_bot": False, "first_name": "Aida"},
    }
    if text is not None:
        message["text"] = text
    if contact is not None:
        message["contact"] = contact
    return {"update_id": next(_ids), "message": message}


async def pending(db, phone="+77012345678", *, expires_in=timedelta(minutes=15), used=False):
    user = await make_user(db, phone=phone)
    token = unique("tok").replace("-", "_")
    row = PhoneVerification(
        user_id=user.id,
        token_hash=hash_token(token),
        expires_at=utcnow() + expires_in,
        used_at=utcnow() if used else None,
    )
    db.add(row)
    await db.flush()
    return user, token, row


async def started(db, **kwargs):
    user, token, row = await pending(db, **kwargs)
    await handle_update(db, update(text=f"/start {token}"))
    return user, row


def own_contact(phone_number: str, user_id: int = CHAT) -> dict[str, Any]:
    return {"phone_number": phone_number, "first_name": "Aida", "user_id": user_id}


async def test_start_binds_the_chat_and_asks_for_the_contact(db):
    _, token, row = await pending(db)

    replies = await handle_update(db, update(text=f"/start {token}"))

    assert len(replies) == 1
    assert replies[0].chat_id == CHAT
    assert replies[0].ask_contact is True
    await db.refresh(row)
    assert row.telegram_chat_id == CHAT


async def test_own_matching_contact_verifies_the_phone(db):
    user, row = await started(db)

    replies = await handle_update(db, update(contact=own_contact("77012345678")))

    await db.refresh(user)
    await db.refresh(row)
    assert user.phone_verified_at is not None
    assert user.telegram_chat_id == CHAT
    assert row.used_at is not None
    assert "Your phone is verified" in replies[0].text
    assert replies[0].ask_contact is False


@pytest.mark.parametrize("shared", ["+7 701 234 56 78", "+77012345678", "87012345678"])
async def test_contact_in_another_format_still_matches(db, shared):
    user, _ = await started(db)
    await handle_update(db, update(contact=own_contact(shared)))
    await db.refresh(user)
    assert user.phone_verified_at is not None


@pytest.mark.parametrize("contact_user_id", [CHAT + 1, None])
async def test_someone_elses_contact_is_refused(db, contact_user_id):
    user, row = await started(db)
    contact = {"phone_number": "77012345678", "first_name": "Other"}
    if contact_user_id is not None:
        contact["user_id"] = contact_user_id

    replies = await handle_update(db, update(contact=contact))

    await db.refresh(user)
    assert user.phone_verified_at is None
    assert "your own contact" in replies[0].text
    await db.refresh(row)
    assert row.used_at is None


async def test_a_different_number_is_refused_and_can_be_retried(db):
    user, row = await started(db)

    replies = await handle_update(db, update(contact=own_contact("77079998877")))

    await db.refresh(user)
    await db.refresh(row)
    assert user.phone_verified_at is None
    assert row.used_at is None
    assert "doesn't match" in replies[0].text
    await handle_update(db, update(contact=own_contact("77012345678")))
    await db.refresh(user)
    assert user.phone_verified_at is not None


async def test_a_foreign_number_counts_as_a_mismatch(db):
    user, _ = await started(db)
    replies = await handle_update(db, update(contact=own_contact("+7 901 234 56 78")))
    await db.refresh(user)
    assert user.phone_verified_at is None
    assert "doesn't match" in replies[0].text


async def test_the_current_account_phone_is_used(db):
    user, _ = await started(db)
    user.phone = "+77020000000"
    await db.flush()

    replies = await handle_update(db, update(contact=own_contact("77012345678")))

    await db.refresh(user)
    assert user.phone_verified_at is None
    assert "doesn't match" in replies[0].text


@pytest.mark.parametrize(
    ("kind", "kwargs"),
    [("expired", {"expires_in": timedelta(minutes=-1)}), ("used", {"used": True})],
)
async def test_expired_or_used_links_are_refused(db, kind, kwargs):
    _, token, row = await pending(db, **kwargs)

    replies = await handle_update(db, update(text=f"/start {token}"))

    assert "no longer valid" in replies[0].text, kind
    await db.refresh(row)
    assert row.telegram_chat_id is None


async def test_unknown_links_are_refused(db):
    replies = await handle_update(db, update(text="/start not-a-real-token"))
    assert "no longer valid" in replies[0].text


async def test_contact_without_start_and_other_messages(db):
    user, _, _ = await pending(db)

    no_start = await handle_update(db, update(contact=own_contact("77012345678")))
    plain = await handle_update(db, update(text="hello"))
    bare_start = await handle_update(db, update(text="/start"))
    sticker = await handle_update(db, update())

    assert "verification link" in no_start[0].text
    for replies in (plain, bare_start, sticker):
        assert "account page" in replies[0].text
    await db.refresh(user)
    assert user.phone_verified_at is None


@pytest.mark.parametrize(
    "malformed", [{}, {"update_id": 1}, {"update_id": 2, "message": {"text": "x"}}]
)
async def test_malformed_updates_are_ignored(db, malformed):
    assert await handle_update(db, malformed) == []


async def test_the_same_update_twice_is_harmless(db):
    user, _ = await started(db)
    shared = update(contact=own_contact("77012345678"))

    await handle_update(db, shared)
    again = await handle_update(db, shared)

    await db.refresh(user)
    assert user.phone_verified_at is not None
    assert len(again) == 1


async def test_client_sends_the_contact_keyboard():
    seen: list[dict[str, Any]] = []

    def respond(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/bot123:abc/sendMessage"
        seen.append(json.loads(request.content))
        return httpx.Response(200, json={"ok": True, "result": {}})

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        api = TelegramApi("123:abc", client)
        await api.send_message(BotReply(chat_id=7, text="hi", ask_contact=True))
        await api.send_message(BotReply(chat_id=7, text="bye"))

    keyboard = seen[0]["reply_markup"]
    assert keyboard["keyboard"][0][0]["request_contact"] is True
    assert keyboard["one_time_keyboard"] is True
    assert seen[1]["reply_markup"] == {"remove_keyboard": True}
    assert seen[0]["chat_id"] == 7


async def test_client_reads_updates_and_raises_on_failure():
    def respond(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/getUpdates"):
            assert request.url.params["offset"] == "42"
            return httpx.Response(200, json={"ok": True, "result": [{"update_id": 42}]})
        return httpx.Response(200, json={"ok": False, "description": "Forbidden"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        api = TelegramApi("123:abc", client)
        assert await api.get_updates(42) == [{"update_id": 42}]
        with pytest.raises(TelegramError):
            await api.send_message(BotReply(chat_id=7, text="x"))
