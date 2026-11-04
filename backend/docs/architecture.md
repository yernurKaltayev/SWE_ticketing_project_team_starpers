# BiletFlow backend architecture

BiletFlow is an event-ticketing platform for Kazakhstan. This document records why the stack was
chosen and the conventions every part builds on. The plan itself is in `/CLAUDE.md`.

## Stack rationale

| Choice | Why |
|---|---|
| **Python + FastAPI** | The team already works in Python. Request validation and OpenAPI generation come from one set of Pydantic types, which suits a contract-first project split across three people. |
| **PostgreSQL** | The hardest requirements are concurrency guarantees: no double-booked seat, no oversold ticket type, no over-redeemed promo. Partial unique indexes, CHECK constraints and row locks enforce these in the database rather than in application code. |
| **SQLAlchemy 2 (async) + asyncpg + Alembic** | Typed models, migrations that are checked against those models in CI, and no thread pool to size for I/O-bound endpoints. |
| **APScheduler worker** | Hold expiry, order expiry and email retries are periodic jobs at small scale. A separate process keeps them out of request handling, without running a message broker. |
| **MinIO (S3 API)** | Event images and cached PDFs use the same code locally and against any S3-compatible host. |
| **Docker Compose** | One command starts the whole stack for development and for the demo. |
| **reportlab** | Chosen over weasyprint for PDFs because it needs no system libraries in the image. |

## Structure

```
routers/   HTTP only: parse the request, call a service, shape the response
services/  business logic, no HTTP types; raises AppError subclasses
models/    SQLAlchemy tables, one file per aggregate
schemas/   Pydantic request/response types
core/      config, security, deps, errors, money, pagination, logging
tasks/     background jobs, registered in worker.py
```

## Conventions

**Transactions.** `get_db` gives one session per request and does not commit. The service that
owns the operation calls `await db.commit()` once. `audit()` and `notify()` join the caller's
transaction, so an audit entry can never exist without its change, or the reverse.

**Async sessions.** Do not rely on lazy loading: touching an unloaded relationship raises
`MissingGreenlet`. The models declare foreign keys only. Add `relationship()` where a part needs
it, and load it with `selectinload`.

**Errors.** Raise `NotFoundError`, `ConflictError` and the other `AppError` subclasses with a
stable snake_case `code`. Every non-2xx body is `{code, message, details}`, including validation
errors, unknown routes and crashes. Validation errors never echo submitted values.

**Authorization.** Every endpoint needs one of the guards in `core/deps.py`.

- `require_role(...)` checks the global role.
- `require_event_access(StaffRole.checkin)` handles routes with an `{event_id}` path parameter.
  It allows platform admins, the owning organizer, managers, and staff holding a listed role.
- `check_event_access(db, user, event_id, ...)` does the same when the event ID is elsewhere,
  such as `POST /checkin/verify`.

**Authentication.** Accounts are required for the MVP; guest checkout is not built.

- Sign-in needs a confirmed email, so an access token always belongs to a verified user and other
  parts need no check of their own. `POST /auth/resend-verification` covers expired links.
- Access tokens are JWTs that live 30 minutes and cannot be revoked. Suspension still applies at
  once, because `get_current_user` reads the user on every request.
- Refresh tokens are random, stored hashed and rotated on each use. Reusing a rotated token revokes
  all of the user's sessions, so clients must not run two refreshes in parallel.
- Verification and reset emails call `send_email` directly, not `notify()`, because a notification
  is stored and the raw token must not be. They go out in a FastAPI background task without
  retries; a lost email is recovered by requesting another.
- Rate limits are per process (`core/rate_limit.py`). They use the peer address, so behind a reverse
  proxy start uvicorn with `--proxy-headers` and a matching `--forwarded-allow-ips`.

**Money.** Integer tiyn in columns and in the API, with a `currency` beside it. Use
`core.money.Money` for arithmetic. Floats are rejected.

**Logging.** JSON lines on stdout, each with a `request_id`. Add fields with
`logger.info("...", extra={...})`. Never log tokens, passwords or IBANs.

**Simulation.** Payments, payouts and identity checks are simulated. `is_simulated` is stored on
each such record and must reach API responses.

## Shared service interfaces

Agreed in P0 so parts can be built in parallel. The signatures are in place; each owner fills in
their own.

| Interface | Location | State |
|---|---|---|
| `audit(db, *, action_type, entity_type, entity_id, description, ...)` | `services/audit_service.py` | Working |
| `require_event_access()` / `check_event_access()` | `core/deps.py` | Working |
| `notify(db, event_type, user, context)` | `services/notification_service.py` | Stub: logs only |
| `issue_tickets(db, order)` | `services/ticket_service.py` | Raises `NotImplementedError` |
| `apply_promo(db, order, code)` | `services/promo_service.py` | Raises `NotImplementedError` |
| `release_inventory(db, order)` | `services/inventory_service.py` | Raises `NotImplementedError` |
| `PaymentProvider` | `services/payments/base.py` | Abstract class |

`notify` is a safe no-op because a dropped notification never breaks a flow. The others raise,
because silently skipping ticket issuance or a discount would look like success. Patch them in
tests until the owner's part lands.

These take `db` as their first argument, which the plan's short form leaves out: they must run in
the caller's transaction.

## Contract workflow

`docs/openapi.yaml` is the source of truth. Change it first, then implement.
`tests/api/test_contract.py` fails if a route exists in code but not in the contract. FastAPI's
generated view of what is actually implemented is at `/api/v1/docs`.
