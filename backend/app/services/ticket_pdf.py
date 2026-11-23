"""Printable A4 ticket [P8]. Black on white, large type, no card or price data."""

import io
from dataclasses import dataclass
from datetime import datetime
from functools import cache
from pathlib import Path
from zoneinfo import ZoneInfo

from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas

from app.services.ticket_qr import render_qr_png

MARGIN = 20 * 2.8346  # 20 mm in points
QR_SIZE = 90 * 2.8346

# ReportLab's built-in Helvetica only covers Latin-1, so Russian and Kazakh names and
# titles printed as black boxes. DejaVu Sans covers Cyrillic, including the Kazakh-specific
# letters (tested in tests/unit/test_ticket_pdf.py); see LICENSE_DEJAVU.
FONT_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"
REGULAR = "DejaVuSans"
BOLD = "DejaVuSans-Bold"


@cache
def _register_fonts() -> None:
    for name in (REGULAR, BOLD):
        pdfmetrics.registerFont(TTFont(name, FONT_DIR / f"{name}.ttf"))


@dataclass(frozen=True)
class TicketPdfData:
    ticket_number: str
    qr_payload: str
    event_title: str
    venue: str
    starts_at: datetime
    timezone: str
    ticket_type: str
    attendee_name: str
    seat_label: str | None


def _fit(text: str, font: str, size: float, max_width: float) -> str:
    """Cut `text` with an ellipsis so it fits `max_width` points when set in `font`."""
    if pdfmetrics.stringWidth(text, font, size) <= max_width:
        return text
    while text and pdfmetrics.stringWidth(text + "…", font, size) > max_width:
        text = text[:-1]
    return text.rstrip() + "…"


def render_ticket_pdf(data: TicketPdfData) -> bytes:
    _register_fonts()
    buffer = io.BytesIO()
    pdf = Canvas(buffer, pagesize=A4, pageCompression=1, initialFontName=REGULAR)
    pdf.setTitle(f"Ticket {data.ticket_number}")
    width, height = A4
    y = height - MARGIN
    value_x = MARGIN + 35 * 2.8346

    pdf.setFont(BOLD, 12)
    pdf.drawString(MARGIN, y, "BILETFLOW")
    y -= 14 * 2.8346
    pdf.setFont(BOLD, 26)
    pdf.drawString(MARGIN, y, _fit(data.event_title, BOLD, 26, width - 2 * MARGIN))
    y -= 12 * 2.8346

    local_start = data.starts_at.astimezone(ZoneInfo(data.timezone))
    rows = [
        ("Date", local_start.strftime("%A, %d %B %Y")),
        ("Time", f"{local_start.strftime('%H:%M')} ({data.timezone})"),
        ("Venue", data.venue),
        ("Ticket", data.ticket_type),
        ("Attendee", data.attendee_name),
    ]
    if data.seat_label:
        rows.append(("Seat", data.seat_label))
    for label, value in rows:
        pdf.setFont(REGULAR, 11)
        pdf.drawString(MARGIN, y, label.upper())
        pdf.setFont(BOLD, 15)
        pdf.drawString(value_x, y, _fit(value, BOLD, 15, width - MARGIN - value_x))
        y -= 9 * 2.8346

    y -= 6 * 2.8346
    pdf.setLineWidth(1.5)
    pdf.line(MARGIN, y, width - MARGIN, y)
    y -= QR_SIZE + 8 * 2.8346
    qr = ImageReader(io.BytesIO(render_qr_png(data.qr_payload)))
    pdf.drawImage(qr, MARGIN, y, QR_SIZE, QR_SIZE)

    pdf.setFont(BOLD, 18)
    pdf.drawString(MARGIN + QR_SIZE + 10 * 2.8346, y + QR_SIZE / 2 + 8, data.ticket_number)
    pdf.setFont(REGULAR, 11)
    pdf.drawString(
        MARGIN + QR_SIZE + 10 * 2.8346, y + QR_SIZE / 2 - 10, "Show this code at the entrance."
    )
    pdf.drawString(MARGIN + QR_SIZE + 10 * 2.8346, y + QR_SIZE / 2 - 24, "One entry per ticket.")

    pdf.setFont(REGULAR, 9)
    pdf.drawString(MARGIN, MARGIN, "Same ticket number as in your BiletFlow account.")
    pdf.showPage()
    pdf.save()
    return buffer.getvalue()
