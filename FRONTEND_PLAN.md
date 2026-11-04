# BiletFlow Frontend — Implementation Plan

**Status:** frontend implementation plan for Yernur Slyamshaikhov and Dias. No frontend is implemented yet.

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

**Schedule:** Weeks 1–2, Weeks 3–4, Weeks 5–6, Week 7, and Remaining. Remaining contains the source delivery plan's Weeks 8–12 milestones. The frontend framework remains undecided; the proposed stack below follows the PDF recommendations and adds Vite for the web build.

## 1. Goal and working assumptions

Build three interfaces: a responsive organizer/attendee web application, an administrative web portal, and a dedicated iOS/Android ticket-verification app for Event Admins. An Event Admin is organizer-authorized check-in staff; a Platform Admin moderates the platform. These roles are distinct. Events are physical and venue-based. [S2 pp.1–2; S3 pp.1–3]

The frontend plan is needed because these users share authentication, permissions, event state, checkout state, money, and API contracts. Deliver complete user journeys in small increments so each increment can be demonstrated with the backend.

Working assumptions, to revisit when the team agrees otherwise:

- Yernur Slyamshaikhov and Dias implement the frontend in parallel. Backend integration is coordinated with Yernur (backend), Dos (backend), and Dima (backend).
- React + TypeScript for web and React Native + TypeScript for the Event Admin app follow the source recommendations. Confirm web build tooling, optional Expo, and target-device access in Weeks 1–2.
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

Each module has a frontend lead. Where a module spans attendee and organizer/admin screens, the split below identifies who implements each area. Both students review each other's PRs and test their own modules.

| Module | Frontend lead | Work split |
|---|---|---|
| F0 — Foundation/contracts | Yernur Slyamshaikhov | Yernur Slyamshaikhov: web/mobile setup, shared API types, separate session adapters, CI and iOS/Android launch proof. Dias: Figma wireframes, fixtures, shared web styling/layouts and locale resources. |
| F1 — Shared UI/authentication | Yernur Slyamshaikhov | Authentication, session, profiles, permissions, and reusable UI; Dias reviews and reuses the shared forms/layouts. |
| F2 — Discovery/event setup | Dias | Public event discovery/detail, organizer event/ticket editors, publishing, and uploads; Yernur Slyamshaikhov connects session/access helpers. |
| F3 — Checkout/orders/tickets | Yernur Slyamshaikhov | Attendee checkout, order recovery/history, QR/PDF tickets; Dias connects event/ticket selection data from F2. |
| F4 — Payments/activation/payouts | Yernur Slyamshaikhov | Yernur Slyamshaikhov: attendee simulated payment and status recovery. Dias: organizer activation checklist, payout accounts, and financial/payout views. |
| F5 — Seating/holds (bonus) | Dias | If core is stable: layout/category configuration, seat map/list, hold lifecycle; Yernur Slyamshaikhov connects holds to checkout/recovery. |
| F6 — Refunds/organizer orders | Dias | Organizer orders/attendee lists, exports, cancellation and refund controls; Yernur Slyamshaikhov connects resulting attendee order/ticket state changes. |
| F7 — Event Admin mobile app/check-in | Yernur Slyamshaikhov | React Native iOS/Android app, mobile session, assigned events, camera/manual search, counts and undo. Dias connects organizer staff-assignment screens and assists device acceptance tests. |
| F8 — Promotions | Dias | Campaign management, codes/QR, links and reporting fields; Yernur Slyamshaikhov connects validation/discount feedback to checkout. |
| F9 — Notifications/support | Dias | Notification center, attendee/organizer support, staff/admin case inbox and polling; Yernur Slyamshaikhov connects shared permissions and navigation. |
| F10 — Analytics/history/admin | Dias | Dias: organizer analytics and event history. Yernur Slyamshaikhov: platform admin screens, settings, moderation, and operational exports. |
| F11 — Calendar/final delivery | Yernur Slyamshaikhov | Yernur Slyamshaikhov: deployment, run instructions and integrated smoke checks. Dias: optional calendar, responsive/accessibility review. Both fix and verify their assigned screens. |

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
| Tooling | npm lockfile, ESLint, formatting, supported Node.js LTS | Reproducible local development and CI |

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

**Frontend lead:** Yernur Slyamshaikhov for web/mobile infrastructure; Dias owns wireframes, mock fixtures, locale resources and the shared web styling/layout foundation.

