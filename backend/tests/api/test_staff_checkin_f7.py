"""F7 backend support: staff listing, assignment by email, the Event Admin app's event list,
attendee ticket references for check-in staff, and manual (search-based) check-in."""

import uuid

from sqlalchemy import select

from app.models import Attendee, AuditLog, StaffAssignment, TicketType
from app.models.event import EventStatus
from app.models.user import StaffRole, UserRole
from app.services.ticket_qr import encode_qr_payload
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


# Assignment by email and staff listing


async def test_owner_assigns_staff_by_email_ignoring_case(client, db):
    owner, profile = await make_organizer(db)
    event = await _published(db, profile)
    target = await make_user(db, email=f"scanner-{uuid.uuid4().hex[:8]}@example.com")
    await db.commit()

    response = await client.post(
        f"{API}/events/{event.id}/staff",
        json={"email": target.email.upper(), "role": "checkin"},
        headers=auth_header(owner),
    )

    assert response.status_code == 201, response.text
    assert response.json()["user_id"] == str(target.id)


async def test_assignment_needs_exactly_one_identifier(client, db):
    owner, profile = await make_organizer(db)
    event = await _published(db, profile)
    target = await make_user(db)
    await db.commit()

    for body in (
        {"role": "checkin"},
        {"role": "checkin", "user_id": str(target.id), "email": target.email},
    ):
        response = await client.post(
            f"{API}/events/{event.id}/staff", json=body, headers=auth_header(owner)
        )
        assert response.status_code == 422, body


async def test_assigning_an_unknown_email_is_not_found(client, db):
    owner, profile = await make_organizer(db)
    event = await _published(db, profile)
    await db.commit()

    response = await client.post(
        f"{API}/events/{event.id}/staff",
        json={"email": "nobody-here@example.com", "role": "support"},
        headers=auth_header(owner),
    )

    assert response.status_code == 404
    assert response.json()["code"] == "user_not_found"


async def test_managers_list_staff_with_identity(client, db):
    owner, profile = await make_organizer(db)
    event = await _published(db, profile)
    manager = await make_staff(db, event, StaffRole.manager)
    scanner = await make_staff(db, event, StaffRole.checkin)
    await db.commit()

    for actor in (owner, manager):
        response = await client.get(f"{API}/events/{event.id}/staff", headers=auth_header(actor))
        assert response.status_code == 200, response.text
        rows = {row["user_id"]: row for row in response.json()}
        assert rows[str(scanner.id)]["role"] == "checkin"
        assert rows[str(scanner.id)]["email"] == scanner.email
        assert rows[str(manager.id)]["role"] == "manager"


async def test_non_managers_cannot_list_staff(client, db):
    _, profile = await make_organizer(db)
    event = await _published(db, profile)
    scanner = await make_staff(db, event, StaffRole.checkin)
    stranger, _ = await make_organizer(db)
    await db.commit()

    for actor in (scanner, stranger):
        response = await client.get(f"{API}/events/{event.id}/staff", headers=auth_header(actor))
        assert response.status_code == 403


# /me/staff-events


async def test_staff_events_list_owned_and_assigned_events_with_roles(client, db):
    owner, profile = await make_organizer(db)
    owned = await _published(db, profile, title="Own show")
    await make_event(db, profile, title="Still a draft")  # drafts are left out
    _, other_profile = await make_organizer(db)
    scanned = await _published(db, other_profile, title="Scanning gig")
    supported = await _published(db, other_profile, title="Support gig")
    unrelated = await _published(db, other_profile, title="Not mine")
    await db.flush()
    db.add_all(
        [
            StaffAssignment(
                event_id=scanned.id,
                user_id=owner.id,
                role=StaffRole.checkin,
                assigned_by=owner.id,
            ),
            StaffAssignment(
                event_id=supported.id,
                user_id=owner.id,
                role=StaffRole.support,
                assigned_by=owner.id,
            ),
        ]
    )
    await db.commit()

    response = await client.get(f"{API}/me/staff-events", headers=auth_header(owner))

    assert response.status_code == 200, response.text
    rows = {row["event_id"]: row for row in response.json()}
    assert set(rows) == {str(owned.id), str(scanned.id), str(supported.id)}
    assert str(unrelated.id) not in rows
    assert (rows[str(owned.id)]["role"], rows[str(owned.id)]["can_check_in"]) == ("owner", True)
    assert (rows[str(scanned.id)]["role"], rows[str(scanned.id)]["can_check_in"]) == (
        "checkin",
        True,
    )
    assert (rows[str(supported.id)]["role"], rows[str(supported.id)]["can_check_in"]) == (
        "support",
        False,
    )
    assert rows[str(owned.id)]["venue_name"] == "Hall"


