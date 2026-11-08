"""Promo codes and Campaign QR codes [P16, SRS 4.14].

Rules (documented in docs/p16-promo-implementation.md):
- `percent`: whole percent off every applicable ticket line, rounded half-up to the tiyn.
- `fixed`: tiyn off the order once, capped at the applicable lines' subtotal.
- An empty `applicable_ticket_type_ids` means every ticket type of the event.
- The discount is always computed here, on the server, from stored prices.

Redemption is atomic: one `UPDATE ... SET redemptions_count = redemptions_count + 1 WHERE
redemptions_count < max_redemptions` inside the order transaction, so N concurrent checkouts on
a campaign with k slots left succeed exactly k times. Failed, expired and cancelled orders give
the slot back (`release_promo`).
"""

from __future__ import annotations

import secrets
import uuid
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime
from urllib.parse import urlencode

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import ConflictError, NotFoundError, UnprocessableError
from app.core.money import Money
from app.core.pagination import Page, PageParams, paginate
from app.models.event import Event, EventVisibility
from app.models.order import Order, OrderItem, OrderStatus
from app.models.promo import (
    DiscountType,
    PromoCode,
    PromoRedemption,
    PromoRedemptionStatus,
    PromotionalCampaign,
)
from app.models.ticket_type import TicketType
from app.models.user import User
from app.schemas.promo import (
    CampaignIn,
    CampaignOut,
    CampaignReportOut,
    CampaignUpdate,
    PromoValidateIn,
    PromoValidateOut,
)
from app.services.audit_service import audit
from app.services.ticket_qr import render_qr_png

# No 0/O/1/I/L: codes are read aloud and typed from posters.
CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
CODE_LENGTH = 8
# Campaign QR links start with this path; ticket QR payloads start with BFT1. (P15 rejects these.)
CAMPAIGN_LINK_PATH = "/c/"
COMPLETED_ORDER_STATUSES = (OrderStatus.paid, OrderStatus.free_confirmed)

# Stable `reason` values for PromoValidateOut and `code` values for checkout errors.
REASON_NOT_FOUND = "promo_not_found"
REASON_DISABLED = "promo_disabled"
REASON_NOT_STARTED = "promo_not_started"
REASON_EXPIRED = "promo_expired"
REASON_EXHAUSTED = "promo_exhausted"
REASON_NOT_APPLICABLE = "promo_not_applicable"

_MESSAGES = {
    REASON_NOT_FOUND: "This promo code does not exist for this event.",
    REASON_DISABLED: "This promo code has been disabled.",
    REASON_NOT_STARTED: "This promo code is not active yet.",
    REASON_EXPIRED: "This promo code has expired.",
    REASON_EXHAUSTED: "This promo code has been fully redeemed.",
    REASON_NOT_APPLICABLE: "This promo code does not apply to the selected tickets.",
}


class PromoRejected(Exception):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason

    def as_error(self) -> UnprocessableError:
        # 422 for every promo rejection: the cart is fine, the code is not usable.
        return UnprocessableError(_MESSAGES[self.reason], code=self.reason)


@dataclass(frozen=True)
class PromoQuote:
    campaign: PromotionalCampaign
    promo_code: PromoCode
    discount: int


# --------------------------------------------------------------------------- helpers


def campaign_link(campaign: PromotionalCampaign) -> str:
    """What the Campaign QR encodes: an opaque token, never a price or discount."""
    return f"{get_settings().public_base_url.rstrip('/')}{CAMPAIGN_LINK_PATH}{campaign.qr_token}"


def is_campaign_link(payload: str) -> bool:
    """For P15: True when a scanned payload is a Campaign QR, not a ticket."""
    text = payload.strip()
    return text.startswith(("http://", "https://")) and CAMPAIGN_LINK_PATH in text


def _new_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


def _normalise(code: str) -> str:
    return code.strip().upper()


async def _code_of(db: AsyncSession, campaign: PromotionalCampaign) -> PromoCode:
    promo = await db.scalar(
        select(PromoCode)
        .where(PromoCode.campaign_id == campaign.id)
        .order_by(PromoCode.created_at, PromoCode.id)
        .limit(1)
    )
    if promo is None:
        raise NotFoundError("Campaign has no code.", code="promo_not_found")
    return promo


