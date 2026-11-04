"""Printable A4 ticket [P8]. Black on white, large type, no card or price data."""

import io
from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen.canvas import Canvas

from app.services.ticket_qr import render_qr_png

MARGIN = 20 * 2.8346  # 20 mm in points
QR_SIZE = 90 * 2.8346


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


def _fit(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[: limit - 1] + "…"


def render_ticket_pdf(data: TicketPdfData) -> bytes:
    buffer = io.BytesIO()
    pdf = Canvas(buffer, pagesize=A4, pageCompression=1)
    pdf.setTitle(f"Ticket {data.ticket_number}")
    width, height = A4
    y = height - MARGIN

    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(MARGIN, y, "BILETFLOW")
    y -= 14 * 2.8346
    pdf.setFont("Helvetica-Bold", 26)
    pdf.drawString(MARGIN, y, _fit(data.event_title, 36))
    y -= 12 * 2.8346

    local_start = data.starts_at.astimezone(ZoneInfo(data.timezone))
    rows = [
        ("Date", local_start.strftime("%A, %d %B %Y")),
        ("Time", f"{local_start.strftime('%H:%M')} ({data.timezone})"),
        ("Venue", _fit(data.venue, 60)),
        ("Ticket", _fit(data.ticket_type, 60)),
        ("Attendee", _fit(data.attendee_name, 60)),
    ]
    if data.seat_label:
        rows.append(("Seat", data.seat_label))
    for label, value in rows:
        pdf.setFont("Helvetica", 11)
        pdf.drawString(MARGIN, y, label.upper())
        pdf.setFont("Helvetica-Bold", 15)
        pdf.drawString(MARGIN + 35 * 2.8346, y, value)
        y -= 9 * 2.8346

    y -= 6 * 2.8346
    pdf.setLineWidth(1.5)
    pdf.line(MARGIN, y, width - MARGIN, y)
    y -= QR_SIZE + 8 * 2.8346
    qr = ImageReader(io.BytesIO(render_qr_png(data.qr_payload)))
    pdf.drawImage(qr, MARGIN, y, QR_SIZE, QR_SIZE)

    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(MARGIN + QR_SIZE + 10 * 2.8346, y + QR_SIZE / 2 + 8, data.ticket_number)
    pdf.setFont("Helvetica", 11)
    pdf.drawString(
        MARGIN + QR_SIZE + 10 * 2.8346, y + QR_SIZE / 2 - 10, "Show this code at the entrance."
    )
    pdf.drawString(MARGIN + QR_SIZE + 10 * 2.8346, y + QR_SIZE / 2 - 24, "One entry per ticket.")

    pdf.setFont("Helvetica", 9)
    pdf.drawString(MARGIN, MARGIN, "Same ticket number as in your BiletFlow account.")
    pdf.showPage()
    pdf.save()
    return buffer.getvalue()
