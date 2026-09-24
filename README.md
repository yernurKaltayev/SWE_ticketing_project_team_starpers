# BiletFlow

A Kazakhstan-focused, self-service event ticketing platform. Organizers create events and issue
tickets; attendees discover events, register or purchase, and receive QR-coded digital tickets;
Event Admins check attendees in from a mobile app; Platform Admins moderate the marketplace.

This is a **CSCI 361 course project** (team of 5, 10–12 week academic MVP), not a production
financial system. Payments, payouts and identity verification are **simulated/sandboxed** — no real
money moves, and demo payment records must never be presented as real transactions.

- Full engineering plan and architecture reference: [`PROJECT_PLAN.md`](PROJECT_PLAN.md)
- Requirements source of truth: `BiletFlow_SRS_Initial_Draft.pdf` (v0.3, Initial Draft)
- Progress reports: [`reports/`](reports/)

## Status

| Area | State |
|---|---|
| Architecture & delivery plan | Done — `PROJECT_PLAN.md` |
| Backend: auth, accounts, organizer profiles | Done — [`backend/`](backend/) |
| Backend: events, ticketing, checkout, check-in, admin | Not started |
| Web frontend (React + TS) | Done — [`web/`](web/); auth & accounts on the real API, other features on a preview data layer |
| Mobile check-in app (React Native) | Not started |

The repository currently contains **one implemented slice**: the FastAPI backend's authentication
and account layer. Everything else is planned in `PROJECT_PLAN.md` §7.

## Repository layout

```
.
├── PROJECT_PLAN.md      # Architecture, data model, 12-week delivery plan, open decisions
├── BiletFlow_SRS_Initial_Draft.pdf
├── backend/             # FastAPI + async SQLAlchemy service (implemented: auth & accounts)
│   ├── app/
│   │   ├── main.py      # App factory, CORS, router registration, /health
│   │   ├── core/        # Settings, JWT/password security, shared dependencies
│   │   ├── db/          # Async engine/session, declarative base
│   │   ├── models/      # SQLAlchemy ORM models
│   │   ├── schemas/     # Pydantic request/response models
│   │   ├── api/v1/      # Routers: auth, users
│   │   └── services/    # Business logic, kept out of the routers
│   ├── alembic/         # Migrations
│   ├── tests/           # pytest suite (runs on in-memory SQLite)
│   └── docker-compose.yml
├── reports/             # Biweekly team progress reports
├── web/                 # React + TS web app (Vite, Tailwind) — see web/README.md
└── mobile/              # Planned — not yet created
```

## Technology stack

| Layer | Choice |
|---|---|
| Backend | FastAPI, Python 3.12+ (3.13 pinned locally), async SQLAlchemy 2.x, Alembic, Pydantic v2 |
| Database | PostgreSQL 17 |
| Auth | JWT access tokens + opaque, revocable refresh tokens; bcrypt password hashing |
| Web frontend | React 19 + TypeScript, Vite, Tailwind CSS 4, TanStack Query |
| Mobile | React Native — Event Admin check-in app *(planned)* |
| Payments | Sandbox or internal simulation, KZT — never real money |
| Tooling | uv, ruff, pytest, Docker Compose |

## Quick start (backend)

Requires [uv](https://docs.astral.sh/uv/) and Docker.

```bash
cd backend
cp .env.example .env          # then fill in JWT_SECRET (min 32 chars)
uv sync

docker compose up -d db       # PostgreSQL
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

Interactive API docs: <http://localhost:8000/docs>

Or run the whole stack in containers:

```bash
docker compose up --build
```

Run the tests (in-memory SQLite, no database container needed):

```bash
uv run pytest
```

Lint:

```bash
uv run ruff check .
```

See [`backend/README.md`](backend/README.md) for the endpoint table, auth design notes, and how to
add a migration.

## User roles

- **Attendee** — discovers events, registers/purchases, holds QR tickets.
- **Organizer** — creates and publishes events, manages ticket types, orders and analytics.
- **Event Admin** — mobile check-in staff, assigned per event (distinct from Platform Admin).
- **Platform Admin** — internal moderation and operations, can cross organizer boundaries.

Only `attendee` and `organizer` can self-register. `event_admin` is granted per event via a
`StaffAssignment` (arrives with the event feature); `platform_admin` is seeded internally.

## Architectural rules

These are non-negotiable constraints from the SRS — see `PROJECT_PLAN.md` §3 for the full list:

- **Atomic seat reservation.** Seat selection creates a time-limited hold; checkout takes a
  transaction/lock so two concurrent checkouts can never win the same seat.
- **Payment gating is server-side.** Paid ticket types are unpurchasable until the event completes
  Paid Sales Activation — enforced on every checkout attempt, not just in the UI.
- **Tickets only exist after confirmed payment** (or, for free tickets, after order creation).
  Failed or abandoned checkouts must never leave a valid ticket behind.
- **Campaign QR ≠ admission QR.** Campaign codes only pre-apply a promo after server-side
  validation; the check-in endpoint must reject them outright.
- **Discounts are computed server-side.** The client never supplies a trusted discount amount.
- **Role-scoped authorization.** Event Admins see only assigned events; Organizers only their own.
- **Append-only audit log** for every payment/refund and meaningful organizer/admin action.
- **Analytics come from authoritative tables**, never from optional GA4 data.

## Contributing

1. Agree on the API contract and data model before parallel work — FastAPI's `/docs` is the living
   contract between backend, web and mobile.
2. New models must be imported in `backend/app/models/__init__.py`, or Alembic autogenerate will
   not see them.
3. Keep business logic in `app/services/`, not in routers.
4. Run `uv run ruff check .` and `uv run pytest` before pushing.
5. Never commit `.env`; `JWT_SECRET` must be at least 32 characters.

Team ownership areas and the week-by-week schedule are in `PROJECT_PLAN.md` §5 and §7. Unresolved
questions are tracked in §9 ("Open Decisions") — record answers there as they are settled.