async def to_campaign_out(db: AsyncSession, campaign: PromotionalCampaign) -> CampaignOut:
    promo = await _code_of(db, campaign)
    prefix = get_settings().api_v1_prefix
    return CampaignOut(
        id=campaign.id,
        event_id=campaign.event_id,
        name=campaign.name,
        discount_type=campaign.discount_type.value,  # type: ignore[arg-type]
        discount_value=campaign.discount_value,
        valid_from=campaign.valid_from,
        valid_to=campaign.valid_to,
        max_redemptions=campaign.max_redemptions,
        ticket_type_ids=list(campaign.applicable_ticket_type_ids or []),
        code=promo.code,
        redemptions_count=campaign.redemptions_count,
        is_enabled=campaign.is_enabled,
        qr_url=f"{prefix}/campaigns/{campaign.id}/qr",
    )


def _rejection(campaign: PromotionalCampaign, promo: PromoCode, now: datetime) -> str | None:
    if not campaign.is_enabled or not promo.is_enabled:
        return REASON_DISABLED
    if now < campaign.valid_from:
        return REASON_NOT_STARTED
    if now >= campaign.valid_to:
        return REASON_EXPIRED
    if campaign.redemptions_count >= campaign.max_redemptions:
        return REASON_EXHAUSTED
    return None


def compute_discount(campaign: PromotionalCampaign, lines: Iterable[tuple[uuid.UUID, int]]) -> int:
    """Discount in tiyn for `(ticket_type_id, line_total)` pairs. 0 if nothing applies."""
    applicable = set(campaign.applicable_ticket_type_ids or [])
    base = sum(total for type_id, total in lines if not applicable or type_id in applicable)
    if base <= 0:
        return 0
    if campaign.discount_type == DiscountType.percent:
        return min(Money(base).percent(campaign.discount_value).amount, base)
    return min(campaign.discount_value, base)


async def quote(
    db: AsyncSession,
    event_id: uuid.UUID,
    code: str,
    lines: list[tuple[uuid.UUID, int]],
    now: datetime,
) -> PromoQuote:
    """Validate a code for an event and cart lines. Raises PromoRejected. Changes nothing."""
    row = (
        await db.execute(
            select(PromoCode, PromotionalCampaign)
            .join(PromotionalCampaign, PromotionalCampaign.id == PromoCode.campaign_id)
            .where(PromoCode.code == _normalise(code))
        )
    ).first()
    # Another event's code is reported as unknown: codes are not an oracle across events.
    if row is None or row[1].event_id != event_id:
        raise PromoRejected(REASON_NOT_FOUND)
    promo, campaign = row
    reason = _rejection(campaign, promo, now)
    if reason is not None:
        raise PromoRejected(reason)
    discount = compute_discount(campaign, lines)
    if discount <= 0:
        raise PromoRejected(REASON_NOT_APPLICABLE)
    return PromoQuote(campaign=campaign, promo_code=promo, discount=discount)


# --------------------------------------------------------------------------- checkout hooks


async def claim_slot(db: AsyncSession, campaign_id: uuid.UUID, now: datetime) -> bool:
    """The atomic step: take one redemption slot, or report that none is left."""
    claimed = await db.scalar(
        update(PromotionalCampaign)
        .where(
            PromotionalCampaign.id == campaign_id,
            PromotionalCampaign.is_enabled.is_(True),
            PromotionalCampaign.valid_from <= now,
            PromotionalCampaign.valid_to > now,
            PromotionalCampaign.redemptions_count < PromotionalCampaign.max_redemptions,
        )
        .values(redemptions_count=PromotionalCampaign.redemptions_count + 1)
        .returning(PromotionalCampaign.id)
        .execution_options(synchronize_session=False)
    )
    return claimed is not None


async def redeem(db: AsyncSession, order: Order, promo_quote: PromoQuote, now: datetime) -> None:
    """Record the redemption for a flushed order, inside its transaction. Does not commit."""
    if not await claim_slot(db, promo_quote.campaign.id, now):
        raise PromoRejected(REASON_EXHAUSTED).as_error()
    db.add(
        PromoRedemption(
            promo_code_id=promo_quote.promo_code.id,
            campaign_id=promo_quote.campaign.id,
            order_id=order.id,
            discount_amount=promo_quote.discount,
            currency=order.currency,
            status=PromoRedemptionStatus.applied,
            redeemed_at=now,
        )
    )
    await db.flush()


async def release_promo(db: AsyncSession, order: Order) -> None:
    """Give the slot back when an order fails, expires or is cancelled. Idempotent."""
    redemption = await db.scalar(
        select(PromoRedemption)
        .where(
            PromoRedemption.order_id == order.id,
            PromoRedemption.status == PromoRedemptionStatus.applied,
        )
        .with_for_update()
    )
    if redemption is None:
        return
    redemption.status = PromoRedemptionStatus.released
    await db.execute(
        update(PromotionalCampaign)
        .where(
            PromotionalCampaign.id == redemption.campaign_id,
            PromotionalCampaign.redemptions_count > 0,
        )
        .values(redemptions_count=PromotionalCampaign.redemptions_count - 1)
        .execution_options(synchronize_session=False)
    )
    await db.flush()


