"""`PaymentProvider`: what P6's sandbox, or a real provider later, must implement.

No card data ever reaches this interface: the provider collects it directly.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from app.core.money import Money
from app.models.payment import PaymentProviderName, PaymentStatus


@dataclass(frozen=True)
class PaymentIntent:
    provider_ref: str
    checkout_url: str
    is_simulated: bool


@dataclass(frozen=True)
class ProviderEvent:
    """A verified webhook. `provider_ref` is what makes processing it idempotent."""

    provider_ref: str
    status: PaymentStatus
    raw: dict[str, Any] = field(default_factory=dict)
    failure_reason: str | None = None


@dataclass(frozen=True)
class ProviderRefund:
    provider_ref: str
    succeeded: bool
    failure_reason: str | None = None


class ProviderUnavailableError(Exception):
    """The provider could not be reached or answered with something unusable. Retry later."""


class PaymentProvider(ABC):
    name: PaymentProviderName
    # True when the provider's own status API is the source of truth (callbacks are unsigned),
    # so payments are settled by pulling `fetch_status` rather than by trusting a webhook body.
    supports_pull: bool = False

    @abstractmethod
    async def create_intent(
        self, amount: Money, *, reference: str, metadata: dict[str, Any] | None = None
    ) -> PaymentIntent:
        """Start a payment. `reference` is our order or activation ID."""

    @abstractmethod
    def parse_webhook(self, payload: bytes, signature: str) -> ProviderEvent:
        """Verify the signature and decode a callback. Raise on a bad signature."""

    @abstractmethod
    async def refund(self, provider_ref: str, amount: Money) -> ProviderRefund:
        """Refund a succeeded payment."""

    async def fetch_status(self, provider_ref: str) -> ProviderEvent:
        """Ask the provider for the payment's current status. `pending` means "not final yet"."""
        raise NotImplementedError(f"{self.name} does not support status polling")