**Backend dependencies:** Yernur (backend), Dos (backend), and Dima (backend); P0.

- Agree the F0/first-integration subset of section 6 first. Record exact API paths and examples in the backend OpenAPI document, which is planned but not yet present. Settle later-feature contracts when needed.
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

**Frontend lead:** Yernur Slyamshaikhov; Dias connects event/ticket selection from F2.

**Backend dependencies:** Dos (backend) for orders/inventory; Dima (backend) for ticket issuance/QR/PDF; Yernur (backend) for notifications; P3/P5/P8/P9.

- Implement quantity selection, attendee details, order review, and a clear `Register for free` action. A free order has a zero total, no platform fee and no payment-information form; activation gates paid sales only. Display authoritative server totals. [S1 p.3 §4.4; S3 pp.3–4 §§3.1,3.3]
- Keep an order-creation idempotency key stable through retries of the same checkout attempt. Resolve uncertain outcomes before allowing a new order attempt.
- Build confirmation/status recovery, owned order history/detail, and “My tickets.” Show unique ticket ID, event/ticket type, attendee, optional seat and current valid/checked-in/cancelled/refunded status; retrieve the canonical backend QR and protected print-optimized PDF.
- Download/print the server PDF through a standard browser or PDF viewer. Check event name/date/time/venue, ticket type, attendee, optional section/row/seat, ticket ID and QR. The PDF must be legible on A4 in color/grayscale, exclude unnecessary sensitive/card data and share the digital ticket's identifier; printing must never create a second admission. [S2 p.3 §4.7; S1 p.4 §4.7]
- Handle sold-out inventory, closed sales, changed availability, validation failure, delayed issuance, and failed PDF retrieval without discarding recoverable order state.
- Confirmation remains usable when email is delayed; users can access their ticket from their account.

**Done when:** the free flow and QR/PDF access work against the real API, the registration appears in the organizer attendee list, and retries do not create duplicate orders/tickets. Print an A4 ticket in grayscale and verify its QR with the actual Event Admin app; scanning its digital copy afterwards must be rejected as already used. [S4 p.2 UC7]

### F4 — Paid-sales activation, simulated checkout, and payouts [B]

**Frontend lead:** Yernur Slyamshaikhov for attendee payment/status recovery. Dias owns organizer activation and payout screens.

**Backend dependencies:** Dima (backend), with Yernur (backend) for suspension/settings; P6/P11.

- Add a per-event activation checklist showing missing event/paid-ticket setup, simulated identity and payout verification, payout account, terms acceptance and the one-time KZT activation-fee payment. Activation applies only to that event; do not invent a fee amount. [S3 pp.3–4 §§3.2–3.3]
- Build payout-account forms with masked stored details, simulated verification status, and payout summaries/status. Do not echo full stored sensitive details into the UI.
- Build clearly labeled simulated payment success/failure/pending flows using backend sandbox scenario controls; do not ask for real card numbers. Show activation fees, processing charges/deductions, and final totals according to the agreed fee-payer policy; add no per-ticket service fee.
- Keep paid purchasing unavailable while activation is incomplete or suspended; preserve free registration where the backend allows it.
- Reconcile payment state through the backend after redirects, refresh, and network interruption. Do not issue or mark tickets paid in browser state.

**Done when:** inactive paid sales are blocked; activation enables only the selected event; simulated payment creates tickets only after backend confirmation; pending/failure/retry and payout status screens work.

### F5 — Assigned seating and hold recovery [Bonus]

**Frontend lead:** Dias; Yernur Slyamshaikhov connects holds to checkout/recovery.

**Backend dependencies:** Dos (backend), coordinating payment timing with Dima (backend); P4/P5/P6.

**Start gate:** required general-admission checkout, campaign/PDF/mobile/support flows and required reporting are stable. S5 §8 makes seating a bonus despite its detailed functional requirements; target the Week 9 bonus window only if capacity permits. Deferring this module does not fail the base MVP.

- Organizer selects a predefined venue layout and maps price categories to ticket types. No venue drawing/editor tools.
- Use React with SVG or Canvas for one agreed predefined layout. Show section/row/seat labels and price before checkout; distinguish available, selected, temporarily held, sold, unavailable and accessible seats through color plus text/symbols. Include an equivalent keyboard-usable list and promptly refreshed availability on desktop/mobile. [S2 pp.1–3 §§2,4.3.1]
- Distinguish a local selection from a server-confirmed hold. Show held seats and remaining time using server expiry information; reconcile on refresh and tab focus.
- Handle conflicting selection, expiry, release, cancellation, and abandoned/failed checkout. Refresh availability when a hold fails and preserve unrelated attendee form values where safe.
- Release on navigation as a best effort; server expiry remains authoritative. Do not assume a browser close event will execute a release request.