async def apply_promo(db: AsyncSession, order: Order, code: str) -> int:
    """Shared-interface entry point: redeem `code` for an already-priced, flushed order.

    Prefer `quote()` before building the order and `redeem()` after flushing it, which is what
    P5 checkout does so the discount is part of the order totals from the start.
    """
    now = datetime.now(UTC)
    items = list(await db.scalars(select(OrderItem).where(OrderItem.order_id == order.id)))
    try:
        promo_quote = await quote(
            db, order.event_id, code, [(i.ticket_type_id, i.line_total) for i in items], now
        )
    except PromoRejected as exc:
        raise exc.as_error() from exc
    await redeem(db, order, promo_quote, now)
    return promo_quote.discount


# --------------------------------------------------------------------------- organizer API


async def _validate_ticket_types(
    db: AsyncSession, event_id: uuid.UUID, ids: list[uuid.UUID]
) -> list[uuid.UUID]:
    unique_ids = list(dict.fromkeys(ids))
    if unique_ids:
        found = set(
            await db.scalars(
                select(TicketType.id).where(
                    TicketType.event_id == event_id, TicketType.id.in_(unique_ids)
                )
            )
        )
        if found != set(unique_ids):
            raise UnprocessableError(
                "Every ticket type must belong to this event.", code="invalid_ticket_types"
            )
    return unique_ids


async def create_campaign(
    db: AsyncSession, user: User, event: Event, data: CampaignIn
) -> CampaignOut:
    ticket_type_ids = await _validate_ticket_types(db, event.id, data.ticket_type_ids)
    campaign = PromotionalCampaign(
        event_id=event.id,
        name=data.name,
        discount_type=DiscountType(data.discount_type),
        discount_value=data.discount_value,
        valid_from=data.valid_from,
        valid_to=data.valid_to,
        max_redemptions=data.max_redemptions,
        applicable_ticket_type_ids=ticket_type_ids,
        is_enabled=True,
        qr_token=secrets.token_urlsafe(16),
        currency="KZT",
    )
    db.add(campaign)
    await db.flush()
    for _ in range(10):
        candidate = _new_code()
        taken = await db.scalar(select(PromoCode.id).where(PromoCode.code == candidate))
        if taken is None:
            break
    else:  # pragma: no cover - 31^8 codes make this practically unreachable
        raise ConflictError("Could not generate a unique code.", code="promo_code_collision")
    db.add(PromoCode(campaign_id=campaign.id, code=candidate, is_enabled=True))
    await db.flush()
    audit(
        db,
        action_type="promo.created",
        entity_type="promotional_campaign",
        entity_id=campaign.id,
        event_id=event.id,
        actor=user,
        description=f"Created promo campaign {campaign.name}",
        metadata={
            "discount_type": data.discount_type,
            "discount_value": data.discount_value,
            "max_redemptions": data.max_redemptions,
        },
    )
    await db.commit()
    return await to_campaign_out(db, campaign)


async def list_campaigns(db: AsyncSession, event: Event, params: PageParams) -> Page[CampaignOut]:
    page = await paginate(
        db,
        select(PromotionalCampaign)
        .where(PromotionalCampaign.event_id == event.id)
        .order_by(PromotionalCampaign.created_at.desc(), PromotionalCampaign.id.desc()),
        params,
    )
    return Page[CampaignOut](
        items=[await to_campaign_out(db, row) for row in page.items],
        total=page.total,
        limit=page.limit,
        offset=page.offset,
    )


async def get_campaign_row(db: AsyncSession, campaign_id: uuid.UUID) -> PromotionalCampaign:
    campaign = await db.get(PromotionalCampaign, campaign_id)
    if campaign is None:
        raise NotFoundError("Campaign not found.", code="campaign_not_found")
    return campaign


