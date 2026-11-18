# F9 — Notifications and support cases

Owner: Dias. Prepared 18 November 2026.
Base: master `8a8285769037b320eacf18a5a3180249bdc992fe`, with F8 merged via PR #30
and the white UI merged via PR #29. No backend, session, checkout coordinator or
payment implementation is replaced.

## Implemented scope

| Requirement | Frontend behavior |
| --- | --- |
| Notifications | Signed-in navigation, authoritative unread count, paginated all/unread views, per-record mark-read and safe contextual links |
| Notification families | Verification, confirmation, payment failure, ticket delivery, event update/cancellation, refund, payout and support reply/assignment/status |
| Entry points | Event details, own order/ticket pages, event editor, organizer event list and global Support navigation |
| Context | Signed-in requester attached by backend; available event/order/ticket IDs sent automatically; derived context rendered after creation |
| Categories | Delivery, payment/activation, refund, seating, event information, check-in, account and technical |
| Audiences | Backend-derived attendee cases for event support; organizer/platform cases for admins; handlers verified using the handler-filtered API |
| Cases | Paginated inbox with requester/handler/status/event filters; subject/category/context and retained thread |
| Replies | REST cursor polling, ID deduplication, chronological messages, no reload or optimistic success |
| Assignment/status | Assign to self, unassign, eligible event support/manager roster choices when permitted; Open/In Progress/Waiting for Customer/Resolved |
| Drafts | Per-account memory drafts survive SPA navigation; clear on sign-out/account change/reload; no support text in browser storage |
| Resilience | No automatic write retry; uncertain writes require refresh/inspection before another attempt; authorization failures hide old private content |
| Locales/design | English/Russian/Kazakh controls, white UI surface/line/radius tokens, narrow layouts and scrollable header navigation |

The existing backend email templates currently link to `/orders/{id}` and
`/tickets`. Small safe redirects now lead to F3's canonical `/account/orders/{id}`
and `/account/tickets` routes, where existing authentication/ownership guards
apply. Unknown order IDs route to the order list; no external URL is accepted.
In-app notification routing uses recognized types and validated payload IDs,
never arbitrary payload URLs or HTML from notification bodies.

## Existing API contracts

- GET `/api/v1/me/notifications?unread_only=&limit=&offset=` → page.
- POST `/api/v1/me/notifications/{id}/read` → idempotent updated notification.
- GET `/api/v1/support/cases?role=requester|handler&status=&event_id=&limit=&offset=` → page.
- POST `/api/v1/support/cases`: category, subject, initial message and optional
  event/order/ticket IDs. Audience and requester are decided by the server.
- GET/PATCH `/api/v1/support/cases/{id}`: current case; handlers may change
  status and assignee. Explicit `assignee_id: null` unassigns.
- GET `/api/v1/support/cases/{id}/messages?after={last GET cursor}` → up to 200,
  ordered by timestamp and ID. POST to that path sends one message.
- Existing GET `/api/v1/events/{id}/staff` supplies assignment names when access
  is granted; only manager/support staff are offered as candidates.

The requester may reply but cannot change status or assignment unless also an
actual handler. Global account role alone does not determine event permission:
any appropriately assigned manager/support account can be a handler; check-in
assignment alone cannot. Organizer cases and attendee cases without events are
handled by platform admins. Unrelated reads return 404. The backend remains the
final authorization authority for every request.

CaseOut has no `can_handle` flag or complete eligible-assignee directory.
The frontend searches the current user's server-filtered handler list (bounded
at 10,000 entries, failing closed if incomplete/malformed). Eligible event staff
are listed only where the existing roster endpoint allows access. For platform
cases and handlers without roster access, self-assignment/unassignment remain
available. Selecting any arbitrary platform admin is not implemented through an
invented lookup endpoint. Assignment is revalidated on the server.

## Polling and uncertain writes

- Unread badge polls every 15 seconds; notification/inbox pages every 10 seconds;
  case metadata/messages every 5 seconds; handler permission every 10 seconds.
- Hidden/offline views stop background reads. Visibility, reconnection and an
  explicit window-focus handler resume reads; manual Refresh is available.
- Reads retry at most twice with exponential delay; 429 Retry-After is respected
  with a 60-second cap. Authorization/not-found/validation failures are not
  retried. Polling stops after a final read error until focus/manual recovery.
- Initial/backlog message reads fetch at most five 200-message pages per batch;
  additional history remains accessible through Load more and subsequent polls.
  Server cursors advance from GET responses only, not from a new POST response,
  so interleaved messages are not skipped. Display retains microsecond ordering.
- Message IDs are deduplicated across polling and accepted POST responses.
  Identical text under distinct message IDs remains separate.
