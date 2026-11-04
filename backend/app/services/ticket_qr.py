"""Ticket QR payloads: sign, verify and render [P8].

Payload: ``BFT1.<ticket id, 32 hex>.<signature, 32 hex>``. The signature is an HMAC of the ticket
ID under the server secret, so a QR cannot be forged or edited without that secret. Nothing else
is encoded: never a price or discount. Campaign QR codes (P16) are HTTPS links, so the two
formats cannot be confused, and check-in (P15) rejects anything without this prefix.
"""

import hmac
import io
import uuid

import qrcode
from qrcode.constants import ERROR_CORRECT_M

from app.core.security import sign_value

PREFIX = "BFT1"
PURPOSE = "ticket-qr"
SIGNATURE_LENGTH = 32  # hex characters: 128 bits, enough for HMAC truncation and keeps the QR small


def _signature(ticket_id: uuid.UUID) -> str:
    return sign_value(ticket_id.hex, purpose=PURPOSE)[:SIGNATURE_LENGTH]


def encode_qr_payload(ticket_id: uuid.UUID) -> str:
    return f"{PREFIX}.{ticket_id.hex}.{_signature(ticket_id)}"


def decode_qr_payload(payload: str) -> uuid.UUID | None:
    """Return the ticket ID if `payload` is a genuine ticket QR, otherwise None.

    None covers every failure (wrong prefix, malformed, bad signature) on purpose: callers
    must not tell a scanner why a forgery failed.
    """
    parts = payload.strip().split(".")
    if len(parts) != 3 or parts[0] != PREFIX:
        return None
    _, id_hex, signature = parts
    try:
        ticket_id = uuid.UUID(hex=id_hex)
    except ValueError:
        return None
    if len(id_hex) != 32 or not hmac.compare_digest(_signature(ticket_id), signature):
        return None
    return ticket_id


def render_qr_png(payload: str, *, box_size: int = 10) -> bytes:
    """Black on white with a full quiet zone: stays scannable when printed in grayscale."""
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_M, box_size=box_size, border=4)
    qr.add_data(payload)
    qr.make(fit=True)
    buffer = io.BytesIO()
    qr.make_image(fill_color="black", back_color="white").save(buffer, format="PNG")
    return buffer.getvalue()
