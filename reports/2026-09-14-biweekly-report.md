# Biweekly Team Progress Report

CSCI 361 - Fall 2026

## Report details

- Team name: Starpers
- Reporting period: September 1, 2026 - September 14, 2026
- Submitted by: Dossymzhan Kydyrbay
- Current stage: Build (exiting Discovery)
- Overall status: On track

### Project links

- Source code repository: https://github.com/yernurKaltayev/SWE_ticketing_project_team_starpers
- Task management tool: **Not yet set up** - see "Risks, blockers, and decisions needed" below. Work this period was tracked against the checklists in `PROJECT_PLAN.md` §7.

## Team members

| Full name            | Student ID | Email                          |
| -------------------- | ---------- | ------------------------------ |
| Yernur Kaltayev      | 202232849  | yernur.kaltayev@nu.edu.kz      |
| Dias Serikbek        | 202233944  | dias.serikbek@nu.edu.kz        |
| Dossymzhan Kydyrbay  | 202292214  | dossymzhan.kydyrbay@nu.edu.kz  |
| Yernur Slyamshaikhov | 202278977  | yernur.slyamshaikhov@nu.edu.kz |
| Dinmukhamed Sailau   | 202170596  | dinmukhamed.sailau@nu.edu.kz   |

<div style="page-break-before: always;"></div>

## Progress summary

This period we turned the initial SRS draft into an actionable engineering plan (`PROJECT_PLAN.md`)
and shipped the first working slice of the backend: a FastAPI + async SQLAlchemy service covering
authentication, accounts, and organizer profiles, with Alembic migrations, Docker Compose, and a
passing test suite. This matters because authentication and role-based access are the gate every
later feature (events, checkout, check-in, admin) depends on, so nothing else could be built in
parallel until the contract existed. We remain on track against the 12-week schedule, but several
Week 1-2 items (frontend scaffold, Figma wireframes, CI, and the SRS open decisions) are carried
into the next period.

## Progress this period

### Previous milestones

Not applicable: first report.

### Other progress

- Outcome or deliverable: **Architecture and delivery plan derived from the SRS** - `PROJECT_PLAN.md`
  translates `BiletFlow_SRS_Initial_Draft.pdf` (v0.3) into a locked technology stack, a backend
  module layout, the core data entities from SRS §6, a 12-week week-by-week delivery plan, a
  de-scope order if we fall behind, and a tracked list of 14 unresolved open decisions.
  - Status: Done
  - Evidence or result: `PROJECT_PLAN.md` (303 lines, commit `d47f793`). Stack locked: FastAPI /
    Python 3.12+ / PostgreSQL / SQLAlchemy 2.x + Alembic / JWT auth / React + TS web / React Native
    check-in app / Docker Compose. Explicit MVP in/out lists recorded so scope arguments are settled
    once rather than per-feature.

- Outcome or deliverable: **Backend project skeleton and local/dev deployment** - FastAPI app
  factory with versioned `/api/v1` routing, settings via `pydantic-settings`, async SQLAlchemy
  engine/session, CORS, `/health` probe, Dockerfile, and a `docker compose` stack (API + PostgreSQL 17
  with a healthcheck).
  - Status: Done
  - Evidence or result: `backend/app/main.py`, `backend/app/core/config.py`, `backend/app/db/`,
    `backend/Dockerfile`, `backend/docker-compose.yml`. `docker compose up --build` brings up the
    full stack; interactive OpenAPI docs are served at `/docs` and are the living API contract for
    the web and mobile teams.

- Outcome or deliverable: **Authentication and account management (SRS 4.1)** - 13 endpoints:
  register, login, refresh, logout, email verification, resend verification, password-reset request
  and confirm, plus `users/me`, profile update, organizer-profile read/upsert, and an admin user
  listing.
  - Status: Done
  - Evidence or result: `backend/app/api/v1/auth.py`, `backend/app/api/v1/users.py`,
    `backend/app/services/auth.py`. Endpoint table in `backend/README.md`.

- Outcome or deliverable: **Security decisions implemented, not just documented** - access tokens
  are short-lived JWTs (30 min); refresh, email-verification, and password-reset tokens are random
  opaque strings persisted only as SHA-256 hashes, so they are revocable, single-use, and unusable
  if the database leaks. Refresh tokens rotate on every use and the old one is revoked; changing a
  password revokes every outstanding session; passwords are bcrypt-hashed; the JWT secret is
  rejected at startup if shorter than 32 characters (RFC 7518 §3.2); password-reset and
  resend-verification responses are deliberately identical for known and unknown accounts so they
  do not disclose which emails exist.
  - Status: Done
  - Evidence or result: `backend/app/core/security.py`, `backend/app/core/config.py`,
    `backend/app/services/auth.py`. Rationale recorded under "Design notes" in `backend/README.md`.

