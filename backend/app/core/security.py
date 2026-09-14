import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

import bcrypt
import jwt

from app.core.config import settings


def hash_password(plain_password: str) -> str:
    return bcrypt.hashpw(plain_password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode(), hashed_password.encode())


def create_access_token(user_id: UUID, role: str) -> tuple[str, int]:
    """Returns the signed token and its lifetime in seconds."""
    ttl = timedelta(minutes=settings.access_token_ttl_minutes)
    issued_at = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "role": role,
        "type": "access",
        "iat": issued_at,
        "exp": issued_at + ttl,
    }
    token = jwt.encode(
        payload, settings.jwt_secret.get_secret_value(), algorithm=settings.jwt_algorithm
    )
    return token, int(ttl.total_seconds())


def decode_access_token(token: str) -> dict:
    """Raises jwt.PyJWTError when the token is invalid or expired."""
    payload = jwt.decode(
        token, settings.jwt_secret.get_secret_value(), algorithms=[settings.jwt_algorithm]
    )
    if payload.get("type") != "access":
        raise jwt.InvalidTokenError("not an access token")
    return payload


def generate_opaque_token() -> str:
    """Refresh, email-verification and password-reset tokens are random, not JWTs.

    They are revocable and single-use, which JWTs are not.
    """
    return secrets.token_urlsafe(32)


def hash_opaque_token(token: str) -> str:
    """Only the hash is persisted, so a database leak cannot be replayed."""
    return hashlib.sha256(token.encode()).hexdigest()
