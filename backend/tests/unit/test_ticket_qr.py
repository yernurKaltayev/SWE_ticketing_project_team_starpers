import uuid

from app.services.ticket_qr import PREFIX, decode_qr_payload, encode_qr_payload, render_qr_png


def test_payload_round_trips():
    ticket_id = uuid.uuid4()
    payload = encode_qr_payload(ticket_id)
    assert payload.startswith(f"{PREFIX}.")
    assert decode_qr_payload(payload) == ticket_id
    assert decode_qr_payload(f"  {payload}\n") == ticket_id


def test_payload_carries_only_id_and_signature():
    payload = encode_qr_payload(uuid.uuid4())
    assert len(payload.split(".")) == 3
    assert len(payload) < 80


def test_tampered_id_is_rejected():
    payload = encode_qr_payload(uuid.uuid4())
    _, _, signature = payload.split(".")
    forged = f"{PREFIX}.{uuid.uuid4().hex}.{signature}"
    assert decode_qr_payload(forged) is None


def test_tampered_signature_is_rejected():
    ticket_id = uuid.uuid4()
    forged = f"{PREFIX}.{ticket_id.hex}.{'0' * 32}"
    assert decode_qr_payload(forged) is None


def test_signature_for_another_purpose_is_rejected():
    from app.core.security import sign_value

    ticket_id = uuid.uuid4()
    other = sign_value(ticket_id.hex, purpose="something-else")[:32]
    assert decode_qr_payload(f"{PREFIX}.{ticket_id.hex}.{other}") is None


def test_other_formats_are_rejected():
    ticket_id = uuid.uuid4()
    payload = encode_qr_payload(ticket_id)
    for bad in (
        "",
        "garbage",
        "https://biletflow.kz/c/abc123",  # a campaign QR (P16)
        payload.replace(PREFIX, "BFC1"),
        payload.upper(),
        f"{PREFIX}.{ticket_id.hex}",
        f"{payload}.extra",
        f"{PREFIX}.not-a-uuid.{'0' * 32}",
        f"{PREFIX}.{ticket_id!s}.{payload.split('.')[2]}",  # hyphenated UUID
    ):
        assert decode_qr_payload(bad) is None, bad


def test_png_is_rendered():
    png = render_qr_png(encode_qr_payload(uuid.uuid4()))
    assert png.startswith(b"\x89PNG\r\n\x1a\n")
