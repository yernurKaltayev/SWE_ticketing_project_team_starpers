# F4 — Payments, paid-sales activation and payouts

Implemented on `feat/frontend-f4`, 8 November 2026. Owner: Yernur Slyamshaikhov.
The existing functional paper/green interface is retained. This is not a Figma design implementation.

## Implemented

- Per-event organizer activation at `/organizer/events/:eventId/activation`: backend checklist, simulated identity verification, verified payout-account selection, explicit simulation terms acceptance and one-time fee payment. Suspended sales remain blocked.
- Payout-account creation, replacement details and confirmed deletion at `/organizer/payout-accounts`. IBAN checksum validation; only masked saved details displayed; the input is cleared after saving. Full IBANs are not put in browser storage or retained in mutation variables after completion.
- Paid general-admission ticket selection in F3, gated by the event's `paid_sales_status`. Free tickets remain selectable independently. Order creation retains F3's idempotent attempt/body recovery.
- Pending orders expose authenticated P6 sandbox success/failure controls. Order amounts and organizer deductions come from the API; no buyer service fee or activation amount is invented. No real card form or external checkout redirect is introduced.
- Account-scoped opaque payment IDs survive reload. After signing in again under F1's existing memory-session policy, the payment is retrieved from P6. If no ID was saved, explicitly starting/resuming recovers P6's existing pending intent. Writes are not automatically retried. GET polling is bounded and has manual refresh.
- Lost payment responses trigger authoritative payment/order readback. The client does not generate tickets or mark an order paid. Failed/expired/cancelled orders link back to events; F3's existing order check permits a new registration only after the prior attempt is terminal. Failed activation payments can start a new intent.
- Event financial summaries at `/organizer/events/:eventId/financials`; paginated payout history at `/organizer/payouts` with scheduled/paid dates and backend amounts.
- Organizer navigation, lazy-loaded screens, account-scoped queries, loading/error/empty states, accessible labels and English/Russian/Kazakh copy.

## Contract details

- P6 routes and schemas are documented in `backend/docs/p6-payments-implementation.md`. Existing generated API types still match the checked-in OpenAPI contract.
- Live P3 availability is an envelope (`registration_open`, `ticket_types`), while the older F2 contract/mocks are an array. Checkout accepts both. P3 exposes the persisted `price_amount` as a decimal string; P5 uses that same stored value as integer **tiyn**. F4 preserves integer values (including `.00` serialization) without multiplying by 100. Fractional tiyn/unsafe amounts are unavailable for paid selection. A real `250000` fixture produced a 2,500 KZT order and payment.
- P6 supplies the current activation fee only when an intent is opened. The user reviews that returned amount before choosing a simulated outcome. The local platform override was 15,000 KZT during browser verification, demonstrating that the UI does not hardcode the default.
- Production legal terms are not supplied by the API/repository. The acceptance control explicitly describes classroom simulation terms.
- Payout lists lack event titles and event time zones; rows link by event ID and display dates using the project's Kazakhstan timezone (`Asia/Almaty`). No bank transfer or actual payout settlement runs in the client.

## Verification

- `npm run check`: API consistency, lint, web/mobile/shared type checks, **125 tests** after event-navigation follow-ups, production web build.
- Automated F4 coverage: inactive/active paid choices, free registration preservation, paid order issuance after confirmation, response-loss readback, pending payment recovery after remount, failure without tickets, activation failure/retry, checklist completion, suspension, IBAN validation/masking, linked-account deletion denial, localized empty states, financial amounts and scheduled/paid payout pagination. Existing F0–F3 tests continue passing.
- Real local API/browser flow: disposable organizer/attendee registered and email-verified through MailHog; paid/free types created and event published; inactive paid selection blocked while free remained available; payout account created/masked; identity/account/terms/fee completed; activation and ticket payment recovered after reload and reauthentication; paid order issued a ticket after confirmation; dropping a real successful simulation response still recovered the paid order; attendee denied access to organizer activation.
- Real financial response: gross `250000`, fees `7500`, refunds `0`, estimated payout `242500` tiyn. Financial page and empty payout history displayed correctly.
- Browser captures at 1280, 390 and 320 pixels for accounts, activation payment/active state, pending/confirmed order, financials and payout history: no page overflow. Pending payment also captured in kk/ru/en at 320 pixels. Screens inspected against the existing controls, spacing, colors and typography; no design-system changes were made. Mechanical UI detector returned no findings.
- Local API/worker images were rebuilt because the previous running image had no P6 routes. Database and storage volumes were retained. Disposable `F4 local acceptance … (disposable)` events/test accounts remain in the local database. Browser scripts/captures are local ignored artifacts under `frontend/web/output/`.

## Remaining acceptance and team dependencies

**User decision:** Manual F4 acceptance checks are deferred until later. The implementation and automated/browser evidence below do not mark the outstanding owner/team acceptance complete.

### Event editor follow-up

The reported blank Create event page was traced to live P4 returning a venue array while F2 expected a paginated envelope. The editor now validates and normalizes both formats. Saved-event ticket lists also accept live P3 arrays and normalize its `qty_*` counters/decimal serialization; complete arrays do not offer false extra pages. Paid ticket writes explicitly include `is_free: false` and KZT, avoiding P3's default free-ticket validation. A real browser run created an event, saved a 2,500 KZT paid ticket, reopened its price unchanged, and recorded no page errors or overflow at 1280/390 pixels. Regression tests cover the live response shapes.

### Event details and navigation follow-up

The user's event `/events/c3777b61-7e8c-407f-add4-20bd93032f44` crashed because live public availability is an envelope rather than the array F2 rendered. Public detail/protected preview now normalize this response and validate event/venue data before rendering dates, images and ticket prices. Event discovery and editor responses also validate their render inputs; malformed error details no longer crash the error display. Route and root error boundaries provide localized recovery instead of removing the application. Route failures preserve navigation and retry remounts the page without replaying order/payment actions.

Verified the exact reported event, five discovery-card links, and recovery navigation after an intentionally injected render error in the real browser. The reported event was captured at 1280/390/320 pixels without overflow. Regression tests cover the live availability envelope, malformed responses, and boundary retry/navigation. Other F2 feature handoff/owner acceptance remains separate.

- Owner review of kk/ru wording, keyboard/screen-reader behavior, zoom and supported real devices remains required; viewport checks do not establish full accessibility compliance.
- Suspension is covered by controlled frontend fixtures; a real P11 admin suspend/resume journey remains a team integration check. Failed payment/retry and populated payout statuses have controlled test evidence; the live run exercised successful payment, dropped response and empty payout history, not a time-advanced worker payout.
- Initial F4 acceptance used direct checkout routes. The subsequently reported F2 venue/ticket/detail response crashes were fixed as documented above; remaining F2 feature work and full owner acceptance remain assigned to Dias/Dos.
- F3's outstanding P9 email, physical F7 print/scan and prior F0/F1 deferred checks remain in their checklists.
- No commits, push or pull request were created by this implementation task.
