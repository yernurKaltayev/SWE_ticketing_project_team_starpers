# F5 — Assigned seating (partial frontend handoff)

Owner: Dias. Base: master d6b88244fb654696a2edcc0c7ebfe74d4300bec8.
Revision 2. Evidence: 11 November 2026. Branch: feat/f5-seating-dias.

## Status

This is a reviewable frontend slice, **not completed F5 acceptance**. Organizer layout/category setup and public seat browsing are wired to implemented P2/P3/P4 routes. A reusable selection/hold component and checkout handoff are implemented and tested with controlled responses. Public seat booking is deliberately disabled until public ticket categories and the F3 integration are available. No backend files or F3/F4 checkout implementation were changed.

## Implemented

- `/organizer/events/:eventId/seating`: organizer session guard; reads the existing venue's layouts and managed ticket types. Draft-only layout assignment via event PATCH; category assignment via ticket PATCH. No venue designer, venue creation, or invented layout IDs in live requests.
- `/events/:eventId/seats`: public SVG schematic and labeled list, grouped by returned section/row; availability, accessibility and category labels; read-only until pricing/category handoff exists. Focus refresh and visible-tab 15-second polling; stale reads are aborted. Live IDs and labels come from P4.
- Existing backend seed: Almaty Demo Hall / Standard hall; Parterre A–D, ten seats each (standard); VIP V1–V2, six each (vip). Total 52. The seeded event is general admission despite having a layout, so a draft must be configured as assigned and published before P4 exposes its map.
- kk/ru/en copy and responsive list. The diagram is explicitly schematic because P4 has no seat coordinates. Status text in the equivalent list avoids color-only meaning.
- `SeatPicker` accepts authoritative `SeatOffer[]` and a checkout callback. It separates selection from confirmed hold, uses returned expiry, limits one group to P4's ten seats/per-ticket limit, validates category/seat availability, handles conflict/release/unknown writes and exports the actual hold-group ID plus seat IDs.
- Unknown network/5xx/malformed hold responses block another POST in the same controller. No invented hold ownership, automatic write replay or persisted credentials/attendee data. Server expiry is the recovery fallback.
- Best-effort release on unmount, including a POST response arriving after unmount. Successful checkout transfer suppresses that release. Failed explicit releases remain retryable.
- Event editor allows publication of assigned events. Its basic form remains guarded to avoid resetting layout/seating. Ticket edits omit price_category so a category configured on the seating page is preserved.
- Development MSW read fixtures mirror the existing 52-seat geometry with explicitly synthetic IDs. They do not simulate successful checkout or prove server reservations.
- Regenerated API types for the already-merged `unread_only` notification parameter (two lines), resolving baseline check:api drift without changing the source contract.

## F3 handoff (Yernur Slyamshaikhov)

Import `SeatPicker`, `SeatOffer`, and `SeatingSelection` from `web/src/seating` files. Mount keyed by authenticated user ID and event ID; pass the existing authenticated request callback. Offers must be obtained from an agreed public API and contain ticket ID, name, exact price in tiyn, category (including explicit null), and max-per-order limit. Never derive category from a ticket name or array order.

`onContinue(take)` receives a function, not a fabricated order. Retain the picker while collecting/reviewing attendee details. Call `take()` only immediately before the existing order coordinator dispatches an order. It rechecks expiry and returns `{eventId, holdIds, expiresAt, items:[{ticket_type_id, quantity, seat_ids}]}`. Map `holdIds` to P5's `hold_ids`; preserve seat ordering when binding attendees. On definite order rejection, checkout owns releasing transferred groups; on uncertain outcome, retain the exact body/key and reconcile the existing order before releasing or retrying. The current component supports one ticket category/group per checkout.

Do not enable assigned checkout by simply removing F3's general-admission guard. Its availability validation must account for inventory already held by this user. Its order recovery/idempotency behavior must remain intact. Paid expiry/payment coordination needs P5/P6 verification. An onContinue callback must not navigate away before taking ownership or the picker releases the hold.

## Backend contract requests (Dos, coordinating with Dima)

