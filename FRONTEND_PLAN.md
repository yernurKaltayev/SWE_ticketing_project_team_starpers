# BiletFlow Frontend — Implementation Plan

**Status:** frontend implementation plan for Yernur Slyamshaikhov and Dias. No frontend is implemented yet.

**Basis:** the backend plan in [CLAUDE.md](CLAUDE.md), including P0–P16 and its example schemas. The referenced SRS PDF is absent, so this document does not claim independent SRS verification.

**Frontend team:** Yernur Slyamshaikhov and Dias.

**Backend integration contacts:** Yernur (backend), Dos (backend), and Dima (backend). Yernur (backend) and Yernur Slyamshaikhov are different students; only Yernur Slyamshaikhov and Dias receive frontend implementation assignments in this document.

**Schedule:** Weeks 1–2, Weeks 3–4, Weeks 5–6, Week 7, and Remaining, aligned with the backend plan's phases. The frontend framework remains undecided; React + TypeScript + Vite is the recommendation in this plan.

## 1. Goal and working assumptions

Build a responsive web application through which attendees discover events and obtain tickets, organizers manage events and sales, event staff check tickets and handle support, and platform administrators manage operations.

The frontend plan is needed because these users share authentication, permissions, event state, checkout state, money, and API contracts. Deliver complete user journeys in small increments so each increment can be demonstrated with the backend.

Working assumptions, to revisit when the team agrees otherwise:

- Yernur Slyamshaikhov and Dias implement the frontend in parallel. Backend integration is coordinated with Yernur (backend), Dos (backend), and Dima (backend).
- React + TypeScript is the proposed stack; the two frontend students should confirm their shared framework choice in Week 1.
- The first checkout requires an attendee account, matching the backend plan's MVP default. Guest checkout remains an open product decision.
- Start with one team-agreed UI language and translation-ready strings. English is a temporary drafting assumption; Kazakh/Russian translation scope needs agreement.
- The target is mobile and desktop web. Native apps, offline check-in, a venue-layout editor, real payments/identity verification/payouts, and WebSocket chat are outside the documented MVP.
- Currency is KZT. Payment, verification, and payout simulations must remain visibly labeled wherever users encounter them.
- Weekly goals depend on the relevant backend contracts and endpoints. Track mocked UI, real API integration, and verified behavior separately.

**Implementation goal:** first complete the organizer → attendee journey with free general-admission tickets; then integrate simulated paid checkout, assigned seating, refunds, and check-in. Build support, notifications, reporting, history, and administration incrementally, then complete their integration and final delivery in the Remaining phase. Calendar export and GA4 remain optional as in the backend plan.

**First integration milestone:** organizer creates and publishes a free event → attendee registers → confirmed order displays a QR ticket → confirmation email is queued/delivered by the backend. Add PDF download when the backend PDF endpoint is ready, targeting Week 7 in line with the backend plan. Verify the email through the development mail service; the frontend displays delivery state only if the API exposes it.

## Frontend ownership overview

Each module has a frontend lead. Where a module spans attendee and organizer/admin screens, the split below identifies who implements each area. Both students review each other's PRs and test their own modules.

| Module | Frontend lead | Work split |
|---|---|---|
| F0 — Foundation/contracts | Yernur Slyamshaikhov | Yernur Slyamshaikhov: app setup, routing, API client, generated types, CI. Dias: mock fixtures, styling/layout foundation, event contract review. |
| F1 — Shared UI/authentication | Yernur Slyamshaikhov | Authentication, session, profiles, permissions, and reusable UI; Dias reviews and reuses the shared forms/layouts. |
| F2 — Discovery/event setup | Dias | Public event discovery/detail, organizer event/ticket editors, publishing, and uploads; Yernur Slyamshaikhov connects session/access helpers. |
| F3 — Checkout/orders/tickets | Yernur Slyamshaikhov | Attendee checkout, order recovery/history, QR/PDF tickets; Dias connects event/ticket selection data from F2. |
| F4 — Payments/activation/payouts | Yernur Slyamshaikhov | Yernur Slyamshaikhov: attendee simulated payment and status recovery. Dias: organizer activation checklist, payout accounts, and financial/payout views. |
| F5 — Seating/holds | Dias | Venue-layout/category configuration, seat map/list, hold lifecycle; Yernur Slyamshaikhov connects holds to checkout and recovery. |
| F6 — Refunds/organizer orders | Dias | Organizer orders/attendee lists, exports, cancellation and refund controls; Yernur Slyamshaikhov connects resulting attendee order/ticket state changes. |
| F7 — Staff/check-in | Yernur Slyamshaikhov | Staff assignments, scanner/manual fallback, results and undo; Dias reviews organizer entry points and attendee-list reuse. |
| F8 — Promotions | Dias | Campaign management, codes/QR, links and reporting fields; Yernur Slyamshaikhov connects validation/discount feedback to checkout. |
| F9 — Notifications/support | Dias | Notification center, attendee/organizer support, staff/admin case inbox and polling; Yernur Slyamshaikhov connects shared permissions and navigation. |
| F10 — Analytics/history/admin | Dias | Dias: organizer analytics and event history. Yernur Slyamshaikhov: platform admin screens, settings, moderation, and operational exports. |
| F11 — Calendar/final delivery | Yernur Slyamshaikhov | Yernur Slyamshaikhov: deployment, run instructions and integrated smoke checks. Dias: optional calendar, responsive/accessibility review. Both fix and verify their assigned screens. |