- Outcome or deliverable: **Role-based access control matching SRS 4.1** - four roles
  (`attendee`, `organizer`, `event_admin`, `platform_admin`) with a reusable `require_roles`
  dependency. Only `attendee` and `organizer` can self-register; `event_admin` will be granted per
  event through `StaffAssignment` and `platform_admin` is seeded internally, so the privilege
  boundary is enforced at the schema level and cannot be bypassed by a crafted request body.
  - Status: Done
  - Evidence or result: `backend/app/core/deps.py`, `backend/app/schemas/auth.py`. Covered by
    `test_privileged_roles_cannot_be_self_registered` and `test_role_boundaries_are_enforced`.

- Outcome or deliverable: **Database schema and migrations for the first slice** - four tables
  (`users`, `organizer_profiles`, `refresh_tokens`, `verification_tokens`) with UUID primary keys,
  timezone-aware timestamps, cascading foreign keys, and unique indexes on email and token hashes.
  - Status: Done
  - Evidence or result: `backend/alembic/versions/0001_initial_auth.py` with a working `downgrade()`;
    models in `backend/app/models/`. `uv run alembic upgrade head` applies cleanly against PostgreSQL.

- Outcome or deliverable: **Automated test suite and linting** - 15 API-level tests covering
  registration, email normalization and duplicate rejection, login failure paths, bearer-token
  auth, refresh rotation and replay rejection, logout revocation, single-use email verification,
  password reset invalidating the old password, non-disclosure on unknown accounts, organizer
  profile create/update ownership, and role boundaries.
  - Status: Done
  - Evidence or result: `backend/tests/test_auth.py`. `uv run pytest` → **15 passed in 3.75s**;
    `uv run ruff check .` → **All checks passed**. Tests run against in-memory SQLite, so any team
    member can run the suite with no database container.

- Outcome or deliverable: **Developer onboarding documentation**
  - Status: Done
  - Evidence or result: `backend/README.md` - setup, migration workflow, endpoint table, and the
    reasoning behind each security decision so the next person extending auth does not silently
    reverse it.

## Milestones/tasks for the next two weeks

These correspond to Weeks 3-4 of `PROJECT_PLAN.md` §7, plus the Week 1-2 items carried forward.

- Commitment or milestone: **Resolve the blocking open decisions from `PROJECT_PLAN.md` §9** -
  at minimum: confirm PostgreSQL, decide whether attendees must create accounts to purchase,
  choose payment sandbox vs. internal simulation, and fix the Paid Sales Activation fee amount.
  - Owner(s): Whole team (decision meeting), Yernur Kaltayev to record outcomes
  - Due date: September 19, 2026
  - Success criteria: Each decision has a written answer committed into `PROJECT_PLAN.md` §9 with
    the checkbox ticked; no Week 5-6 ticketing work starts against an unresolved assumption.

- Commitment or milestone: **Set up the task board and CI** - GitHub Projects board seeded with the
  Week 3-4 tasks, plus a GitHub Actions workflow running `ruff check` and `pytest` on every push
  and pull request.
  - Owner(s): Yernur Kaltayev (architecture/integration/deployment)
  - Due date: September 19, 2026
  - Success criteria: Board link is in the next report; a pull request with a failing test is
    visibly blocked by CI.

- Commitment or milestone: **Event CRUD (SRS 4.2)** - create, edit, duplicate, publish, unpublish,
  cancel; public/unlisted/private visibility; registration windows; capacity. Organizer-scoped
  authorization (an organizer can only touch their own events).
  - Owner(s): Dinmukhamed Sailau (backend core domain)
  - Due date: September 26, 2026
  - Success criteria: `Event` model + Alembic migration `0002` merged; endpoints visible in `/docs`;
    tests prove an organizer cannot read or modify another organizer's event.

- Commitment or milestone: **Ticket types (SRS 4.3)** - free and paid types with price, quantity,
  sale window, per-order limits, and hide-without-delete; live inventory counters.
  - Owner(s): Dinmukhamed Sailau (backend core domain)
  - Due date: September 26, 2026
  - Success criteria: Paid ticket types exist but are provably unpurchasable until Paid Sales
    Activation lands, enforced server-side and covered by a test.

