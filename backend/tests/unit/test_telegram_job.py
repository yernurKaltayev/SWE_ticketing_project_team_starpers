"""The worker job that polls the Telegram bot [P1]."""

from pydantic import SecretStr

from app.core.config import get_settings
from app.services.telegram import BotReply, TelegramError
from app.tasks import telegram_updates
from app.tasks.telegram_updates import poll_once, telegram_updates_job
from app.tasks.worker import JOBS


def text_update(update_id: int, chat_id: int, text: str = "hello") -> dict:
    return {
        "update_id": update_id,
        "message": {
            "message_id": update_id,
            "chat": {"id": chat_id, "type": "private"},
            "from": {"id": chat_id},
            "text": text,
        },
    }


class FakeApi:
    def __init__(self, updates=None, *, fail_updates=False, fail_for_chat=None):
        self.updates = updates or []
        self.fail_updates = fail_updates
        self.fail_for_chat = fail_for_chat
        self.asked_offsets: list[int | None] = []
        self.sent: list[BotReply] = []

    async def get_updates(self, offset, wait_seconds=0):
        self.asked_offsets.append(offset)
        if self.fail_updates:
            raise TelegramError("getUpdates failed: timeout")
        return self.updates

    async def send_message(self, reply):
        if reply.chat_id == self.fail_for_chat:
            raise TelegramError("sendMessage failed: Forbidden")
        self.sent.append(reply)


async def test_poll_handles_updates_sends_replies_and_advances(db):
    api = FakeApi([text_update(10, 1), text_update(12, 2)])

    offset = await poll_once(db, api, 9)

    assert offset == 13
    assert api.asked_offsets == [9]
    assert [reply.chat_id for reply in api.sent] == [1, 2]


async def test_poll_with_nothing_new_keeps_the_offset(db):
    assert await poll_once(db, FakeApi([]), 7) == 7


async def test_poll_keeps_the_offset_when_telegram_fails(db):
    api = FakeApi(fail_updates=True)

    offset = await poll_once(db, api, 5)

    assert offset == 5
    assert api.sent == []


async def test_a_failing_reply_does_not_stop_the_batch(db):
    api = FakeApi([text_update(1, 100), text_update(2, 200)], fail_for_chat=100)

    offset = await poll_once(db, api, None)

    assert offset == 3
    assert [reply.chat_id for reply in api.sent] == [200]


async def test_job_does_nothing_without_a_bot(monkeypatch):
    def must_not_connect(*args, **kwargs):
        raise AssertionError("TelegramApi must not be created without a bot")

    monkeypatch.setattr(telegram_updates, "TelegramApi", must_not_connect)

    await telegram_updates_job()


async def test_job_polls_and_remembers_the_offset(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "telegram_bot_token", SecretStr("123:test"))
    monkeypatch.setattr(settings, "telegram_bot_username", "biletflow_test_bot")
    monkeypatch.setattr(telegram_updates, "_offset", None)
    seen: list[int | None] = []

    async def fake_poll(db, api, offset):
        seen.append(offset)
        return 41 if offset is None else offset + 1

    monkeypatch.setattr(telegram_updates, "poll_once", fake_poll)

    await telegram_updates_job()
    await telegram_updates_job()

    assert seen == [None, 41]


def test_worker_registers_the_telegram_job():
    assert (telegram_updates_job, 3) in JOBS