## 2. Proposed technical approach

| Concern | Proposed choice | Purpose |
|---|---|---|
| Application | React + TypeScript, strict mode, Vite | A client application consuming the separately owned FastAPI backend |
| Routing | React Router | Nested public, attendee, organizer, staff, and admin routes |
| API and server state | Native `fetch` wrapper + TanStack Query | Central errors/auth handling, queries, mutation state, and cache invalidation |
| Forms | React Hook Form + Zod, added when the first substantial forms land | Form state, accessible validation, and transformation into API inputs |
| Styling | CSS Modules + shared CSS custom properties | A small reusable UI foundation without committing to a large component framework |
| API types | `openapi-typescript` from the agreed OpenAPI specification | Shared request/response types; generated files are not hand-edited |
| Development mocks | Mock Service Worker (MSW) | Build screens before endpoints are ready using the same HTTP client |
| Verification | Vitest + React Testing Library; Playwright for critical journeys | Test behavior and real browser integration |
| Tooling | npm lockfile, ESLint, formatting, supported Node.js LTS | Reproducible local development and CI |

This SPA approach is a project-specific recommendation for an academic MVP with an existing backend boundary. Public search indexing and rich social-link previews are a tradeoff: if these become required deliverables, choose server rendering/prerendering before scaffolding. Confirm the stack in F0 and keep it stable through the first working journey.

Start with one Vite application, React Router, basic native form controls, and a small shared stylesheet. Add the query/form libraries as their first real use appears. Avoid a second frontend/server framework, an unnecessary custom component library, and duplicate global state tooling. If both frontend students already know another suitable framework, agree that choice in Week 1 before implementing feature screens.

Keep server data in TanStack Query, filters/pagination in URL parameters, form values in the form library, and temporary interactions in local component state. Use a small session context for the current user and capabilities. Do not introduce a second global store until a concrete shared-state problem needs it.

Use the current compatible stable releases when scaffolding, pin the supported runtime, and commit one lockfile. Do not add charting or QR-scanning libraries until their module is being implemented; check their maintenance, license, bundle cost, and target-device behavior then.

## 3. Users, navigation, and proposed routes

Routes here are **browser routes**, not commitments about API endpoints. Use stable event IDs initially; keep share-token behavior aligned with the backend.

| Area | Main routes | Access and primary tasks |
|---|---|---|
| Public | `/`, `/events`, `/events/:eventId` | Browse/filter public events; inspect venue, dates, ticket types, availability, and refund policy |
| Authentication | `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password` | Sign in, verify, reset credentials, and return to the intended allowed page |
| Checkout | `/events/:eventId/checkout`, `/orders/:orderId/status` | Select tickets/seats, enter attendee details, apply a promo, review server totals, register/pay, recover status |
| Attendee | `/account`, `/account/orders`, `/account/orders/:orderId`, `/account/tickets`, `/account/tickets/:ticketId` | Manage profile; inspect owned orders and tickets; download PDFs |
| Notifications/support | `/notifications`, `/support`, `/support/:caseId` | Read notifications and manage permitted contextual support cases |
| Organizer | `/organizer`, `/organizer/profile`, `/organizer/events`, `/organizer/events/new` | Organizer onboarding, profile, and event list |
| Event workspace | `/organizer/events/:eventId/*` | Overview, details, ticket types, seating setup, activation, orders, attendees, staff, promotions, analytics, history, and support |
| Organizer finances | `/organizer/payouts` | Simulated payout accounts, financial summaries, and payout status |
| Event staff | `/staff/events`, `/staff/events/:eventId/check-in`, `/staff/events/:eventId/support` | Only assigned event capabilities; phone-friendly scanner and support inbox |
| Administration | `/admin/*` | Users, events/reports, orders/payments/refunds, activations, settings, escalated support, and exports |

Use public, account, organizer, staff, and admin layouts with shared primitives. Do not build a separate UI system for each role. Users may have event-specific staff assignments; derive navigation from backend permissions rather than assuming one global `organizer_staff` role. A route guard improves navigation; the backend remains responsible for authorization.

Public listing must exclude unlisted/private events according to the API contract. A share link must not bypass a private event's authorization. Organizers need a protected preview of draft events. Handle missing, inaccessible, cancelled, and unpublished events explicitly.

## 4. Implementation modules and acceptance criteria

