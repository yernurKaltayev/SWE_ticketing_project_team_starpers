"""P10: support cases, message threads with polling, access by role and relationship."""

import uuid

import pytest
from sqlalchemy import select

from app.models import AuditLog, Notification
from app.models.notification import NotificationType
from app.models.order import Attendee, Order
from app.models.support import SupportCase, SupportMessage
from app.models.user import StaffRole, UserRole
from tests.factories import (
    auth_header,
    make_event,
    make_order,
    make_organizer,
    make_staff,
    make_ticket,
    make_user,
)

PREFIX = "/api/v1"
CASES = f"{PREFIX}/support/cases"


async def _owned_ticket(db, event, user):
    ticket = await make_ticket(db, event)
    attendee = await db.get(Attendee, ticket.attendee_id)
    order = await db.get(Order, attendee.order_id)
    order.buyer_user_id = user.id
    await db.flush()
    return ticket, order


async def _open(client, user, **fields):
    payload = {"category": "ticket_delivery", "subject": "No ticket", "message": "Help"} | fields
    response = await client.post(CASES, json=payload, headers=auth_header(user))
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture
async def scene(db):
    """An event with its owner, staff in each role, a buyer and an open case about it."""
    owner, profile = await make_organizer(db)
    event = await make_event(db, profile)
    buyer = await make_user(db)
    ticket, order = await _owned_ticket(db, event, buyer)
    return {
        "owner": owner,
        "event": event,
        "buyer": buyer,
        "ticket": ticket,
        "order": order,
        "support": await make_staff(db, event, StaffRole.support),
        "manager": await make_staff(db, event, StaffRole.manager),
        "checkin": await make_staff(db, event, StaffRole.checkin),
        "admin": await make_user(db, role=UserRole.platform_admin),
    }


async def _notification_types(db, user):
    return set(await db.scalars(select(Notification.type).where(Notification.user_id == user.id)))


# --- opening a case ---------------------------------------------------------------------


async def test_case_from_ticket_derives_order_and_event(client, db, scene):
    case = await _open(client, scene["buyer"], ticket_id=str(scene["ticket"].id), message="Lost")

    assert case["ticket_id"] == str(scene["ticket"].id)
    assert case["order_id"] == str(scene["order"].id)
    assert case["event_id"] == str(scene["event"].id)
    assert case["audience"] == "attendee_case"
    assert case["status"] == "open"
    assert case["requester_id"] == str(scene["buyer"].id)

    bodies = list(
        await db.scalars(
            select(SupportMessage.body).where(SupportMessage.case_id == uuid.UUID(case["id"]))
        )
    )
    assert bodies == ["Lost"]
    entry = await db.scalar(select(AuditLog).where(AuditLog.entity_id == case["id"]))
    assert entry.action_type == "support.case_created"
    assert entry.event_id == scene["event"].id


async def test_ticket_owned_by_attendee_email_is_accepted(client, db, scene):
    guest = await make_user(db, email="guest@example.com")  # make_ticket's attendee email
    ticket = await make_ticket(db, scene["event"])

    case = await _open(client, guest, ticket_id=str(ticket.id))

    assert case["event_id"] == str(scene["event"].id)


async def test_case_from_order_derives_event(client, scene):
    case = await _open(client, scene["buyer"], order_id=str(scene["order"].id), category="refund")
    assert case["event_id"] == str(scene["event"].id)
    assert case["ticket_id"] is None


async def test_organizer_case_for_own_event_and_attendee_case_elsewhere(client, db, scene):
    own = await _open(client, scene["owner"], event_id=str(scene["event"].id), category="payment")
    no_event = await _open(client, scene["owner"], category="account")
    other_event = await make_event(db)
    elsewhere = await _open(client, scene["owner"], event_id=str(other_event.id))

    assert own["audience"] == "organizer_case"
    assert no_event["audience"] == "organizer_case"
    assert elsewhere["audience"] == "attendee_case"


async def test_someone_elses_ticket_or_order_is_not_found(client, db, scene):
    stranger = await make_user(db)
    headers = auth_header(stranger)
    base = {"category": "payment", "subject": "s", "message": "m"}

    ticket = await client.post(
        CASES, json=base | {"ticket_id": str(scene["ticket"].id)}, headers=headers
    )
    order = await client.post(
        CASES, json=base | {"order_id": str(scene["order"].id)}, headers=headers
    )
    event = await client.post(CASES, json=base | {"event_id": str(uuid.uuid4())}, headers=headers)

    assert (ticket.status_code, ticket.json()["code"]) == (404, "ticket_not_found")
    assert (order.status_code, order.json()["code"]) == (404, "order_not_found")
    assert (event.status_code, event.json()["code"]) == (404, "event_not_found")


async def test_mismatched_context_is_rejected(client, db, scene):
    other_order = await make_order(db, await make_event(db), buyer_user_id=scene["buyer"].id)
    payload = {
        "category": "payment",
        "subject": "s",
        "message": "m",
        "ticket_id": str(scene["ticket"].id),
        "order_id": str(other_order.id),
    }

    response = await client.post(CASES, json=payload, headers=auth_header(scene["buyer"]))

    assert response.status_code == 422
    assert response.json()["code"] == "support_context_mismatch"


