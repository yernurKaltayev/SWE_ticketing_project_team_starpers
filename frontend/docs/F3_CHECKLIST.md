# F3 — Free checkout, orders, and attendee tickets

Owner: **Yernur Slyamshaikhov**. Evidence date: **8 November 2026**. Implementation branch: `feat/frontend-f3`, based on `master` `f94f783` at the start of this work.

**Acceptance is partial.** The free general-admission flow, same-attempt retry, owned records, and canonical QR/PDF retrieval have implementation and real-API evidence. F3's full “Done when” criterion in [FRONTEND_PLAN.md](../../FRONTEND_PLAN.md) still requires physical A4/grayscale printing and admission/duplicate scanning through F7, plus the remaining checks below. A build pass or a scoped visual-review verdict does not complete that criterion.

The actual brief is the repository-root [PRODUCT.md](../../PRODUCT.md). This extends the existing functional paper/green UI. Figma screens, fonts, branding, assets, and layouts remain unapproved for implementation. No backend source was changed by F3. F2/F5/F6/F8 remain Dias's modules; F3 makes only minimal registration-entry links in F2 and consumes agreed interfaces within checkout.

## Implemented

Checked items in this section describe code, not completed integrated acceptance.

- [x] Protected, account-keyed routes for checkout and owned order/ticket records, with safe sign-in return handling:

  | Route | Purpose |
  | --- | --- |
  | `/events/:eventId/checkout` | Free general-admission quantity, attendee details, review, registration/recovery |
  | `/account/orders` | Paginated owned order history |
  | `/account/orders/:orderId` | Order detail, authoritative totals, current status, issued tickets |
  | `/orders/:orderId/status` | Same owned status/recovery surface |
  | `/account/tickets` | Paginated owned tickets with event title/date, ticket type, attendee and status |
  | `/account/tickets/:ticketId` | Ticket identity, event/venue, attendee, optional seat, status, canonical QR/PDF |

- [x] Public discovery cards and public detail have a direct Registration entry link. The link on working discovery cards provides access while the separate F2 detail contract issue is reconciled; it does not repair or replace F2.
- [x] Free choices enforce available quantity and per-order limits, with exactly one valid name/email per selected ticket and a 100-ticket client bound. Paid choices cannot be treated as free through a price-unit guess. Assigned-seat checkout is unavailable until the F5 interface exists.
- [x] An explicit review lists quantities and attendees before `Register for free`. The pre-submit free total is zero and no payment-information form is shown. Current event/availability conditions are re-read before a first POST. Order request bodies contain no client-supplied totals; the accepted order page displays the backend subtotal, discount, processing fee, total, currency, and status.
- [x] Concurrent clicks share one in-flight attempt. An uncertain in-page retry retains the original body and idempotency key; edits cannot turn it into a different request. Definite server rejections allow correction without automatically replaying the write.
- [x] Only the opaque attempt key and known order ID are persisted, scoped by user and event. Attendee details remain in memory and are cleared on account change. Recovery-storage failure prevents POST dispatch. See the recovery boundary below.
- [x] Known-order recovery offers the existing order instead of another registration. Starting another registration requires a fresh read of a resolved server order. Unknown outcomes remain blocked until resolved.
- [x] Sold-out/closed/unavailable choices, changed inventory, validation, request failure, denial, and malformed contract data have explicit states. Recoverable order information is retained. Pending/delayed issuance uses bounded status rechecks and an explicit refresh; no expiry countdown is invented because `OrderOut` has no `expires_at`.
- [x] Confirmed order/ticket pages remain accessible from the account without relying on an email. `is_simulated` orders visibly display “Simulated”; pending is not presented as confirmation or payment success.
- [x] Ticket lists obtain authoritative event title/date through parallel, account-scoped queries, with one query per distinct event rather than per ticket. Missing event reads show an explicit fallback.
- [x] Current ticket status controls admission access. A failed/denied ticket-status read hides cached ticket data and its QR. A failed/denied QR-only read also removes the old QR; explicit retry can restore the canonical image.
- [x] Authenticated QR/PDF requests use canonical backend ticket paths, validate binary responses, and do not trust arbitrary response URLs. The browser downloads the backend PDF for the standard browser/PDF viewer print flow. Printing does not create a new ticket in the client.
- [x] Shared labeled fields, native controls, status badges and error styling are reused. Errors receive focus, review receives heading focus, long content wraps, and the layout becomes one column at the existing 680px breakpoint. kk/ru/en copy is present; owner language and accessibility acceptance remain pending.

