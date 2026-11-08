"""P5 order checkout and read models; amounts are integer tiyn."""

from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.schemas.ticket import SeatRef, TicketOut


class OrderItemIn(BaseModel):
    ticket_type_id: UUID
    quantity: int = Field(ge=1, le=100)
    seat_ids: list[UUID] = Field(default_factory=list, max_length=100)

    @field_validator("seat_ids")
    @classmethod
    def no_duplicate_seats(cls, ids: list[UUID]) -> list[UUID]:
        if len(ids) != len(set(ids)):
            raise ValueError("seat_ids must not repeat")
        return ids


class AttendeeIn(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    email: EmailStr


class OrderCreate(BaseModel):
    event_id: UUID
    items: list[OrderItemIn] = Field(min_length=1, max_length=20)
    attendees: list[AttendeeIn] = Field(min_length=1, max_length=100)
    promo_code: str | None = None
    # Existing P4 /events/{id}/holds returns a hold-group ID.  One order can
    # consume several groups (different ticket price categories).
    hold_ids: list[UUID] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def check_cart(self) -> "OrderCreate":
        types = [item.ticket_type_id for item in self.items]
        if len(types) != len(set(types)):
            raise ValueError("Specify each ticket type once per order")
        if len(self.hold_ids) != len(set(self.hold_ids)):
            raise ValueError("hold_ids must not repeat")
        if sum(item.quantity for item in self.items) != len(self.attendees):
            raise ValueError("One attendee is required per ticket")
        return self


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
