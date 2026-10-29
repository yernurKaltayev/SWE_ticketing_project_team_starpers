"""Internal provisioning and repeatable local demo setup; never a public role-granting API."""

import argparse
import asyncio
import getpass
import os
from datetime import UTC, datetime, timedelta

from pydantic import EmailStr, TypeAdapter
from sqlalchemy import select

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import SessionLocal, engine
from app.models.event import Event, PromoCode
from app.models.organizer import OrganizerProfile
from app.models.user import User, UserRole
from app.schemas.auth import Password
from app.schemas.event import ActivationRequest, EventWrite, TicketTypeWrite
from app.services import events


async def provision(db, email, name, role, password):
    email = str(TypeAdapter(EmailStr).validate_python(email)).lower()
    user = await db.scalar(select(User).where(User.email == email))
    if user:
        if user.role != role:
            raise ValueError("existing account has another role; no role was changed")
        return user
    user = User(
        email=email,
        full_name=name,
        role=role,
        hashed_password=hash_password(password),
        is_email_verified=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def seed_demo(db, password):
    if settings.environment not in {"local", "test"}:
        raise ValueError("demo seeding is available only in local/test environments")
    owner = await provision(
        db, "organizer@example.kz", "Starpers Demo", UserRole.organizer, password
    )
    await provision(db, "attendee@example.kz", "Demo Attendee", UserRole.attendee, password)
    await provision(db, "staff@example.kz", "Demo Staff", UserRole.event_admin, password)
    if (
        await db.scalar(select(OrganizerProfile).where(OrganizerProfile.user_id == owner.id))
        is None
    ):
        db.add(
            OrganizerProfile(
                user_id=owner.id,
                display_name="Starpers Demo",
                contact_email=owner.email,
                description="University course demonstration organizer",
            )
        )
        await db.commit()
    for title, price in (("Starpers free meetup", 0), ("Starpers paid demo", 2500)):
        event = await db.scalar(
            select(Event).where(Event.organizer_id == owner.id, Event.title == title)
        )
        if event is None:
            starts = datetime.now(UTC) + timedelta(days=14)
            created = await events.create_event(
                db,
                owner,
                EventWrite(
                    title=title,
                    summary="Biweekly Report 3 demonstration",
                    description="Academic demo",
                    category="tech",
                    city="Astana",
                    venue_name="University Hall",
                    venue_address="Campus",
                    starts_at=starts,
                    ends_at=starts + timedelta(hours=3),
                    ticket_types=[
                        TicketTypeWrite(name="General admission", price=price, quantity=50)
                    ],
                ),
            )
            if price:
                await events.activate(
                    db,
                    owner,
                    created.id,
                    ActivationRequest(
                        payout_iban="KZ001234567890123456",
                        terms_accepted=True,
                    ),
                )
            await events.status_action(db, owner, created.id, "publish")
            event = await db.get(Event, created.id)
        await events.assign_staff(db, owner, event.id, "staff@example.kz")
        if (
            price
            and await db.scalar(
                select(PromoCode.id).where(
                    PromoCode.event_id == event.id,
                    PromoCode.code == "STUDENT20",
                )
            )
            is None
        ):
            db.add(
                PromoCode(
                    event_id=event.id,
                    code="STUDENT20",
                    kind="percent",
                    value=20,
                    max_redemptions=100,
                    redemptions=0,
                    active=True,
                    campaign_name="University posters",
                )
            )
            await db.commit()
    print("Demo ready: organizer@example.kz, attendee@example.kz, staff@example.kz")
    print("New demo accounts use your supplied password; existing passwords are not overwritten.")


async def run(args):
    password = os.environ.get("BILETFLOW_DEMO_PASSWORD") or getpass.getpass("Account password: ")
    TypeAdapter(Password).validate_python(password)
    try:
        async with SessionLocal() as db:
            if args.command == "seed-demo":
                await seed_demo(db, password)
            else:
                await provision(db, args.email, args.name, UserRole(args.role), password)
                print("Internal staff account provisioned; organizers must assign it to an event.")
    finally:
        await engine.dispose()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("seed-demo")
    staff = sub.add_parser("provision-staff")
    staff.add_argument("--email", required=True)
    staff.add_argument("--name", required=True)
    staff.add_argument("--role", choices=["event_admin", "platform_admin"], default="event_admin")
    asyncio.run(run(parser.parse_args()))


if __name__ == "__main__":
    main()
