# Biweekly Team Progress Report

CSCI 361 - Fall 2026

## Report details

- Team name: Starpers
- Reporting period: September 15, 2026 - September 28, 2026
- Submitted by: Dossymzhan Kydyrbay
- Current stage: Build
- Overall status: On track

### Project links

- Source code repository: https://github.com/yernurKaltayev/SWE_ticketing_project_team_starpers
- Task management tool: **Not yet set up** - carried over from the previous period; work is still
  tracked against the checklists in `PROJECT_PLAN.md` §7.

## Team members

| Full name            | Student ID | Email                          |
| --------------------- | ---------- | ------------------------------ |
| Yernur Kaltayev      | 202232849  | yernur.kaltayev@nu.edu.kz      |
| Dias Serikbek        | 202233944  | dias.serikbek@nu.edu.kz        |
| Dossymzhan Kydyrbay  | 202292214  | dossymzhan.kydyrbay@nu.edu.kz  |
| Yernur Slyamshaikhov | 202278977  | yernur.slyamshaikhov@nu.edu.kz |
| Dinmukhamed Sailau   | 202170596  | dinmukhamed.sailau@nu.edu.kz   |

<div style="page-break-before: always;"></div>

## Progress summary

This period the web client moved from an empty `web/` directory to a working, typed Vite + React
front end wired against the live authentication backend, with a BiletFlow visual design system and
a client-side domain layer standing in for the ticketing backend that has not been built yet. This
matters because it lets page work start immediately instead of waiting on Event CRUD, ticket types,
and checkout to land server-side: the domain layer exposes the same async, error-shaped functions a
real API call would, so pages built against it now can be pointed at the backend later with no
rewrite. Screen assembly itself (browse, event detail, checkout, my tickets, organizer dashboard) has
not started yet - the app still renders the default Vite starter page - so that is the immediate
next step. Progress on the other Week 3-4 commitments from the previous report (task board and CI,
Event CRUD, ticket types, transactional email, the mobile scaffold) has no new evidence this period
and is carried forward; this repeats a risk already raised last period and is called out again below.

## Progress this period

### Previous milestones

- Milestone: **Web app scaffold + Figma wireframes** (committed for September 26, 2026)
  - Status: Partially done. The scaffold, authentication wiring, and a domain layer for the
    ticketing screens are in place; the wireframe-driven screens themselves are not yet built.
    Carried forward as the top priority for the next period.

### Other progress

- Outcome or deliverable: **Web application scaffold** - Vite + React 19 + TypeScript project in
  `web/`, with `@`-aliased imports, a dev-server proxy to the FastAPI backend at `localhost:8000` so
  browser requests are same-origin, and a documented `.env.example` for the API base URL.
  - Status: Done
  - Evidence or result: `web/package.json`, `web/vite.config.ts`, `web/tsconfig*.json`,
    `web/.env.example`.

- Outcome or deliverable: **BiletFlow visual design system in Tailwind CSS v4** - a theme of
  ink/sun/sky color tokens (the golden accent is drawn from the national flag), a Manrope/Unbounded
  type pairing, a reusable ticket-stub "notch" treatment for ticket and order layouts, and a print
  stylesheet so an issued ticket can be printed cleanly.
  - Status: Done
  - Evidence or result: `web/src/index.css`.

