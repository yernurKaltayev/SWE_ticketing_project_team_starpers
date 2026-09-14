from functools import lru_cache
from typing import Annotated

from pydantic import AfterValidator, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


def _long_enough(secret: SecretStr) -> SecretStr:
    # RFC 7518 3.2: an HMAC-SHA256 key must be at least as long as the digest.
    if len(secret.get_secret_value()) < 32:
        raise ValueError("JWT_SECRET must be at least 32 characters")
    return secret


JwtSecret = Annotated[SecretStr, AfterValidator(_long_enough)]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "BiletFlow API"
    environment: str = "local"
    api_v1_prefix: str = "/api/v1"

    database_url: str = "postgresql+asyncpg://biletflow:biletflow@localhost:5432/biletflow"

    jwt_secret: JwtSecret
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 30
    refresh_token_ttl_days: int = 14
    verification_token_ttl_hours: int = 24
    password_reset_ttl_minutes: int = 60

    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
