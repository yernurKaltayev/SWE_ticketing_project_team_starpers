# F10 — Analytics, retained history and platform administration

Owner: Dias. Frontend implementation prepared 18 November 2026.
Base: master `9a5f14ea608941ae72f2a0809fed796007f2768f`, after F9 PR #31,
F8 PR #30 and the white UI PR #29. Backend source and generated contracts are
consumed without backend changes. No new checkout fields are introduced.

## Delivery and acceptance

| Required area | Implemented frontend behavior | Live acceptance |
| --- | --- | --- |
| Analytics | Canonical P13 inventory, sold/remaining/percent, money, daily sales, type comparison, campaign attribution and attendance | Reconcile seeded P13 transactions |
| Filters | Owned event selector; event-time-zone dates; ticket type; URL filters, reset and refresh | Verify owner/manager/admin access and foreign-event denial |
| Accessible reporting | Labeled SVG count charts with equivalent tables, captions, scoped headers and exact KZT values | Browser keyboard, screen reader, zoom and narrow-screen review |
| Event lifecycle | Upcoming/Active/Completed/Cancelled across all owned pages; stored status remains visible | Check completed/cancelled seeds and retained related records |
| History | Paginated newest-first P12 timeline; timestamp, actor/role, action, entity, description; date/category/exact-action filters | Check audit retention and ordering against real API |
| Safe duplication | Configuration-only clone, explicit cancel/confirm, source untouched, returned new draft validated; duplicate writes blocked | Check copied fields/types and absence of old transactions/staff/history |
| Admin search/details | Users/events/orders/payments; supported filters; full current server DTO shown on selection | Verify every collection and denied access with real accounts |
| Operational monitoring | Activation records, refunds, failed payments, basic disputes, escalated cases, campaign activity | Check failed/pending/completed seeds; F9 case handoff |
| Moderation | Public signed-in report form; report review labels; separate reasoned user/event/paid-sales suspension/reinstatement | Verify revocation, sales shutdown and activation rechecks |
| Settings | KZT fee input → integer tiyn; decimal percent; whole-day/minute validation; preview changed keys before PATCH | Verify backend limits and effective configuration |
| Exports | Authenticated canonical CSV for users/events/orders/payments/refunds; UTC dates; CSV validation and URL cleanup | Verify authorization, row cap, amounts and formula escaping |
| Design/locales | Existing white surface/line/radius tokens, responsive cards and horizontally scrollable tables; EN/RU/KK controls | Human language/design/device review |

The frontend slice is implemented and locally checked. The plan's full **Done
when** condition remains open until real authorization and seeded API reporting
are accepted with the backend team. Mock tests do not establish live security,
PostgreSQL reconciliation, production email delivery or device accessibility.

## Routes and permissions

- `/organizer/events`: existing My events entry now groups the complete owned list.
  It fetches up to 10,000 records, fails visibly on incomplete/changing pagination
  or duplicate IDs, and paginates the resulting groups. It does not classify
  only the first API page. Classification follows P12 timestamps: cancellation
  wins, then end/start boundaries; draft/suspended status is displayed separately.
- `/organizer/events/{id}/analytics` and `/history`: signed-in routes. P13/P12
  determine owner, assigned manager and platform-admin access. Check-in/support
  assignment alone cannot read reports. Public event visibility grants no report
  access. No organizer-wide event list is requested for manager/admin accounts.
- Past event cards retain links to existing editor, orders, attendee ticket
  status, refunds, campaigns, support, analytics, history and attendance totals.
  Existing routes retain their own authorization. The attendance link shows
  report totals; F7 mobile admission remains its owner's implementation.
- `/admin` defaults to users; `/admin/{section}` provides users, events, orders,
  payments, activations, refunds, support, campaigns, reports, disputes, settings
  and exports. Non-admins cannot mount these readers; API authorization is final.
- Event reporting appears on published non-private public detail pages. The
  backend controls signed-in access and valid event visibility.

P11 has **no individual GET detail endpoints**. Detail panels use the complete
DTO from the currently selected search result, with a scope hint. They are hidden
when refresh fails/authorization is denied. No invented `/admin/users/{id}` or
similar read is issued. Search uses only actual API fields: user name/email,
event title, order number/buyer email and payment provider reference.

## Financial and date definitions

- Money comes from server aggregates in **integer tiyn**; UI formats KZT.
  Net = gross − discounts − completed refunds. Processing fees are payout
  deductions and are not subtracted a second time. Signed net is permitted.
- Sold means current valid/checked-in tickets. Remaining excludes reservations.
  Checked-in, absent and percentages are current inventory measures.
- P13 dates filter sale/money/campaign figures by **order creation timestamp**,
  not event start or refund completion time. Inventory/attendance remain current.
  A ticket-type filter also scopes inventory/attendance. Per-type monetary
  allocation belongs to the backend, never the reporting UI.
- Local datetime inputs convert using the event timezone; start inclusive/end
  exclusive. Invalid/equal/reversed ranges or ticket IDs send no report read.
  Admin and CSV creation-date inputs explicitly use UTC.
- P13 daily rows use the event timezone and contain at most 366 days. Summary
  totals may cover a longer requested range; charts/tables show supplied rows.
- P13 campaign rows expose attributed completed-order counts and revenue.
  Expanded P16 code/ticket/money details are explicitly **lifetime**, unaffected
  by P13 date/type filters. They are not presented as filtered ticket counts.
