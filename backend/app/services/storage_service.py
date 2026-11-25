"""S3/MinIO object storage for uploaded files (event cover images).

The bucket is private: the API streams objects back to browsers, so storage never
needs a public endpoint (production MinIO publishes no port).
"""

import asyncio
import contextlib
from functools import lru_cache
from typing import Any

import boto3
from botocore.exceptions import ClientError

from app.core.config import get_settings


@lru_cache
def _client() -> Any:
    settings = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key.get_secret_value(),
        region_name=settings.s3_region,
    )


async def put_object(key: str, body: bytes, content_type: str) -> None:
    bucket = get_settings().s3_bucket
    await asyncio.to_thread(
        _client().put_object, Bucket=bucket, Key=key, Body=body, ContentType=content_type
    )


async def get_object(key: str) -> tuple[bytes, str] | None:
    """Return (body, content type), or None when the object does not exist."""
    bucket = get_settings().s3_bucket

    def read() -> tuple[bytes, str] | None:
        try:
            response = _client().get_object(Bucket=bucket, Key=key)
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") in {"NoSuchKey", "404"}:
                return None
            raise
        return response["Body"].read(), response.get("ContentType", "application/octet-stream")

    return await asyncio.to_thread(read)


async def delete_object(key: str) -> None:
    bucket = get_settings().s3_bucket
    # A leftover object is harmless; the event no longer references it.
    with contextlib.suppress(ClientError):
        await asyncio.to_thread(_client().delete_object, Bucket=bucket, Key=key)