@pytest.mark.parametrize(
    "fields",
    [{"category": "not-a-category"}, {"message": "   "}, {"subject": ""}],
)
async def test_invalid_case_payload_is_rejected(client, db, fields):
    user = await make_user(db)
    payload = {"category": "payment", "subject": "s", "message": "m"} | fields
    response = await client.post(CASES, json=payload, headers=auth_header(user))
    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


# --- visibility -------------------------------------------------------------------------


async def test_case_visible_to_participants_only(client, db, scene):
    case = await _open(client, scene["buyer"], ticket_id=str(scene["ticket"].id))
    other_owner, _ = await make_organizer(db)
    stranger = await make_user(db)

    for who in ("buyer", "owner", "support", "manager", "admin"):
        response = await client.get(f"{CASES}/{case['id']}", headers=auth_header(scene[who]))
        assert response.status_code == 200, who
    for user in (scene["checkin"], other_owner, stranger):
        response = await client.get(f"{CASES}/{case['id']}", headers=auth_header(user))
        assert response.status_code == 404
        assert response.json()["code"] == "support_case_not_found"
        messages = await client.get(f"{CASES}/{case['id']}/messages", headers=auth_header(user))
        assert messages.status_code == 404


async def test_organizer_case_is_for_admins_not_event_staff(client, scene):
    case = await _open(client, scene["owner"], event_id=str(scene["event"].id))

    staff = await client.get(f"{CASES}/{case['id']}", headers=auth_header(scene["support"]))
    admin = await client.get(f"{CASES}/{case['id']}", headers=auth_header(scene["admin"]))

    assert staff.status_code == 404
    assert admin.status_code == 200


async def test_list_shows_own_and_handled_cases_with_filters(client, db, scene):
    attendee_case = await _open(client, scene["buyer"], ticket_id=str(scene["ticket"].id))
    organizer_case = await _open(client, scene["owner"], category="account")
    stranger = await make_user(db)

    async def ids(user, query=""):
        response = await client.get(f"{CASES}{query}", headers=auth_header(user))
        assert response.status_code == 200
        return {item["id"] for item in response.json()["items"]}

    assert await ids(scene["buyer"]) == {attendee_case["id"]}
    assert await ids(scene["support"]) == {attendee_case["id"]}
    assert await ids(scene["checkin"]) == set()
    assert await ids(stranger) == set()
    assert await ids(scene["owner"]) == {attendee_case["id"], organizer_case["id"]}
    assert await ids(scene["owner"], "?role=requester") == {organizer_case["id"]}
    assert await ids(scene["owner"], "?role=handler") == {attendee_case["id"]}
    assert {attendee_case["id"], organizer_case["id"]} <= await ids(scene["admin"])
    assert await ids(scene["owner"], "?status=resolved") == set()
    assert await ids(scene["owner"], f"?event_id={scene['event'].id}") == {attendee_case["id"]}


# --- updating a case --------------------------------------------------------------------


async def test_requester_cannot_patch(client, scene):
    case = await _open(client, scene["buyer"], ticket_id=str(scene["ticket"].id))

    response = await client.patch(
        f"{CASES}/{case['id']}", json={"status": "resolved"}, headers=auth_header(scene["buyer"])
    )

    assert response.status_code == 403
    assert response.json()["code"] == "support_handler_required"


async def test_status_change_is_audited_and_notifies_requester(client, db, scene):
    case = await _open(client, scene["buyer"], ticket_id=str(scene["ticket"].id))

    response = await client.patch(
        f"{CASES}/{case['id']}",
        json={"status": "resolved"},
        headers=auth_header(scene["support"]),
    )

    assert response.status_code == 200
    assert response.json()["status"] == "resolved"
    entry = await db.scalar(
        select(AuditLog).where(
            AuditLog.entity_id == case["id"], AuditLog.action_type == "support.status_changed"
        )
    )
    assert entry.meta["from"] == "open" and entry.meta["to"] == "resolved"
    assert entry.actor_id == scene["support"].id
    assert NotificationType.support_status in await _notification_types(db, scene["buyer"])


async def test_assign_to_event_staff_notifies_assignee(client, db, scene):
    case = await _open(client, scene["buyer"], ticket_id=str(scene["ticket"].id))

    response = await client.patch(
        f"{CASES}/{case['id']}",
        json={"assignee_id": str(scene["support"].id)},
        headers=auth_header(scene["owner"]),
    )

    assert response.status_code == 200
    assert response.json()["assignee_id"] == str(scene["support"].id)
    assert await _notification_types(db, scene["support"]) == {NotificationType.support_assigned}

    unassigned = await client.patch(
        f"{CASES}/{case['id']}", json={"assignee_id": None}, headers=auth_header(scene["owner"])
    )
    assert unassigned.json()["assignee_id"] is None