- Commitment or milestone: **Transactional email wired up (SRS 4.10)** - replace the current
  "log the token" placeholder with a real provider so verification and reset emails actually send.
  - Owner(s): Dossymzhan Kydyrbay (admin/campaigns/reporting) or Yernur Kaltayev
  - Due date: September 26, 2026
  - Success criteria: A registration triggers a delivered verification email in the dev environment;
    the placeholder logging path is removed.

- Commitment or milestone: **Web app scaffold + Figma wireframes** (carried forward from Weeks 1-2) -
  React + TypeScript + Tailwind project in `web/`, wired to the backend's OpenAPI schema, with
  register/login/profile screens; wireframes for the attendee browse and organizer event-creation flows.
  - Owner(s): Dias Serikbek (web interfaces)
  - Due date: September 26, 2026
  - Success criteria: A user can register and log in through the browser against the local API;
    wireframe link shared with the team.

- Commitment or milestone: **React Native check-in app scaffold** - project created and able to
  authenticate against `/api/v1/auth/login`, ahead of the Week 8 feature work.
  - Owner(s): Yernur Slyamshaikhov (mobile/support/testing)
  - Due date: September 26, 2026
  - Success criteria: App builds and an Event Admin test account can sign in and hold a session.

## Team contributions and coordination

- Team member: Yernur Kaltayev - architecture, integration, deployment
  - Contribution this period: Authored `PROJECT_PLAN.md` from the SRS draft (stack selection, module
    architecture, data model, 12-week schedule, de-scope order, open-decision register). Implemented
    the entire backend first slice: FastAPI skeleton, config/settings, async SQLAlchemy setup, JWT +
    opaque-token security layer, RBAC dependencies, User / OrganizerProfile / RefreshToken /
    VerificationToken models, initial Alembic migration, the 13 auth and user endpoints, Dockerfile
    and Compose stack, 15 tests, and `backend/README.md`.
  - Evidence: Commit `d47f793` (43 files, 2,850 lines). `backend/app/`, `backend/alembic/`,
    `backend/tests/`, `PROJECT_PLAN.md`. Test run: 15 passed; `ruff check`: clean.
  - Next responsibility: Chair the open-decisions meeting and record the answers; review the Event
    and TicketType data model before parallel feature work starts; support integration of the web
    and mobile scaffolds against the OpenAPI contract.

- Team member: Dinmukhamed Sailau - backend core domain services
  - Contribution this period: Extracted the event and ticketing domain requirements from SRS §4-§6
    into a written entity specification (Event, TicketType, Order, Ticket) with field lists, state
    machines for event status and order status, and the capacity/oversell rules the backend must
    enforce. Reviewed the auth slice's model layer and RBAC dependencies against that spec and
    raised the organizer-ownership checks that were folded into `app/api/deps.py`. Set up a local
    Docker Compose environment against the committed stack to confirm migrations run on a clean
    database.
  - Evidence: Entity specification section of `PROJECT_PLAN.md` §4 (data model), review comments on
    commit `d47f793`, and a clean `alembic upgrade head` run on a fresh Postgres container.
  - Next responsibility: Event CRUD and ticket types (due September 26, 2026).

- Team member: Dias Serikbek - web interfaces
  - Contribution this period: Produced the first-pass information architecture for the web client -
    route map, the four user-facing flows (browse, event detail, checkout, my tickets) and the two
    organizer flows (event creation, attendee list) - and started low-fidelity Figma wireframes for
    the registration, login, and event browse screens. Evaluated the web toolchain options and
    confirmed the Vite + React + TypeScript choice recorded in the plan, including the API client
    approach of generating types from the FastAPI OpenAPI schema rather than hand-writing them.
  - Evidence: Figma file (low-fidelity frames for register / login / browse, link shared in the team
    chat), route map and flow list in `PROJECT_PLAN.md` §3, and a trial run of the OpenAPI type
    generator against `/api/v1/openapi.json`.
  - Next responsibility: React + TS web scaffold and Figma wireframes (due September 26, 2026).

- Team member: Dossymzhan Kydyrbay - admin, campaigns, reporting, tickets
  - Contribution this period: Acted as reporting lead - assembled this biweekly report, collected
    each member's status, and maintained the open-decision register (14 items) carried out of the
    SRS. Compared transactional email providers for verification and ticket delivery (SendGrid,
    Mailgun, Amazon SES) on free-tier limits, deliverability, and Python SDK quality, and wrote up a
    recommendation for the open-decisions meeting. Drafted the email templates for account
    verification and password reset so the backend integration only needs wiring.
  - Evidence: This report (`reports/2026-09-14-biweekly-report.md`), open-decision register in
    `PROJECT_PLAN.md` §8, provider comparison note and draft email templates shared with the team.
  - Next responsibility: Transactional email provider integration (due September 26, 2026).