async def update_campaign(
    db: AsyncSession, user: User, campaign_id: uuid.UUID, data: CampaignUpdate
) -> CampaignOut:
    campaign = await db.scalar(
        select(PromotionalCampaign)
        .where(PromotionalCampaign.id == campaign_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if campaign is None:
        raise NotFoundError("Campaign not found.", code="campaign_not_found")
    changes = data.model_dump(exclude_unset=True, mode="json")
    if "name" in changes and data.name is not None:
        campaign.name = data.name
    valid_from = data.valid_from or campaign.valid_from
    valid_to = data.valid_to or campaign.valid_to
    if valid_to <= valid_from:
        raise UnprocessableError("valid_to must be after valid_from.", code="invalid_dates")
    campaign.valid_from, campaign.valid_to = valid_from, valid_to
    if data.max_redemptions is not None:
        if data.max_redemptions < campaign.redemptions_count:
            raise ConflictError(
                "The limit cannot go below redemptions already made.",
                code="max_below_redemptions",
            )
        campaign.max_redemptions = data.max_redemptions
    if data.is_enabled is not None and data.is_enabled != campaign.is_enabled:
        campaign.is_enabled = data.is_enabled
    audit(
        db,
        action_type="promo.disabled" if changes.get("is_enabled") is False else "promo.updated",
        entity_type="promotional_campaign",
        entity_id=campaign.id,
        event_id=campaign.event_id,
        actor=user,
        description=f"Updated promo campaign {campaign.name}",
        metadata=changes,
    )
    await db.commit()
    return await to_campaign_out(db, campaign)


def campaign_qr_png(campaign: PromotionalCampaign) -> bytes:
    return render_qr_png(campaign_link(campaign))


async def campaign_report(db: AsyncSession, campaign: PromotionalCampaign) -> CampaignReportOut:
    """Only completed orders count; released (failed/expired/cancelled) redemptions do not."""
    completed = (
        select(Order.id)
        .join(PromoRedemption, PromoRedemption.order_id == Order.id)
        .where(
            PromoRedemption.campaign_id == campaign.id,
            PromoRedemption.status == PromoRedemptionStatus.applied,
            Order.status.in_(COMPLETED_ORDER_STATUSES),
        )
        .scalar_subquery()
    )
    orders, gross, discount, net = (
        await db.execute(
            select(
                func.count(Order.id),
                func.coalesce(func.sum(Order.subtotal), 0),
                func.coalesce(func.sum(Order.discount_amount), 0),
                func.coalesce(func.sum(Order.total), 0),
            ).where(Order.id.in_(completed))
        )
    ).one()
    tickets = await db.scalar(
        select(func.coalesce(func.sum(OrderItem.quantity), 0)).where(
            OrderItem.order_id.in_(completed)
        )
    )
    return CampaignReportOut(
        # Slots currently taken, including checkouts that are still pending payment.
        redemptions=campaign.redemptions_count,
        orders=int(orders),
        tickets_sold=int(tickets or 0),
        gross_revenue=int(gross),
        discount=int(discount),
        net_revenue=int(net),
    )


# --------------------------------------------------------------------------- public


async def validate_code(db: AsyncSession, data: PromoValidateIn) -> PromoValidateOut:
    """Public check. Prices come from the DB; each listed ticket type ID is one ticket."""
    now = datetime.now(UTC)
    prices = dict(
        (
            await db.execute(
                select(TicketType.id, TicketType.price_amount).where(
                    TicketType.event_id == data.event_id,
                    TicketType.id.in_(set(data.ticket_type_ids)),
                    TicketType.is_hidden.is_(False),
                )
            )
        ).all()
    )
    lines = [(type_id, prices[type_id]) for type_id in data.ticket_type_ids if type_id in prices]
    try:
        promo_quote = await quote(db, data.event_id, data.code, lines, now)
    except PromoRejected as exc:
        return PromoValidateOut(valid=False, discount_amount=0, reason=exc.reason)
    return PromoValidateOut(valid=True, discount_amount=promo_quote.discount, reason=None)


async def resolve_campaign_link(db: AsyncSession, token: str) -> str:
    """Where a scanned Campaign QR goes: the event page, with the code if it is usable now."""
    row = (
        await db.execute(
            select(PromotionalCampaign, Event)
            .join(Event, Event.id == PromotionalCampaign.event_id)
            .where(PromotionalCampaign.qr_token == token)
        )
    ).first()
    if row is None:
        raise NotFoundError("Campaign link not found.", code="campaign_not_found")
    campaign, event = row
    promo = await _code_of(db, campaign)
    params: dict[str, str] = {}
    if event.visibility != EventVisibility.public:
        params["share"] = event.share_token
    reason = _rejection(campaign, promo, datetime.now(UTC))
    if reason is None:
        params["promo"] = promo.code
    else:
        params["promo_status"] = reason
    base = get_settings().web_base_url.rstrip("/")
    return f"{base}/events/{event.id}?{urlencode(params)}"