- P10 has no idempotency key/client message ID. A lost write response cannot be
  safely retried automatically. The UI retains the draft, blocks another write,
  refreshes records and asks the user to inspect before explicitly unlocking a
  new attempt. It does not pretend that matching message text proves success.
- Draft storage is a session-scoped memory vault (up to 50 drafts). No support
  text is written to localStorage/sessionStorage. A reload intentionally clears
  drafts and uncertain-write memory; inspect existing records before resending.
- Resolved/waiting cases retain messages/context. Backend customer replies may
  reopen them to In Progress. Status/assignment audit rows are retained by P12;
  F9 does not invent a status-history field in CaseOut or take over F10 history UI.

## Verification

- `npm run check` passes: generated contract check, lint, web/mobile/shared
  TypeScript checks, **279 tests across 32 files**, web production build.
- **44 new F9 tests** cover supported notification destinations, legacy email
  destinations, context derivation/rejection, handler/outsider boundaries,
  assignment/unassignment, reopening, polling without reload, focus/hidden
  behavior, drafts, uncertain writes, ID deduplication, pagination and locales.
- Node 24 experimental-webstorage mode passes with the existing jsdom setup.
- `web/e2e/support.spec.ts` is included for a single-page attendee/responder
  journey, notifications, status changes, preserved history and narrow locales.
  Chromium launch is blocked here by `socket() failed: Operation not permitted`.
  **Browser/visual acceptance is not claimed as passed.**
- No live PostgreSQL, SMTP/MailHog delivery, deployment-browser or real multi-user
  security test was run for this frontend delivery. HTTP fixtures prove client
  behavior, not production authorization or email delivery.

## Windows setup and manual frontend test

Use Node 24. From `frontend`:

```powershell
npm.cmd ci --include=optional
npm.cmd run check
npx.cmd playwright install chromium
npm.cmd run test:e2e --workspace @biletflow/web -- support.spec.ts
```

Stop an existing 5173 server before Playwright; its config starts its own.
For manual development, set `VITE_ENABLE_MOCKS=true` in **frontend/web/.env.local**
and run `npm.cmd run dev:web` from `frontend`.

Development accounts all use `BiletFlow123!`:

- `attendee@example.com`: requester.
- `organizer@example.com`: demo event owner/responder.
- `support@example.com`: verified attendee account; assign it manager/support
  through the existing F7 Staff screen to test event-scoped permissions.
- `admin@example.com`: platform responder for organizer/account cases.

1. As attendee, open a public event → Support (or use an issued order/ticket's
   Support link). Choose category, subject and initial message; inspect context.
2. Use SPA Sign out/Sign in controls as organizer, without reloading. Open Support
   → Cases I handle. Claim the case, reply, choose Waiting for Customer.
3. Switch to attendee. The thread and notifications update; mark a notification
   read, follow its contextual link and reply. Observe In Progress on the case.
4. As handler, resolve it and verify prior messages/context remain visible.
   Reply again as requester to test reopening. Use Refresh without a page reload.
5. As organizer, open a context-free account/payment/technical case. Switch to
   admin to respond. A different requester or check-in-only staff must not read it.
6. Navigate away with a draft, return and verify it remains; sign out and verify
   it clears. Hide the tab/offline it, then resume/focus and inspect fresh updates.

Mocks are in page memory and send no email. Refreshing the browser or opening a
new tab resets them. Mock checkout/payment settlement generates confirmation,
failed-payment and ticket notifications; support replies/changes generate their
own notifications. Other families can be injected with the test fixture helper;
this is not evidence of live refund/payout/event email integration.

## Live P9/P10 handoff

Set `VITE_ENABLE_MOCKS=false` in frontend/web/.env.local and restart Vite. Use the
team's backend via the existing `API_ORIGIN` proxy and current live seed logins
(mock passwords are not asserted to be live passwords). Backend teammates own
migrations, worker, SMTP/MailHog and notification emission.

Verify attendee ↔ event owner/support/manager, organizer ↔ admin and unrelated
accounts in separate live sessions. Compare a case's message IDs/cursor pages,
notifications/unread/read state, assignment eligibility and statuses with actual
backend records. Exercise 401 refresh failure, 403/404 revocation, hidden/focus,
network failures before/after commit, and histories over 200 messages.

Trigger each of the eleven P9 event families with the responsible backend
teammate. Confirm in-app context routes, unread counts, email worker retry and
actual MailHog/SMTP delivery independently. Test confirmation-email order/ticket
links through sign-in using the newly supported route aliases. Do not mark email
or database authorization accepted from frontend mock results alone.