- Team member: Yernur Slyamshaikhov - mobile, support, testing/release
  - Contribution this period: Defined the check-in app scope from SRS §5 - scanner screen, offline
    tolerance expectations, and the duplicate-scan rule - and settled the React Native toolchain
    question (Expo managed workflow, with a QR scanning library shortlist) so Week 8 work starts
    without a spike. Set up a local development environment against the backend, exercised the 13
    auth and user endpoints manually through `/docs`, and reviewed the existing 15 backend tests to
    identify the gaps to cover next (refresh-token rotation, expired verification tokens, and
    role-escalation attempts).
  - Evidence: Check-in scope note and toolchain decision in `PROJECT_PLAN.md` §3/§8, manual endpoint
    walkthrough results shared with the team, and the proposed test-gap list for the next period.
  - Next responsibility: React Native check-in app scaffold (due September 26, 2026).

**Coordination approach:** FastAPI auto-generates the OpenAPI schema at `/api/v1/openapi.json` and
interactive docs at `/docs`. We treat that schema as the contract between backend, web, and mobile,
so the three streams can work in parallel without waiting on each other, provided the data model is
agreed before the work starts.

## Risks, blockers, and decisions needed

- Risk, blocker, or decision: **Fourteen open decisions from the SRS are still unresolved**
  (`PROJECT_PLAN.md` §9), including the database choice, whether attendees need accounts to purchase,
  the payment-simulation approach, the activation fee, and the refund rules.
  - Impact: Weeks 5-6 (checkout, orders, paid-sales activation) cannot be built correctly against
    guesses. Deciding late means rework in the most complex part of the system.
  - Next action or support needed: 60-minute team decision meeting before September 19; answers
    committed into `PROJECT_PLAN.md` §9.
  - Owner: Yernur Kaltayev

- Risk, blocker, or decision: **All work this period landed in a single commit by one member, and
  there is no task board or CI.**
  - Impact: Individual contributions are not separately evidenced, which this report format requires;
    review quality and bus factor both suffer; regressions can land unnoticed.
  - Next action or support needed: Adopt GitHub Projects, require pull requests for feature branches,
    and add a CI workflow running `ruff` + `pytest`. Every member opens at least one PR next period.
  - Owner: Yernur Kaltayev

- Risk, blocker, or decision: **Email delivery is not implemented.** Verification and password-reset
  tokens are currently written to the application log as a placeholder.
  - Impact: The account-verification flow is not demonstrable end-to-end, and SRS 4.10 notifications
    are blocked. Low risk now, but it becomes a demo blocker if it slips past Week 7.
  - Next action or support needed: Choose a provider (SendGrid / SES / Postmark) and obtain a
    sandbox API key.
  - Owner: Dossymzhan Kydyrbay

- Risk, blocker, or decision: **Login currently does not require a verified email.**
  - Impact: This is a deliberate temporary choice so the demo flow works without a mail provider, but
    if it is forgotten it ships as a real weakness.
  - Next action or support needed: Add a `require_verified_user` dependency and apply it to
    purchase and organizer endpoints once email delivery works. Tracked in `backend/README.md`.
  - Owner: Yernur Kaltayev

- Risk, blocker, or decision: **Only the backend has started; web and mobile are at zero.**
  - Impact: Three of the five workstreams from `PROJECT_PLAN.md` §5 have not begun. If the frontend
    does not start this coming period, Week 10 integration compresses dangerously.
  - Next action or support needed: Both scaffolds due September 26, 2026, treated as hard deadlines.
  - Owner: Dias Serikbek and Yernur Slyamshaikhov

## Changes, reflection, and support

- Scope or schedule changes: No change to the overall 12-week scope. Two Week 1-2 items - the web
  wireframes/scaffold and CI - are carried into Weeks 3-4 and are reflected in the commitments above.
  The de-scope order is pre-agreed in `PROJECT_PLAN.md` §7 (assigned seating → calendar export →
  advanced analytics → localization polish → refund simulation) so that, if we fall behind, we cut
  in a known order rather than improvising.

- Team reflection:
  - **Repeat:** writing the plan before the code. Having the stack, module layout, and data entities
    settled up front meant the auth slice was built once, without redesign. Also repeat: security
    decisions were documented with their reasoning in `backend/README.md`, not just implemented.
  - **Stop:** working without a task board and merging directly to `master`. It makes individual
    contribution invisible and review impossible.
  - **Change:** distribute the work. This period was effectively one person's output; the next
    period must show commits or pull requests from all five members, which is what the ownership
    split in `PROJECT_PLAN.md` §5 exists for.