## Verification recorded on 8 November 2026

These are implementation-session results. The documentation handoff read source, the safe evidence record/logs, and representative final captures; it did not rerun the build, browser, or backend.

| Evidence | Result | Limit |
| --- | --- | --- |
| `npm.cmd run check` from `frontend/` | Passed API-generation drift check, lint, all workspace TypeScript checks, **105 tests in 14 files**, and production web build | Automated/component/fixture coverage does not prove physical admission or every live lifecycle |
| iOS and Android Expo exports | Both passed after the shared binary-response transport change | No new physical-device passes; an export is not device acceptance |
| Real local API setup with mocks off | Disposable accounts verified through MailHog; event, free type and publication created through real API; UI selected two tickets | Local integration evidence; no production deployment or external messages sent |
| Real order with injected response loss | The browser deliberately dropped the response **after** the POST committed. An explicit identical-key/body retry resulted in **one order, two tickets and two organizer attendee API rows**. Availability changed from 8 to 6 once; total and fee were zero | Client response-loss injection, not a server outage/failure test; organizer attendee evidence is an API read, not a completed F6 organizer UI |
| Known-order reload/sign-in recovery | Existing order was found and duplicate checkout submission was blocked | Does not solve a reloaded unknown outcome whose original body is lost |
| Actual nonowner requests | Order detail, QR and PDF returned **403**, with request IDs retained in the evidence record | Covers those requests/accounts; not an exhaustive permissions audit |
| Canonical artifacts | Real PNG QR rendered; real protected PDF downloaded as `live-ticket.pdf`; A4 rendering inspected | Physical color/grayscale quality and scanner readability are still unverified; long event-title truncation is a backend P8 issue |
| Responsive/locales | 1280/390/320px captures and kk/ru narrow wrapping checked; no page overflow recorded | Not a complete device, screen-reader, zoom, contrast, or translation audit |
| Production preview | Protected routes required sign-in with safe return preserved; development foundation route showed client “Page not found”; zero service workers; built-output marker scan found no mock fixtures/runtime | Production-build local preview, not hosting/deployment acceptance |

The retained safe run is [live-evidence.json](../web/output/f3/live-evidence.json), with [live-run.log](../web/output/f3/live-run.log). Its order is `fe80486c-b9e8-4725-857f-26aa45efe611`, status `free_confirmed`, with two POST attempts and one resulting order. Logs/artifacts are local evidence under `web/output/f3`; they may be ignored by Git. Disposable example data in captures is test data.

### Injected/fixture evidence — separate from live backend behavior

| Scenario | What was checked | What is not claimed |
| --- | --- | --- |
| Post-commit client response loss | Explicit same-key/body replay and one resulting order/ticket set against the real API | A real server failure |
| PDF `503` | Error left ticket/order usable; removing the injection allowed a real successful download | A naturally occurring backend PDF outage |
| Ticket-status read failure and separate QR-only `403` | Old admission QR removed; QR-only explicit retry restored the real image | A real backend revocation/lifecycle event |
| Delayed tickets and simulated pending order | UI did not invent issuance, free confirmation, or payment success; refresh/recovery copy remained available | Actual delayed backend issuance or completed F4 payment |
| Model/coordinator/component tests | Live availability envelope and old static array fallback, malformed data, free-only gating, attendee binding/caps, stable retry, no-storage no-write, account isolation, known/unknown recovery, inventory rejection, denial, QR invalidation, event-query deduplication, pending display | Full real-backend coverage of each inventory/lifecycle/race condition |

## Unknown-outcome recovery boundary

P5 has no lookup-by-idempotency-key endpoint. The client therefore distinguishes three cases:

1. **The original page/process still holds an uncertain body:** preserve that exact body/key and allow an explicit same-attempt retry; do not allow an edited or fresh attempt.
2. **The backend order ID is known:** reload/sign-in can recover the owned order, refresh its status, and keep a duplicate submission blocked.
3. **Reload lost the original body before the outcome/order ID became known:** persist no attendee PII, offer My orders/organizer recovery, and remain fail-closed. Do not reconstruct a request or create a new key to bypass uncertainty.

