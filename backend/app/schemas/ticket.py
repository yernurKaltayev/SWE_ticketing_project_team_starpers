from uuid import UUID

from pydantic import BaseModel


class SeatRef(BaseModel):
    seat_id: UUID
    section_name: str
    row_label: str
    seat_number: int


class TicketOut(BaseModel):
    id: UUID
    ticket_number: str
    event_id: UUID
    ticket_type: str
    attendee_name: str
    seat: SeatRef | None
    status: str
    qr_url: str
    pdf_url: str
