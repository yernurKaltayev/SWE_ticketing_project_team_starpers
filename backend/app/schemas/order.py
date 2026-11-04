from uuid import UUID

from pydantic import BaseModel, EmailStr

from app.schemas.ticket import SeatRef, TicketOut


class OrderItemIn(BaseModel):
    ticket_type_id: UUID
    quantity: int
    seat_ids: list[UUID] = []


class AttendeeIn(BaseModel):
    full_name: str
    email: EmailStr


class OrderCreate(BaseModel):
    event_id: UUID
    items: list[OrderItemIn]
    attendees: list[AttendeeIn]
    promo_code: str | None = None


class OrderItemOut(BaseModel):
    id: UUID
    ticket_type_id: UUID
    seat: SeatRef | None
    unit_price: int
    quantity: int
    line_total: int


class OrderOut(BaseModel):
    id: UUID
    order_number: str
    status: str
    subtotal: int
    discount_amount: int
    processing_fee: int
    total: int
    currency: str
    is_simulated: bool
    items: list[OrderItemOut]
    tickets: list[TicketOut]


class AttendeeOut(BaseModel):
    id: UUID
    order_id: UUID
    full_name: str
    email: EmailStr
    ticket_type: str
    ticket_status: str