If recovery storage is blocked before submission, no order POST is sent. This conservative boundary is implemented and tested; fully automatic recovery of case 3 requires an agreed backend reconciliation contract. Clearing site storage is not an acceptance/recovery procedure.

## External contract and ownership handoff

| Dependency | Current boundary / next action | Owner coordination |
| --- | --- | --- |
| F2/P3 public availability | Real F2 public detail produced `tickets.data?.map is not a function`: its older static array assumption differs from live `{ registration_open, ticket_types }`. F3 validates the live envelope itself and still supports agreed old static array fixtures. F2 ticket/venue APIs also differ from older static assumptions. Reconcile those contracts and re-run integrated public detail → checkout | Dias / Dos; no F2 takeover or backend rewrite in F3 |
| P9 notifications | Registration/ticket email delivery is a logging stub. Confirmation/account access works without it. P1 verification/reset mail reaching MailHog is separate evidence and does not prove ticket mail | Yernur (backend) |
| P8 PDF layout | Backend A4 PDF is retrievable and rendered; long event titles truncate. Correct and verify varied/long event data before final PDF acceptance | Dima (backend) |
| Refund-policy readback / images | Terms cannot be read back from the current event contract; UI tells attendees to confirm terms with the organizer. Image attachment remains an external contract gap | Dias with Dima / Dos |
| P5 unknown-outcome lookup | No lookup by idempotency key. Agree reconciliation if automatic recovery after lost body is required; preserve the fail-closed client behavior until then | Dos with F3 owner |
| Paid completion / assigned seating / promotions | F4, F5 and F8 remain later dependencies. F3 adds no guessed price conversion, payment result, seat hold, or promotion rules | Yernur for F4; Dias for F5/F8 |
| Admission scan | Printed/digital duplicate rejection depends on the actual F7 Event Admin app and backend check-in state | Yernur with Dima |

## Remaining acceptance

- [ ] Reconcile F2 live availability/ticket/venue contracts with Dias/Dos; demonstrate the complete real public discovery → working public detail → free checkout journey. Record the shared backend/database revision used for the team acceptance run.
- [ ] Verify remaining real inventory/lifecycle cases: closed/changed/sold-out registration, validation failure, genuine delayed issuance where supported, and two-session inventory contention. Keep injected and real evidence labeled separately.
- [ ] Finish P9 registration/ticket mail and verify real notification delivery/recovery separately from P1 account emails. Until then, do not promise email delivery.
- [ ] Resolve backend PDF long-title truncation; check event name/date/time/venue, ticket type, attendee, optional section/row/seat, ticket ID/QR and absence of unnecessary sensitive/card data across representative content.
- [ ] Print the server PDF on physical A4 in color and grayscale, confirm legibility and the same digital/printed ticket identifier, scan the grayscale print through the actual Event Admin app, then verify its digital copy is rejected as already used. This is required F3/F7 acceptance, not optional polish.
- [ ] Complete owner review of all kk/ru wording and date presentation, keyboard navigation/focus recovery, screen-reader use, zoom/text sizing and the remaining WCAG 2.1 AA checks at supported widths/devices.
- [ ] Keep the user-deferred earlier F0/F1 Android physical-device and genuine access-expiry/refresh checks explicit in their original checklists. F3 exports do not complete them.

## Visual and review handoff

The ordinary-extension documentation comparison is recorded in [design-review.md](../web/output/f3/design-review.md). The incumbent `web/src/index.css` and `web/src/auth/ProfilePage.tsx` were checked against F3's source and final captures; no system/identity replacement was introduced. This documentation pass preserves those source files and creates no `DESIGN.md` or `.impeccable/design.json`.

The independent finish review initially required a corrected ticket-list capture, then identified two material fixes: QR-specific retained data and missing event identity in the ticket list. Both fixes were implemented, regression-tested, and recaptured. The reviewer scored **both resolved**, with disposition **ship at the scope of those two findings**, and reported no regressions in the nine supplied fix captures. That verdict is not whole-F3 acceptance. The web mechanical detector ran once and returned `[]`.

No commits, pushes, publication, or Git writes were performed by the agent during this work. The documentation handoff changes only this checklist and the optional local visual-evidence note.
