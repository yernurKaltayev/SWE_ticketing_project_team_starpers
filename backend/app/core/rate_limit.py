"""Fixed-window rate limiting for the public auth endpoints.

Counters live in process memory, on `app.state`. That is enough for the single uvicorn process in
docker/start-api.sh. Running several processes multiplies the limits by their number, so move the
counters to shared storage before scaling out.
"""

import math
import time

from fastapi import Request

from app.core.config import get_settings
from app.core.errors import TooManyRequestsError


class RateLimiter:
    def __init__(self) -> None:
        self._windows: dict[str, tuple[float, int]] = {}  # key -> (resets at, attempts)
        self._next_sweep = 0.0

    def hit(self, key: str, *, limit: int, window_seconds: int) -> None:
        """Count one attempt, or raise `TooManyRequestsError` if `key` has none left."""
        now = time.monotonic()
        if now >= self._next_sweep:  # keeps memory bounded by the traffic of one window
            self._windows = {k: v for k, v in self._windows.items() if v[0] > now}
            self._next_sweep = now + window_seconds

        resets_at, attempts = self._windows.get(key, (now + window_seconds, 0))
        if resets_at <= now:
            resets_at, attempts = now + window_seconds, 0
        if attempts >= limit:
            retry_after = math.ceil(resets_at - now)
            raise TooManyRequestsError(headers={"Retry-After": str(retry_after)})
        self._windows[key] = (resets_at, attempts + 1)


def enforce_auth_rate_limit(request: Request, action: str, email: str | None = None) -> None:
    """Limit `action` per client IP and, if `email` is given, per IP and account together.

    The account limit stops password guessing. It includes the IP so that an attacker cannot lock
    a victim out from elsewhere. The IP limit stops one password being tried on many accounts.
    """
    settings = get_settings()
    limiter: RateLimiter = request.app.state.rate_limiter
    window_seconds = settings.auth_rate_limit_window_seconds
    ip = request.client.host if request.client else "unknown"

    limiter.hit(
        f"{action}:{ip}", limit=settings.auth_rate_limit_per_ip, window_seconds=window_seconds
    )
    if email is not None:
        limiter.hit(
            f"{action}:{ip}:{email.lower()}",
            limit=settings.auth_rate_limit_per_account,
            window_seconds=window_seconds,
        )
