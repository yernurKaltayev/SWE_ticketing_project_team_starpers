"""The printable ticket must render Kazakh and Russian text and keep long values on the page."""

from datetime import UTC, datetime

from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics

from app.services.ticket_pdf import BOLD, TicketPdfData, _fit, _register_fonts, render_ticket_pdf


def _ticket(**overrides: object) -> TicketPdfData:
    values: dict[str, object] = {
        "ticket_number": "BF-TEST-0001",
        "qr_payload": "BFT.00000000000000000000000000000000.0123456789abcdef0123456789abcdef",
        "event_title": "Концерт «Абай» — Әнші кеші",
        "venue": "Алматы, Абай даңғылы 1",
        "starts_at": datetime(2026, 12, 20, 14, 0, tzinfo=UTC),
        "timezone": "Asia/Almaty",
        "ticket_type": "Стандарт",
        "attendee_name": "Дінмұхамед Сайлау",
        "seat_label": None,
    }
    values.update(overrides)
    return TicketPdfData(**values)  # type: ignore[arg-type]


def test_pdf_embeds_a_unicode_font_instead_of_helvetica() -> None:
    pdf = render_ticket_pdf(_ticket())

    assert pdf.startswith(b"%PDF")
    # Built-in Helvetica has no Cyrillic glyphs; the embedded TrueType font does.
    assert b"DejaVuSans" in pdf
    assert b"Helvetica" not in pdf


def test_font_covers_kazakh_and_russian_letters() -> None:
    _register_fonts()
    face = pdfmetrics.getFont(BOLD).face
    for letter in "АаЯяЁёӘәҒғҚқҢңӨөҰұҮүҺһІі":
        assert ord(letter) in face.charToGlyph, f"missing glyph for {letter!r}"


def test_long_values_are_cut_to_the_page_width() -> None:
    _register_fonts()
    max_width = A4[0] - 2 * 20 * 2.8346
    long_title = "Халықаралық студенттік джаз фестивалі " * 4

    fitted = _fit(long_title, BOLD, 26, max_width)

    assert fitted.endswith("…")
    assert pdfmetrics.stringWidth(fitted, BOLD, 26) <= max_width
    assert _fit("Short", BOLD, 26, max_width) == "Short"
    render_ticket_pdf(_ticket(event_title=long_title, attendee_name="Я" * 200))
