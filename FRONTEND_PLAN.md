# BiletFlow Frontend — Implementation Plan

**Status:** frontend implementation plan for Yernur Slyamshaikhov and Dias. F0 is merged through PR #6 and F1 through PR #7. Real web and basic iPhone outcomes are user-reported in the F0/F1 checklists; Android and genuine access-expiry/refresh acceptance were deferred by the user. Owner review and remaining unchecked criteria are still pending. Track evidence in [frontend/docs/F0_CHECKLIST.md](frontend/docs/F0_CHECKLIST.md) and [frontend/docs/F1_CHECKLIST.md](frontend/docs/F1_CHECKLIST.md).

F1 includes refresh fix `d10826b`. Its partial acceptance documentation was merged through PR #13 at `f94f783`; that is the base of `feat/frontend-f3`. Later backend readiness is checked operation by operation, not inferred from scaffold files or a merge.

**F3 local implementation (8 November 2026):** free general-admission checkout/review, stable idempotent recovery, own order/ticket pages and authenticated canonical QR/PDF downloads are implemented on `feat/frontend-f3`. The real free checkout/retry/download/authorization path and 105 frontend tests passed. Full F3 acceptance still needs P9 order-email delivery, F2/backend contract reconciliation, owner accessibility/translation review and F7 paper/digital scan evidence. See [frontend/docs/F3_CHECKLIST.md](frontend/docs/F3_CHECKLIST.md). No Figma implementation or automatic git publication is included.

**F2 client progress (6 November 2026):** Dias’s discovery/editor/ticket-type/publication implementation and controlled tests are recorded in [frontend/docs/F2_CHECKLIST.md](frontend/docs/F2_CHECKLIST.md). Live integration, image attachment, policy readback and real-browser acceptance remain pending; F2 is not marked fully accepted.

**Basis:** all five supplied BiletFlow SRS v0.3 PDF extracts, reviewed in full, plus the implementation interfaces in [CLAUDE.md](CLAUDE.md). PDF references below use printed page numbers and original SRS section/use-case identifiers. These are initial-draft requirements; proposed implementation details and unresolved decisions are identified separately.

| Source | Supplied document | Relevant scope |
|---|---|---|
| S1 | `BiletFlow_1_Backend.pdf` | Server business rules, canonical ticket/PDF data, API dependencies and security |
| S2 | `BiletFlow_2_Frontend.pdf` | Web/admin/mobile interfaces, localization, accessibility and frontend guidance |
| S3 | `BiletFlow_3_Overview_and_Business_Model.pdf` | Product applications/roles, free events, per-event activation and KZT pricing |
| S4 | `BiletFlow_4_Use_Cases.pdf` | UC1–UC12 acceptance journeys |
| S5 | `BiletFlow_5_Scope_and_Delivery_Plan.pdf` | Required versus bonus/excluded scope, success criteria and delivery phases |

**Reconciliation:** S5 §8 determines MVP versus bonus priority when detailed functional sections describe a broader capability. Thus assigned seating remains documented but is a bonus, while the dedicated Event Admin mobile app and basic analytics are required. Earlier frontend assumptions and backend-derived scheduling do not override those PDF requirements. CLAUDE.md's P0–P16 identifiers remain integration references. The source's suggested ownership areas are adapted to the two frontend students specified here; backend assignments remain unchanged.

**Frontend team:** Yernur Slyamshaikhov and Dias.

**Backend integration contacts:** Yernur (backend), Dos (backend), and Dima (backend). Yernur (backend) and Yernur Slyamshaikhov are different students; only Yernur Slyamshaikhov and Dias receive frontend implementation assignments in this document.

**Schedule:** Weeks 1–2, Weeks 3–4, Weeks 5–6, Week 7, and Remaining. Remaining contains the source delivery plan's Weeks 8–12 milestones. The stack is user-confirmed: React/TypeScript/Vite/Tailwind for web and React Native/TypeScript/Expo for mobile.

## 1. Goal and working assumptions

Build three interfaces: a responsive organizer/attendee web application, an administrative web portal, and a dedicated iOS/Android ticket-verification app for Event Admins. An Event Admin is organizer-authorized check-in staff; a Platform Admin moderates the platform. These roles are distinct. Events are physical and venue-based. [S2 pp.1–2; S3 pp.1–3]

The frontend plan is needed because these users share authentication, permissions, event state, checkout state, money, and API contracts. Deliver complete user journeys in small increments so each increment can be demonstrated with the backend.

Working assumptions, to revisit when the team agrees otherwise:

- Yernur Slyamshaikhov and Dias implement the frontend in parallel. Backend integration is coordinated with Yernur (backend), Dos (backend), and Dima (backend).
- React/TypeScript/Vite/Tailwind and React Native/TypeScript/Expo are confirmed. The user has Android and iPhone devices; actual launch and OS-version evidence remains pending.
- The first checkout requires an attendee account, matching the backend plan's MVP default. Guest checkout remains an open product decision.
- The initial customer-facing UI must support Kazakh and Russian; English is an additional locale. Externalize strings from the start and verify critical flows in all three locales. Localization polish may be reduced if behind; Kazakh/Russian support is not replaced by an English-only baseline. [S2 p.6 §5]
- The Event Admin app targets selected current iOS and Android versions, with online verification and central synchronization. Native attendee/organizer apps, app-store publication, production offline synchronization, a venue-layout designer/arbitrary imports, real financial/identity processing, and advanced refund/dispute workflows are excluded. Chat uses REST polling; attachments and enhanced real-time delivery are stretch. [S2 pp.4,6; S5 pp.1–2 §8]
- Currency is KZT. Payment, verification, and payout simulations must remain visibly labeled wherever users encounter them.
- Weekly goals depend on the relevant backend contracts and endpoints. Track mocked UI, real API integration, and verified behavior separately.

**Implementation goal:** complete free and simulated paid general-admission journeys, PDF tickets, campaign QR/promos, mobile check-in, basic cancellation/refunds, support, notifications, required basic analytics/history and admin moderation. Assigned seating, calendar, advanced GA4 analytics, offline sync and support attachments are bonus scope; they must not delay the required journey. [S5 pp.1–3 §§8,11]

Also excluded from the initial MVP: resale/transfer marketplace, affiliate marketing, recurring events, advanced marketing automation, on-site hardware integration, multiple payout splits, detailed accounting/tax automation, and full field-version rollback/compliance archival. [S5 p.2 §8]

**First integration milestone:** organizer creates and publishes a free event → attendee registers → confirmed order displays a QR ticket → confirmation email is queued/delivered by the backend. Add PDF download when the backend PDF endpoint is ready, targeting Week 7 in line with the backend plan. Verify the email through the development mail service; the frontend displays delivery state only if the API exposes it.

**Core acceptance journey:** create event → distribute Campaign QR → automatically apply validated promo → select a ticket → complete simulated checkout → receive/print the canonical ticket → request contextual support → verify entry in the dedicated mobile app. Run this journey before adding bonuses. [S5 p.4 §13.4]

## Frontend ownership overview

Each module has exactly one frontend owner: its named lead implements all of that module's screens, API wiring, fixtures, tests, documentation and acceptance work. There is no work split within a module. Owners agree interfaces between modules and consume one another's published helpers/components without taking over implementation. Peer review and backend coordination do not change ownership; defects are assigned back to the owner of the affected module.