**Done when enabled:** two browser sessions competing for one seat show one successful reservation and a clear recovery path for the other; expired holds cannot complete checkout; purchased seat information agrees across order, ticket and PDF. Run UC8 and the seat-race check separately from base MVP acceptance.

### F6 — Refunds, cancellation, and organizer order operations [B]

**Frontend lead:** Dias; Yernur Slyamshaikhov connects attendee order/ticket state updates.

**Backend dependencies:** Dos (backend) for order lists; Dima (backend) for refund lifecycle; Yernur (backend) for notifications/audit; P5/P7/P9/P12.

- Add organizer orders/attendee lists with search/filter/pagination and authorized CSV exports.
- Provide free-registration cancellation and full-refund actions with order identity, amount, and consequences in the confirmation dialog.
- Add event cancellation with affected-registration/refund information and backend-reported progress/results when cancellation is asynchronous.
- Render pending, completed, and failed refunds accurately; update order/ticket lists after mutations. Do not announce completion before the backend confirms it.
- Keep cancelled/completed event records readable and remove unavailable purchasing/check-in actions according to server rules.

**Done when:** completed cancellation/refund invalidates the ticket in attendee/mobile staff views, notifies the attendee and produces the backend audit entry; failures remain visible/recoverable and actions respect ownership. Basic full refunds are in the baseline; advanced refund/dispute workflows are excluded. Any emergency cut to refund simulation must be recorded as the delivery-plan contingency, not silently relabeled optional. [S1 p.5 §4.9; S4 pp.1–2 UC5; S5 pp.1–2,5]

### F7 — Dedicated Event Admin mobile app and online check-in [Required]

**Frontend lead:** Yernur Slyamshaikhov for the React Native app. Dias connects organizer staff-assignment web screens and assists cross-platform device verification.

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

**Frontend lead:** Dias; Yernur Slyamshaikhov connects promotion validation to checkout.

**Backend dependencies:** Dima (backend), with Yernur (backend) for reporting; P16/P13.

- Build campaign creation/editing with percent/fixed discount, validity, ticket-type eligibility, redemption limit, enable/disable, generated codes, and campaign-QR download.
- Add checkout promo entry/removal and backend-calculated discount feedback. A validation preview does not guarantee redemption until the order commits.
- Scanning a Campaign QR opens the correct HTTPS event page, automatically pre-applies the associated code after server validation and preserves that context through login/checkout. Show the applied code, discount and updated total before purchase; verify the completed order/tickets/revenue are attributed to that campaign. Keep campaign QR visibly distinct from admission QR. [S2 p.5 §4.14; S4 pp.2–3 UC10]

**Done when:** valid promos affect server totals; expired/disabled/exhausted/inapplicable codes show specific messages; competing redemptions and campaign links recover correctly.

### F9 — Notifications and support cases [C]

**Frontend lead:** Dias; Yernur Slyamshaikhov connects shared permissions/navigation.

**Backend dependencies:** Yernur (backend); P9/P10.

- Build notifications/unread/mark-read/contextual navigation for verification, registration/purchase, payment failure, ticket delivery, event update/cancellation, refund completion, payout status and support reply/assignment/status changes. Confirmation-email integration starts with F3; the full center follows here.
- Add direct support entry points on event/order/ticket pages. Attach available user/event/order/ticket context automatically; requester selects category and writes an initial message. Support ticket delivery/payment/refund/seating/event/check-in/account/technical categories. Organizers can separately contact platform support for account/activation/payment/technical issues.
- Enforce attendee ↔ authorized organizer support staff and organizer ↔ Platform Admin audiences. Build inbox/thread, assignment and explicit Open/In Progress/Waiting for Customer/Resolved statuses; retain context/history through resolution and notify on replies/relevant changes. Preserve unsent text in memory and deduplicate by message ID. [S2 pp.4–5 §§4.10,4.13; S1 p.6 §4.13]
- Pause polling on hidden views, use bounded retry/backoff, resume on focus, and handle session expiry. Use REST polling as specified by the backend.
- Typing indicators, presence, voice messages, AI chatbots and WebSocket delivery are not required. File attachments remain an open bonus decision, not an assumed upload feature.

