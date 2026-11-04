# BiletFlow backend

FastAPI + PostgreSQL backend for BiletFlow, an event-ticketing platform for Kazakhstan. Payments,
payouts and identity checks are simulated: no real money moves.

- [`docs/architecture.md`](docs/architecture.md): stack rationale and conventions. Read this first.
- [`docs/openapi.yaml`](docs/openapi.yaml): the API contract and source of truth.
- [`docs/data-model.md`](docs/data-model.md): schema conventions and decisions.
- `/CLAUDE.md`: the implementation plan and who owns which part.

## Run with Docker

```sh
docker compose up -d --build --wait
docker compose exec api python -m scripts.seed
```

Migrations are applied when the API starts.

| Service | URL |
|---|---|
| API health | http://localhost:8000/health |
| API docs | http://localhost:8000/api/v1/docs |
| MailHog (dev email) | http://localhost:8025 |
| MinIO console | http://localhost:9001 (`biletflow` / `biletflow-dev`) |

If a port is taken, override it, for example `POSTGRES_PORT=55433 docker compose up -d`. The
variables are in `docker-compose.yml`.

Seeded accounts are `admin@example.com` and `organizer@example.com`, password `ChangeMe-Demo-123`.

## Develop locally

Needs [uv](https://docs.astral.sh/uv/) and a running PostgreSQL, which can be the Compose one
(`docker compose up -d postgres`).

```sh
uv sync
cp .env.example .env
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
uv run python -m app.tasks.worker    # background jobs, in a second terminal
```

## Test

Tests need PostgreSQL, because the partial indexes and citext are part of what they check. They
use a separate database, whose name must end in `_test` because the suite wipes it.

```sh
docker compose exec postgres createdb -U biletflow biletflow_test    # once
uv run pytest
uv run ruff check . && uv run ruff format --check . && uv run mypy
```

## Add a feature

1. Branch per part: `feat/p4-seat-holds`.
2. Change `docs/openapi.yaml` first.
3. Add routes to the existing file in `app/routers/`. They are already registered.
4. For schema changes: edit `app/models/`, then
   `uv run alembic revision --autogenerate -m p4_seat_holds`, and read the generated file.
   If two branches both add migrations, rebase and set `down_revision` so there is one head.
5. Add background jobs to `JOBS` in `app/tasks/worker.py`.
6. Ship unit and API tests with the part. `tests/factories.py` has helpers for valid rows.

## Send real email

By default email goes to MailHog, which keeps it at http://localhost:8025 and sends nothing out. To
deliver it, set these in `.env`, then run `docker compose up -d`:

| Variable | Gmail | Transactional provider |
|---|---|---|
| `SMTP_HOST` | `smtp.gmail.com` | from the provider |
| `SMTP_PORT` | `587` | `587` |
| `SMTP_STARTTLS` | `true` | `true` |
| `SMTP_USERNAME` | your Gmail address | SMTP login from the provider |
| `SMTP_PASSWORD` | an App Password | SMTP key from the provider |
| `EMAIL_FROM` | your Gmail address | a sender verified with the provider |

For Gmail, turn on 2-Step Verification, then create an App Password at
https://myaccount.google.com/apppasswords. Enter its 16 characters without spaces. Your normal
Google password will not work.

Links in emails start with `WEB_BASE_URL`, so set it to the deployed frontend when there is one.
Only STARTTLS is supported, so use port 587, not 465. Keep credentials in `.env`, which is not
committed. A failed delivery does not fail the request: look for `email delivery failed` in the
API logs.

## Backups

`docker compose --profile ops up -d backup` takes a `pg_dump` at start and then daily, into
`./backups`, and keeps 14 days.

To restore, stop the writers, replace the database, then start again:

```sh
docker compose stop api worker
docker compose exec -T postgres dropdb -U biletflow biletflow
docker compose exec -T postgres createdb -U biletflow biletflow
docker compose exec -T postgres pg_restore -U biletflow -d biletflow --no-owner < backups/<file>.dump
docker compose start api worker
```
