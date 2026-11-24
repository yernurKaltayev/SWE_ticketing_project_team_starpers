"""A minimal Telegram Bot API client over httpx: read updates and send replies [P1].

Only what phone verification needs. The token is part of the request URL, so it is never logged
here; callers log failures without it.
"""

from dataclasses import dataclass
from typing import Any

import httpx

API = "https://api.telegram.org"
# The contact-request button: kk · ru · en.
SHARE_BUTTON = "Нөмірімді бөлісу · Поделиться номером · Share my number"


@dataclass(frozen=True)
class BotReply:
    chat_id: int
    text: str
    ask_contact: bool = False


class TelegramError(Exception):
    """Telegram could not be reached, or answered `ok: false`."""


class TelegramApi:
    def __init__(self, token: str, client: httpx.AsyncClient | None = None) -> None:
        self._token = token
        self._client = client or httpx.AsyncClient(timeout=35)

    async def _call(self, method: str, **params: Any) -> Any:
        url = f"{API}/bot{self._token}/{method}"
        try:
            if method == "getUpdates":
                response = await self._client.get(url, params=params)
            else:
                response = await self._client.post(url, json=params)
            data = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise TelegramError(f"{method} failed: {type(exc).__name__}") from None
        if not isinstance(data, dict) or not data.get("ok"):
            description = data.get("description") if isinstance(data, dict) else None
            raise TelegramError(f"{method} failed: {description or response.status_code}")
        return data.get("result")

    async def get_updates(self, offset: int | None, wait_seconds: int = 0) -> list[dict[str, Any]]:
        """New updates after `offset`; `wait_seconds` > 0 long-polls on Telegram's side."""
        params: dict[str, Any] = {"timeout": wait_seconds, "allowed_updates": '["message"]'}
        if offset is not None:
            params["offset"] = offset
        result = await self._call("getUpdates", **params)
        return result if isinstance(result, list) else []

    async def send_message(self, reply: BotReply) -> None:
        markup: dict[str, Any] = (
            {
                "keyboard": [[{"text": SHARE_BUTTON, "request_contact": True}]],
                "one_time_keyboard": True,
                "resize_keyboard": True,
            }
            if reply.ask_contact
            else {"remove_keyboard": True}
        )
        await self._call("sendMessage", chat_id=reply.chat_id, text=reply.text, reply_markup=markup)

    async def aclose(self) -> None:
        await self._client.aclose()