**Done when:** a customer and authorized responder exchange messages and update a case without page reload; unrelated users cannot read it; no duplicate messages appear after polling/retry.

### F10 — Analytics, history, and platform administration [C]

**Frontend lead:** Dias for organizer analytics/history. Yernur Slyamshaikhov owns platform administration.

**Backend dependencies:** Yernur (backend); P11/P12/P13.

- Build required basic analytics from authoritative aggregates: capacity/sold/remaining/percentage sold; gross/discounts/refunds/net demonstration KZT revenue; sales over time from order timestamps; ticket-type comparisons; campaign/code redemptions, attributed tickets and revenue; checked-in/absent holders/check-in percentage. Filter by event/date range/ticket type and provide accessible tabular values alongside charts. Do not add demographics or extra checkout fields to obtain these metrics. [S2 pp.5–6 §4.15; S1 p.7 §4.15]
- Group organizer events as Upcoming/Active/Completed/Cancelled. Completed/cancelled views retain permitted tickets/orders/refunds/check-ins/campaigns/support/basic analytics. The chronological activity timeline shows timestamp, actor, action type, affected entity and description, filtered by date/type. Support safe past-event duplication into a new draft without old attendees/transactions/history; keep the source records unchanged. No audit edit/delete, rollback or full field-versioning UI. [S2 p.6 §4.16; S4 p.3 UC12]
- Build admin search/detail for users/events/orders/payments; suspension and reported-event moderation; activation inspection; refund/dispute/payment-failure monitoring; escalated support and promo activity; settings/activation fees and basic operational exports. Suspending a suspicious event must stop further sales. Basic monitoring is required; advanced dispute/refund workflows are excluded. [S2 pp.4–5 §4.12; S5 pp.2–3 §§8,11]
- Reuse forms and tables. Validate fee/hold settings using agreed units/ranges and show mutation errors. Avoid inventing financial definitions or recalculating aggregate reports in the browser.

**Done when:** seeded transactions reconcile with displayed reports; organizers see only their own events; admin actions, exports, settings, and history work with real authorization and API data.

### F11 — Optional calendar and final delivery [A–C, throughout]

**Frontend lead:** Yernur Slyamshaikhov for deployment/integration checks. Dias owns optional calendar and the responsive/accessibility review; both students fix their own modules.

**Backend dependencies:** Dos (backend) for P14; Yernur (backend), Dos (backend), and Dima (backend) for integration/P0.

- If calendar bonus is enabled, add `.ics` download and one-click common-calendar options on the event and order-confirmation pages, also reachable from ticket detail. Preserve event time zone, venue name/address, URL and stable identity/cancellation updates; request no calendar-account write access. [S2 p.4 §4.11; S4 p.2 UC6]
- Complete web/mobile accessibility, route/deep-link/session recovery, traffic/performance checks and the verification matrix. Provide Docker-based local/demo web + API deployment instructions and a separate reproducible iOS/Android app launch procedure; app stores are not a delivery requirement.
- GA4 is optional and follows a separate agreed consent/data policy; exclude personal information and ticket/session tokens. It is not the source for operational analytics.

**Done when:** required milestones pass against the deployed demo, direct links refresh correctly, mocks are disabled, and the team can repeat the documented demo from a clean seeded environment.

## 5. Phase timeline

Keep the agreed grouped format. S5 pp.4–5 §13 provides a suggested 10–12-week academic schedule: Week 8 mobile/support, Week 9 required admin/history/basic analytics, Week 10 integration and Weeks 11–12 stabilization. Those later milestones sit under Remaining below. Prepare clients against agreed mocks as APIs are built; begin F9/F10 incrementally and reserve required integration/testing time. No calendar submission date is assumed.

