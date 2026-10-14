# BiletFlow Backend

FastAPI + async SQLAlchemy backend for accounts, organizer-scoped events, ticket types,
simulated checkout, admission tickets, refunds, promotions, analytics and online check-in.
All payment and activation records are academic simulations in whole KZT.

## Run

```bash
cd backend
cp .env.example .env
# Fill JWT_SECRET with at least 32 characters.
uv sync --frozen
docker compose up -d db mailpit
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

API documentation: http://localhost:8000/docs. Development email inbox: http://localhost:8025.
`docker compose up --build` also starts the API and applies migrations automatically.

## Accounts and SMTP

Registration, resend-verification and password-reset requests deliver single-use links through
SMTP after the database transaction commits. Mailpit captures them locally; configure SMTP host,
port, credentials and STARTTLS in your local environment for another development provider.
Raw verification/reset tokens are no longer logged. Only token hashes are stored in the database.
Delivery failures are logged without tokens and do not undo account creation; request a new link
when SMTP is restored. A durable email retry worker is future work.

Login remains available without verification. Checkout and paid-sales activation require a
verified account. Only attendees and organizers can self-register; privileged accounts are
provisioned internally.

```bash
uv run python -m app.cli provision-staff --email staff@example.kz --name "Demo Staff"
```

This prompts for a password. An organizer assigns the account with
`POST /api/v1/events/{event_id}/staff` and an `email` request field. Assignment revocation removes
access immediately. `--role platform_admin` is available only through the internal CLI.

## Local demo

```bash
uv run python -m app.cli seed-demo
```

Supply a password when prompted. The script creates verified local demo accounts, two events,
one promo code and an Event Admin assignment. It is restricted to local/test environments,
leaves existing passwords unchanged, and creates no fabricated sales.

## Endpoint groups

Account schemas use snake_case. New event/ticket schemas use camelCase to match the web client.
The complete request/response contract is generated at `/docs` and `/api/v1/openapi.json`.

| Method | Path under /api/v1 | Purpose / access |
| --- | --- | --- |
| POST | /auth/register, /auth/login, /auth/refresh, /auth/logout | Accounts and rotating sessions |
| POST | /auth/verify-email, /auth/resend-verification | SMTP verification links |
| POST | /auth/password-reset/request, /auth/password-reset/confirm | SMTP reset links |
| GET / PATCH | /users/me | Own account |
| GET / PUT | /users/me/organizer-profile | Own organizer profile |
| GET | /users | Platform Admin user list |
| GET | /events | Published public events; q/city/category filters |
| GET | /events?scope=mine or scope=all | Organizer-owned / Platform Admin events |
| POST / GET / PUT | /events, /events/{id} | Create, read and update events |
| GET / PUT | /events/{id}/ticket-types | Ticket type retrieval / owner-only update |
| POST | /events/{id}/publish, /unpublish, /cancel, /duplicate | Owner-managed lifecycle |
| POST | /events/{id}/activation | Verified owner's simulated paid activation |
| POST | /events/{id}/suspension | Platform Admin moderation |
| POST | /events/{id}/quote, /checkout | Server pricing / verified-user purchase |
| GET | /orders/me, /tickets/{id} | Own orders and tickets |
| POST | /orders/{id}/refund | Own eligible order; 24-hour cutoff |
| GET | /events/{id}/orders, /tickets, /audit | Owner-managed records |
| GET / POST | /events/{id}/promos | Owner-managed promotions |
| GET | /events/{id}/promos/validate?code=CODE | Validate an event-scoped campaign code |
| PATCH | /promos/{id} | Owner enables/disables promo |
| GET | /analytics?event_id=UUID | Organizer analytics from database records |
| POST / DELETE | /events/{id}/staff, /staff/{user_id} | Assign / revoke internally provisioned Event Admin |
| GET | /checkin/events | Assigned events only |
| POST / DELETE | /checkin/{event_id}, /checkin/{event_id}/{ticket_id} | Admit / reverse admission |

## Transaction rules

Event edits, purchases, refunds and cancellations take the same event row lock on PostgreSQL.
Inventory also uses a conditional increment, with a database check forbidding negative stock or
sales above capacity. There is no assigned seating or temporary seat-hold UI in this slice.

Checkout accepts ticket type IDs, quantities, an optional promo, a **simulated** result and an
idempotency key. It accepts no client-supplied totals. Prices and discounts come from the server;
paid activation, sale windows, registration windows, hidden types and per-order limits are checked
again at purchase time. A replay returns the same order; reusing a key with a different payload
returns 409. Declines record failed orders without tickets, stock changes or promo consumption.
Free registrations create zero-value confirmed orders.

Order items preserve immutable price/name snapshots in JSON. Tickets have separate database
records and opaque admission tokens prefixed with `ticket_`. Check-in is atomic, assigned-event
scoped, rejects campaign links and blocks duplicate, refunded or cancelled admission. Customer
refunds reject used tickets. Event cancellation refunds confirmed orders and voids their tickets.
Duplicating an event copies setup into a new draft with fresh IDs, no sales and no activation.
Audit entries have no update/delete API. Analytics aggregate persisted orders, tickets and promos.

## Checks

```bash
uv run ruff check .
uv run pytest
uv run alembic check
```

Default tests use in-memory SQLite. PostgreSQL tests require a dedicated database whose name ends
in `_test`, set via `TEST_DATABASE_URL`; fixtures recreate its application tables. CI supplies one
and runs the real concurrent-buyer oversell test there. SMTP tests deliver through a local capture
server without contacting external addresses. The web browser smoke test is documented in web/README.md.

Migration 0002 adds events, ticket types, orders, tickets, promo codes, audit logs and staff
assignments. New models must remain imported in app/models/__init__.py for Alembic to see them.
