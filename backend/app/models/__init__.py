"""Importing this package registers every table on `Base.metadata` (Alembic relies on it)."""

from app.models.audit import AuditLog
from app.models.checkin import CheckInRecord
from app.models.event import Event
from app.models.notification import Notification
from app.models.order import Attendee, Order, OrderItem
from app.models.payment import PaidSalesActivation, Payment, Payout, PayoutAccount
from app.models.promo import PromoCode, PromoRedemption, PromotionalCampaign
from app.models.refund import Refund
from app.models.seat_hold import SeatHold
from app.models.setting import EventReport, PlatformSetting
from app.models.support import SupportCase, SupportMessage
from app.models.ticket import Ticket
from app.models.ticket_type import TicketType
from app.models.user import EmailToken, OrganizerProfile, RefreshToken, StaffAssignment, User
from app.models.venue import Seat, Venue, VenueLayout, VenueRow, VenueSection

__all__ = [
    "Attendee",
    "AuditLog",
    "CheckInRecord",
    "EmailToken",
    "Event",
    "EventReport",
    "Notification",
    "Order",
    "OrderItem",
    "OrganizerProfile",
    "PaidSalesActivation",
    "Payment",
    "Payout",
    "PayoutAccount",
    "PlatformSetting",
    "PromoCode",
    "PromoRedemption",
    "PromotionalCampaign",
    "RefreshToken",
    "Refund",
    "Seat",
    "SeatHold",
    "StaffAssignment",
    "SupportCase",
    "SupportMessage",
    "Ticket",
    "TicketType",
    "User",
    "Venue",
    "VenueLayout",
    "VenueRow",
    "VenueSection",
]
