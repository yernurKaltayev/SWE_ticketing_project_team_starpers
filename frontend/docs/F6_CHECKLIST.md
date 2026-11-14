# F6 — Organizer orders, attendees, cancellations and full refunds

Owner: **Dias**. Evidence: **15 November 2026**. Branch: `feat/f6-organizer-orders-dias`. Base: `master` **28248b7** (includes merged F5 and P10).

## Status

The frontend is implemented against the current P2/P5/P7 endpoints and verified through controlled HTTP/component/model checks. **Full F6 acceptance remains open**: real database/provider behavior, notification delivery, audit records and admission denial in the actual F7 app require the backend/mobile owners and a shared integration run. No backend, F3/F4 checkout or F7 source is changed. The existing restrained style is retained; no Figma implementation.

Requirements read: FRONTEND_PLAN.md F6 plus its recovery/privacy/localization/acceptance sections; CLAUDE.md P5/P7/P9/P12; backend/docs/p7-refunds-implementation.md; implemented order/refund/event routes, services and schemas, not only the older static OpenAPI.

| Requirement | Implemented frontend | Remaining proof |
| --- | --- | --- |
| Orders/attendees with search, filters and pagination | Account/event-keyed workspace; complete order search/status filtering, 20-row pagination; attendee server search/type/status filtering and pagination; order identity, totals and ticket status detail | Live ownership/large-data checks |
| Authorized CSV | Protected attendee CSV with exactly the active filters and no pagination; freshly authorized full filtered order CSV with BOM, quoting and formula neutralization | Live export permissions and spreadsheet review |
| Free cancellation/full refund | Explicit safe-default modal with order ID/number, amount, quantity and consequences; refund reason required; no partial option; fresh order preflight and duplicate-click lock | Real provider, inventory, invalidation, mail and audit |
| Event cancellation | Full-event free/paid/pending order counts and paid totals before confirmation; event/orders preflight; server-confirmed cancelled status required | Real mixed-order/provider-failure journey |
| Pending/completed/failed | Exact refund statuses and server amounts; bounded visible-tab read polling and manual refresh; no optimistic completion | Async responses are injected fixtures; current backend completes synchronously |
| Record/cache updates | Reset/refetch F6, F3 orders/tickets/QR and F4 finance caches after every attempted mutation | Other-user/native clients must reread canonical backend state |
| History and unavailable actions | Cancelled/completed records stay readable; terminal/used orders have no inappropriate action; nonpublished purchasing links hidden; F2 cancel entry leads through F6 impact review | Real browser/F7 check |

## Routes, permissions and API

- `/organizer/events/:eventId/orders`: Orders, Attendees and Refunds views.
- `/organizer/events/:eventId/orders/:orderId`: adds order details and eligible actions. The order must belong to the authorized event list before details/actions render.
- URL parameters: `view`, `q`, `status`, `ticket_type_id`, `offset`. Applying filters resets pagination; changing view clears incompatible filters. Organizer cards/editor link to the workspace.
- Existing organizer role/session guard reused. Backend is the owner/manager authority. Permission/read failures hide old private rows. Remount on account, event or order change clears private local state; SessionProvider clears shared caches on account change.

All paths use the existing authenticated transport and `/api/v1` prefix. Credentials never appear in download URLs.

| Operation | Implemented API |
| --- | --- |
| Event read/cancel | `GET /events/{id}`, `POST /events/{id}/cancel` |
| Organizer order pages | `GET /events/{id}/orders?limit=100&offset=…` |
| Order preflight/cancel | `GET /orders/{id}`, `POST /orders/{id}/cancel` |
| Full refund | `POST /orders/{id}/refund` with `{reason}`; no client amount |
| Refund records | `GET /events/{id}/refunds?limit=…&offset=…` |
| Attendee list/export | `GET /events/{id}/attendees` and `/attendees.csv` with `q`, `ticket_type_id`, `status` |
| Type labels | Managed `GET /events/{id}/ticket-types` |

### Order-search limitation

P5 has no order search/filter API or orders CSV endpoint. F6 reads **all authorized order pages** before local search/pagination, export or event-impact calculation. It refuses changing totals, duplicate IDs, incomplete pages or more than 10,000 orders; no partial list/export is presented as complete. Same-count edits cannot be detected as an atomic snapshot, so fresh preflight and server mutation validation remain authoritative. Larger events need Dos to add server order search/export. Attendee filtering/export already run server-side.

Order search covers ID/number and issued ticket number/type/attendee name. Unissued attendees remain searchable through Attendees; absent buyer/email fields are not invented in OrderOut. Event impact shows paid order totals, not a fabricated provider refund amount. Actual refund amounts come from RefundOut.

### Mutation recovery

- A per-user/event **sessionStorage** journal holds only operation kind and opaque target ID, plus returned refund ID when pending. No name/email, amount, reason, token or body is persisted.
- Storage must work before dispatch; unavailable/corrupt storage blocks a new write. A synchronous lock prevents double clicks.
- Definite 4xx refusals permit explicit correction/retry. Transport/timeout/5xx/malformed success retains uncertainty. Mutations are never automatically replayed.
- Reload offers **Check outcome**, rereading the event, complete order list and refund pages. Cancelled event/order, refunded order or a terminal status for the exact returned pending refund ID resolves recovery. An older failed refund is not proof a new request failed.
- Unresolved results remain blocked. No lookup/idempotency contract exists for a P7 attempt; elapsed time or manually clearing storage is not reconciliation. Backend assistance may be necessary if no final outcome can be established.
- Completed/failed response states are shown honestly; pending is never completion. Read polling stops after twelve checks and manual refresh remains available. Current event cancellation is synchronous; its EventOut has no job ID/settled counts. No async progress percentage is invented.
- Native dialog defaults to the safe dismissal button, blocks dismissal during POST, focuses invalid reason and restores focus afterward. A definite refusal preserves the reason for explicit retry.