- Admin CSV supports **report kind and creation dates only**, up to 10,000 rows.
  Search/status filters on other pages are not applied. Downloaded money columns
  remain integer tiyn; the browser does not rebuild or reformat server reports.
- Settings use activation fee ≥1 tiyn (UI minimum 0.01 KZT), processing percent
  0–100 inclusive, payout delay integer ≥0 days and hold integer ≥1 minute. No
  speculative upper limit is added. Only changed keys are sent after review.

## Writes and recovery

Confirmation dialogs focus Keep unchanged, restore focus when dismissed and
require a 1–500 character reason for suspension/reinstatement. Report moderation
labels do not themselves suspend an event. Existing orders/tickets are retained;
refund/cancellation remains F6, separate from suspension. Paid-sales-only
suspension is also distinct from suspending the event.

Writes have a synchronous duplicate-click lock and no automatic retry. Network,
5xx or malformed success responses block another attempt in the current session.
The UI asks for an authoritative refresh and explicit inspection before unlocking.
Duplication checks returned ID/new-draft/disabled-paid-sales state before routing.
Settings retain input after cancellation or a definite validation error and are
not automatically overwritten by background polling. Other read pages pause
background requests when hidden/offline and refresh on resume/manual action.

Uncertain-write state is memory-only and cleared on identity change/reload. After
reload or signing back in, inspect drafts/settings/records before repeating an
uncertain action; P11/P12 provide no mutation idempotency key. Reporting success
is only shown after a validated response, not optimistically.

## Local evidence

- `npm run check`: generated API contract, zero-warning lint, web/mobile/shared
  TypeScript, **360 tests in 35 files**, web production build.
- **81 F10 tests**: 40 contract/filter/unit cases, 28 React flow cases and 13
  mock API integration cases. Covers financial reconciliation, campaign paid
  settlement, free/refunded inventory, current attendance versus filtered sales,
  manager/check-in boundaries, admin collection DTOs/denials, suspension stopping
  new mock orders while keeping old tickets, moderation, atomic settings, CSV
  headers/escaping, timeline filters, duplication, lost responses and RU/KK.
- Node 24 `--experimental-webstorage`: all 81 F10 tests also pass with the
  repository's existing jsdom storage setup.
- `insights.spec.ts`: two Playwright journeys supplied; test discovery passes. Attempted with system
  Chromium; both were blocked **before test interactions** by host
  `socket() failed: Operation not permitted`. Browser pass is pending locally.
- Mock analytics/admin endpoints are development fixtures only. Mock audit
  entries cover fixture event create/update/duplicate/report/admin actions, not
  every backend audit family. Real P12 rows are rendered without that limitation.

## Dias's Windows browser check

From `frontend/`, use Node 24 and the workspace install. In
`frontend/web/.env.local`, set `VITE_ENABLE_MOCKS=true` (create the file if absent),
then run `npm.cmd run dev:web`. Use the web folder, matching the current Vite
configuration and `web/.env.example`. Restart Vite after changes. Do not reload between mock account switches.

1. Register a free demo ticket through F3 as attendee@example.com / BiletFlow123!.
   Use Sign out/Sign in to become organizer@example.com / BiletFlow123!.
2. Open My events. From the demo event use Analytics. Check sold 1, zero KZT,
   attendance, daily/type tables, date/type filters and Clear filters. Changing
   sales dates must not erase current inventory. Use existing F4/F8 demo checkout
   for paid/campaign scenarios; never enter a real payment.
3. Edit/save an event field, then open Activity history. Filter event activity and
   dates. Verify actor, timestamp/entity/description and read-only presentation.
   Move a demo event into past dates before sales if needed; inspect Completed
   and retained links. Cancel/confirm Duplicate; inspect the new draft and verify
   the original order/ticket stays on its source event.
4. Sign in as admin@example.com / BiletFlow123!. Use Platform administration.
   Search/select user, event, order and payment records. Inspect activation,
   refund, support/campaign and failed-payment sections. Empty states are valid
   until their fixtures are created through existing flows.
5. Report a published event from attendee public details, switch to admin, review
   it under Reported events. The review label must leave event sales unchanged.
   Separately suspend the event with a reason. A new attendee registration must
   fail; the old issued ticket/order must remain readable. Reinstatement is an
   explicit action with a reason, not an automatic consequence of report review.
6. Change activation fee to 123.45 KZT, inspect preview, dismiss once, then confirm.
   Refresh and verify it. Try hold 0 and fee 0: neither may send a write. Restore
   intended settings. Export an operational CSV and check integer tiyn columns.
7. Check keyboard dialog dismissal/focus, all locales, 390px width and 200% zoom.

For automation, **stop the running Vite server first** (Ctrl+C), then:

```powershell
npx.cmd playwright install chromium
npm.cmd run test:e2e --workspace @biletflow/web -- insights.spec.ts
```

For API acceptance, set `VITE_ENABLE_MOCKS=false`, restart Vite, and use teammates'
seeded backend/proxy. Repeat the matrix with owner, foreign organizer, assigned
manager, check-in staff, attendee and platform admin; compare exact integer-tiyn
reports/CSV to the same seeded orders, discounts, completed refunds and check-ins.
Record actual results before marking F10 fully accepted. Backend runtime testing
stays with its named owners; F11 cross-application review stays with its owner.