These modules describe the frontend scope. Priority **A** establishes the free-ticket journey; **B** completes payment, seating, admission, and ticket lifecycle; **C** completes the remaining documented platform scope. The weekly sequence and parallel assignments are in section 5. C features remain planned deliverables, not automatically optional. Calendar export and GA4 retain the optional status given in the backend plan.

### F0 — Contracts, setup, and development workflow [A]

**Frontend lead:** Yernur Slyamshaikhov; Dias owns mock fixtures and the shared styling/layout foundation.

**Backend dependencies:** Yernur (backend), Dos (backend), and Dima (backend); P0.

- Agree the F0/first-integration subset of section 6 first. Record exact API paths and examples in the backend OpenAPI document, which is planned but not yet present. Settle later-feature contracts when needed.
- Create `frontend/` with the agreed stack, routing, query client, environment validation, lint/typecheck/build scripts, and basic CI.
- Add one API client with structured error mapping, request cancellation, and the agreed session mechanism.
- Generate API types and create MSW scenarios for success, empty, validation error, forbidden, network failure, and expired session.
- Use `VITE_API_BASE_URL` or a same-origin `/api/v1` proxy. Browser-exposed environment values contain configuration only, never signing keys or provider secrets.

**Done when:** a clean install runs the app; one read and one mutation work through the same client against mocks and a real development API when available; CI can typecheck, lint, test, and build. Mocked completion is recorded separately from integrated completion.

### F1 — Shared UI, authentication, and permissions [A]

**Frontend lead:** Yernur Slyamshaikhov.

**Backend dependencies:** Yernur (backend); P0/P1.

- Build page layouts, navigation, buttons, labeled inputs, selects, error summaries, dialogs, status badges, tables/pagination, and loading/empty/error states as they are needed.
- Implement register, verify/resend verification if supported, login/logout, refresh, forgotten/reset password, and profile editing.
- Add organizer profile/onboarding and permission-aware navigation. Staff assignment management lands with F7.
- Preserve a safe, same-origin return route through login. Expired links, suspended accounts, denied access, and expired sessions receive actionable messages.

**Done when:** login survives the agreed session lifecycle, logout clears user-specific cached data, inaccessible routes show the right response, and an organizer cannot view another organizer's protected resources in the integrated application.

### F2 — Public discovery and organizer event setup [A]

**Frontend lead:** Dias.

**Backend dependencies:** Dos (backend) for P2/P3; Yernur (backend) for event access.

- Build searchable/filterable event listing with category, date, city, pagination, and URL-preserved filters. Event detail shows real dates/time zone, venue, pricing, availability, and registration/refund terms.
- Build organizer event list and editor: basics, images, venue, dates/time zone, visibility, registration window, capacity, and refund policy.
- Add free/paid ticket-type editing: name, price, quantity, sales window, per-order limit, hidden state, and inventory summary.
- Add save draft, protected preview, publish/unpublish, and duplicate. Explain backend validation failures, including missing ticket types and invalid capacity. Duplication copies configuration only.
- Agree event deletion/archive eligibility with Dos (backend). Expose deletion only where the backend permits it; preserve completed/cancelled records and events with protected transaction history. Do not invent permanent-delete behavior.
- Use server-mediated/presigned uploads when the upload contract is ready; handle size/type limits and failed uploads.

**Done when:** an organizer creates a valid free general-admission event, publishes it, and an attendee can find and view it. Invalid publication stays in draft with specific correction instructions.

### F3 — Free checkout, orders, and attendee tickets [A]

**Frontend lead:** Yernur Slyamshaikhov; Dias connects event/ticket selection from F2.

**Backend dependencies:** Dos (backend) for orders/inventory; Dima (backend) for ticket issuance/QR/PDF; Yernur (backend) for notifications; P3/P5/P8/P9.

- Implement quantity selection, attendee details, order review, and a clear `Register for free` action. Display totals from the server.
- Keep an order-creation idempotency key stable through retries of the same checkout attempt. Resolve uncertain outcomes before allowing a new order attempt.
- Build confirmation/status recovery, owned order history/detail, and “My tickets.” Ticket detail shows event, attendee, seat if present, validity state, backend-issued QR, and protected PDF download.
- Handle sold-out inventory, closed sales, changed availability, validation failure, delayed issuance, and failed PDF retrieval without discarding recoverable order state.
- Confirmation remains usable when email is delayed; users can access their ticket from their account.

**Done when:** the first integration milestone in section 1 and QR/PDF ticket access work against the real API. Refreshing status and retrying a timed-out order submission do not produce a duplicate order or ticket set.

### F4 — Paid-sales activation, simulated checkout, and payouts [B]

**Frontend lead:** Yernur Slyamshaikhov for attendee payment/status recovery. Dias owns organizer activation and payout screens.

**Backend dependencies:** Dima (backend), with Yernur (backend) for suspension/settings; P6/P11.

