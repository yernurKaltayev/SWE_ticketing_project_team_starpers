import pytest

from app.core import rate_limit
from app.core.errors import TooManyRequestsError
from app.core.rate_limit import RateLimiter


@pytest.fixture
def clock(monkeypatch):
    class Clock:
        now = 1000.0

        def monotonic(self) -> float:
            return self.now

    fake = Clock()
    monkeypatch.setattr(rate_limit, "time", fake)
    return fake


def test_blocks_after_the_limit_and_says_when_to_retry(clock):
    limiter = RateLimiter()
    for _ in range(3):
        limiter.hit("key", limit=3, window_seconds=60)

    clock.now += 10
    with pytest.raises(TooManyRequestsError) as caught:
        limiter.hit("key", limit=3, window_seconds=60)
    assert caught.value.headers == {"Retry-After": "50"}


def test_keys_are_counted_separately(clock):
    limiter = RateLimiter()
    limiter.hit("a", limit=1, window_seconds=60)
    limiter.hit("b", limit=1, window_seconds=60)


def test_the_window_resets(clock):
    limiter = RateLimiter()
    limiter.hit("key", limit=1, window_seconds=60)
    clock.now += 60
    limiter.hit("key", limit=1, window_seconds=60)


def test_expired_windows_are_dropped(clock):
    limiter = RateLimiter()
    limiter.hit("old", limit=1, window_seconds=60)
    clock.now += 120
    limiter.hit("new", limit=1, window_seconds=60)
    assert set(limiter._windows) == {"new"}
