"""/campaigns, /promo/validate, and the public /c/{token} resolver [P16 Dima]."""

from fastapi import APIRouter

router = APIRouter(tags=["promos"])
# Mounted at the site root, not /api/v1: Campaign QR codes encode this link.
public_router = APIRouter(tags=["promos"])