| Module | Frontend lead (sole owner) | Responsibilities owned entirely by this person |
|---|---|---|
| F0 — Foundation/contracts | Yernur Slyamshaikhov | Web/mobile setup, shared API types, session adapters, CI, Figma wireframes, fixtures, shared styles/layouts, locales and Android/iPhone launch evidence. |
| F1 — Shared UI/authentication | Yernur Slyamshaikhov | Authentication, session lifecycle, profiles, permissions and reusable UI. |
| F2 — Discovery/event setup | Dias | Public discovery/detail, organizer event/ticket editors, publishing, uploads and this module's access integration. |
| F3 — Checkout/orders/tickets | Yernur Slyamshaikhov | Attendee selection/checkout, order recovery/history, QR/PDF tickets and integration with agreed seating/promo interfaces. |
| F4 — Payments/activation/payouts | Yernur Slyamshaikhov | Attendee simulated payment/status recovery, organizer activation checklist, payout accounts and financial/payout views. |
| F5 — Seating/holds (bonus) | Dias | Conditional layout/category setup, seat map/list, hold lifecycle and the seating interface consumed by checkout. |
| F6 — Refunds/organizer orders | Dias | Organizer orders/attendees, exports, cancellation/refund controls and resulting record/cache updates through agreed interfaces. |
| F7 — Event Admin mobile app/check-in | Yernur Slyamshaikhov | Native app, sessions, assigned events, organizer staff-assignment screens, camera/manual search, counts, undo and device verification. |
| F8 — Promotions | Dias | Campaigns, codes/QR, links, validation, automatic promo application, discount feedback and the promotion interface consumed by checkout. |
| F9 — Notifications/support | Dias | Notification center, contextual support, staff/admin inbox, polling, permissions and navigation within this module. |
| F10 — Analytics/history/admin | Dias | Organizer analytics/history and all platform admin screens, settings, moderation and operational exports. |
| F11 — Calendar/final delivery | Yernur Slyamshaikhov | Optional calendar, cross-application checks, responsive/accessibility verification, deployment, documentation and demo coordination; fixes in other modules return to their owners. |

## Incremental delivery and start rule — both frontend owners

**Frontend modules must be delivered incrementally, following their dependencies and the phase timeline in section 5. F numbers identify scope and ownership; they are not a strict one-at-a-time queue from F0 through F11. This rule applies to Yernur Slyamshaikhov and Dias.**

1. Establish a usable F0 foundation/contracts handoff first. F1 authentication/shared UI and F2 discovery/event setup can then progress in parallel. A dependent screen consumes an available, reviewed interface from its owner; do not duplicate or replace another owner's shared code because their work is still local or unmerged.
2. Build the first required journey in small increments: shared foundation → authentication and event discovery/setup → F3 general-admission registration/orders/tickets. Add simulated paid checkout, cancellation/refunds, campaigns, mobile check-in, support and required reporting in the plan's dependency/timeline order. Finish and review each usable slice before expanding it; avoid starting unrelated modules as one large change.
3. A frontend UI can be implemented against agreed OpenAPI types and clearly labeled contract-aligned mocks before its backend endpoints run. **Real API integration needs the implemented backend dependencies; acceptance needs observed end-to-end results.** Track `contract agreed → UI with mocks → API integrated → acceptance verified` separately. Do not invent an endpoint/field or call a module complete because a mock or build passes.
4. Start dependent implementation when the specific contracts/helpers it needs are stable and shared, rather than requiring every acceptance item in an earlier-numbered module to be closed. Keep outstanding gates explicit. For example, F3's print-and-scan acceptance needs F7, so F7 must be able to start while that F3 acceptance item is pending. F0 backend/device/owner-review gaps likewise remain open while independent client work proceeds.
5. Keep one frontend owner per module. Publish/share reviewed dependencies through the normal git/PR process before a teammate relies on them; a change existing only in another developer's working tree is not a team handoff. Each owner implements, tests, documents and resolves defects in their own module.
6. F5 assigned seating is a bonus and must not block required general-admission work. F11 verification/delivery preparation runs throughout; optional calendar waits until required work is stable. The backend's P0–P16 Plan Gate is separate and does not automatically enforce this F0–F11 frontend workflow.

**Dias's delivery lane:** F2 discovery/event setup → F6 organizer order/attendee lists alongside F3 → F8 promotions plus F6 cancellation/refund integration → F9 notifications/support → F10 required analytics/history/admin. Prepare the next slice's contracts/mocks as the required shared interfaces become available. F5 seating starts only after the required flows are stable and capacity remains. This lane does not transfer any F0/F1/shared-session implementation ownership to Dias.

### Frontend-to-backend integration dependencies

These are integration requirements, not a claim that every listed endpoint is already implemented or verified. Backend source availability, a running API and frontend acceptance are separate checks. Payout/terms fields missing from P1 must use the later agreed contract/F4 rather than being invented in F1.

| Frontend module | Backend parts needed for its relevant real integrations |
|---|---|
| F0 foundation/contracts | P0; P1 for real session/profile adapter evidence |
| F1 auth/profiles/permissions | P0/P1 |
| F2 discovery/event setup | P2/P3; P1 for authorization |
| F3 checkout/orders/tickets | P3/P5/P8/P9; F8/P16 when promotions are added |
| F4 payments/activation/payouts | P6/P11 |
| F5 seating/holds — bonus | P4/P5/P6 |
| F6 cancellation/refunds/organizer orders | P5/P7/P9/P12 |
| F7 mobile/staff/check-in | P1/P15 |
| F8 promotions | P16/P13 |
| F9 notifications/support | P9/P10 |
| F10 analytics/history/admin | P11/P12/P13 |
| F11 delivery/calendar | P0 and the parts used by each integrated journey; P14 for optional calendar |

## 2. Proposed technical approach

| Concern | Proposed choice | Purpose |
|---|---|---|
| Web application/admin portal | React + TypeScript, strict mode; Vite proposed | Responsive web interfaces consuming the existing planned FastAPI backend; Next.js only if SSR/search visibility is needed |
| Event Admin mobile app | React Native + TypeScript; Expo optional | Required dedicated iOS/Android online verifier, separate from native attendee/organizer apps |
| Routing | React Router | Nested public, attendee, organizer, staff, and admin routes |
| API and server state | Native `fetch` wrapper + TanStack Query | Central errors/auth handling, queries, mutation state, and cache invalidation |
| Forms | React Hook Form + Zod, added when the first substantial forms land | Form state, accessible validation, and transformation into API inputs |
| Design/styling | Figma wireframes; Tailwind CSS and shared web tokens | Follows S2 p.1 §2 guidance. Mobile uses React Native styles/native controls with coordinated tokens; web CSS is not assumed to run in the app |
| API types | `openapi-typescript` from the agreed OpenAPI specification | Shared request/response types; generated files are not hand-edited |
| Development mocks | Mock Service Worker (MSW) | Build screens before endpoints are ready using the same HTTP client |
| Verification | Vitest/React Testing Library and Playwright for web; React Native component checks and iOS/Android device journeys | Interface, payment and QR behavior plus actual cross-application integration; mobile testing tool choice is settled in F0 |
| Tooling | npm workspace lockfile, Oxlint, TypeScript checks and Node.js 24 LTS | Reproducible local development and CI; F0 records the selected tooling |

This SPA approach is a project-specific recommendation for an academic MVP with an existing backend boundary. Public search indexing and rich social-link previews are a tradeoff: if these become required deliverables, choose server rendering/prerendering before scaffolding. Confirm the stack in F0 and keep it stable through the first working journey.

