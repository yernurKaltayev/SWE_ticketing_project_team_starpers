"""Application settings, read from environment variables (or a local `.env`)."""

from decimal import Decimal
from functools import lru_cache
from typing import Annotated, Literal

from pydantic import AfterValidator, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_SECRET_PREFIX = "dev-only-"  # noqa: S105 - a prefix to reject, not a credential
DEFAULT_SEED_PASSWORD = "ChangeMe-Demo-123"  # noqa: S105 - demo seed data, refused in production


def _long_enough(secret: SecretStr) -> SecretStr:
    # RFC 7518 3.2: an HMAC-SHA256 key must be at least as long as the digest.
    if len(secret.get_secret_value()) < 32:
        raise ValueError("secret must be at least 32 characters")
    return secret


Secret = Annotated[SecretStr, AfterValidator(_long_enough)]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "BiletFlow API"
    app_version: str = "0.1.0"
    environment: Literal["local", "test", "staging", "production"] = "local"
    api_v1_prefix: str = "/api/v1"
    log_level: str = "INFO"
    log_json: bool = True
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]
    web_base_url: str = "http://localhost:5173"

    database_url: str = "postgresql+asyncpg://biletflow:biletflow@localhost:5432/biletflow"
    database_pool_size: int = 10

    jwt_secret: Secret
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 30
    refresh_token_ttl_days: int = 14
    # Signs ticket QR payloads (P8). Separate from the JWT key so either can rotate alone.
    ticket_signing_secret: Secret
    email_verify_token_ttl_hours: int = 24
    password_reset_token_ttl_minutes: int = 60

    # Attempts per window on the public auth endpoints: see app/core/rate_limit.py.
    auth_rate_limit_window_seconds: int = 300
    auth_rate_limit_per_account: int = 10
    auth_rate_limit_per_ip: int = 100

    # P6 payments. Every amount is simulated; platform_settings rows (P11) override these.
    activation_fee_amount: int = 1_000_000  # tiyn, i.e. 10 000 KZT per event
    processing_fee_percent: Decimal = Decimal("3")  # deducted from the organizer, not the buyer
    payout_delay_days: int = 3  # after the event ends
    # Lets a buyer or organizer finish a sandbox payment via /payments/{id}/simulate.
    payment_simulation_enabled: bool = True

    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_username: str | None = None
    smtp_password: SecretStr | None = None
    smtp_starttls: bool = False
    email_from: str = "noreply@example.com"

    s3_endpoint_url: str = "http://localhost:9000"
    s3_access_key: str = "biletflow"
    s3_secret_key: SecretStr = SecretStr("biletflow-dev")
    s3_bucket: str = "biletflow"
    s3_region: str = "us-east-1"

    seed_admin_email: str = "admin@example.com"
    seed_organizer_email: str = "organizer@example.com"
    seed_password: SecretStr = SecretStr(DEFAULT_SEED_PASSWORD)

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @model_validator(mode="after")
    def _no_dev_secrets_in_production(self) -> "Settings":
        if self.is_production:
            for name in ("jwt_secret", "ticket_signing_secret"):
                if getattr(self, name).get_secret_value().startswith(DEV_SECRET_PREFIX):
                    raise ValueError(f"{name} must not be a development value in production")
            if self.smtp_username and not self.smtp_starttls:
                raise ValueError("smtp_starttls must be on: the login would be sent unencrypted")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # required fields come from the environment
