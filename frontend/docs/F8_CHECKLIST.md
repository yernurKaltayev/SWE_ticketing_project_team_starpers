# F8 — Promotions and Campaign QR

Owner: Dias. Frontend implementation prepared 18 November 2026.
Base: master `41754747eeb7319370fd1296b374e32846ea2945` (F7 merged via PR #28).
White UI compatibility base: `feat/f0-figma-white-ui-slyamshaikhov` at
`12b365b1a24b79edcbaa013434d182e65d2a6a2e` (separate, unmerged design commit).

## Implemented

- Organizer event workspace → Promotions: paginated campaigns, generated codes,
  percent/fixed creation, validity in the event's IANA timezone, eligible ticket
  types, maximum redemptions, editable metadata and enable/disable.
- Fixed amounts are entered in KZT and sent as integer tiyn. Percent is a whole
  number from 1 to 100. Validation rejects invalid dates, limits and money.
- Complete live ticket-type arrays and paginated fixtures are supported. Explicit
  eligibility is limited to 100 types by P16; an empty list applies to all types.
- Campaign QR downloads use the authenticated canonical PNG endpoint. No backend
  response can make the client fetch an arbitrary `qr_url`. Labels clearly
  distinguish Campaign QR from admission QR.
- Event promo feedback and registration links preserve `promo`, `promo_status`
  and `share` through the existing safe login return path.
- F8's promo component automatically validates the linked code when tickets are
  selected, supports manual entry/removal, and displays the server's discount
  with an estimated ticket total after discount. Pending/invalid codes block review.
- Cart/code changes abort and hide obsolete previews. Expired, disabled, future,
  exhausted and inapplicable codes receive specific EN/RU/KK messages.
- F3 integration sends `promo_code`; confirmation rechecks current availability
  and the discount. A changed quote returns to selection for another review.
  F3's existing order page displays authoritative discount, fees and final total
  before simulated payment. A 100% discount may produce `free_confirmed` directly.
- Lost order responses retain the original body, code and idempotency key in the
  existing F3 coordinator. Retrying does not build a new order or strip the code.
- Completed campaign orders, ticket quantities and revenue are read from the
  P16 campaign report. Pending redemption reservations are labelled separately.
- Uncertain campaign writes are never replayed automatically; an explicit refresh
  is required before another write. Known rejections retain the edit form.
- Responsive cards/form controls follow the white UI's surface/line/radius tokens
  with fallbacks for master. No design commit or new package dependency is added.

## Backend boundaries

| Operation | Existing contract |
| --- | --- |
| List/create campaigns | GET/POST `/api/v1/events/{id}/campaigns` |
| Read/update | GET/PATCH `/api/v1/campaigns/{id}` |
| Download/report | GET `/api/v1/campaigns/{id}/qr`, `/report` |
| Preview | POST `/api/v1/promo/validate` with one type ID per ticket |
| Commit | Existing POST `/api/v1/orders` with `promo_code` |
| Scan resolver | Backend site-root GET `/c/{opaque-token}` → event query |

The current `CampaignUpdate` schema cannot change discount type/value or ticket
eligibility. The edit screen explains this and sends only supported fields;
create another campaign to change those immutable properties.

Promo validation does not reserve a redemption and returns no final fee/total.
The frontend does not manufacture a guaranteed quote. The backend order transaction
owns atomic slot claims and authoritative totals; F8's frontend mock race test is
not PostgreSQL concurrency evidence.

The backend resolver preserves a share token for nonpublic events. Current public
availability accepts published public events only, and the existing F2/F3 id-based
journey does not implement token-based nonpublic registration. F8 preserves that
context but does not bypass backend visibility. Public events are the integrated
path; private/unlisted Campaign QR checkout needs agreement with F2/F3/backend
owners before acceptance.

OrderOut does not expose a campaign identifier. Attribution is verified through
the authenticated campaign report, rather than invented order/ticket fields.

## Checks and remaining acceptance

- `npm run check`: API contract check, lint, web/mobile/shared types, **235 tests**
  across 30 files, and web production build pass on both the master and white UI
  variants. These include 39 new F8 unit/component/HTTP-fixture tests.
- Node 24's experimental webstorage path is checked using the existing jsdom
  storage setup (no global `Storage.prototype` changes).
- New `web/e2e/promotions.spec.ts` covers campaign creation/download, event link,
  sign-out/sign-in, automatic promo, zero-total completion, attribution and narrow
  EN/RU/KK layouts. Chromium launch is blocked in the authoring environment by
  `socket() failed: Operation not permitted`; **the browser test is not a pass**.
- No live backend, deployment HTTPS scan, physical camera test or visual comparison
  is claimed by these frontend checks. Use the manual path below with real data
  before marking UC10 end-to-end acceptance complete.
- F7 code/checklist was reviewed: its campaign-QR rejection is already supported.
  Its documented Android/iPhone, camera, printed/digital and accessibility checks
  remain with the F7 owner. F8 does not mark them complete.
- F3 owner should review the small `CheckoutPage` integration. Session, coordinator,
  payment and admission scanner implementations are not replaced.

## Local frontend test (Windows PowerShell)

From `frontend` with Node 24:

```powershell
npm.cmd ci --include=optional
npm.cmd run check
npx.cmd playwright install chromium
npm.cmd run test:e2e --workspace @biletflow/web -- promotions.spec.ts
```

Stop an existing 5173 dev server before Playwright (the config starts its own).
For manual testing, create **`frontend/web/.env.local`** containing
`VITE_ENABLE_MOCKS=true`, then run `npm.cmd run dev:web` from `frontend`.

Mocks use `organizer@example.com` / `attendee@example.com`, password
`BiletFlow123!`. Create a paid general-admission ticket and complete the existing
F4 sandbox activation first; a promo cannot discount a zero-price ticket.
Create a currently valid campaign in My events → event → Promotions. Download
Campaign QR and use “Preview event with code”. Sign out on the public event page,
select Registration, sign in as attendee, select tickets, inspect the automatic
preview, remove/reapply, review, create the order and complete F4's explicit sandbox
outcome if payment is due. Switch back to organizer and open Campaign report.

Mock data exists only in page memory. Use SPA links/account controls without
reloading. The mock campaign PNGs encode localhost `/c/demo-campaign-N`; there
are 32 matching fixtures and they are not shareable deployed campaigns. A physical
scan/new-tab reload needs the persisted real backend. The Playwright seed uses
existing F4 mock HTTP endpoints and is explicitly not real payment evidence.

## Real API and UC10 handoff

Disable mocks in `frontend/web/.env.local` and restart Vite. Use the team's seeded
backend and existing API proxy (`API_ORIGIN`, default localhost:8000).
The Vite config now proxies root `/c/` as well as `/api`; deployment routing must
also send `/c/*` to the backend, not the SPA fallback.

Backend `PUBLIC_BASE_URL` must be a public HTTPS backend/resolver origin;
`WEB_BASE_URL` must be the HTTPS frontend origin. Campaign QR contains an opaque
server token, not a frontend-constructed price or discount. Ask backend teammates
to configure these values, migrations, payment simulator and current seed logins.
Mock passwords are not asserted to be live seed credentials.

1. Create a public paid event/campaign; scan its canonical Campaign QR in the
   phone camera. Confirm correct HTTPS event and code through login/checkout.
2. Compare preview against the committed OrderOut amounts; complete payment and
   compare campaign report orders, tickets, gross, discount and net with backend
   rows. Repeat with a fixed discount and a 100% discount.
3. Validate invalid/disabled/future/expired/inapplicable/exhausted codes, a cart
   change and a competing final redemption. Confirm no success before server commit.
4. Exercise failed/expired/cancelled orders and ensure the backend releases slots.
   Retry a lost order response with the original body/key.
5. Scan the Campaign QR in F7: it must show “not an admission ticket” and leave
   admission counts unchanged. Verify the issued ticket QR separately on Android
   and iPhone with the F7 owner. Record this evidence rather than inferring it from mocks.