S2 p.1 §2 recommends React, conditional Next.js, React Native/optional Expo, TypeScript, Tailwind CSS and Figma. Vite, query/form libraries, API type generation and test tooling are this plan's implementation proposals, not additional SRS requirements. Prove the mobile app can run on both chosen platforms in Weeks 1–2; do not discover build/device-access restrictions in Week 8. Store publication is excluded, but a reproducible way to launch and demonstrate the app on both platforms is required.

Start with one Vite application, React Router, basic native form controls, and a small shared stylesheet. Add the query/form libraries as their first real use appears. Avoid a second frontend/server framework, an unnecessary custom component library, and duplicate global state tooling. If both frontend students already know another suitable framework, agree that choice in Week 1 before implementing feature screens.

Keep server data in the query layer, web filters/pagination in URL parameters, form values in the form library, and temporary interactions locally. Share pure TypeScript contracts, formatters and permission vocabulary where useful; keep React DOM components, React Native screens and authentication/storage adapters platform-specific. Use a small session context for the current user/capabilities rather than a second duplicate server-data store.

Use the current compatible stable releases when scaffolding, pin the supported runtime, and commit one lockfile. Do not add charting or QR-scanning libraries until their module is being implemented; check their maintenance, license, bundle cost, and target-device behavior then.

## 3. Users, navigation, and proposed routes

Routes here are **browser routes**, not commitments about API endpoints. The required mobile screens are listed separately below. Use stable event IDs initially; keep share-token behavior aligned with the backend.

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
| Organizer support staff | `/staff/events`, `/staff/events/:eventId/support` | Assigned-event support inbox and permitted attendee operations; admission scanning is delivered in the dedicated mobile app |
| Administration | `/admin/*` | Users, events/reports, orders/payments/refunds, activations, settings, escalated support, and exports |

**Event Admin mobile navigation:** secure sign-in → assigned-event list → event overview (registered/checked-in counts) → camera scanner/result or manual attendee search/detail → authorized check-in reversal. Include session-expired, denied-camera, no-assigned-events and disconnected states. A web scanner, if later added, is supplementary and does not satisfy the dedicated-app requirement. [S2 pp.3–4 §4.8; S4 p.1 UC4]

Use public, account, organizer, staff, and admin web layouts with shared primitives. Users may have event-specific staff assignments; derive navigation from backend permissions rather than assuming one global `organizer_staff` role. A route guard improves navigation; the backend remains responsible for authorization. The mobile app applies the same event-level permissions through its own session adapter.

Public listing must exclude unlisted/private events according to the API contract. A share link must not bypass a private event's authorization. Organizers need a protected preview of draft events. Handle missing, inaccessible, cancelled, and unpublished events explicitly.

## 4. Implementation modules and acceptance criteria

These modules describe the frontend scope. **A**, **B** and **C** indicate implementation order for required work: foundations/free journey, paid tickets/lifecycle, and operational interfaces. F7 mobile verification, F9 support and F10 basic analytics/history/admin are required even though they land later. **Bonus** identifies conditional work, including F5 seating and F11 calendar/advanced GA4. The source's explicit MVP/bonus split in S5 §8 controls priority.

### F0 — Contracts, setup, and development workflow [A]

**Frontend lead:** Yernur Slyamshaikhov — sole owner of all F0 tasks, including wireframes, fixtures, styles/layouts, locale review, infrastructure and acceptance evidence.

**Backend dependencies:** Yernur (backend), Dos (backend), and Dima (backend); P0 foundation and P1 for real session/profile verification. P8 ticket routes inform F3's later integration.

- Agree the F0/first-integration subset using the existing `backend/docs/openapi.yaml`. Generate from the static contract, which also covers planned operations; the live specification includes implemented health, P1 authentication/profile/staff and P8 ticket routes. Source implementation and successful frontend runtime integration are separate evidence. Track readiness and transport decisions in [frontend/docs/API_CONTRACT.md](frontend/docs/API_CONTRACT.md).
- Create `frontend/web`, `frontend/mobile`, and a small shared-contract area with agreed routing, environment validation, lint/typecheck/build scripts and CI. The web/admin application and mobile verifier consume the same backend.
- Produce Figma wireframes in Weeks 1–2 for organizer creation, event detail, checkout, ticket/PDF access, mobile scanning and operational views. Define web/mobile navigation and loading/error states before parallel implementation. [S2 p.7 §6]
- Agree API/error contracts with platform-specific session/storage adapters. Verify web session recovery and a mobile authenticated request; document supported iOS/Android targets, device/build access, and the demo launch method.
- Set up Kazakh, Russian and additional English locale resources, language switching and localized money/time/error formatting. Test representative Cyrillic/Kazakh strings in the first shared components.
- Generate API types and create MSW scenarios for success, empty, validation error, forbidden, network failure, and expired session.
- For web, use `VITE_API_BASE_URL` or a same-origin `/api/v1` proxy; configure the native app's API origin separately. Client-exposed configuration contains no signing keys, provider secrets or stored credentials.

**Done when:** clean setup runs the web app and launches the mobile skeleton on both chosen platforms; reviewed wireframes/contracts/locale foundations exist; a read/mutation and platform session adapters work against mocks and available real APIs; CI validates both clients. Mocked completion is recorded separately from integrated completion.

### F1 — Shared UI, authentication, and permissions [A]

**Frontend lead:** Yernur Slyamshaikhov.

**Backend dependencies:** Yernur (backend); P0/P1.

- Build page layouts, navigation, buttons, labeled inputs, selects, error summaries, dialogs, status badges, tables/pagination, and loading/empty/error states as they are needed.
- Implement register, verify/resend verification if supported, login/logout, refresh, forgotten/reset password, and profile editing.
- Add organizer profile/onboarding with contact and payout information and permission-aware navigation. Expose email-verification state; the UC1 publication journey starts with a verified organizer. Staff assignment management lands with F7.
- Preserve a safe, same-origin return route through login. Expired links, suspended accounts, denied access, and expired sessions receive actionable messages.

**Done when:** login survives the agreed session lifecycle, logout clears user-specific cached data, inaccessible routes show the right response, and an organizer cannot view another organizer's protected resources in the integrated application.

### F2 — Public discovery and organizer event setup [A]

**Frontend lead:** Dias.

**Backend dependencies:** Dos (backend) for P2/P3; Yernur (backend) for event access.

- Build searchable/filterable event listing with category, date, city, pagination, and URL-preserved filters. Event detail shows real dates/time zone, venue, pricing, availability, and registration/refund terms.
- Build organizer event list and editor: basics, images, venue, dates/time zone, visibility, registration window, capacity, and refund policy.
- Add free/paid ticket-type editing: name, description, price, quantity, sales window, per-order limit and hidden state. Explicitly display available, reserved, sold, refunded and checked-in inventory counts.
- Add save draft, protected preview, publish/unpublish, and duplicate. Explain backend validation failures, including missing ticket types and invalid capacity. Duplication copies configuration only.
- Provide the source's create/edit/duplicate/publish/unpublish/cancel actions. Permanent event deletion is not a base requirement; preserve completed/cancelled records and transaction history. [S2 p.2 §4.2]
- Use server-mediated/presigned uploads when the upload contract is ready; handle size/type limits and failed uploads.

