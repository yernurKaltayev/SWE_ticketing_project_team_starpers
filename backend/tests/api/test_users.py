import uuid

import pytest
from sqlalchemy import select

from app.models import AuditLog
from app.models.user import StaffAssignment, StaffRole
from tests.factories import auth_header, make_event, make_organizer, make_staff, make_user

PREFIX = "/api/v1"


# /me


async def test_get_me(client, db):
    user = await make_user(db, phone="+77011234567")

    response = await client.get(f"{PREFIX}/me", headers=auth_header(user))

    assert response.status_code == 200
    assert response.json()["phone"] == "+77011234567"
    assert "password_hash" not in response.json()


async def test_patch_me_changes_only_what_was_sent(client, db):
    user = await make_user(db, phone="+77011234567")

    response = await client.patch(
        f"{PREFIX}/me", json={"full_name": "  New Name  "}, headers=auth_header(user)
    )

    assert response.status_code == 200
    assert response.json()["full_name"] == "New Name"
    assert response.json()["phone"] == "+77011234567"


async def test_patch_me_can_clear_the_phone(client, db):
    user = await make_user(db, phone="+77011234567")

    response = await client.patch(f"{PREFIX}/me", json={"phone": None}, headers=auth_header(user))

    assert response.json()["phone"] is None


async def test_patch_me_rejects_a_null_name(client, db):
    user = await make_user(db)

    response = await client.patch(
        f"{PREFIX}/me", json={"full_name": None}, headers=auth_header(user)
    )

    assert response.status_code == 422


async def test_patch_me_cannot_change_the_role(client, db):
    user = await make_user(db)

    response = await client.patch(
        f"{PREFIX}/me", json={"role": "platform_admin"}, headers=auth_header(user)
    )

    assert response.json()["role"] == "attendee"


# /organizers/me


async def test_get_own_organizer_profile(client, db):
    user, profile = await make_organizer(db)

    response = await client.get(f"{PREFIX}/organizers/me", headers=auth_header(user))

    assert response.status_code == 200
    assert response.json()["id"] == str(profile.id)
    assert response.json()["verification_status"] == "unverified"


async def test_patch_organizer_profile(client, db):
    user, profile = await make_organizer(db)

    response = await client.patch(
        f"{PREFIX}/organizers/me",
        json={"organization_name": "Almaty Live", "contact_phone": "+77021112233"},
        headers=auth_header(user),
    )

    assert response.status_code == 200
    assert response.json()["organization_name"] == "Almaty Live"
    assert response.json()["contact_email"] == profile.contact_email


@pytest.mark.parametrize("field", ["organization_name", "contact_email", "contact_phone"])
async def test_patch_organizer_profile_rejects_null(client, db, field):
    user, _ = await make_organizer(db)

    response = await client.patch(
        f"{PREFIX}/organizers/me", json={field: None}, headers=auth_header(user)
    )

    assert response.status_code == 422


async def test_organizer_cannot_verify_themselves(client, db):
    user, _ = await make_organizer(db)

    response = await client.patch(
        f"{PREFIX}/organizers/me",
        json={"verification_status": "verified"},
        headers=auth_header(user),
    )

    assert response.json()["verification_status"] == "unverified"


async def test_an_attendee_has_no_organizer_profile(client, db):
    user = await make_user(db)

    response = await client.get(f"{PREFIX}/organizers/me", headers=auth_header(user))

    assert response.status_code == 403
    assert response.json()["code"] == "insufficient_role"


# Event staff


async def assign(client, event, actor, user_id, role="checkin"):
    return await client.post(
        f"{PREFIX}/events/{event.id}/staff",
        json={"user_id": str(user_id), "role": role},
        headers=auth_header(actor),
    )


async def test_owner_assigns_and_removes_staff(client, db):
    owner, profile = await make_organizer(db)
    event = await make_event(db, profile)
    target = await make_user(db)

    response = await assign(client, event, owner, target.id)

    assert response.status_code == 201
    assert response.json()["role"] == "checkin"
    assignment = await db.scalar(
        select(StaffAssignment).where(StaffAssignment.user_id == target.id)
    )
    assert assignment.assigned_by == owner.id

    removed = await client.delete(
        f"{PREFIX}/events/{event.id}/staff/{target.id}", headers=auth_header(owner)
    )

    assert removed.status_code == 204
    actions = await db.scalars(select(AuditLog.action_type).where(AuditLog.event_id == event.id))
    assert sorted(actions) == ["staff_assigned", "staff_removed"]


async def test_a_manager_can_assign_staff(client, db):
    event = await make_event(db)
    manager = await make_staff(db, event, StaffRole.manager)
    target = await make_user(db)

    assert (await assign(client, event, manager, target.id)).status_code == 201


@pytest.mark.parametrize("role", [StaffRole.checkin, StaffRole.support])
async def test_other_staff_cannot_manage_staff(client, db, role):
    event = await make_event(db)
    staff = await make_staff(db, event, role)
    target = await make_user(db)

    assert (await assign(client, event, staff, target.id)).status_code == 403
    removed = await client.delete(
        f"{PREFIX}/events/{event.id}/staff/{staff.id}", headers=auth_header(staff)
    )
    assert removed.status_code == 403


async def test_another_organizer_cannot_manage_staff(client, db):
    event = await make_event(db)
    stranger, _ = await make_organizer(db)
    target = await make_user(db)

    assert (await assign(client, event, stranger, target.id)).status_code == 403


async def test_assigning_twice_is_a_conflict(client, db):
    owner, profile = await make_organizer(db)
    event = await make_event(db, profile)
    target = await make_user(db)
    await db.commit()
    assert (await assign(client, event, owner, target.id)).status_code == 201

    response = await assign(client, event, owner, target.id, "support")

    assert response.status_code == 409
    assert response.json()["code"] == "staff_already_assigned"


async def test_assigning_an_unknown_user_is_not_found(client, db):
    owner, profile = await make_organizer(db)
    event = await make_event(db, profile)

    response = await assign(client, event, owner, uuid.uuid4())

    assert response.status_code == 404
    assert response.json()["code"] == "user_not_found"


async def test_removing_someone_not_on_staff_is_not_found(client, db):
    owner, profile = await make_organizer(db)
    event = await make_event(db, profile)
    target = await make_user(db)

    response = await client.delete(
        f"{PREFIX}/events/{event.id}/staff/{target.id}", headers=auth_header(owner)
    )

    assert response.status_code == 404
    assert response.json()["code"] == "staff_not_found"


async def test_a_staff_assignment_grants_event_access_until_removed(client, db):
    owner, profile = await make_organizer(db)
    event = await make_event(db, profile)
    first = await make_user(db)
    await assign(client, event, owner, first.id, "manager")
    target = await make_user(db)

    assert (await assign(client, event, first, target.id)).status_code == 201
    await client.delete(f"{PREFIX}/events/{event.id}/staff/{first.id}", headers=auth_header(owner))

    other = await make_user(db)
    assert (await assign(client, event, first, other.id)).status_code == 403