- Outcome or deliverable: **Authentication wired end-to-end against the live backend** - a typed
  fetch client that attaches bearer tokens, detects an expired access token, and transparently
  rotates the opaque refresh token exactly the way the backend issues and revokes it, with
  concurrent 401s deduplicated into a single refresh call so parallel requests do not race each
  other. Session state (current user, login, logout) is exposed through a React context backed by
  TanStack Query.
  - Status: Done
  - Evidence or result: `web/src/lib/api.ts`, `web/src/lib/auth.tsx`, `web/src/lib/types.ts` (typed
    mirrors of the backend's auth and user schemas).

- Outcome or deliverable: **Client-side domain layer for the not-yet-built ticketing backend (SRS
  4.2-4.6)** - events, ticket types, checkout with promo codes, orders, tickets, and a per-event
  audit log, persisted to `localStorage` behind the same async, error-shaped functions a real API
  call would use, so it can be swapped for `fetch` calls later without touching any page. Business
  rules are mirrored the way the backend is expected to enforce them: ticket-type per-order limits,
  oversell guards, Paid Sales Activation gating on paid ticket types, promo-code redemption caps,
  and organizer-ownership checks on every write. Seeded with eight demo events spanning five
  Kazakhstani cities and multiple categories so the browse and detail screens have realistic data to
  build against.
  - Status: Done
  - Evidence or result: `web/src/services/db.ts`, `web/src/services/events.ts`,
    `web/src/services/checkout.ts`.

- Outcome or deliverable: **Type-checking and linting configured for the web client.**
  - Status: Done
  - Evidence or result: `npx tsc -b --noEmit` -> clean; `npx oxlint` -> 0 errors, 2 informational
    fast-refresh warnings in `web/src/lib/auth.tsx` (a shared context module also exporting a small
    constant map), left as-is and noted for a later file split rather than treated as a defect.

## Milestones/tasks for the next two weeks

- Commitment or milestone: **Assemble the actual screens on top of the scaffold** - attendee browse,
  event detail, checkout, and "my tickets", plus the organizer event-creation and dashboard flows,
  built against the domain layer and design system already in place.
  - Owner(s): Dias Serikbek
  - Due date: October 10, 2026
  - Success criteria: A user can browse seeded events, complete a simulated checkout, and see an
    issued ticket, all in the browser against the local backend and mock domain layer.

- Commitment or milestone: **Set up the task board and CI** (carried over from Weeks 3-4).
  - Owner(s): Yernur Kaltayev
  - Due date: October 10, 2026
  - Success criteria: Board link is in the next report; a pull request with a failing test is
    visibly blocked by CI.

- Commitment or milestone: **Event CRUD and ticket types on the backend (SRS 4.2-4.3)** (carried
  over from Weeks 3-4), built to the same shapes the web client's mock domain layer already assumes
  so the swap-over is a contract match, not a redesign.
  - Owner(s): Dinmukhamed Sailau
  - Due date: October 10, 2026
  - Success criteria: `Event` and `TicketType` models and endpoints merged; a web client request
    against the real API returns data the existing pages can render unchanged.

- Commitment or milestone: **Transactional email wired up (SRS 4.10)** (carried over from Weeks
  3-4).
  - Owner(s): Dossymzhan Kydyrbay
  - Due date: October 10, 2026
  - Success criteria: A registration triggers a delivered verification email in the dev environment.

- Commitment or milestone: **React Native check-in app scaffold** (carried over from Weeks 3-4).
  - Owner(s): Yernur Slyamshaikhov
  - Due date: October 10, 2026
  - Success criteria: App builds and an Event Admin test account can sign in and hold a session.

## Team contributions and coordination

- Team member: Dias Serikbek - web interfaces
  - Contribution this period: Built the web client from an empty directory into a working scaffold:
    Vite + React + TypeScript project setup, the BiletFlow Tailwind theme and ticket-stub styling,
    the authenticated API client with refresh-token rotation, and a client-side domain layer covering
    events, ticket types, checkout, promo codes, and orders so screen work is not blocked on the
    backend's ticketing endpoints. Seeded realistic demo data (eight events across five cities) for
    building and reviewing the upcoming screens against.
  - Evidence: `web/` (package config, `src/index.css`, `src/lib/`, `src/services/`); `tsc -b --noEmit`
    clean, `oxlint` 0 errors.
  - Next responsibility: Assemble the attendee and organizer screens on top of this scaffold (due
    October 10, 2026).

- Team member: Yernur Kaltayev - architecture, integration, deployment
  - Contribution this period: Reviewed the web client's authentication flow against the backend's
    token-rotation and revocation behavior to confirm the two sides agree on refresh semantics. No
    new backend commits this period; task board and CI setup, committed for the previous period,
    carried forward.
  - Evidence: n/a - no new committed work this period.
  - Next responsibility: Task board and CI setup (due October 10, 2026).

- Team member: Dinmukhamed Sailau - backend core domain services
  - Contribution this period: No new committed work this period; Event CRUD and ticket types,
    committed for the previous period, carried forward. The web client's domain layer (`events.ts`,
    `checkout.ts`) was built to the entity spec from `PROJECT_PLAN.md` §4 that this member authored
    last period, which narrows the contract the real backend implementation needs to match.
  - Evidence: n/a - no new committed work this period.
  - Next responsibility: Event CRUD and ticket types on the backend (due October 10, 2026).

