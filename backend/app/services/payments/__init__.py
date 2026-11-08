"""P6 payments: provider registry. Swap in a real provider by adding it here."""

from app.core.errors import NotFoundError
from app.models.payment import PaymentProviderName
from app.services.payments.base import PaymentProvider
from app.services.payments.sandbox import SandboxProvider

_PROVIDERS: dict[PaymentProviderName, PaymentProvider] = {
    PaymentProviderName.sandbox: SandboxProvider(),
}

DEFAULT_PROVIDER = PaymentProviderName.sandbox


def get_provider(name: PaymentProviderName | str = DEFAULT_PROVIDER) -> PaymentProvider:
    try:
        return _PROVIDERS[PaymentProviderName(name)]
    except (ValueError, KeyError) as exc:
        raise NotFoundError("Unknown payment provider.", code="provider_not_found") from exc