- Add a per-event activation checklist showing missing event/ticket setup, simulated identity verification, payout account, terms acceptance, and activation-fee payment.
- Build payout-account forms with masked stored details, simulated verification status, and payout summaries/status. Do not echo full stored sensitive details into the UI.
- Build clearly labeled simulated payment success/failure/pending flows using backend sandbox scenario controls; do not ask for real card numbers. Show activation fees, processing charges/deductions, and final totals according to the agreed fee-payer policy; add no per-ticket service fee.
- Keep paid purchasing unavailable while activation is incomplete or suspended; preserve free registration where the backend allows it.
- Reconcile payment state through the backend after redirects, refresh, and network interruption. Do not issue or mark tickets paid in browser state.

**Done when:** inactive paid sales are blocked; activation enables only the selected event; simulated payment creates tickets only after backend confirmation; pending/failure/retry and payout status screens work.

### F5 — Assigned seating and hold recovery [B]

**Frontend lead:** Dias; Yernur Slyamshaikhov connects holds to checkout/recovery.

**Backend dependencies:** Dos (backend), coordinating payment timing with Dima (backend); P4/P5/P6.

- Organizer selects a predefined venue layout and maps price categories to ticket types. No venue drawing/editor tools.
- Build an attendee seat map with section/row/seat labels, price, accessible-seat information, a legend, and an equivalent keyboard-usable list selection.
- Distinguish a local selection from a server-confirmed hold. Show held seats and remaining time using server expiry information; reconcile on refresh and tab focus.
- Handle conflicting selection, expiry, release, cancellation, and abandoned/failed checkout. Refresh availability when a hold fails and preserve unrelated attendee form values where safe.
- Release on navigation as a best effort; server expiry remains authoritative. Do not assume a browser close event will execute a release request.

**Done when:** two browser sessions competing for one seat show one successful reservation and a clear recovery path for the other; an expired hold cannot complete checkout; successful ticket detail/PDF identifies the correct seat.

### F6 — Refunds, cancellation, and organizer order operations [B]

**Frontend lead:** Dias; Yernur Slyamshaikhov connects attendee order/ticket state updates.

**Backend dependencies:** Dos (backend) for order lists; Dima (backend) for refund lifecycle; Yernur (backend) for notifications/audit; P5/P7/P9/P12.

- Add organizer orders/attendee lists with search/filter/pagination and authorized CSV exports.
- Provide free-registration cancellation and full-refund actions with order identity, amount, and consequences in the confirmation dialog.
- Add event cancellation with affected-registration/refund information and backend-reported progress/results when cancellation is asynchronous.
- Render pending, completed, and failed refunds accurately; update order/ticket lists after mutations. Do not announce completion before the backend confirms it.
- Keep cancelled/completed event records readable and remove unavailable purchasing/check-in actions according to server rules.

**Done when:** completed cancellation/refund invalidates the ticket in attendee and staff views; failures remain visible and recoverable; cancellation and refund controls respect event ownership.

### F7 — Staff assignments and online check-in [B]

**Frontend lead:** Yernur Slyamshaikhov.

**Backend dependencies:** Yernur (backend) for assignments/permissions; Dima (backend) for check-in; P1/P15.

- Build per-event staff management and assigned-event navigation; check-in staff receive only their permitted capabilities.
- Build a phone-friendly event scanner with camera enable/disable, rear-camera preference where supported, and a manual lookup/input fallback agreed with the backend.
- Pause duplicate frame submission while a verification request is in flight. Show ticket/event identity and distinct accepted, already-used, invalid, refunded, cancelled, wrong-event, and campaign-QR results as supported by the agreed contract.
- Add attendee status/search, registered/checked-in totals, and authorized undo with reason/confirmation and refreshed state.
- Show connection failures as unknown results pending reconciliation. Never accept admission locally while offline. Release camera tracks when leaving the page.

**Done when:** the first scan succeeds once, the second is rejected, refund/campaign/wrong-event cases are rejected, unauthorized undo is denied, and camera-denied behavior works on a real phone. Deploy camera use over HTTPS, with localhost used only for local development.

### F8 — Promotions and campaign QR [B]

**Frontend lead:** Dias; Yernur Slyamshaikhov connects promotion validation to checkout.

**Backend dependencies:** Dima (backend), with Yernur (backend) for reporting; P16/P13.

- Build campaign creation/editing with percent/fixed discount, validity, ticket-type eligibility, redemption limit, enable/disable, generated codes, and campaign-QR download.
- Add checkout promo entry/removal and backend-calculated discount feedback. A validation preview does not guarantee redemption until the order commits.
- Handle campaign-link arrival, preserving the opaque campaign context through login/checkout and validating it through the backend. Keep campaign QR clearly labeled as promotional, separate from admission tickets.

**Done when:** valid promos affect server totals; expired/disabled/exhausted/inapplicable codes show specific messages; competing redemptions and campaign links recover correctly.

### F9 — Notifications and support cases [C]

**Frontend lead:** Dias; Yernur Slyamshaikhov connects shared permissions/navigation.

**Backend dependencies:** Yernur (backend); P9/P10.