- Team member: Dossymzhan Kydyrbay - admin, campaigns, reporting, tickets
  - Contribution this period: Assembled this biweekly report and collected status across the team.
    No new committed work on transactional email this period; carried forward from the previous
    period.
  - Evidence: This report (`reports/2026-09-28-biweekly-report.md`).
  - Next responsibility: Transactional email provider integration (due October 10, 2026).

- Team member: Yernur Slyamshaikhov - mobile, support, testing/release
  - Contribution this period: No new committed work this period; the React Native check-in app
    scaffold, committed for the previous period, carried forward.
  - Evidence: n/a - no new committed work this period.
  - Next responsibility: React Native check-in app scaffold (due October 10, 2026).

**Coordination approach:** unchanged from the previous period - the backend's OpenAPI schema at
`/api/v1/openapi.json` is the contract between backend and web. The web client's new domain layer
extends that same idea one step further: it defines, in code, the shapes the ticketing endpoints are
expected to return, so the backend implementation and the already-built screens can converge on the
same contract independently.

## Risks, blockers, and decisions needed

- Risk, blocker, or decision: **Work this period again landed with one member, and the task board
  and CI still do not exist.** This is the same risk raised in the previous report; it was not
  resolved.
  - Impact: Four of five committed workstreams from the previous period (task board/CI, Event CRUD,
    email, mobile scaffold) show no new evidence this period. Individual contribution remains
    unverifiable and review is still not happening before code lands.
  - Next action or support needed: Task board and CI are now the first item due next period, ahead
    of new feature work, so the gap does not compound a third time.
  - Owner: Yernur Kaltayev

- Risk, blocker, or decision: **The web client's domain layer duplicates business rules that the
  real backend still has to implement** (inventory limits, Paid Sales Activation gating, promo
  redemption caps, organizer ownership).
  - Impact: If the backend's Event/Ticket/Order implementation diverges from what the mock layer
    assumes, screens built against the mock will need rework rather than a clean swap.
  - Next action or support needed: Backend Event CRUD and ticket types should be reviewed against
    `web/src/services/events.ts` and `checkout.ts` before merging, not just against
    `PROJECT_PLAN.md` §4.
  - Owner: Dinmukhamed Sailau and Dias Serikbek

- Risk, blocker, or decision: **No screens exist yet.** The web app currently renders the default
  Vite starter page; only the scaffold, auth wiring, and domain layer are in place.
  - Impact: This is expected at this stage, but it is the only web progress visible to a non-technical
    reviewer opening the app, and Week 10 integration compresses if screen work does not start
    immediately.
  - Next action or support needed: Screen assembly is the first commitment for the next period.
  - Owner: Dias Serikbek

- Risk, blocker, or decision: **Fourteen open decisions from the SRS remain unresolved**
  (`PROJECT_PLAN.md` §9), carried over from the previous report.
  - Impact: Checkout and paid-sales work cannot be finalized against guesses.
  - Next action or support needed: The decision meeting from the previous period did not happen;
    it needs to be scheduled before Event CRUD and checkout implementation continue further.
  - Owner: Yernur Kaltayev

## Changes, reflection, and support

- Scope or schedule changes: No change to the overall 12-week scope. The Week 3-4 commitments not
  completed this period (task board/CI, Event CRUD, ticket types, transactional email, mobile
  scaffold) are carried into the next period alongside the new screen-assembly work, and are
  reflected in the commitments above.

- Team reflection:
  - **Repeat:** designing the client-side domain layer around the same shapes the backend is
    expected to return, the way `PROJECT_PLAN.md` was written before the first backend slice. It
    means the web screens and the backend's Event/Ticket/Order implementation can be built in
    parallel next period instead of the web team waiting on the backend a second time.
  - **Stop:** letting a whole period pass without a task board or CI. This was flagged last period
    and was not fixed.
  - **Change:** the next report needs committed work from more than one member, and the decision
    meeting needs to actually be scheduled rather than carried forward again.
