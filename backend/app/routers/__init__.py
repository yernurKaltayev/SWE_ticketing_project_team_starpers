"""All routers are registered here, so adding endpoints never requires touching main.py."""

from fastapi import APIRouter

from app.routers import (
    admin,
    analytics,
    auth,
    calendar,
    checkin,
    events,
    history,
    holds,
    notifications,
    orders,
    payments,
    promos,
    refunds,
    support,
    ticket_types,
    tickets,
    users,
    venues,
)

api_router = APIRouter()
for module in (
    auth,
    users,
    events,
    venues,
    ticket_types,
    holds,
    orders,
    payments,
    refunds,
    tickets,
    checkin,
    promos,
    notifications,
    support,
    admin,
    history,
    analytics,
    calendar,
):
    api_router.include_router(module.router)

public_router = promos.public_router