**Done when:** an organizer creates a valid free general-admission event, publishes it, and an attendee can find and view it. Invalid publication stays in draft with specific correction instructions.

### F3 — Free checkout, orders, and attendee tickets [A]

**Implementation evidence:** [F3_CHECKLIST.md](frontend/docs/F3_CHECKLIST.md) separates local code, real API checks, injected failure tests, mocks and pending external acceptance. In particular, P9 is still a notification stub and physical print/scan requires F7; these gates are not marked complete by frontend implementation.

**Frontend lead:** Yernur Slyamshaikhov — sole owner, including checkout's use of agreed event/ticket, seating and promotion interfaces.

**Backend dependencies:** Dos (backend) for orders/inventory; Dima (backend) for ticket issuance/QR/PDF; Yernur (backend) for notifications; P3/P5/P8/P9.

- Implement quantity selection, attendee details, order review, and a clear `Register for free` action. A free order has a zero total, no platform fee and no payment-information form; activation gates paid sales only. Display authoritative server totals. [S1 p.3 §4.4; S3 pp.3–4 §§3.1,3.3]
- Keep an order-creation idempotency key stable through retries of the same checkout attempt. Resolve uncertain outcomes before allowing a new order attempt.
- Build confirmation/status recovery, owned order history/detail, and “My tickets.” Show unique ticket ID, event/ticket type, attendee, optional seat and current valid/checked-in/cancelled/refunded status; retrieve the canonical backend QR and protected print-optimized PDF.
- Download/print the server PDF through a standard browser or PDF viewer. Check event name/date/time/venue, ticket type, attendee, optional section/row/seat, ticket ID and QR. The PDF must be legible on A4 in color/grayscale, exclude unnecessary sensitive/card data and share the digital ticket's identifier; printing must never create a second admission. [S2 p.3 §4.7; S1 p.4 §4.7]
- Handle sold-out inventory, closed sales, changed availability, validation failure, delayed issuance, and failed PDF retrieval without discarding recoverable order state.
- Confirmation remains usable when email is delayed; users can access their ticket from their account.

**Done when:** the free flow and QR/PDF access work against the real API, the registration appears in the organizer attendee list, and retries do not create duplicate orders/tickets. Print an A4 ticket in grayscale and verify its QR with the actual Event Admin app; scanning its digital copy afterwards must be rejected as already used. [S4 p.2 UC7]

### F4 — Paid-sales activation, simulated checkout, and payouts [B]

**Implementation evidence (8 November 2026):** F4 is implemented on `feat/frontend-f4`, with per-event activation, masked payout-account management, simulated paid checkout/recovery and financial/payout views. Real local P6 activation/paid-order/reload/response-loss flows passed; automated checks cover failure/retry, suspension and payout statuses. Owner accessibility/translation review and remaining cross-team acceptance are tracked separately in [F4_CHECKLIST.md](frontend/docs/F4_CHECKLIST.md).

**Frontend lead:** Yernur Slyamshaikhov — sole owner of attendee payment/status recovery and organizer activation/payout screens.

**Backend dependencies:** Dima (backend), with Yernur (backend) for suspension/settings; P6/P11.

- Add a per-event activation checklist showing missing event/paid-ticket setup, simulated identity and payout verification, payout account, terms acceptance and the one-time KZT activation-fee payment. Activation applies only to that event; do not invent a fee amount. [S3 pp.3–4 §§3.2–3.3]
- Build payout-account forms with masked stored details, simulated verification status, and payout summaries/status. Do not echo full stored sensitive details into the UI.
- Build clearly labeled simulated payment success/failure/pending flows using backend sandbox scenario controls; do not ask for real card numbers. Show activation fees, processing charges/deductions, and final totals according to the agreed fee-payer policy; add no per-ticket service fee.
- Keep paid purchasing unavailable while activation is incomplete or suspended; preserve free registration where the backend allows it.
- Reconcile payment state through the backend after redirects, refresh, and network interruption. Do not issue or mark tickets paid in browser state.

**Done when:** inactive paid sales are blocked; activation enables only the selected event; simulated payment creates tickets only after backend confirmation; pending/failure/retry and payout status screens work.

### F5 — Assigned seating and hold recovery [Bonus]

**Frontend lead:** Dias — sole owner of seating/holds and its public interface; F3 consumes that interface within its own checkout code.

**Backend dependencies:** Dos (backend), coordinating payment timing with Dima (backend); P4/P5/P6.

**Start gate:** required general-admission checkout, campaign/PDF/mobile/support flows and required reporting are stable. S5 §8 makes seating a bonus despite its detailed functional requirements; target the Week 9 bonus window only if capacity permits. Deferring this module does not fail the base MVP.

- Organizer selects a predefined venue layout and maps price categories to ticket types. No venue drawing/editor tools.
- Use React with SVG or Canvas for one agreed predefined layout. Show section/row/seat labels and price before checkout; distinguish available, selected, temporarily held, sold, unavailable and accessible seats through color plus text/symbols. Include an equivalent keyboard-usable list and promptly refreshed availability on desktop/mobile. [S2 pp.1–3 §§2,4.3.1]
- Distinguish a local selection from a server-confirmed hold. Show held seats and remaining time using server expiry information; reconcile on refresh and tab focus.
- Handle conflicting selection, expiry, release, cancellation, and abandoned/failed checkout. Refresh availability when a hold fails and preserve unrelated attendee form values where safe.
- Release on navigation as a best effort; server expiry remains authoritative. Do not assume a browser close event will execute a release request.

**Done when enabled:** two browser sessions competing for one seat show one successful reservation and a clear recovery path for the other; expired holds cannot complete checkout; purchased seat information agrees across order, ticket and PDF. Run UC8 and the seat-race check separately from base MVP acceptance.

### F6 — Refunds, cancellation, and organizer order operations [B]

**Frontend lead:** Dias — sole owner of refund/cancellation/order operations and record/cache updates through agreed interfaces.

**Backend dependencies:** Dos (backend) for order lists; Dima (backend) for refund lifecycle; Yernur (backend) for notifications/audit; P5/P7/P9/P12.

- Add organizer orders/attendee lists with search/filter/pagination and authorized CSV exports.
- Provide free-registration cancellation and full-refund actions with order identity, amount, and consequences in the confirmation dialog.
- Add event cancellation with affected-registration/refund information and backend-reported progress/results when cancellation is asynchronous.
- Render pending, completed, and failed refunds accurately; update order/ticket lists after mutations. Do not announce completion before the backend confirms it.
- Keep cancelled/completed event records readable and remove unavailable purchasing/check-in actions according to server rules.

**Done when:** completed cancellation/refund invalidates the ticket in attendee/mobile staff views, notifies the attendee and produces the backend audit entry; failures remain visible/recoverable and actions respect ownership. Basic full refunds are in the baseline; advanced refund/dispute workflows are excluded. Any emergency cut to refund simulation must be recorded as the delivery-plan contingency, not silently relabeled optional. [S1 p.5 §4.9; S4 pp.1–2 UC5; S5 pp.1–2,5]

### F7 — Dedicated Event Admin mobile app and online check-in [Required]

**Frontend lead:** Yernur Slyamshaikhov — sole owner of the native app, organizer staff-assignment web screens and cross-platform verification.

**Backend dependencies:** Yernur (backend) for assignments/permissions; Dima (backend) for check-in; P1/P15.

