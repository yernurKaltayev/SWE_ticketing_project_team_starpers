"""Promotional campaigns, promo codes and redemptions [P16]."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, func, text
from sqlalchemy.dialects.postgresql import ARRAY, CITEXT
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import (
    Base,
    Counter,
    Currency,
    MoneyAmount,
    Timestamps,
    TrueByDefault,
    UUIDPrimaryKey,
    fk,
    pg_enum,
    utcnow,
)


class DiscountType(enum.StrEnum):
    percent = "percent"
    fixed = "fixed"


class PromoRedemptionStatus(enum.StrEnum):
    applied = "applied"
    released = "released"


class PromotionalCampaign(UUIDPrimaryKey, Timestamps, Currency, Base):
    __tablename__ = "promotional_campaigns"
    __table_args__ = (
        CheckConstraint("redemptions_count <= max_redemptions", name="not_over_redeemed"),
    )

    event_id: Mapped[uuid.UUID] = fk("events.id")
    name: Mapped[str]
    discount_type: Mapped[DiscountType] = mapped_column(pg_enum(DiscountType, "discount_type"))
    # Whole percent for `percent`; tiyn for `fixed`.
    discount_value: Mapped[int] = mapped_column(BigInteger)
    valid_from: Mapped[datetime]
    valid_to: Mapped[datetime]
    max_redemptions: Mapped[int]
    redemptions_count: Mapped[Counter]
    applicable_ticket_type_ids: Mapped[list[uuid.UUID]] = mapped_column(
        ARRAY(PG_UUID(as_uuid=True)), default=list, server_default=text("'{}'")
    )
    is_enabled: Mapped[TrueByDefault]
    qr_token: Mapped[str] = mapped_column(unique=True)
    qr_object_key: Mapped[str | None]


class PromoCode(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "promo_codes"

    campaign_id: Mapped[uuid.UUID] = fk("promotional_campaigns.id")
    code: Mapped[str] = mapped_column(CITEXT, unique=True)
    is_enabled: Mapped[TrueByDefault]


class PromoRedemption(UUIDPrimaryKey, Timestamps, Currency, Base):
    __tablename__ = "promo_redemptions"

    promo_code_id: Mapped[uuid.UUID] = fk("promo_codes.id")
    campaign_id: Mapped[uuid.UUID] = fk("promotional_campaigns.id")
    order_id: Mapped[uuid.UUID] = fk("orders.id", index=False, unique=True)
    discount_amount: Mapped[MoneyAmount]
    status: Mapped[PromoRedemptionStatus] = mapped_column(
        pg_enum(PromoRedemptionStatus, "promo_redemption_status"),
        default=PromoRedemptionStatus.applied,
        server_default="applied",
    )
    redeemed_at: Mapped[datetime] = mapped_column(default=utcnow, server_default=func.now())
