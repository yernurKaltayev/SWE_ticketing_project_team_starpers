"""Password hashing, JWT access tokens and HMAC signing."""

import hashlib
import hmac
import uuid
from datetime import UTC, datetime, timedelta

import jwt
from passlib.context import CryptContext

from app.core.config import get_settings

ACCESS_TOKEN_TYPE = "access"  # noqa: S105 - a claim value, not a credential

_passwords = CryptContext(schemes=["argon2"], deprecated="auto")


class InvalidTokenError(Exception):
    """The token is malformed, expired, or has the wrong type."""


def hash_password(password: str) -> str:
    return _passwords.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return _passwords.verify(password, password_hash)


def create_access_token(user_id: uuid.UUID, *, expires_in: timedelta | None = None) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    lifetime = expires_in or timedelta(minutes=settings.access_token_ttl_minutes)
    return jwt.encode(
        {"sub": str(user_id), "type": ACCESS_TOKEN_TYPE, "iat": now, "exp": now + lifetime},
        settings.jwt_secret.get_secret_value(),
        algorithm=settings.jwt_algorithm,
    )


def decode_access_token(token: str) -> uuid.UUID:
    """Return the user ID in a valid access token, or raise `InvalidTokenError`."""
    settings = get_settings()
    try:
        claims = jwt.decode(
            token,
            settings.jwt_secret.get_secret_value(),
            algorithms=[settings.jwt_algorithm],
            options={"require": ["exp", "sub"]},
        )
        if claims.get("type") != ACCESS_TOKEN_TYPE:
            raise InvalidTokenError("not an access token")
        return uuid.UUID(claims["sub"])
    except (jwt.InvalidTokenError, ValueError) as exc:
        raise InvalidTokenError(str(exc)) from exc


def hash_token(token: str) -> str:
    """Digest for high-entropy tokens stored in the DB (refresh, email, ...)."""
    return hashlib.sha256(token.encode()).hexdigest()


def sign_value(value: str, *, purpose: str) -> str:
    """HMAC-SHA256 hex signature. `purpose` stops a signature for one use passing as another."""
    key = get_settings().ticket_signing_secret.get_secret_value().encode()
    return hmac.new(key, f"{purpose}:{value}".encode(), hashlib.sha256).hexdigest()


def verify_signature(value: str, signature: str, *, purpose: str) -> bool:
    return hmac.compare_digest(sign_value(value, purpose=purpose), signature)