- Build the required React Native application for the selected current iOS and Android targets; Expo is optional. A responsive web scanner is not a replacement. Provide secure sign-in/session recovery, assigned-event selection and central API synchronization. [S2 pp.1,3–4,6; S4 p.1 UC4]
- Connect organizer per-event staff assignments to the app's permitted event list; do not give Event Admins Platform Admin capabilities.
- Build camera scanning with native permission handling, denial/retry guidance and manual attendee search/detail. Provide a manual verification/check-in action only through an authorized backend operation; searching for an attendee alone does not grant admission.
- Pause duplicate frame submission while a verification request is in flight. Show ticket/event identity and distinct accepted, already-used, invalid, refunded, cancelled, wrong-event, and campaign-QR results as supported by the agreed contract.
- Add attendee status/search, registered/checked-in totals, and authorized undo with reason/confirmation and refreshed state.
- Show connection failures as unknown results pending reconciliation. Never accept admission locally or queue offline check-ins for the base MVP. Pause/stop camera use when the screen/app is inactive and use platform-appropriate accessibility feedback.
- QR verification should normally complete within two seconds with internet. Measure request-to-result latency on both chosen platforms and distinguish a slow/disconnected request from an invalid ticket. [S2 p.4 §4.8; S1 p.8 §6]

**Done when:** the dedicated app runs and is demonstrated on the selected iOS and Android targets; secure assigned-event access, camera/manual search, counts, online synchronization and authorized undo work. The first scan succeeds once; repeated/digital-versus-paper scans and invalid/cancelled/refunded/wrong-event/Campaign QR cases are rejected. Verify camera-denied, logout/session-expiry, disconnected and normal under-two-second behavior. Document how teammates launch the app without app-store publication. [S2 p.4 §4.8; S5 pp.1–3 §§8,11]

### F8 — Promotions and campaign QR [B]

**Frontend lead:** Dias — sole owner of promotion UI/validation and its public interface; F3 consumes that interface within checkout.

**Backend dependencies:** Dima (backend), with Yernur (backend) for reporting; P16/P13.

- Build campaign creation/editing with percent/fixed discount, validity, ticket-type eligibility, redemption limit, enable/disable, generated codes, and campaign-QR download.
- Add checkout promo entry/removal and backend-calculated discount feedback. A validation preview does not guarantee redemption until the order commits.
- Scanning a Campaign QR opens the correct HTTPS event page, automatically pre-applies the associated code after server validation and preserves that context through login/checkout. Show the applied code, discount and updated total before purchase; verify the completed order/tickets/revenue are attributed to that campaign. Keep campaign QR visibly distinct from admission QR. [S2 p.5 §4.14; S4 pp.2–3 UC10]

**Done when:** valid promos affect server totals; expired/disabled/exhausted/inapplicable codes show specific messages; competing redemptions and campaign links recover correctly.

### F9 — Notifications and support cases [C]

**Frontend lead:** Dias — sole owner, including this module's use of shared permission/navigation helpers.

**Backend dependencies:** Yernur (backend); P9/P10.

- Build notifications/unread/mark-read/contextual navigation for verification, registration/purchase, payment failure, ticket delivery, event update/cancellation, refund completion, payout status and support reply/assignment/status changes. Confirmation-email integration starts with F3; the full center follows here.
- Add direct support entry points on event/order/ticket pages. Attach available user/event/order/ticket context automatically; requester selects category and writes an initial message. Support ticket delivery/payment/refund/seating/event/check-in/account/technical categories. Organizers can separately contact platform support for account/activation/payment/technical issues.
- Enforce attendee ↔ authorized organizer support staff and organizer ↔ Platform Admin audiences. Build inbox/thread, assignment and explicit Open/In Progress/Waiting for Customer/Resolved statuses; retain context/history through resolution and notify on replies/relevant changes. Preserve unsent text in memory and deduplicate by message ID. [S2 pp.4–5 §§4.10,4.13; S1 p.6 §4.13]
- Pause polling on hidden views, use bounded retry/backoff, resume on focus, and handle session expiry. Use REST polling as specified by the backend.
- Typing indicators, presence, voice messages, AI chatbots and WebSocket delivery are not required. File attachments remain an open bonus decision, not an assumed upload feature.

**Done when:** a customer and authorized responder exchange messages and update a case without page reload; unrelated users cannot read it; no duplicate messages appear after polling/retry.

### F10 — Analytics, history, and platform administration [C]

**Frontend lead:** Dias — sole owner of organizer analytics/history and platform administration.

**Backend dependencies:** Yernur (backend); P11/P12/P13.

- Build required basic analytics from authoritative aggregates: capacity/sold/remaining/percentage sold; gross/discounts/refunds/net demonstration KZT revenue; sales over time from order timestamps; ticket-type comparisons; campaign/code redemptions, attributed tickets and revenue; checked-in/absent holders/check-in percentage. Filter by event/date range/ticket type and provide accessible tabular values alongside charts. Do not add demographics or extra checkout fields to obtain these metrics. [S2 pp.5–6 §4.15; S1 p.7 §4.15]
- Group organizer events as Upcoming/Active/Completed/Cancelled. Completed/cancelled views retain permitted tickets/orders/refunds/check-ins/campaigns/support/basic analytics. The chronological activity timeline shows timestamp, actor, action type, affected entity and description, filtered by date/type. Support safe past-event duplication into a new draft without old attendees/transactions/history; keep the source records unchanged. No audit edit/delete, rollback or full field-versioning UI. [S2 p.6 §4.16; S4 p.3 UC12]
- Build admin search/detail for users/events/orders/payments; suspension and reported-event moderation; activation inspection; refund/dispute/payment-failure monitoring; escalated support and promo activity; settings/activation fees and basic operational exports. Suspending a suspicious event must stop further sales. Basic monitoring is required; advanced dispute/refund workflows are excluded. [S2 pp.4–5 §4.12; S5 pp.2–3 §§8,11]
- Reuse forms and tables. Validate fee/hold settings using agreed units/ranges and show mutation errors. Avoid inventing financial definitions or recalculating aggregate reports in the browser.

**Done when:** seeded transactions reconcile with displayed reports; organizers see only their own events; admin actions, exports, settings, and history work with real authorization and API data.

### F11 — Optional calendar and final delivery [A–C, throughout]

**Frontend lead:** Yernur Slyamshaikhov — sole owner of optional calendar, responsive/accessibility verification and final delivery. Defects in another module are returned to its owner rather than implemented as shared F11 work.

**Backend dependencies:** Dos (backend) for P14; Yernur (backend), Dos (backend), and Dima (backend) for integration/P0.

- If calendar bonus is enabled, add `.ics` download and one-click common-calendar options on the event and order-confirmation pages, also reachable from ticket detail. Preserve event time zone, venue name/address, URL and stable identity/cancellation updates; request no calendar-account write access. [S2 p.4 §4.11; S4 p.2 UC6]
- Complete web/mobile accessibility, route/deep-link/session recovery, traffic/performance checks and the verification matrix. Provide Docker-based local/demo web + API deployment instructions and a separate reproducible iOS/Android app launch procedure; app stores are not a delivery requirement.
- GA4 is optional and follows a separate agreed consent/data policy; exclude personal information and ticket/session tokens. It is not the source for operational analytics.

**Done when:** required milestones pass against the deployed demo, direct links refresh correctly, mocks are disabled, and the team can repeat the documented demo from a clean seeded environment.

## 5. Phase timeline

