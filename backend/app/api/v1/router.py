from fastapi import APIRouter

from app.api.v1 import auth, events, ticketing, users

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(ticketing.router)
api_router.include_router(events.router)