| Phase | Yernur Slyamshaikhov — frontend | Dias — frontend | Phase outcome |
|---|---|---|---|
| **Weeks 1–2** | F0: scaffold web/mobile clients, shared API types, web/mobile session contracts and CI. Prove the mobile skeleton launches on selected iOS/Android targets. Define F1 shared interfaces. | F0: Figma wireframes for web/admin/mobile journeys, shared web styles/layouts, Kazakh/Russian/English resources and fixtures. Review event/venue/ticket contracts. | Reviewed wireframes/contracts, shared web foundation, demonstrated mobile build/device access and deterministic mocks; stack and ownership agreed. |
| **Weeks 3–4** | F1: authentication, verification, profiles, web permissions/session recovery; integrate P1. Prepare F3 general-admission checkout/order/ticket states and native session adapter. | F2: event discovery/detail, organizer event editor, venue/uploads, preview/publish and registration windows; integrate P2. Prepare free/paid ticket-type forms. | Verified organizer can create/preview/publish an event; account and event flows are usable in Kazakh/Russian, with English locale available. |
| **Weeks 5–6** | F3: integrate free orders/idempotency/recovery, account tickets and QR; verify email delivery. F4: attendee simulated paid checkout, authoritative totals and payment/status recovery. | F2: ticket types/inventory. F4: per-event activation/payout screens. F6: organizer attendee/order lists. Prepare F8 campaign forms and F9 contextual support contracts. | **First milestone:** free registration → QR → email → organizer attendee list. **Second milestone:** activated simulated paid general-admission checkout; payment failure/retry and inventory exhaustion are verified. No seating bonus gate. |
| **Week 7** | F3: PDF download/print flow, canonical identifier and A4/grayscale review. Connect F8 automatic promo application/discount display to checkout. Prepare F7 mobile screen/session/camera contracts for Week 8. | F8: campaigns, generated code/Campaign QR, validation and attribution. Progress F6 basic cancellation/refunds; add F11 calendar only if required work is stable. | Campaign scan → pre-applied promo → simulated order attribution; downloadable printable canonical tickets. Paper-to-mobile scan acceptance completes when F7 lands. |
| **Remaining** | F7 mobile verification, F10 platform admin and F11 cross-application integration, automated checks, deployment/docs and demo rehearsal, following the milestones below. | F9 support/notifications, F10 required analytics/history, remaining F6 lifecycle checks and F11 responsive/localization/accessibility review. F5 seating only through the bonus gate. | Required web/admin/mobile journeys are integrated, reviewed, tested and documented; bonuses are recorded separately from base acceptance. |

### Remaining milestones from the source delivery plan

- **Week 8:** Yernur Slyamshaikhov completes F7 React Native online verification on both selected platforms: assigned events, camera, manual search, check-in/undo, counts and synchronization. Dias completes F9 asynchronous support and notifications and remaining F6 basic refund/cancellation integration. Together verify invalidated and printed tickets using the mobile app.
- **Week 9:** Yernur Slyamshaikhov completes F10 basic administration/moderation. Dias completes F10 required analytics and organizer history, including past-event duplication. Start F5 assigned seating or advanced GA4 only if the entire required flow is stable and capacity remains; calendar is also bonus scope. Choose one manageable bonus rather than committing to all of them.
- **Week 10:** both students integrate web/admin/mobile/backend behavior, resolve cross-application defects, reconcile metrics and complete required interface/payment/QR tests. For a 10-week term, overlap Weeks 7–9 where capacity permits while retaining Week 10 for integration/stabilization. Any unfinished bonus is dropped before required acceptance.
- **Weeks 11–12:** both students stabilize their modules, improve usability/localization polish, document and rehearse the demo, and retain contingency time. Stop new feature development after Week 9 unless a missing required feature blocks the core demonstration. [S5 pp.4–5 §§13.3–13.4]

### Integration checkpoints

- **End of Week 2:** agree API contracts and mock examples with the backend contacts, including readiness expectations for each later operation. Complete shared frontend foundations before duplicating components across modules.
- **End of Week 4:** demonstrate authentication/event publishing with available real APIs and the prepared free-checkout flow. Keep endpoint gaps visible rather than delaying all frontend work until checkout is implemented.
- **Weeks 5–6:** prove real free and simulated paid general-admission journeys, with no payment inputs/fees for free orders. Do not infer payment success or valid admission from local UI state.
- **Week 7:** integrate PDF/promotions; validate code/discount/total before purchase and campaign attribution afterwards. Prepare the mobile scan test for Week 8. Calendar must not displace required work.
- **Remaining:** verify dedicated mobile check-in/support in Week 8, required basic analytics/history/admin in Week 9, then cross-application tests and delivery. Run all required use cases and success criteria before declaring completion.