1. Expose `price_category` on public ticket availability, or return an authoritative seat-category-to-ticket mapping. Current `PublicTicketAvailability` omits category; managed `/ticket-types` is not an attendee endpoint.
2. Provide authorized hold recovery/read with seat IDs, ticket type, status, expiry and a server clock reference. Current P4 only creates/deletes holds; a public `held` seat does not identify its owner. Define reconciliation for a lost create response (prefer idempotency).
3. Provide layout seats/categories for organizer draft setup, if automatic category dropdowns or draft previews are required. Current `/layouts` returns only ID/name; `/seat-map` accepts only published public assigned events. This slice uses explicit category text fields with seed guidance.
4. Verify registration closure, sold-seat/expiry races, ownership, hold/order expiry and paid confirmation against the actual database. No backend behavior is inferred from frontend tests.

Countdown is labeled an estimate because there is no server clock reference. Reload does not claim recovery: it shows current public availability and explains previous holds may remain until expiry. Full recovery acceptance remains blocked.

## Verification — revision 2

- Full `npm run check`: API drift, lint, web/mobile/shared TypeScript checks, **147 tests in 22 files**, production web build passed.
- **22 F5-specific tests**: 12 model/controller, 5 rendered picker with real MSW HTTP requests (no mocked read hook), 3 organizer setup, 2 HTTP ledger scenarios.
- Cases include keyboard selection, all 52 seats, category/limit gating, HTTP create/release, real returned IDs, read failure/retry, unknown-response blocking, malformed responses, duplicate POST prevention, release/transfer race, failed release retention, navigation while creating, exact expiry, organizer venue-scoped layout save, category retry without losing input, published configuration lock, competing claims, unauthorized release, expiry/reclaim.
- The claim/expiry/authorization scenarios run against an explicitly simulated ledger. They do not establish PostgreSQL concurrency or real API authorization.
- A Playwright browser test is included at `web/e2e/seating.spec.ts`. Attempted with local Chromium; **could not run** because browser launch fails with `socket() failed: Operation not permitted`. No visual, device-width, or real-browser accessibility pass is claimed.
- Real API integration, two real browser sessions, assigned order/payment, order/ticket/PDF agreement, owner translation review and physical/device acceptance remain unverified.

## Improvements over revision 1

- Interactive SVG: pointer and Enter/Space selection share state with the button list; named controls, pressed/disabled states and visible keyboard focus. Category and per-order limits apply to both representations.
- Injectable read/write transport and an identity-scoped, abortable read hook. Visible-tab polling retains the last snapshot while loading but disables reservation until fresh data arrives; failed reads hide availability.
- Hold release requests are coalesced. Checkout cannot transfer while release is pending. Invalid prices/limits fail before any write.
- Local selection is reconciled after availability changes. Error focus, localized conflict recovery and explicit retry remain available.
- A working development-only reservation demo replaces the previous map-only demonstration. It includes simulated held-state updates, expiry, release and a checkout payload preview. It does not create an order or ticket.
- Source was formatted for review. No new runtime dependency was added.

## Frontend-only demo

1. Enable development mocks in `frontend/.env.local` (`VITE_ENABLE_MOCKS=true`) and run `npm.cmd run dev:web` from `frontend/`.
2. Open `http://localhost:5173/dev/seating`. Sign in as `organizer@example.com` / `BiletFlow123!`. Pick a language with the header control.
3. Choose Demo Standard or Demo VIP. Select seats by clicking the SVG, using Enter/Space on a focused SVG seat, or using the equivalent seat-list buttons. Standard has a four-seat limit; VIP has a two-seat limit.
4. Hold selected seats. Inspect the confirmed hold and estimated countdown. Release explicitly, or continue to inspect the actual returned hold-group/seat payload. Release the demo hold from that preview.
5. This route exists only in development with mocks enabled. Refreshing resets in-memory demo reservations. Separate real browser tabs are not a shared database race test.
6. For organizer setup, create a draft/ticket type through F2, follow Seating setup, choose Assigned seats / Demo Standard hall and save. Save each category separately (`standard` or `vip`). Publish from F2 and view its public Seats link. That live-shaped route remains read-only pending the backend/F3 gaps above.

To run the included browser test locally: from `frontend/`, run `npx.cmd playwright install chromium`, then `npm.cmd run test:e2e --workspace @biletflow/web -- seating.spec.ts`. Playwright starts its own development server; stop a running server on 5173 first.

A frontend mock is not a real reservation test. Do not mark UC8 or F5 complete until the backend contract gaps and F3 handoff are integrated and the two-session race/expiry/purchase journey passes.