Keep the agreed grouped format. S5 pp.4–5 §13 provides a suggested 10–12-week academic schedule: Week 8 mobile/support, Week 9 required admin/history/basic analytics, Week 10 integration and Weeks 11–12 stabilization. Those later milestones sit under Remaining below. Prepare clients against agreed mocks as APIs are built; begin F9/F10 incrementally and reserve required integration/testing time. No calendar submission date is assumed.

| Phase | Yernur Slyamshaikhov — frontend | Dias — frontend | Phase outcome |
|---|---|---|---|
| **Weeks 1–2** | Own all F0: web/mobile clients, shared contracts/adapters, CI, Figma wireframes, styles/layouts, kk/ru/en resources, fixtures and phone-launch evidence. Define F1 interfaces. | Prepare F2's event/discovery/editor requirements, venue/ticket inputs and module-specific API questions while F0 interfaces become available. | Reviewed wireframes/contracts, shared web foundation, demonstrated mobile build/device access and deterministic mocks; stack and ownership agreed. |
| **Weeks 3–4** | F1: authentication, verification, profiles, web permissions/session recovery; integrate P1. Prepare F3 general-admission checkout/order/ticket states and native session adapter. | F2: event discovery/detail, organizer event editor, venue/uploads, preview/publish and registration windows; integrate P2. Prepare free/paid ticket-type forms. | Verified organizer can create/preview/publish an event; account and event flows are usable in Kazakh/Russian, with English locale available. |
| **Weeks 5–6** | F3 free orders/idempotency/recovery, tickets/QR and email verification. Own all F4: attendee paid checkout/status, organizer activation, payout accounts and financial views. | F2 ticket types/inventory; F6 organizer attendee/order lists. Prepare F8 campaign/promo components and F9 contextual support contracts. | **First milestone:** free registration → QR → email → organizer attendee list. **Second milestone:** activated simulated paid general-admission checkout; failure/retry and exhaustion verified. |
| **Week 7** | F3 PDF/print and checkout consumption of F8's promo interface. Prepare F7 for Week 8; own optional F11 calendar only if required work is stable. | F8 campaigns, code/Campaign QR, automatic promo UI/validation and attribution. Progress F6 basic cancellation/refunds. | Campaign scan → pre-applied promo → attributed order; printable canonical tickets. Paper-to-mobile acceptance completes with F7. |
| **Remaining** | Own F7 mobile/staff verification and all F11 cross-application checks, responsive/accessibility review, deployment/docs and demo coordination. | Own F9 support/notifications, all F10 analytics/history/admin, remaining F6 operations and conditional F5 seating. | Required journeys integrated, reviewed, tested/documented; each owner fixes their own modules and bonuses remain separate. |

### Remaining milestones from the source delivery plan

- **Week 8:** Yernur Slyamshaikhov completes all F7 mobile/staff functionality and tests invalidated/printed tickets on both platforms. Dias completes F9 support/notifications and F6 refund/cancellation integration, including those modules' own tests.
- **Week 9:** Dias completes all F10 basic administration, analytics and history/duplication. Yernur Slyamshaikhov progresses F11 delivery preparation and F7 fixes. Conditional F5 seating/advanced F10 analytics belong to Dias; optional F11 calendar belongs to Yernur Slyamshaikhov. Start bonuses only when the required flow is stable and capacity remains.
- **Week 10:** Yernur Slyamshaikhov owns F11 cross-application verification and reports defects by module; each module's sole owner implements its fixes. For a 10-week term, overlap Weeks 7–9 where capacity permits while retaining Week 10 for integration/stabilization. Drop unfinished bonuses before required acceptance.
- **Weeks 11–12:** each owner stabilizes and documents their own modules. Yernur Slyamshaikhov owns F11 usability/accessibility verification, demo preparation and contingency coordination; issues in Dias's modules return to Dias. Stop new features after Week 9 unless required for the core demonstration. [S5 pp.4–5 §§13.3–13.4]

### Integration checkpoints

- **End of Week 2:** agree API contracts and mock examples with the backend contacts, including readiness expectations for each later operation. Complete shared frontend foundations before duplicating components across modules.
- **End of Week 4:** demonstrate authentication/event publishing with available real APIs and the prepared free-checkout flow. Keep endpoint gaps visible rather than delaying all frontend work until checkout is implemented.
- **Weeks 5–6:** prove real free and simulated paid general-admission journeys, with no payment inputs/fees for free orders. Do not infer payment success or valid admission from local UI state.
- **Week 7:** integrate PDF/promotions; validate code/discount/total before purchase and campaign attribution afterwards. Prepare the mobile scan test for Week 8. Calendar must not displace required work.
- **Remaining:** verify dedicated mobile check-in/support in Week 8, required basic analytics/history/admin in Week 9, then cross-application tests and delivery. Run all required use cases and success criteria before declaring completion.

Yernur Slyamshaikhov and Dias review dependencies with backend contacts at each phase start. Agree P15 readiness for mobile Week 8 and P9–P13 readiness for support/reporting in Weeks 8–9; PDF extracts provide the delivery baseline where CLAUDE.md is abbreviated. If an endpoint is late, continue client development against contract-aligned mocks and record the task as **mocked**, with its frontend owner and unresolved dependency. A phase ending does not make integration complete.

**Scope control if behind:** S5 p.5 §13.4 orders cuts as assigned seating, calendar, advanced analytics, localization polish and refund simulation before cutting the core journey. Preserve baseline Kazakh/Russian support and required basic analytics; they are not the optional polish/advanced analytics. Basic refunds are listed as required in S5 §8, so reducing refund simulation is an explicit contingency requiring a documented team scope decision. Do not substitute a web scanner for the required mobile app or count unimplemented required work as complete.

Work in module-specific PRs such as `feat/frontend-free-checkout`. The sole module owner implements/tests/documents all of its work; peer review does not split implementation. Track **contract agreed → UI with mocks → API integrated → acceptance verified**. F0 shared code is maintained by its owner; other owners request interface changes and consume the published result. A mock-only demonstration does not complete an integration milestone.

## 6. API contracts to agree before dependent work

The backend static `backend/docs/openapi.yaml` contract now contains 102 operations across 88 paths. Health, P1 authentication/profile/staff and P8 ticket/QR/PDF routes are implemented in source; other planned feature routers remain separate dependencies. F0's generated types are synchronized with this contract. Runtime checks remain pending because the local Docker engine has not started successfully. Readiness and remaining auth decisions are recorded in the handoff document. The contact column identifies backend API owners; frontend ownership is defined above.