- Build notifications, unread state, mark-read actions, and permitted contextual navigation.
- Build attendee and organizer support creation with category, subject, initial message, and allowed event/order/ticket context.
- Build staff/admin case inbox and detail with polling messages, assignment, status changes, reply errors, and retry. Preserve unsent text in memory; deduplicate messages by stable ID.
- Pause polling on hidden views, use bounded retry/backoff, resume on focus, and handle session expiry. Use REST polling as specified by the backend.

**Done when:** a customer and authorized responder exchange messages and update a case without page reload; unrelated users cannot read it; no duplicate messages appear after polling/retry.

### F10 — Analytics, history, and platform administration [C]

**Frontend lead:** Dias for organizer analytics/history. Yernur Slyamshaikhov owns platform administration.

**Backend dependencies:** Yernur (backend); P11/P12/P13.

- Build organizer analytics from backend aggregates: capacity/sold/remaining, financial totals, trends/type breakdown, campaign performance, and check-in/absence. Include filters and useful empty states; provide tabular values with charts.
- Build an event activity feed with date/type filters and read-only historical records.
- Build admin search/detail views for users, events/reports, orders, payments/refunds/failures, activations, and payouts; add suspension, report review, escalated support, operational exports, and settings controls.
- Reuse forms and tables. Validate fee/hold settings using agreed units/ranges and show mutation errors. Avoid inventing financial definitions or recalculating aggregate reports in the browser.

**Done when:** seeded transactions reconcile with displayed reports; organizers see only their own events; admin actions, exports, settings, and history work with real authorization and API data.

### F11 — Optional calendar and final delivery [A–C, throughout]

**Frontend lead:** Yernur Slyamshaikhov for deployment/integration checks. Dias owns optional calendar and the responsive/accessibility review; both students fix their own modules.

**Backend dependencies:** Dos (backend) for P14; Yernur (backend), Dos (backend), and Dima (backend) for integration/P0.

- Add `.ics` download from event/ticket views if core delivery is on schedule. Use the backend file, including cancellation updates and stable calendar identity.
- Complete responsive/accessibility review, route refresh handling, performance work, environment/deployment instructions, and the verification matrix below.
- GA4 is optional and follows a separate agreed consent/data policy; exclude personal information and ticket/session tokens. It is not the source for operational analytics.

**Done when:** required milestones pass against the deployed demo, direct links refresh correctly, mocks are disabled, and the team can repeat the documented demo from a clean seeded environment.

## 5. Phase timeline

Use the same grouped phases as the backend plan. Each phase has an integration outcome rather than a separate deadline for every week. Prepare frontend screens against agreed mocks while endpoints are being built. Begin F9/F10 incrementally as their contracts become available, and complete those operational features and final delivery in Remaining; Week 7 is not a deadline for the entire platform.

| Phase | Yernur Slyamshaikhov — frontend | Dias — frontend | Phase outcome |
|---|---|---|---|
| **Weeks 1–2** | F0: scaffold application, routes/providers, API client, generated types, session/error/permission contracts and CI. Define F1 reusable form and status components. | F0: shared styles/layouts and contract-aligned fixtures. Sketch F2 public/organizer screens and review event/ticket/venue contracts. | Agreed stack, ownership, UI conventions and first API contracts; one shared application runs with deterministic mocks. |
| **Weeks 3–4** | F1: authentication, profiles, session/route guards and error handling; integrate P1 as it lands. Prepare F3 checkout/order/ticket states against contracts. | F2: public discovery/detail, organizer event editor, venue/uploads and publishing; integrate P2 as it lands. Prepare ticket-type forms and F5 seating configuration against contracts. | Authentication and event management work with available real APIs; ticket selection and free checkout are ready for P3/P5 integration. |
| **Weeks 5–6** | F3: integrate free-order submission/idempotency/recovery, account tickets and QR; verify backend confirmation email. F4: attendee simulated payment/status recovery and hold-to-checkout integration with Dias. | F2: integrate ticket types/inventory. F5: seat map/list, holds, conflicts and expiry. F4: organizer activation and payout screens. Prepare F6 order/refund operations and F8 campaign forms. | **First milestone:** free registration → QR ticket → email. **Second milestone:** activated simulated paid checkout with assigned seats; failure/recovery and inventory conflicts are verified. |
| **Week 7** | F3: PDF access. Connect F8 promo feedback to checkout, then integrate F7 online check-in/scanner/manual fallback and undo as P15 becomes available. Verify repeated-scan and refunded-ticket rejection with Dias. | F8: campaign codes/QR and promo redemption. Add optional F11 calendar only if core flows pass; then integrate F6 cancellation/refund controls as P7 becomes available. | QR/PDF delivery and promotions work; refund invalidation and single-use admission are verified as the corresponding backend services land. |
| **Remaining** | Complete F10 platform admin/settings/moderation/exports and shared permission integration. Lead F11 deployment, run instructions, end-to-end checks and demo rehearsal; fix and verify assigned modules. | Complete F9 notifications/support and F10 organizer analytics/history. Lead F11 responsive/accessibility review, organizer reporting checks and any unfinished optional calendar work; fix and verify assigned modules. | Required F0–F10 acceptance criteria and F11 delivery checks pass against the deployed demo. Remaining is planned work, with completion tracked by acceptance criteria rather than a fixed calendar date. |

