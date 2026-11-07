import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.core.config import Settings, get_settings
from app.core.security import (
    InvalidTokenError,
    create_access_token,
    decode_access_token,
    hash_password,
    hash_token,
    sign_value,
    verify_password,
    verify_signature,
)


def test_password_hash_round_trip():
    hashed = hash_password("correct horse")
    assert hashed.startswith("$argon2id$")
    assert verify_password("correct horse", hashed)
    assert not verify_password("wrong", hashed)


def test_access_token_round_trip():
    user_id = uuid.uuid4()
    assert decode_access_token(create_access_token(user_id)) == user_id


def test_expired_token_is_rejected():
    token = create_access_token(uuid.uuid4(), expires_in=timedelta(seconds=-1))
    with pytest.raises(InvalidTokenError):
        decode_access_token(token)


def _encode(claims: dict, secret: str | None = None) -> str:
    settings = get_settings()
    return jwt.encode(claims, secret or settings.jwt_secret.get_secret_value(), algorithm="HS256")


@pytest.mark.parametrize(
    "token",
    [
        "garbage",
        _encode({"sub": str(uuid.uuid4()), "type": "access", "exp": 9999999999}, "x" * 40),
        _encode({"sub": str(uuid.uuid4()), "type": "refresh", "exp": 9999999999}),
        _encode({"sub": "not-a-uuid", "type": "access", "exp": 9999999999}),
        _encode({"sub": str(uuid.uuid4()), "type": "access"}),
    ],
    ids=["malformed", "wrong-key", "wrong-type", "bad-subject", "no-expiry"],
)
def test_invalid_tokens_are_rejected(token):
    with pytest.raises(InvalidTokenError):
        decode_access_token(token)


def test_alg_none_is_rejected():
    claims = {
        "sub": str(uuid.uuid4()),
        "type": "access",
        "exp": datetime.now(UTC) + timedelta(hours=1),
    }
    with pytest.raises(InvalidTokenError):
        decode_access_token(
            jwt.encode(claims, None, algorithm="none")  # type: ignore[arg-type]
        )


def test_signature_round_trip_and_tampering():
    signature = sign_value("ticket-1", purpose="ticket")
    assert verify_signature("ticket-1", signature, purpose="ticket")
    assert not verify_signature("ticket-2", signature, purpose="ticket")


def test_signature_is_bound_to_its_purpose():
    signature = sign_value("value", purpose="ticket")
    assert not verify_signature("value", signature, purpose="campaign")


def test_hash_token_is_deterministic_and_not_the_token():
    assert hash_token("abc") == hash_token("abc")
    assert hash_token("abc") != "abc"


def test_short_secrets_are_rejected():
    with pytest.raises(ValueError, match="at least 32"):
        Settings(jwt_secret="short", ticket_signing_secret="y" * 32, _env_file=None)


def test_dev_secrets_are_rejected_in_production():
    with pytest.raises(ValueError, match="production"):
        Settings(
            environment="production",
            jwt_secret="dev-only-" + "x" * 32,
            ticket_signing_secret="y" * 32,
            _env_file=None,
        )