async def test_platform_admins_get_no_implicit_staff_events(client, db):
    admin = await make_user(db, role=UserRole.platform_admin)
    await _published(db)
    await db.commit()

    response = await client.get(f"{API}/me/staff-events", headers=auth_header(admin))

    assert response.status_code == 200
    assert response.json() == []


async def test_staff_events_require_sign_in(client):
    response = await client.get(f"{API}/me/staff-events")
    assert response.status_code == 401


# Attendee search references for check-in staff


async def test_checkin_staff_see_ticket_references_in_attendee_search(client, db):
    _, profile = await make_organizer(db)
    event = await _published(db, profile)
    ticket = await _sold_ticket(db, event)
    # The factory leaves the attendee unlinked; real orders link it to its order item.
    (await db.get(Attendee, ticket.attendee_id)).order_item_id = ticket.order_item_id
    scanner = await make_staff(db, event, StaffRole.checkin)
    await db.commit()

    response = await client.get(
        f"{API}/events/{event.id}/attendees", params={"q": "guest"}, headers=auth_header(scanner)
    )

    assert response.status_code == 200, response.text
    [row] = response.json()["items"]
    assert row["ticket_id"] == str(ticket.id)
    assert row["ticket_number"] == ticket.ticket_number
    assert row["ticket_status"] == "valid"


# Manual check-in


async def _manual(client, user, event_id, ticket_id):
    return await client.post(
        f"{API}/checkin/manual",
        json={"event_id": str(event_id), "ticket_id": str(ticket_id)},
        headers=auth_header(user),
    )


async def test_manual_check_in_admits_once_and_is_audited(client, db):
    _, profile = await make_organizer(db)
    event = await _published(db, profile)
    ticket = await _sold_ticket(db, event)
    scanner = await make_staff(db, event, StaffRole.checkin)
    await db.commit()

    first = await _manual(client, scanner, event.id, ticket.id)
    second = await _manual(client, scanner, event.id, ticket.id)

    assert first.status_code == 200, first.text
    assert first.json()["result"] == "accepted"
    assert first.json()["ticket"]["ticket_number"] == ticket.ticket_number
    assert second.json()["result"] == "already_used"
    entry = await db.scalar(
        select(AuditLog).where(
            AuditLog.entity_id == str(ticket.id), AuditLog.action_type == "checkin.accepted"
        )
    )
    assert entry is not None
    assert entry.meta["method"] == "manual"


async def test_manual_then_qr_scan_is_already_used(client, db):
    _, profile = await make_organizer(db)
    event = await _published(db, profile)
    ticket = await _sold_ticket(db, event)
    scanner = await make_staff(db, event, StaffRole.checkin)
    await db.commit()

    await _manual(client, scanner, event.id, ticket.id)
    scan = await client.post(
        f"{API}/checkin/verify",
        json={"event_id": str(event.id), "qr_payload": encode_qr_payload(ticket.id)},
        headers=auth_header(scanner),
    )

    assert scan.json()["result"] == "already_used"


async def test_manual_check_in_rejects_other_events_and_unknown_tickets(client, db):
    _, profile = await make_organizer(db)
    event = await _published(db, profile)
    other_event = await _published(db, profile)
    foreign = await _sold_ticket(db, other_event)
    scanner = await make_staff(db, event, StaffRole.checkin)
    await db.commit()

    wrong = await _manual(client, scanner, event.id, foreign.id)
    unknown = await _manual(client, scanner, event.id, uuid.uuid4())

    assert wrong.json() == {
        "result": "wrong_event",
        "ticket": None,
        "message": "This ticket is for a different event.",
    }
    assert unknown.json()["result"] == "invalid"


async def test_support_staff_cannot_check_in_manually(client, db):
    _, profile = await make_organizer(db)
    event = await _published(db, profile)
    ticket = await _sold_ticket(db, event)
    support = await make_staff(db, event, StaffRole.support)
    await db.commit()

    response = await _manual(client, support, event.id, ticket.id)

    assert response.status_code == 403