### Integration checkpoints

- **End of Week 2:** agree API contracts and mock examples with the backend contacts, including readiness expectations for each later operation. Complete shared frontend foundations before duplicating components across modules.
- **End of Week 4:** demonstrate authentication/event publishing with available real APIs and the prepared free-checkout flow. Keep endpoint gaps visible rather than delaying all frontend work until checkout is implemented.
- **Weeks 5–6:** prove the real free journey first, then paid/assigned-seat checkout. Do not infer payment success, inventory ownership, or valid admission from local UI state.
- **Week 7:** integrate PDF/promotions, then refunds/check-in as their backend endpoints land. Optional calendar/GA4 must not displace an unfinished required journey.
- **Remaining:** finish notifications/support, analytics/history, admin operations, hardening, tests and demo deployment. Run the full verification matrix before declaring delivery complete.

Yernur Slyamshaikhov and Dias should review dependencies with the backend contacts at the start of each phase. P9–P13 contracts and endpoints arrive incrementally, matching the backend plan's Remaining phase; start available F9/F10 work early and track completion there. Agree readiness rather than assuming it. If an endpoint is late, continue with contract-aligned MSW responses and record the frontend task as **mocked**, with its frontend owner and unresolved backend dependency. A phase ending does not make unfinished integration complete.

Work in small PRs such as `feat/frontend-free-checkout`. Each student implements and tests their named area; the other reviews it. For every feature, track **contract agreed → UI with mocks → API integrated → acceptance verified**. On shared modules, coordinate common types/query keys before changing the same files. A mock-only demonstration does not complete an integration milestone.

## 6. API contracts to agree before dependent work

The current backend document contains representative schemas, not a complete implemented API. Treat the following as contract requests, not endpoints already available. Agree F0/first-integration requirements first; settle later-feature requirements before their phase milestone. The ownership column below identifies backend API contacts, not frontend implementers; frontend ownership is defined above.

| Contract | Backend API contact(s) | Required decision / response |
|---|---|---|
| General API | Yernur (backend), Dos (backend), Dima (backend) | Exact `/api/v1` methods/paths; IDs/enums/nullability; pagination, sorting and filters; `{code, message, details}` and field-validation format; conflict/rate-limit behavior; request IDs |
| Session | Yernur (backend) | Login/refresh/logout transport; refresh rotation, expiry, `/me` capabilities, verification/reset links, return routes, and CORS/CSRF behavior |
| Permissions | Yernur (backend) | Global roles versus event assignments; discoverable staff events and allowed event actions; suspended-account behavior; account-required versus guest purchase |
| Events/uploads | Dos (backend), Yernur (backend) | Public/unlisted/private access, draft preview, event states, draft deletion/archive eligibility, upload initiation/completion and limits, venue/layout data, image URLs |
| Checkout | Dos (backend), Dima (backend) | Quote/validation strategy, server totals, order-create idempotency header/body and scope, same-key payload mismatch, order retrieval/status, expiry and safe retry rules |
| Seat holds | Dos (backend) | Hold ownership/token, seat identifiers/statuses, `expires_at` and clock reference, release/lookup/recovery operations, order attachment, and expiry/payment race rules |
| Payments/activation | Dima (backend), Yernur (backend) | Simulation actions, status polling, retry/new-intent rules, fee payer/units/rounding, activation checklist/actions, suspension and payout-account/status shapes |
| Tickets/downloads | Dima (backend) | Protected ticket detail, QR image/payload, PDF retrieval and content type, signed URL lifetime if used, issuance status, allowed visibility and cancelled/refunded states |
| Refunds/cancellation | Dima (backend), Dos (backend) | Full-order scope, eligibility, cancellation versus refund semantics, pending/failure outcomes, bulk cancellation progress, and retry safety |
| Check-in | Dima (backend), Yernur (backend) | Verify input/results, whether verification also consumes admission, manual lookup, uncertain-result reconciliation, attendee stats, undo endpoint/permission/reason |
| Promotions | Dima (backend) | Percent/fixed units, server quote/redemption timing, campaign redirect destination, token propagation, validation errors, and reporting fields |
| Notifications/support | Yernur (backend) | Mark-read operations; allowed case relationships, assignment/status transitions, polling cursor/order, message IDs, duplicate-send handling |
| Reports/admin | Yernur (backend) | Financial/check-in definitions, filters, export format/authorization, settings units/ranges, reports/disputes/failures scope, and available admin actions |
| Calendar | Dos (backend) | `.ics` access/download and event cancellation/update behavior |

Recommended session contract: short-lived access token held in memory, refresh token in a Secure/HttpOnly cookie, with backend-owned rotation and CSRF protection appropriate to deployment. The backend example currently returns both tokens in JSON, so this requires explicit agreement. Do not quietly substitute persistent browser token storage to make refresh work.

