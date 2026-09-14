# BiletFlow Backend

FastAPI + async SQLAlchemy backend. This first slice covers **authentication and accounts only**
— see `../PROJECT_PLAN.md` for the full roadmap.

## Setup

```bash
cd backend
cp .env.example .env          # then fill in JWT_SECRET (min 32 chars)
uv sync
```

Start PostgreSQL and apply migrations:

```bash
docker compose up -d db
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

Interactive docs: http://localhost:8000/docs

Or run the whole stack in Docker:

```bash
docker compose up --build
```

## Tests

```bash
uv run pytest
```

Tests run against in-memory SQLite, so no database container is needed.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/v1/auth/register` | — | Create an attendee or organizer account |
| POST | `/api/v1/auth/login` | — | Exchange credentials for an access + refresh token |
| POST | `/api/v1/auth/refresh` | — | Rotate the refresh token |
| POST | `/api/v1/auth/logout` | — | Revoke a refresh token |
| POST | `/api/v1/auth/verify-email` | — | Consume an email-verification token |
| POST | `/api/v1/auth/resend-verification` | — | Re-issue a verification token |
| POST | `/api/v1/auth/password-reset/request` | — | Start a password reset |
| POST | `/api/v1/auth/password-reset/confirm` | — | Set a new password with a reset token |
| GET | `/api/v1/users/me` | bearer | Current user |
| PATCH | `/api/v1/users/me` | bearer | Update own name |
| GET | `/api/v1/users/me/organizer-profile` | organizer | Read own organizer profile |
| PUT | `/api/v1/users/me/organizer-profile` | organizer | Create or update own organizer profile |
| GET | `/api/v1/users` | platform_admin | List users |
| GET | `/health` | — | Liveness probe |

## Design notes

- **Access tokens are JWTs, refresh tokens are not.** Refresh, verification and reset tokens are
  random opaque strings stored as SHA-256 hashes, so they stay revocable and single-use and a
  database leak cannot be replayed. Refresh tokens rotate on every use; the old one is revoked.
- **Only `attendee` and `organizer` can self-register.** `event_admin` is granted per event via a
  `StaffAssignment` (added with the event feature) and `platform_admin` is seeded internally.
- **Email delivery is not wired up yet.** Verification and reset tokens are written to the
  application log so the flow can be exercised locally. Replace with the transactional email
  provider when notifications (SRS 4.10) are implemented.
- **Login does not require a verified email** so the demo flow stays usable without a mail
  provider. Add a `require_verified_user` dependency when a feature actually needs it.
- Changing a password revokes every outstanding refresh token for that user.

## Adding a migration

```bash
uv run alembic revision --autogenerate -m "add events"
uv run alembic upgrade head
```

New models must be imported in `app/models/__init__.py`, otherwise autogenerate will not see them.
