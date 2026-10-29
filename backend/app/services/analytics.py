from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import select

from app.models.event import Event, Order, PromoCode, Ticket, TicketType
from app.models.user import UserRole
from app.services.events import get_event, utc


async def organizer_analytics(db, user, event_id=None):
    if user.role != UserRole.organizer:
        raise HTTPException(403, "organizers only")
    query = select(Event).where(Event.organizer_id == user.id)
    if event_id:
        await get_event(db, event_id, user, manage=True)
        query = query.where(Event.id == event_id)
    events = (await db.scalars(query)).all()
    ids = [e.id for e in events]
    titles = {e.id: e.title for e in events}
    orders = (await db.scalars(select(Order).where(Order.event_id.in_(ids)))).all()
    types = (await db.scalars(select(TicketType).where(TicketType.event_id.in_(ids)))).all()
    tickets = (await db.scalars(select(Ticket).where(Ticket.event_id.in_(ids)))).all()
    promos = (await db.scalars(select(PromoCode).where(PromoCode.event_id.in_(ids)))).all()
    paid = [o for o in orders if o.status == "paid"]
    zone = ZoneInfo("Asia/Almaty")
    today = datetime.now(UTC).astimezone(zone).date()
    by_day = {
        (today - timedelta(days=i)).isoformat(): {
            "date": (today - timedelta(days=i)).isoformat(),
            "tickets": 0,
            "revenue": 0,
        }
        for i in range(20, -1, -1)
    }
    for order in paid:
        key = utc(order.created_at).astimezone(zone).date().isoformat()
        if key in by_day:
            by_day[key]["tickets"] += sum(i["quantity"] for i in order.items)
            by_day[key]["revenue"] += order.total
    return {
        "capacity": sum(t.quantity for t in types),
        "sold": sum(t.sold for t in types),
        "checkedIn": sum(t.status == "checked_in" for t in tickets),
        "gross": sum(o.subtotal for o in paid),
        "discounts": sum(o.discount for o in paid),
        "refunded": sum(o.total for o in orders if o.status == "refunded"),
        "net": sum(o.total for o in paid),
        "orders": len(paid),
        "byDay": list(by_day.values()),
        "byTicketType": [
            {
                "name": t.name if event_id else f"{t.name} · {titles[t.event_id]}",
                "sold": t.sold,
                "quantity": t.quantity,
                "revenue": sum(
                    i["quantity"] * i["unitPrice"]
                    for o in paid
                    for i in o.items
                    if i["ticketTypeId"] == str(t.id)
                ),
            }
            for t in types
        ],
        "campaigns": [
            {
                "id": str(p.id),
                "eventTitle": titles[p.event_id],
                "code": p.code,
                "campaignName": p.campaign_name,
                "redemptions": sum(
                    o.event_id == p.event_id and o.promo_code == p.code for o in paid
                ),
                "discount": sum(
                    o.discount for o in paid if o.event_id == p.event_id and o.promo_code == p.code
                ),
            }
            for p in promos
        ],
    }