For development and demo, prefer a same-origin frontend/API deployment with a reverse proxy. If separate origins are required, agree exact allowed origins, credential handling, cookie attributes, and HTTPS before implementing session recovery.

Resolve these existing plan ambiguities with the backend owners before encoding assumptions: integer tiyn versus decimal amounts; organizer-staff global role versus event capabilities; processing-fee payer; full versus partial refund scope; and the coordinated hold-to-sold seat transition. Currency arithmetic, inventory locking, signatures, and authorization remain server responsibilities.

## 7. Rules for state and recovery

| Situation | Required frontend behavior |
|---|---|
| Money | Display server amounts as KZT using `Intl.NumberFormat`. Prefer agreed integer tiyn; parse organizer price inputs deliberately into that unit, enforce API bounds/safe integer handling, and avoid authoritative browser subtotal/discount/fee calculations. |
| Event time | Display the event's IANA time zone explicitly. Convert organizer date/time input to the agreed timestamp format using that zone, not the browser zone; validate end/start and registration/sales windows. |
| Changing availability | Treat displayed availability as a snapshot. On conflict, refresh server data and explain which selection changed. Never show an optimistic successful reservation. |
| Seat/order expiry | Count down from server-provided expiry and clock reference. Recheck on focus and before submission. Reload recovers an authorized order/hold or clearly starts reselection; do not fabricate a fresh expiry. |
| Unknown order outcome | Keep the attempt's idempotency identity, look up/retry by the agreed contract, and prevent an accidental second purchase. Store only an opaque recovery identifier if persistence is needed; do not persist attendee details or tokens in local storage. |
| Payment pending | Poll status with bounded intervals/backoff while relevant. A redirect, elapsed timer, or button click is not proof of payment. After a UI wait limit, offer “Check status” and show the existing order, rather than marking it failed. |
| Mutations | Disable duplicate submissions while pending; display validation near fields and an error summary. Retry reads selectively; retry financial/order writes only under an agreed idempotency/reconciliation contract. |
| Session expiry | Attempt one coordinated refresh; avoid refresh loops. If it fails, prompt sign-in, clear private cached data, and recover the owned checkout/order after authentication through the API. |
| Refund/check-in/change | Invalidate related ticket, order, inventory, attendee, and report queries. QR views recheck validity on focus; the scanner always asks the backend, even when a screenshot still shows an old QR. |
| Failed network | Keep recoverable form input, show an explicit retry, cancel obsolete searches, and prevent older responses from overwriting newer selections. Never announce a successful check-in on an unknown result. |

## 8. UI, accessibility, and responsive requirements

Visual branding is intentionally undecided in this roadmap. Establish a small shared set of color, spacing, typography, focus, and status tokens before building many screens; capture the chosen values when implementation/design begins.

- Prioritize mobile event discovery, checkout, tickets, and scanning; organizer/admin work must remain usable on narrow screens. Use content-driven layouts, labeled summary rows, and scrollable or adapted tables rather than clipping actions.
- Use semantic landmarks/headings, visible labels, keyboard access, visible focus, accessible dialogs, and sufficient text/control contrast. Target WCAG 2.2 AA during implementation; verify the actual rendered UI.
- Do not communicate selected seats, check-in results, or payment states by color alone. Supply text, icons where useful, and appropriately announced status changes. Do not announce the countdown every second.
- Preserve reading/focus order after route changes, form errors, dialogs, and asynchronous updates. Keep primary actions visible without covering focused fields or the last table row.
- Every data view needs loading, empty, error/retry, unavailable/permission, and success states as applicable. Every form needs pending, validation, server error, and confirmed result states.
- Explain sold-out, not-yet-open, sales-ended, cancelled-event, and suspended-paid-sales states next to the affected action. Display the refund policy before confirmation.
- Use real or clearly labeled seeded event content. Allow long event/venue names, multiple ticket types, missing images, zero sales, and Cyrillic/Kazakh text without layout breakage. Do not invent event claims or testimonials.
- Keep operational success/failure feedback persistent where users need to act; reserve transient toasts for supplementary feedback. Honor reduced-motion preferences.

## 9. Proposed repository structure

Create this structure incrementally when implementation begins; it is not present today.

```text
frontend/
  package.json
  package-lock.json
  .env.example
  README.md
  src/
    app/                 # router, providers, layouts, route-level errors
    api/                 # HTTP client, errors, generated OpenAPI types
    features/
      auth/              # session, account, verification and recovery
      events/            # discovery and organizer event editing
      ticket-types/      # organizer configuration and availability
      checkout/          # selections, order submission and recovery
      seating/           # seat map/list and holds
      payments/          # simulated payment and activation
      orders/            # attendee/organizer order operations and refunds
      tickets/           # ticket display, QR and PDF access
      check-in/          # staff scanner, attendee status and undo
      promotions/
      notifications/
      support/
      organizer/         # overview, staff, payouts, analytics, history
      admin/
    components/ui/       # shared accessible primitives
    lib/                 # money, time, permissions and safe navigation
    styles/              # tokens, global styles
    locales/             # team-agreed UI language, organized for translation
    mocks/               # contract-aligned handlers and deterministic fixtures
    test/                # shared test setup/helpers
  e2e/                   # critical browser journeys
```