| Contract | Backend API contact(s) | Required decision / response |
|---|---|---|
| General API | Yernur (backend), Dos (backend), Dima (backend) | Exact `/api/v1` methods/paths; IDs/enums/nullability; pagination, sorting and filters; `{code, message, details}` and field-validation format; conflict/rate-limit behavior; request IDs |
| Session | Yernur (backend) | Web and native login/refresh/logout transports, refresh rotation/revocation, secure native storage, `/me` capabilities, verification/reset links, return routes and web CORS/CSRF behavior |
| Permissions | Yernur (backend) | Global roles versus event assignments; discoverable staff events and allowed event actions; suspended-account behavior; account-required versus guest purchase |
| Events/uploads | Dos (backend), Yernur (backend) | Public/unlisted/private access, draft preview, physical venue/time-zone data, states/history classifications, upload initiation/completion and limits, image URLs; layout data only for the seating bonus |
| Checkout | Dos (backend), Dima (backend) | Quote/validation strategy, server totals, order-create idempotency header/body and scope, same-key payload mismatch, order retrieval/status, expiry and safe retry rules |
| Seat holds | Dos (backend) | Hold ownership/token, seat identifiers/statuses, `expires_at` and clock reference, release/lookup/recovery operations, order attachment, and expiry/payment race rules |
| Payments/activation | Dima (backend), Yernur (backend) | Simulation actions, status polling, retry/new-intent rules, fee payer/units/rounding, activation checklist/actions, suspension and payout-account/status shapes |
| Tickets/downloads | Dima (backend) | Protected ticket detail, QR image/payload, PDF retrieval and content type, signed URL lifetime if used, issuance status, allowed visibility and cancelled/refunded states |
| Refunds/cancellation | Dima (backend), Dos (backend) | Full-order scope, eligibility, cancellation versus refund semantics, pending/failure outcomes, bulk cancellation progress, and retry safety |
| Check-in | Dima (backend), Yernur (backend) | Native assigned-event access, verify input/results and whether verify consumes admission, manual attendee search/check-in, central stats, uncertain-result reconciliation and authorized undo; normal online result within two seconds |
| Promotions | Dima (backend) | Percent/fixed units, server quote/redemption timing, campaign redirect destination, token propagation, validation errors, and reporting fields |
| Notifications/support | Yernur (backend) | Mark-read operations; allowed case relationships, assignment/status transitions, polling cursor/order, message IDs, duplicate-send handling |
| Reports/admin | Yernur (backend) | Exact required metrics/filters, past-event classifications/retained records, timeline fields, export authorization, settings units/ranges, basic disputes/failures monitoring and suspension stopping sales |
| Calendar | Dos (backend) | `.ics` access/download and event cancellation/update behavior |

Current **P1** session transport returns access and refresh tokens in JSON and uses bearer authorization. F0's web adapter keeps tokens in memory; its native adapter keeps access in memory and persists only refresh credentials in SecureStore. A Secure/HttpOnly web-refresh cookie remains a proposal requiring an explicit backend change and CSRF/CORS review. P1 rotates refresh tokens and treats reuse of a rotated token as theft, revoking the user's sessions; dependent session code must coordinate refresh requests and avoid automatic refresh retries. F0's JSON client performs neither implicit refresh nor mutation retries. Do not persist credentials in web local storage or plain mobile app storage.

For development and demo, prefer a same-origin frontend/API deployment with a reverse proxy. If separate origins are required, agree exact allowed origins, credential handling, cookie attributes, and HTTPS before implementing session recovery.

Resolve implementation ambiguities before encoding assumptions: integer tiyn versus decimal amounts; Event Admin/support capabilities; fee payer; sandbox/scenario method; activation fee amount/refundability; verification and payout delay/reserve policy; account-required versus guest ticket access; cancellation/refund eligibility and audit retention. Full refunds are the documented baseline, not an automatic partial-refund UI because an example enum mentions partial refunds. Currency arithmetic, inventory locking, signatures and authorization remain server responsibilities.

Additional open choices from S2 p.7 and S5 p.3 §12: demonstration seating layout (if enabled), support attachments (bonus), initial promo limits/report fields, dashboard default date ranges/chart formats, and target iOS/Android versions/devices/build access. Choose a default UI locale and review translations; Kazakh/Russian support itself is already required. Record the choices with the named module owner in F0 and revisit only when product scope changes.

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
| Session expiry | Attempt one coordinated refresh through the correct web/native adapter; avoid refresh loops. On failure prompt sign-in, clear private cached data/credentials as appropriate, and recover owned order/event state through the API. |
| Refund/check-in/change | Invalidate related ticket, order, inventory, attendee, and report queries. QR views recheck validity on focus; the scanner always asks the backend, even when a screenshot still shows an old QR. |
| Failed network | Keep recoverable form input, show an explicit retry, cancel obsolete searches, and prevent older responses from overwriting newer selections. Never announce a successful check-in on an unknown result. |

## 8. UI, accessibility, and responsive requirements

**Figma implementation gate:** the 43 editable Figma screens and their structure, gold university logo, burgundy palette and DM Sans are explorations, not an approved implementation specification. Keep the current functional frontend in its restrained technical styling. Do not copy Figma screens, layouts, assets or branding into web/mobile code until Yernur Slyamshaikhov explicitly approves the design for implementation and requests that work. A later approved design pass can update presentation while retaining the required functionality, API contracts, permissions and acceptance checks. Functional module work does not constitute Figma approval.

- Prioritize mobile event discovery, checkout, tickets, and scanning; organizer/admin work must remain usable on narrow screens. Use content-driven layouts, labeled summary rows, and scrollable or adapted tables rather than clipping actions.
- Use semantic landmarks/headings, visible labels, keyboard access, visible focus, accessible dialogs and sufficient contrast. Event pages must meet the source WCAG 2.1 AA baseline; WCAG 2.2 AA is a proposed stronger implementation target, not a substituted source requirement. Verify rendered pages and native screen-reader labels/focus on chosen devices. [S2 p.6 §5]
- Deliver customer-facing Kazakh/Russian plus additional English locale resources, language selection, localized validation/error states and KZT/date/time formatting. Test real translated text at narrow widths; avoid hardcoded English in shared controls and checkout. Agree the mobile/admin default locale and coverage with the team while preserving the required customer-facing language baseline.
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
  web/
    package.json
    src/
      app/               # browser router, providers, layouts, route errors
      api/               # web client and cookie/session adapter
      features/
        auth/            # account, profiles, verification and recovery
        events/          # discovery, organizer editing and ticket types
        checkout/        # selections, order creation/status and payments
        tickets/         # canonical QR/PDF display and downloads
        orders/          # attendee/organizer operations and refunds
        seating/         # bonus map/list and holds, only when enabled
        promotions/
        notifications/
        support/
        organizer/       # staff assignment, payouts, analytics, history
        admin/
      components/ui/     # accessible web primitives
      styles/            # Tailwind setup and shared web tokens
      locales/           # kk, ru and en resources
      mocks/             # browser/Node contract scenarios
    e2e/                 # web browser journeys
  mobile/
    package.json
    src/
      app/               # native navigation and providers
      api/               # native session/secure-storage adapter
      screens/           # sign-in, events, scanner/results, search, undo
      components/        # accessible native controls
      locales/
    tests/               # mobile interactions and device test instructions
  shared/
    package.json
    contracts/           # generated OpenAPI types; pure TypeScript only
    lib/                 # shared money/time/permission helpers where suitable
