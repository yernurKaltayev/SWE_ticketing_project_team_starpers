"""Encryption at rest for sensitive fields (payout account IBANs) [P6].

The Fernet key is derived from TICKET_SIGNING_SECRET with a purpose label, so no new required
secret is introduced and the derived key is never usable as a QR or webhook signing key.
"""

import base64
import hashlib
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings

_PURPOSE = b"biletflow:field-encryption:v1:"


@lru_cache
def _fernet(secret: str) -> Fernet:
    digest = hashlib.sha256(_PURPOSE + secret.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def _cipher() -> Fernet:
    return _fernet(get_settings().ticket_signing_secret.get_secret_value())


def encrypt_field(plaintext: str) -> str:
    return _cipher().encrypt(plaintext.encode()).decode()


def decrypt_field(ciphertext: str) -> str:
    try:
        return _cipher().decrypt(ciphertext.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("cannot decrypt field: wrong key or corrupted value") from exc