Keep endpoint functions and query keys near their feature; use the shared client everywhere. Co-locate meaningful component/service tests with the feature. Avoid creating folders or abstracting components that have no current use.

## 10. Verification and definition of done

Test behavior with controlled fixtures before API availability, then repeat the critical journeys against seeded PostgreSQL-backed services. Mock tests do not prove inventory concurrency, payment idempotency, or authorization; those require backend tests and real integration exercises.

| Check | Expected result |
|---|---|
| Free journey | Organizer publishes a free event; attendee registers once; account shows matching order, ticket/QR/PDF; backend mail service receives confirmation. |
| Paid journey | Inactive sales blocked; selected event activated; simulated success issues tickets after confirmation; failure/pending/refresh recover correctly. |
| Race/recovery | Two sessions compete for one seat; expiry and competing promo redemptions explain conflicts; uncertain order retries do not duplicate purchases. |
| Cancellation/refund | Free cancellation and full paid refund update records; invalidated tickets fail admission; pending/failed refund is not reported as complete. |
| Check-in | Valid ticket accepted once; used/refunded/cancelled/wrong-event/campaign QR rejected as contracted; undo respects permission; phone camera denial/manual fallback works. |
| Roles/privacy | Attendee, organizer A/B, assigned staff, and admin scenarios verify direct-link/API denial and absence of private cached data after logout/account change. |
| Support/operations | Permitted parties exchange a case thread; unread/read changes work; event history, admin settings/actions/exports, and analytics match seeded records. |
| Form/data edges | Long/Cyrillic names, zero results, missing images, invalid fields, upload errors, event/browser time-zone differences, and money boundaries render correctly. |
| Accessibility/responsive | Keyboard-only journey, focus/error handling, seat-list alternative, contrast, zoom/reflow, and phone/tablet/desktop views are manually checked. |
| Deployment | Direct-route refresh, deep links/email links, `/api/v1` proxy/auth, protected downloads, HTTPS camera, and mock-disabled production build work. |

Automate pure money/time/form transformations where they carry business-facing risk, interaction tests for checkout/recovery/permissions, and browser tests for the principal journeys. Check camera scanning manually on the intended phone/browser as well as testing response handling automatically.

Per feature, done means its agreed contract exists, required states render, the real API works, permission/error handling is verified, appropriate tests pass, and the result is reviewable on the demo. CI should run clean install, lint, typecheck, focused tests, and production build; run critical browser smoke flows against a controlled environment.

Load heavy organizer/admin/chart/scanner code only when its route needs it, size event images appropriately, and avoid sequential fetches for independent page data. Pause unnecessary polling. Measure page behavior on representative mobile hardware/network before setting performance budgets with the team.

## 11. First work session

1. **Yernur Slyamshaikhov and Dias:** confirm the shared framework, UI language, ownership split, availability, and grouped phase milestones, including Remaining.
2. **Yernur Slyamshaikhov:** coordinate session/current-user and shared API conventions with Yernur (backend); coordinate order, payment, ticket QR/PDF and check-in contracts with Dos (backend) and Dima (backend).
3. **Dias:** coordinate event/venue/ticket/hold contracts with Dos (backend), organizer activation/refund/promo contracts with Dima (backend), and support/analytics/history contracts with Yernur (backend). Agree readiness expectations for the weekly integrations.
4. **Dias:** prepare event/editor/seat and organizer fixtures/screens; **Yernur Slyamshaikhov:** prepare auth/checkout/ticket/staff fixtures/screens. Review shared components and API examples together.
5. **Yernur Slyamshaikhov:** scaffold `frontend/` and the common client/router; **Dias:** add shared styles, layouts and MSW fixtures. Develop the assigned modules in parallel and integrate endpoints as they become available.

## References

- Product/backend scope: [CLAUDE.md](CLAUDE.md).
- SPA build/routing/data-fetching tradeoffs: [React — build from scratch](https://react.dev/learn/build-a-react-app-from-scratch), [Vite guide](https://vite.dev/guide/), [React Router routing](https://reactrouter.com/start/declarative/routing).
- Server state and forms: [TanStack Query overview](https://tanstack.com/query/latest/docs/framework/react/overview), [React Hook Form](https://react-hook-form.com/get-started), [Zod](https://zod.dev/).
- Contract types and mocks: [OpenAPI TypeScript](https://openapi-ts.dev/introduction), [MSW documentation](https://mswjs.io/docs/).
- Verification: [Vitest guide](https://vitest.dev/guide/), [Playwright introduction](https://playwright.dev/docs/intro).
- Camera secure-context/permission requirements: [MDN — getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).