```

The root `package.json`/lockfile can manage these as npm workspaces; confirm this in F0. There are two applications, `web/` and `mobile/`, plus pure shared contracts/helpers. Keep endpoint functions/query keys near their feature and transport/session differences in adapters. Co-locate meaningful tests, and do not force web DOM components or Tailwind CSS into native screens. Create folders only when their feature begins.

## 10. Verification and definition of done

Test behavior with controlled fixtures before API availability, then repeat the critical journeys against seeded PostgreSQL-backed services. Mock tests do not prove inventory concurrency, payment idempotency, or authorization; those require backend tests and real integration exercises.

| Check | Expected result |
|---|---|
| Free journey | Organizer publishes a free event; attendee registers once; account shows matching order, ticket/QR/PDF; backend mail service receives confirmation. |
| Paid journey | Inactive sales blocked; selected event activated; simulated success issues tickets after confirmation; failure/pending/refresh recover correctly. |
| Race/recovery | Required: last general-admission inventory, competing limited promo redemptions and uncertain order retries recover without duplicate purchases. If seating bonus is enabled, additionally verify the one-seat race/hold expiry. |
| Cancellation/refund | Free cancellation and full paid refund update records; invalidated tickets fail admission; pending/failed refund is not reported as complete. |
| Check-in | On dedicated iOS/Android clients, assigned-event scan normally returns within two seconds online; valid ticket accepted once, used/refunded/cancelled/wrong-event/Campaign QR rejected, undo authorized, counts synchronized, camera denial/manual search/network failures handled. |
| Roles/privacy | Attendee, organizer A/B, assigned staff, and admin scenarios verify direct-link/API denial and absence of private cached data after logout/account change. |
| Support/operations | Permitted parties exchange a case thread; unread/read changes work; event history, admin settings/actions/exports, and analytics match seeded records. |
| Form/data edges/locales | Kazakh and Russian journeys plus additional English, long names, empty data, missing images, invalid fields/uploads, event/device time-zone differences and money boundaries render/format correctly. |
| Accessibility/responsive | Keyboard-only journey, focus/error handling, seat-list alternative, contrast, zoom/reflow, and phone/tablet/desktop views are manually checked. |
| Deployment | Docker-based web/API demo supports direct-route refresh, email/campaign links, proxy/session and protected downloads with mocks disabled. Dedicated mobile app launch, native camera permissions/secure API/session and selected iOS/Android device access are reproducible without store publication. |

### Use-case traceability and acceptance

All twelve S4 use cases remain mapped below. UC6 and UC8 are conditional bonuses according to S5 §8; the others form required acceptance coverage. Admin suspension, localization, mobile latency and security checks above supplement the twelve examples.

| Use case / S4 page | Modules | Required proof, or bonus condition |
|---|---|---|
| UC1 — free event, p.1 | F1/F2/F3/F6 | Verified organizer enters details/free type, previews and publishes; attendee registers without payment or fees and appears in the attendee list. |
| UC2 — activation, p.1 | F4 | Draft event with a paid type completes simulated verification, payout account, one-time fee and terms; only that event becomes eligible for paid checkout. |
| UC3 — paid ticket, p.1 | F3/F4 | Active event with inventory accepts attendee details and simulated payment; confirmation creates the order/QR ticket, failure creates no valid ticket. |
| UC4 — mobile admission, p.1 | F7 | Signed-in Event Admin selects an assigned event in the dedicated app; first scan records admission, second rejects; authorized reversal allows subsequent valid admission. |
| UC5 — refund, pp.1–2 | F6/F7/F9 | Eligible order is selected and full refund confirmed; backend invalidates the ticket, notifies the attendee and the mobile app denies entry. |
| UC6 — calendar, p.2 | F11 (bonus) | If enabled, event/confirmation/ticket offers common-calendar link or `.ics` with correct event zone, venue/address and URL, without calendar write access. |
| UC7 — print, p.2 | F3/F7 | Download canonical A4 PDF and print color/grayscale; mobile app scans paper successfully and rejects a second admission through its digital copy. |
| UC8 — assigned seat, p.2 | F5/F3 (bonus) | If enabled, show seat status/price, hold selected seat and finish before expiry; purchased seat is linked to order/ticket and unavailable to another buyer. |
| UC9 — support, p.2 | F9 | From event/order/ticket, create categorized case with retained context; authorized organizer staff replies asynchronously and progresses status through resolution. |
| UC10 — Campaign QR, pp.2–3 | F8/F3/F4/F10 | Scan opens correct event with validated promo pre-applied; visible code/discount/total agrees with order and attribution; admission app rejects the promotional QR. |
| UC11 — basic analytics, p.3 | F10 | Managed-event date/type filters produce correct capacity, sales, revenue, campaign and attendance metrics from canonical records, with no additional attendee/demographic checkout fields. |
| UC12 — history/reuse, p.3 | F2/F10 | Open completed/cancelled event and authorized timeline/retained records, duplicate to new draft without attendees/transactions; historical data remains unchanged. |

Automated API, interface, payment and QR-validation checks are required by S2 p.1 §2. Backend owners implement service/API tests; each frontend student implements their assigned interface tests and participates in integrated payment/QR cases. Automate risky money/time/form transformations and checkout/recovery/permissions behavior, plus principal browser journeys. Test native app interactions and actual camera/printed-ticket behavior on chosen iOS/Android devices; a browser test alone does not validate the mobile deliverable.

Per feature, done means its agreed contract exists, required states/locales render, real API integration is reviewed, permission/error checks and appropriate tests pass, and usage/demo instructions are documented. CI validates web and mobile types/tests and the web production build; run browser smoke flows and native device acceptance against a controlled backend. Track base features and bonuses separately; a mocked or missing base use case is not counted as passing. [S5 p.5 §13.4]

Load heavy organizer/admin/chart/scanner code only when its route needs it, size event images appropriately, and avoid sequential fetches for independent page data. Pause unnecessary polling. Measure page behavior on representative mobile hardware/network before setting performance budgets with the team.

## 11. First work session

1. **Yernur Slyamshaikhov (F0):** record stack/scope/language foundations, sole module ownership, interfaces and grouped milestones, including Remaining.
2. **Yernur Slyamshaikhov (F0):** coordinate foundational API/auth/error/fixture contracts with backend contacts, prepare all Figma wireframes/styles/locales/MSW fixtures, scaffold clients/shared types and prove device/build access.
3. **Yernur Slyamshaikhov:** implement F1/F3/F4/F7/F11 and arrange their backend integration/acceptance. Activation and payout screens are included in F4; calendar and final QA are included in F11.
4. **Dias:** implement F2/F5/F6/F8/F9/F10 and arrange their module-specific API/acceptance work. F10 includes all admin screens as well as analytics/history; F5 remains conditional bonus scope.
5. **Each module owner:** consume agreed shared interfaces, request changes from the owner of the dependency, and update that module's evidence. Do not divide a module's implementation between the two frontend students.

## References

The supplied SRS v0.3 PDFs S1–S5 are identified in the source table at the top; requirements/acceptance references use their printed page numbers and original section/UC labels. The originals were reviewed from the supplied local files and have not been copied into the repository. Keep a shared team copy so Dias can access the same baseline.

- Backend implementation mapping (P0–P16): [CLAUDE.md](CLAUDE.md). Where it differs from the supplied PDFs, follow the source/scope reconciliation above and coordinate the affected backend contracts; this task updates the frontend plan only.
- SPA build/routing/data-fetching tradeoffs: [React — build from scratch](https://react.dev/learn/build-a-react-app-from-scratch), [Vite guide](https://vite.dev/guide/), [React Router routing](https://reactrouter.com/start/declarative/routing).
- Server state and forms: [TanStack Query overview](https://tanstack.com/query/latest/docs/framework/react/overview), [React Hook Form](https://react-hook-form.com/get-started), [Zod](https://zod.dev/).
- Contract types and mocks: [OpenAPI TypeScript](https://openapi-ts.dev/introduction), [MSW documentation](https://mswjs.io/docs/).
- Verification: [Vitest guide](https://vitest.dev/guide/), [Playwright introduction](https://playwright.dev/docs/intro).
- Camera secure-context/permission requirements: [MDN — getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).