async def test_assignee_must_be_a_handler(client, db, scene):
    case = await _open(client, scene["buyer"], ticket_id=str(scene["ticket"].id))

    for user_id in (scene["checkin"].id, scene["buyer"].id, uuid.uuid4()):
        response = await client.patch(
            f"{CASES}/{case['id']}",
            json={"assignee_id": str(user_id)},
            headers=auth_header(scene["admin"]),
        )
        assert response.status_code == 422
        assert response.json()["code"] == "invalid_assignee"


async def test_noop_patch_writes_nothing(client, db, scene):
    case = await _open(client, scene["buyer"], ticket_id=str(scene["ticket"].id))

    response = await client.patch(
        f"{CASES}/{case['id']}", json={"status": "open"}, headers=auth_header(scene["support"])
    )

    assert response.status_code == 200
    actions = set(
        await db.scalars(select(AuditLog.action_type).where(AuditLog.entity_id == case["id"]))
    )
    assert actions == {"support.case_created"}
    assert await _notification_types(db, scene["buyer"]) == set()


# --- messages ---------------------------------------------------------------------------


async def test_polling_returns_only_newer_messages_oldest_first(client, scene):
    case = await _open(client, scene["buyer"], ticket_id=str(scene["ticket"].id), message="m1")
    url = f"{CASES}/{case['id']}/messages"
    buyer, staff = auth_header(scene["buyer"]), auth_header(scene["support"])

    first = (await client.get(url, headers=buyer)).json()
    assert [m["body"] for m in first] == ["m1"]

    await client.post(url, json={"body": "m2"}, headers=staff)
    await client.post(url, json={"body": "m3"}, headers=buyer)

    newer = await client.get(f"{url}?after={first[-1]['id']}", headers=staff)
    assert newer.status_code == 200
    assert [m["body"] for m in newer.json()] == ["m2", "m3"]

    latest = newer.json()[-1]["id"]
    assert (await client.get(f"{url}?after={latest}", headers=buyer)).json() == []


async def test_bad_cursor_is_rejected(client, scene):
    case = await _open(client, scene["buyer"], ticket_id=str(scene["ticket"].id))
    other = await _open(client, scene["buyer"], category="account")
    other_message = (
        await client.get(f"{CASES}/{other['id']}/messages", headers=auth_header(scene["buyer"]))
    ).json()[0]["id"]

    for cursor in (uuid.uuid4(), other_message):
        response = await client.get(
            f"{CASES}/{case['id']}/messages?after={cursor}", headers=auth_header(scene["buyer"])
        )
        assert response.status_code == 422
        assert response.json()["code"] == "invalid_after_cursor"


async def test_staff_reply_moves_open_case_in_progress_and_notifies_requester(client, db, scene):
    case = await _open(client, scene["buyer"], ticket_id=str(scene["ticket"].id))

    response = await client.post(
        f"{CASES}/{case['id']}/messages",
        json={"body": "  Looking into it  "},
        headers=auth_header(scene["support"]),
    )

    assert response.status_code == 201
    assert response.json()["body"] == "Looking into it"
    assert response.json()["author_id"] == str(scene["support"].id)
    stored = await db.get(SupportCase, uuid.UUID(case["id"]))
    assert stored.status.value == "in_progress"
    assert await _notification_types(db, scene["buyer"]) == {NotificationType.support_message}


async def test_customer_reply_reopens_and_notifies_assignee(client, db, scene):
    case = await _open(client, scene["buyer"], ticket_id=str(scene["ticket"].id))
    await client.patch(
        f"{CASES}/{case['id']}",
        json={"status": "waiting_customer", "assignee_id": str(scene["support"].id)},
        headers=auth_header(scene["manager"]),
    )

    response = await client.post(
        f"{CASES}/{case['id']}/messages",
        json={"body": "Here is my order number"},
        headers=auth_header(scene["buyer"]),
    )

    assert response.status_code == 201
    stored = await db.get(SupportCase, uuid.UUID(case["id"]))
    assert stored.status.value == "in_progress"
    assert NotificationType.support_message in await _notification_types(db, scene["support"])
    reasons = [
        entry.meta.get("reason")
        for entry in await db.scalars(
            select(AuditLog).where(
                AuditLog.entity_id == case["id"], AuditLog.action_type == "support.status_changed"
            )
        )
    ]
    assert "customer_reply" in reasons


async def test_non_participant_cannot_post(client, db, scene):
    case = await _open(client, scene["buyer"], ticket_id=str(scene["ticket"].id))
    response = await client.post(
        f"{CASES}/{case['id']}/messages", json={"body": "hi"}, headers=auth_header(scene["checkin"])
    )
    assert response.status_code == 404


async def test_requires_authentication(client):
    case_id = uuid.uuid4()
    calls = [
        client.get(CASES),
        client.post(CASES, json={}),
        client.get(f"{CASES}/{case_id}"),
        client.patch(f"{CASES}/{case_id}", json={}),
        client.get(f"{CASES}/{case_id}/messages"),
        client.post(f"{CASES}/{case_id}/messages", json={"body": "x"}),
    ]
    for call in calls:
        assert (await call).status_code == 401
