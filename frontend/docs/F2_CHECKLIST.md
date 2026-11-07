# F2 — Event discovery and organizer setup

Owner: **Dias**. Implementation branch: `feat/f2-events-dias`.

This is the F2 client implementation against the committed static OpenAPI contract. It does not mark the real-API acceptance milestone complete. F0/F1 authentication, shared UI, and the existing paper/green styling are reused. No design branding or backend changes are included.

## Implemented

- `/` and `/events`: public discovery with search/category/city/UTC date filters and pagination. Filters live in the URL and survive navigation/back/refresh. Empty, loading, failed/retry states are explicit; obsolete fetches are aborted.
- `/events/:eventId`: event description, explicit event time zone/start/end/registration windows, venue name/address/city, images and public availability. Draft/private access remains backend-authorized. Sold out, closed/unopened registration, cancelled events and inactive/suspended paid sales have explicit status labels.
- `/organizer/events`: protected organizer-owned event list across statuses, pagination, creation/edit navigation.
- `/organizer/events/new` and `/:eventId/edit`: title, description, category, venue selection with paginated venue loading, IANA zone, start/end, visibility, capacity and optional registration windows. Saves draft/changes through POST/PATCH. Inputs survive errors; writes are never automatically replayed. Identity switches clear the mounted feature state.
- `/:eventId/preview`: authenticated preview of saved data, including drafts; it is never a public publishing operation.
- Publication/unpublication/cancellation have an accessible native confirmation dialog. Errors preserve state and explain missing ticket types, invalid capacity, email verification and lifecycle/order conflicts. Duplication requests backend configuration-only copying and opens the returned draft. There is no delete/history-destruction control. Bulk cancellation/refund progress remains F6.
- Ticket types: create/edit free and paid types, descriptions, exact integer-tiyn conversion, quantities, sales windows, per-order limits and hidden state. Authorized inventory table shows available/reserved/sold/refunded/checked-in counters. List is paginated; public detail consumes the separate availability endpoint.
- Refund-policy submission uses the existing PUT contract and clearly distinguishes submission from readback. It never invents a saved policy for public display.
- kk/ru/en copy, semantic controls, keyboard focus on errors, visible labels and responsive grids/tables. Kazakh/Russian wording still needs owner review.
- Assigned-seating events are preserved; the general-admission editor will not overwrite an assigned layout. Seating configuration remains F5.

## Deliberate backend boundaries

1. **Images:** `ImageUploadIn/Out` supplies filename/content type and upload/image URLs only. There is no upload verb/header/size policy or completion/attachment operation, and EventUpdate contains no images field. The inspected P2 branch explicitly defers image upload integration. Existing backend images render; creating/attaching images remains blocked until Dos supplies the complete storage contract. No fake upload or arbitrary image-URL persistence is implemented.
2. **Refund-policy readback:** EventOut omits refund_policy, and there is no policy GET. The editor can submit terms, but cannot prefill previously saved terms or show them publicly. Confirm P7/P2 readback with Dima/Dos before final acceptance. Public UI states that terms must be confirmed before registration.
3. **Checkout:** F3 owns order creation/checkout. This module displays availability without a placeholder checkout route or fabricated registration success. Yernur can consume `Event`/`Availability` types and the availability endpoint; server totals and authorization remain authoritative.
4. **Share links:** canonical public detail uses IDs. A share token must not grant access to private events. Agree the unlisted resolver and route with backend/F8 before exposing links; no private-token bypass is added.
5. **Live readiness:** `master` contains empty event/ticket/venue routers at this snapshot; P2 work exists separately on `feat/p2-events-dos`. P3 inventory and storage readiness must be verified independently. No backend branches were merged by this work.

## Verification — 6 November 2026

- `npm run check`: generated API drift check, lint, all workspace TypeScript checks, **79 tests** and production web build pass locally.
- New tests cover exact-money boundaries, IANA conversion independent of browser zone, DST gaps/ambiguous times, invalid dates, registration/sales ranges, filters and availability gating.
- HTTP fixture tests cover create → missing-ticket correction → free ticket → publish → discovery, capacity rejection, hidden ticket availability, cross-organizer/attendee denial, configuration duplication with reset counters and cancellation retention.
- Rendered component tests cover creation/publication/preview, failed-save draft preservation and explicit recovery, focused linked validation errors and absence of unintended writes. These use jsdom + MSW, not a real browser/backend.
- Two Playwright Chromium journeys are committed for discovery/editor/publication/duplication and responsive/locales/permissions. **Not run successfully here:** installed Chromium cannot create its process-singleton socket (`Operation not permitted`); downloading Playwright headless shell produced an invalid archive. No visual/browser pass is claimed.

## Run locally

From `frontend/`, using Node 24:

```powershell
npm ci
Copy-Item web/.env.example web/.env.local
npm run dev:web
```

Set `VITE_ENABLE_MOCKS=true` in `web/.env.local`. Sign in with fixture-only `organizer@example.com` / `BiletFlow123!`. Create an event, choose the demo venue, use future start/end times, save, add a free ticket type within capacity, preview, publish, then find it publicly. Fixtures reset on browser reload; the existing F1 in-memory web session also signs out on reload. No real purchases/emails occur.

```powershell
npm run check
npx playwright install chromium
npm run test:e2e --workspace @biletflow/web
```

For an already installed Chromium, optionally set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its path. Playwright starts its own mocked Vite server on port 5173; stop other servers on that port first. `web/output/f2` is ignored.

## Remaining acceptance

- [ ] Dos/Dima provide live P2/P3/venue/refund-policy and upload contracts/endpoints.
- [ ] Implement image upload/finalization once its contract exists; verify failed uploads and attachment persistence.
- [ ] Add saved-policy readback and public display once the contract exposes it.
- [ ] Verify real verified-organizer create → free type → publish → public discovery/detail with mocks off; record backend/database revision.
- [ ] Repeat direct-link and mutation authorization with two real organizer accounts and an attendee.
- [ ] Run Playwright and manual keyboard/screen-reader, 320/390/768/1280px and kk/ru/en visual checks on a machine with browser access; review translations.
- [ ] Verify shared private/unlisted-link behavior and F3 handoff before the integrated registration demonstration.

Mock or component passes are not evidence of PostgreSQL inventory, actual storage, real authorization or completed end-to-end acceptance.
