"""Volunteer check-in accounts: created per event by the organizer, limited to scanning that
event's tickets, anonymized after the event."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.models import AuditLog, StaffAssignment, TicketType
from app.models.checkin import CheckInRecord
from app.models.event import EventStatus
from app.models.user import RefreshToken, StaffRole, User, UserRole
from app.services import auth_service
from app.services.ticket_qr import encode_qr_payload
from app.tasks.purge_volunteers import purge_due_volunteers
from tests.factories import (
    auth_header,
    make_event,
    make_organizer,
    make_staff,
    make_ticket,
    make_user,
)

API = "/api/v1"


async def _published(db, profile=None, **overrides):
    return await make_event(db, profile, status=EventStatus.published, **overrides)


async def _sold_ticket(db, event):
    ticket = await make_ticket(db, event)
    (await db.get(TicketType, ticket.ticket_type_id)).qty_sold = 1
    await db.flush()
    return ticket


async def _create(client, owner, event, name="Aru Volunteer"):
    response = await client.post(
        f"{API}/events/{event.id}/volunteers",
        json={"full_name": name},
        headers=auth_header(owner),
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _login(client, login, password):
    return await client.post(f"{API}/auth/login", json={"email": login, "password": password})


async def _scan(client, volunteer_token, event, ticket):
    return await client.post(
        f"{API}/checkin/verify",
        json={"event_id": str(event.id), "qr_payload": encode_qr_payload(ticket.id)},
        headers={"Authorization": f"Bearer {volunteer_token}"},
    )


# Creation and sign-in


async def test_organizer_creates_a_volunteer_who_can_sign_in(client, db):
    owner, profile = await make_organizer(db)
    event = await _published(db, profile)
    await db.commit()

    body = await _create(client, owner, event)

    assert body["login"].startswith("v-")
    assert body["login"].endswith("@volunteers.biletflow.kz")
    assert len(body["password"]) >= 12
    assert datetime.fromisoformat(body["expires_at"]) > event.ends_at
    user = await db.get(User, body["user_id"])
    assert user.role == UserRole.volunteer
    assert user.password_hash != body["password"]
    assignment = await db.scalar(select(StaffAssignment).where(StaffAssignment.user_id == user.id))
    assert (assignment.event_id, assignment.role) == (event.id, StaffRole.checkin)

    response = await _login(client, body["login"], body["password"])
    assert response.status_code == 200, response.text
    assert response.json()["access_token"]


async def test_list_shows_volunteers_without_passwords_and_staff_list_excludes_them(client, db):
    owner, profile = await make_organizer(db)
    event = await _published(db, profile)
    await db.commit()
    created = await _create(client, owner, event)

    volunteers = await client.get(f"{API}/events/{event.id}/volunteers", headers=auth_header(owner))
    staff = await client.get(f"{API}/events/{event.id}/staff", headers=auth_header(owner))

    assert volunteers.status_code == 200
    [row] = volunteers.json()
    assert row["user_id"] == created["user_id"]
    assert row["login"] == created["login"]
    assert "password" not in row
    assert staff.json() == []


async def test_other_organizers_and_check_in_staff_cannot_manage_volunteers(client, db):
    owner, profile = await make_organizer(db)
    event = await _published(db, profile)
    stranger, _ = await make_organizer(db)
    scanner = await make_staff(db, event, StaffRole.checkin)
    await db.commit()
    created = await _create(client, owner, event)

    for actor in (stranger, scanner):
        headers = auth_header(actor)
        base = f"{API}/events/{event.id}/volunteers"
        assert (await client.get(base, headers=headers)).status_code == 403
        assert (
            await client.post(base, json={"full_name": "X"}, headers=headers)
        ).status_code == 403
        assert (
            await client.delete(f"{base}/{created['user_id']}", headers=headers)
        ).status_code == 403


async def test_no_volunteers_for_finished_or_cancelled_events(client, db):
    owner, profile = await make_organizer(db)
    past = datetime.now(UTC) - timedelta(days=3)
    finished = await _published(db, profile, starts_at=past, ends_at=past + timedelta(hours=2))
    cancelled = await make_event(db, profile, status=EventStatus.cancelled)
    await db.commit()

    for event in (finished, cancelled):
        response = await client.post(
            f"{API}/events/{event.id}/volunteers",
            json={"full_name": "Late"},
            headers=auth_header(owner),
        )
        assert response.status_code == 409
        assert response.json()["code"] == "event_ended"


# What a volunteer may do


async def test_volunteer_checks_in_own_event_but_not_another(client, db):
    owner, profile = await make_organizer(db)
    event = await _published(db, profile)
    other_event = await _published(db, profile)
    ticket = await _sold_ticket(db, event)
    other_ticket = await _sold_ticket(db, other_event)
    await db.commit()
    created = await _create(client, owner, event)
    token = (await _login(client, created["login"], created["password"])).json()["access_token"]

    accepted = await _scan(client, token, event, ticket)
    foreign = await _scan(client, token, other_event, other_ticket)

    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["result"] == "accepted"
    assert foreign.status_code == 403
    assert foreign.json()["code"] == "event_access_denied"


async def test_volunteer_sees_only_their_event_and_profile(client, db):
    owner, profile = await make_organizer(db)
    event = await _published(db, profile)
    await _published(db, profile)
    await db.commit()
    created = await _create(client, owner, event)
    headers = auth_header(await db.get(User, created["user_id"]))

    me = await client.get(f"{API}/me", headers=headers)
    events = await client.get(f"{API}/me/staff-events", headers=headers)
    stats = await client.get(f"{API}/events/{event.id}/checkin/stats", headers=headers)

    assert me.json()["role"] == "volunteer"
    assert [row["event_id"] for row in events.json()] == [str(event.id)]
    assert events.json()[0]["can_check_in"] is True
    assert stats.status_code == 200


async def test_volunteer_is_refused_everything_outside_check_in(client, db):
    owner, profile = await make_organizer(db)
    event = await _published(db, profile)
    await db.commit()
    created = await _create(client, owner, event)
    headers = auth_header(await db.get(User, created["user_id"]))

    refused = [
        await client.patch(f"{API}/me", json={"full_name": "Hacker"}, headers=headers),
        await client.get(f"{API}/me/orders", headers=headers),
        await client.get(f"{API}/me/tickets", headers=headers),
        await client.get(f"{API}/support/cases", headers=headers),
        await client.get(f"{API}/events/{event.id}/staff", headers=headers),
        await client.get(f"{API}/events/{event.id}/volunteers", headers=headers),
        await client.patch(f"{API}/events/{event.id}", json={"title": "x"}, headers=headers),
    ]

    for response in refused:
        assert response.status_code == 403, (response.request.url, response.text)
        assert response.json()["code"] == "volunteer_scope"


async def test_volunteer_cannot_be_added_to_another_event(client, db):
    owner, profile = await make_organizer(db)
    event = await _published(db, profile)
    other = await _published(db, profile)
    await db.commit()
    created = await _create(client, owner, event)

    response = await client.post(
        f"{API}/events/{other.id}/staff",
        json={"email": created["login"], "role": "checkin"},
        headers=auth_header(owner),
    )

    assert response.status_code == 409
    assert response.json()["code"] == "volunteer_not_assignable"


async def test_no_password_reset_email_for_volunteer_logins(client, db):
    owner, profile = await make_organizer(db)
    event = await _published(db, profile)
    await db.commit()
    created = await _create(client, owner, event)

    assert await auth_service.forgot_password(db, created["login"]) is None


# Reset and removal


async def test_reset_password_replaces_the_old_one_and_signs_out(client, db):
    owner, profile = await make_organizer(db)
    event = await _published(db, profile)
    await db.commit()
    created = await _create(client, owner, event)
    await _login(client, created["login"], created["password"])

    response = await client.post(
        f"{API}/events/{event.id}/volunteers/{created['user_id']}/reset-password",
        headers=auth_header(owner),
    )

    assert response.status_code == 200, response.text
    new_password = response.json()["password"]
    assert new_password != created["password"]
    assert (await _login(client, created["login"], created["password"])).status_code == 401
    live_tokens = await db.scalars(
        select(RefreshToken).where(
            RefreshToken.user_id == created["user_id"], RefreshToken.revoked_at.is_(None)
        )
    )
    assert live_tokens.all() == []
    assert (await _login(client, created["login"], new_password)).status_code == 200


async def test_removing_a_volunteer_anonymizes_the_account(client, db):
    owner, profile = await make_organizer(db)
    event = await _published(db, profile)
    await db.commit()
    created = await _create(client, owner, event)

    response = await client.delete(
        f"{API}/events/{event.id}/volunteers/{created['user_id']}", headers=auth_header(owner)
    )

    assert response.status_code == 204
    user = await db.get(User, created["user_id"])
    await db.refresh(user)
    assert user.deleted_at is not None
    assert user.full_name == "Former volunteer"
    assert user.email != created["login"]
    assert (await _login(client, created["login"], created["password"])).status_code == 401
    listed = await client.get(f"{API}/events/{event.id}/volunteers", headers=auth_header(owner))
    assert listed.json() == []


async def test_removing_through_the_staff_endpoint_also_anonymizes(client, db):
    owner, profile = await make_organizer(db)
    event = await _published(db, profile)
    await db.commit()
    created = await _create(client, owner, event)

    response = await client.delete(
        f"{API}/events/{event.id}/staff/{created['user_id']}", headers=auth_header(owner)
    )

    assert response.status_code == 204
    user = await db.get(User, created["user_id"])
    await db.refresh(user)
    assert user.deleted_at is not None


# Automatic purge after the event


async def test_purge_anonymizes_volunteers_after_the_event_and_keeps_history(client, db):
    owner, profile = await make_organizer(db)
    event = await _published(db, profile)
    live_event = await _published(db, profile)
    ticket = await _sold_ticket(db, event)
    await db.commit()
    created = await _create(client, owner, event)
    kept = await _create(client, owner, live_event)
    token = (await _login(client, created["login"], created["password"])).json()["access_token"]
    assert (await _scan(client, token, event, ticket)).json()["result"] == "accepted"

    # The event ended well over the grace period ago.
    event.starts_at = datetime.now(UTC) - timedelta(days=2)
    event.ends_at = datetime.now(UTC) - timedelta(days=1)
    await db.commit()

    assert await purge_due_volunteers(db) == 1
    assert await purge_due_volunteers(db) == 0  # idempotent

    user = await db.get(User, created["user_id"])
    await db.refresh(user)
    assert user.deleted_at is not None and user.is_suspended
    assert (await _login(client, created["login"], created["password"])).status_code == 401
    record = await db.scalar(select(CheckInRecord).where(CheckInRecord.ticket_id == ticket.id))
    assert record.staff_user_id == user.id
    actions = await db.scalars(
        select(AuditLog.action_type).where(AuditLog.entity_id == str(user.id))
    )
    assert {"volunteer_created", "volunteer_removed"} <= set(actions)
    survivor = await db.get(User, kept["user_id"])
    assert survivor.deleted_at is None


async def test_purge_handles_cancelled_events(client, db):
    owner, profile = await make_organizer(db)
    event = await _published(db, profile)
    await db.commit()
    created = await _create(client, owner, event)

    event.status = EventStatus.cancelled
    await db.commit()

    assert await purge_due_volunteers(db) == 1
    user = await db.get(User, created["user_id"])
    await db.refresh(user)
    assert user.deleted_at is not None


async def test_purge_leaves_ordinary_users_alone(db):
    _, profile = await make_organizer(db)
    past = datetime.now(UTC) - timedelta(days=3)
    event = await _published(db, profile, starts_at=past, ends_at=past + timedelta(hours=2))
    await make_staff(db, event, StaffRole.checkin)
    await make_user(db)
    await db.commit()

    assert await purge_due_volunteers(db) == 0
