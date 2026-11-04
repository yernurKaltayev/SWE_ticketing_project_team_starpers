"""Create the S3 bucket if it is missing. Waits for the storage service to come up."""

import logging
import time

import boto3
from botocore.exceptions import ClientError, EndpointConnectionError

from app.core.config import get_settings
from app.core.logging import configure_logging

logger = logging.getLogger(__name__)

ATTEMPTS = 30
RETRY_SECONDS = 1


def main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level, json_output=settings.log_json)
    client = boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key.get_secret_value(),
        region_name=settings.s3_region,
    )
    for attempt in range(1, ATTEMPTS + 1):
        try:
            client.create_bucket(Bucket=settings.s3_bucket)
        except ClientError as exc:
            if exc.response["Error"]["Code"] == "BucketAlreadyOwnedByYou":
                break
            if attempt == ATTEMPTS:
                raise
        except EndpointConnectionError:
            if attempt == ATTEMPTS:
                raise
        else:
            break
        time.sleep(RETRY_SECONDS)
    logger.info("bucket ready", extra={"bucket": settings.s3_bucket})


if __name__ == "__main__":
    main()