## Verification

- Full `npm run check`: API drift, lint, web/mobile/shared TypeScript, **174 tests in 25 files**, production build (final result in delivery message).
- **26 F6-specific tests**: 8 model/recovery/CSV and 18 rendered workspace tests through actual authenticated MSW HTTP requests.
- Cases: malformed refunds/money; all-page order loading/search and moving/truncated snapshot refusal; impact/action eligibility; formula-safe Cyrillic CSV; account-scoped/corrupt/blocked storage; no replay; safe dismissal; free cancel/invalidated fixture QR; required reason; completed/refused/pending/failed refunds; lost response/remount/reconcile with one POST; exact pending refund ID; full-event impact/retained history; matching attendee export filters; all-page order export; stale QR/finance cache invalidation; cross-event/second-organizer denial; hiding cached data after revoked access; kk/ru rendering.
- Paid records in the controlled tests are explicitly seeded fixtures. Mock mutations update existing F3 records so consumer-visible invalidation is exercised, but do not prove real provider calls, database locking, inventory/seats, notification/audit writes or mobile scanning.
- `NODE_OPTIONS=--experimental-webstorage npm test`: **173 passed**, repeating the setting associated with Dias's previous Windows storage failure.
- Playwright spec `frontend/web/e2e/operations.spec.ts`: fixture creation through HTTP → organizer sign-in → safe confirmation → free cancellation → filtered attendee CSV → 390px kk/ru/en reflow. Attempted execution: **Chromium could not launch** (`socket() failed: Operation not permitted`). No real-browser/device/accessibility pass is claimed.

## Run and demonstrate (Windows)

1. Node 24; `npm.cmd ci --include=optional`, then `npm.cmd run check` from `frontend/`.
2. Real integration uses the existing frontend proxy with mocks off and the teammates' seeded API. No backend edits are supplied.
3. Mock demo: set `VITE_ENABLE_MOCKS=true` in `frontend/web/.env.local`, then `npm.cmd run dev:web`.
4. Register through F3 as `attendee@example.com` / `BiletFlow123!`. Use app Sign out/Sign in controls to switch to `organizer@example.com` / `BiletFlow123!`; do not reload, since fixtures are in memory.
5. My events → Orders and attendees → order. Review identity/amount/consequences, dismiss once, reopen and confirm. Inspect attendee/refund views and filtered exports. Produce a paid fixture through existing F4 simulated checkout for refund demonstration; the component tests also exercise explicitly seeded paid orders.
6. Browser check: stop an existing server on 5173; `npx.cmd playwright install chromium`, then `npm.cmd run test:e2e --workspace @biletflow/web -- operations.spec.ts`. The spec starts its own mock frontend and seeds its own free registration through HTTP.

## Required joint acceptance (still open)

- [ ] Dos/Dima: same-database free cancellation/full refund, used-ticket rejection, wrong-organizer denial, provider failure, inventory/seats and uncertain response recovery without duplicate refunds.
- [ ] Dima/Yernur backend: actual P12 audit entries and refund/event-cancellation notifications, including mail worker delivery/failure. **Individual free cancellation `_cancel_free()` currently audits but contains no notify call**; add/agree that buyer notification before closing F6 acceptance. UI does not claim delivery.
- [ ] Yernur frontend/Dima: attendee rereads show invalid tickets; actual F7 scanner rejects the same printed/digital QR. Cache reset affects the current web client only; other sessions/mobile rely on canonical API checks.
- [ ] Dias: run the browser spec locally and review keyboard/screen reader/focus, phone/desktop/zoom, and kk/ru translations.
- [ ] Mixed free/pending/paid event cancellation: success leaves history readable; provider failure remains honest. Agree any future async job/result contract before adding progress UI.

Frontend fixtures/build passes do not close these cross-application acceptance checks.


### Follow-up: exact browser filter labels

Dias's local Playwright run reached cancellation and the attendee table, then timed out matching the exact Status label. The wrapping label included its option text. Status and Ticket type now use explicit label/control associations; the existing component test asserts both labels contain only their captions and that the selected status reaches the CSV endpoint. The timeout was not increased. Full frontend check remains 173 passing tests; the browser rerun on Dias's computer is pending. The environment-file path above is corrected to the web workspace.


### Follow-up: create-to-edit navigation

The outgoing create form previously published Edit event state before navigation loaded the saved event. This could briefly expose controls that disappeared during the destination read, causing the existing paid-ticket test to race with Loading. The create response now navigates immediately; only edits to an existing event update that form's local event state. A new navigation-handoff test fails on the old implementation and passes with the fix. The existing live-P3/P4 editor test also covers a delayed destination read. Full check: 174 tests in 25 files, lint/types/API drift and build passed.

Dias reported the local F6 Playwright mock workflow passed (1 test, 2.0 seconds; 5.3 seconds total) after the filter-label fix. This records the browser smoke result only; it does not close real backend/mobile, full accessibility or translation acceptance.
