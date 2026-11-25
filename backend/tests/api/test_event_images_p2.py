"""P2 cover image upload: stored privately, served by the API, owner-only writes."""

import pytest

from app.services import storage_service
from tests.factories import auth_header, make_event, make_organizer, make_user

PREFIX = "/api/v1"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


@pytest.fixture
def bucket(monkeypatch):
    objects: dict[str, tuple[bytes, str]] = {}

    async def put(key, body, content_type):
        objects[key] = (body, content_type)

    async def get(key):
        return objects.get(key)

    async def delete(key):
        objects.pop(key, None)

    monkeypatch.setattr(storage_service, "put_object", put)
    monkeypatch.setattr(storage_service, "get_object", get)
    monkeypatch.setattr(storage_service, "delete_object", delete)
    return objects


async def test_owner_uploads_replaces_and_removes_cover(client, db, bucket):
    owner, profile = await make_organizer(db)
    event = await make_event(db, profile)
    files = {"file": ("cover.png", PNG, "image/png")}
    first = await client.post(
        f"{PREFIX}/events/{event.id}/images", files=files, headers=auth_header(owner)
    )
    assert first.status_code == 200, first.text
    [url] = first.json()["images"]
    assert url.startswith(f"{PREFIX}/event-images/{event.id}/") and url.endswith(".png")

    served = await client.get(url)
    assert served.status_code == 200
    assert served.headers["content-type"] == "image/png"
    assert served.content == PNG
    assert "immutable" in served.headers["cache-control"]

    second = await client.post(
        f"{PREFIX}/events/{event.id}/images", files=files, headers=auth_header(owner)
    )
    [replacement] = second.json()["images"]
    assert replacement != url
    assert len(bucket) == 1  # the replaced object was deleted
    assert (await client.get(url)).status_code == 404

    removed = await client.delete(f"{PREFIX}/events/{event.id}/images", headers=auth_header(owner))
    assert removed.status_code == 200
    assert removed.json()["images"] == []
    assert bucket == {}


async def test_rejects_non_images_and_oversized_files(client, db, bucket):
    owner, profile = await make_organizer(db)
    event = await make_event(db, profile)
    fake = await client.post(
        f"{PREFIX}/events/{event.id}/images",
        files={"file": ("cover.png", b"<svg onload=alert(1)>", "image/png")},
        headers=auth_header(owner),
    )
    assert fake.status_code == 422
    assert fake.json()["code"] == "invalid_image_type"
    huge = await client.post(
        f"{PREFIX}/events/{event.id}/images",
        files={"file": ("big.png", PNG + b"\x00" * (5 * 1024 * 1024), "image/png")},
        headers=auth_header(owner),
    )
    assert huge.status_code == 422
    assert huge.json()["code"] == "image_too_large"
    assert bucket == {}


async def test_other_users_cannot_change_the_cover(client, db, bucket):
    _, profile = await make_organizer(db)
    event = await make_event(db, profile)
    stranger = await make_user(db)
    response = await client.post(
        f"{PREFIX}/events/{event.id}/images",
        files={"file": ("cover.png", PNG, "image/png")},
        headers=auth_header(stranger),
    )
    assert response.status_code == 403
    assert bucket == {}


async def test_unknown_or_malformed_image_names_are_404(client, db, bucket):
    _, profile = await make_organizer(db)
    event = await make_event(db, profile)
    for name in ("missing.png", "../../secret.png", f"{'a' * 32}.svg"):
        response = await client.get(f"{PREFIX}/event-images/{event.id}/{name}")
        assert response.status_code == 404