Yernur Slyamshaikhov and Dias review dependencies with backend contacts at each phase start. Agree P15 readiness for mobile Week 8 and P9–P13 readiness for support/reporting in Weeks 8–9; PDF extracts provide the delivery baseline where CLAUDE.md is abbreviated. If an endpoint is late, continue client development against contract-aligned mocks and record the task as **mocked**, with its frontend owner and unresolved dependency. A phase ending does not make integration complete.

**Scope control if behind:** S5 p.5 §13.4 orders cuts as assigned seating, calendar, advanced analytics, localization polish and refund simulation before cutting the core journey. Preserve baseline Kazakh/Russian support and required basic analytics; they are not the optional polish/advanced analytics. Basic refunds are listed as required in S5 §8, so reducing refund simulation is an explicit contingency requiring a documented team scope decision. Do not substitute a web scanner for the required mobile app or count unimplemented required work as complete.

Work in small PRs such as `feat/frontend-free-checkout`. Each student implements and tests their named area; the other reviews it. For every feature, track **contract agreed → UI with mocks → API integrated → acceptance verified**. On shared modules, coordinate common types/query keys before changing the same files. A mock-only demonstration does not complete an integration milestone.

## 6. API contracts to agree before dependent work

The current backend document contains representative schemas, not a complete implemented API. Treat the following as contract requests, not endpoints already available. Agree F0/first-integration requirements first; settle later-feature requirements before their phase milestone. The ownership column below identifies backend API contacts, not frontend implementers; frontend ownership is defined above.

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

Proposed **web** session contract: short-lived access token in memory and refresh token in a Secure/HttpOnly cookie, with backend-owned rotation and appropriate CSRF protection. The backend example returns both tokens in JSON, so agree this rather than assuming it is implemented. The **mobile** app needs a separately agreed native-compatible authentication/refresh/revocation contract and platform secure storage for any persisted credential; browser cookie/CSRF assumptions do not automatically transfer to React Native. Do not persist credentials in web local storage or plain mobile app storage.

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

Visual branding is intentionally undecided in this roadmap. Establish a small shared set of color, spacing, typography, focus, and status tokens before building many screens; capture the chosen values when implementation/design begins.

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

1. **Yernur Slyamshaikhov and Dias:** confirm required versus bonus scope, shared web/mobile stack, Kazakh/Russian plus additional English coverage, ownership and grouped milestones, including the source Weeks 8–12 under Remaining.
2. **Yernur Slyamshaikhov:** agree web/native auth with Yernur (backend), shared order/payment/QR/PDF/check-in contracts with Dos (backend)/Dima (backend), and prove iOS/Android device/build access early.
3. **Dias:** agree event/ticket contracts with Dos (backend), activation/refund/promo with Dima (backend), and support/analytics/history with Yernur (backend). Record bonus-layout/attachments and dashboard defaults as decisions rather than extra base work.
4. **Dias:** prepare Figma web/admin wireframes, localization resources and fixture examples; **Yernur Slyamshaikhov:** prepare mobile/auth/checkout/QR states and shared API types. Review UC1–UC12 examples together.
5. **Yernur Slyamshaikhov:** scaffold web/mobile clients and session adapters; **Dias:** add shared web styles/layouts/locales and MSW fixtures. Implement assigned modules in parallel and integrate contracts as services become available.

## References

The supplied SRS v0.3 PDFs S1–S5 are identified in the source table at the top; requirements/acceptance references use their printed page numbers and original section/UC labels. The originals were reviewed from the supplied local files and have not been copied into the repository. Keep a shared team copy so Dias can access the same baseline.

- Backend implementation mapping (P0–P16): [CLAUDE.md](CLAUDE.md). Where it differs from the supplied PDFs, follow the source/scope reconciliation above and coordinate the affected backend contracts; this task updates the frontend plan only.
- SPA build/routing/data-fetching tradeoffs: [React — build from scratch](https://react.dev/learn/build-a-react-app-from-scratch), [Vite guide](https://vite.dev/guide/), [React Router routing](https://reactrouter.com/start/declarative/routing).
- Server state and forms: [TanStack Query overview](https://tanstack.com/query/latest/docs/framework/react/overview), [React Hook Form](https://react-hook-form.com/get-started), [Zod](https://zod.dev/).
- Contract types and mocks: [OpenAPI TypeScript](https://openapi-ts.dev/introduction), [MSW documentation](https://mswjs.io/docs/).
- Verification: [Vitest guide](https://vitest.dev/guide/), [Playwright introduction](https://playwright.dev/docs/intro).
- Camera secure-context/permission requirements: [MDN — getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).
