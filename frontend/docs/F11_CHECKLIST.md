# F11 — Calendar (bonus) and final delivery

Owner: **Yernur Slyamshaikhov**. Evidence: **19 November 2026**. Branch: `feat/f11-calendar-delivery-slyamshaikhov`. Base: `master` **4cbb4ef** (F10 merged via PR #32).

## Status

- **Calendar (UC6, bonus):** implemented and verified against the real P14 API in the production build. Desktop (1280 px) and phone width (375 px) were checked in Chrome.
- **Delivery:** the Docker demo stack, the deep-link and session-recovery checks, and the demo runbook are done.
- **Cross-application verification:** in progress. The findings below go back to their module owners.
- **Still open:** the physical-phone and assistive-technology checks (see "Remaining proof"). F11 is not fully accepted until they're done.

## Calendar (UC6)

| Requirement | Implementation |
| --- | --- |
| `.ics` download on the event, order-confirmation and ticket pages | `web/src/calendar/CalendarActions.tsx`, placed on the public event page (F2, as an added section), on confirmed orders and on ticket detail (F3). The file comes from P14 `GET /events/{id}/calendar.ics` and is never generated in the browser. The download is rejected unless the response is a non-empty `text/calendar` |
| One-click common calendars | Google Calendar (UTC instants plus `ctz` set to the event zone) and Outlook.com compose links, opened in a new tab with `noopener noreferrer`. The new-tab behavior is announced to screen readers |
| Time zone, venue and URL | P14 writes `VTIMEZONE` and `TZID` for the event's IANA zone. The links carry the venue name, address and city. The page shows "Times are shown in the event's time zone (…)" |
| Stable identity and cancellation | P14 keeps the UID `<event id>@biletflow.kz` and increases `SEQUENCE`. A cancelled event shows only **Download updated .ics file** plus an explanation; no "add" links |
| No calendar write access | No OAuth and no provider API. Only a file download or a link the user opens |
| Privacy | The event page URL is included only for public events. An unlisted event's share token is sent only to P14, and only when the API revealed it to this viewer. It never reaches Google or Microsoft |
| Access | Anonymous visitors use the public client; signed-in users use the session (P14 then applies event-level access). 401/403/404 → "not available", network → "unable to connect" |
| Localization | kk / ru / en |
| Mock | `web/src/mocks/calendar.ts` mirrors P14 access (public, share token, managed) and labels its PRODID as a development mock |

## Delivery

| Item | Where |
| --- | --- |
| Production web image | `frontend/web/Dockerfile` (Node 24 build, then nginx). Mocks are off and the MSW worker file is removed |
| SPA deep links | `frontend/web/nginx.conf`: `try_files $uri /index.html`. Hashed `/assets/` are cached for 1 year (a missing asset returns 404, not the app). `index.html` is `no-cache` |
| Same-origin API | nginx proxies `/api/`, `/health` and `/c/` (Campaign QR) to `api:8000`, like the Vite dev proxy |
| One-command demo | `frontend/docker-compose.demo.yml` (includes the backend Compose file and adds `web` on port 5173) |
| Repeatable demo | [DEMO_RUNBOOK.md](DEMO_RUNBOOK.md): start, seed, clean reset, phone launch and the ordered acceptance script |
| Browser smoke checks | `web/e2e/delivery.spec.ts`: 375 px layout on public pages, `lang` attribute and focus, calendar download, deep-link reload, protected-link `returnTo`, not-found page |

## Verification run on 19 November 2026

- `npm run check`: API types match the contract, lint, typecheck, **371 tests** (11 new: 7 calendar model and 4 calendar UI tests; the F3 checkout flow test also now checks for the calendar on the order and the ticket), and the web build all passed.
- Playwright (mock mode, Chrome): the four `delivery.spec.ts` tests pass. On the full suite, 11 of 12 pass. The failing one is F2's `events.spec.ts`, which predates this branch (finding F11-4).
- Live, against the Docker demo stack (production build behind nginx, real API, seeded database), all passing:
  - `/health` through nginx returns ok/ok. Reloading `/`, `/events`, `/account/tickets/:id`, `/organizer/events/:id/analytics`, `/verify-email?token=…` and unknown paths returns the app with 200.
  - Real end-to-end setup: register an attendee, verify through MailHog, create a free event as organizer, publish it, and complete a free order.
  - Event page, anonymous: the calendar section renders, the `.ics` downloads with the event's UID and `TZID:Asia/Almaty`, and the Google link has `ctz=Asia/Almaty` with the venue address. There is no horizontal scroll at 1280 px or 375 px, and no page errors.
  - Opening `/account/orders/:id` directly redirects to `/login?returnTo=…`; after sign-in it returns to the order. The confirmed order and its ticket both show the calendar options.
  - After cancelling as organizer, the `.ics` keeps the same UID, `SEQUENCE` goes from 1 to 2, and `STATUS:CANCELLED` is set.

## Cross-application findings (returned to owners)

| # | Finding | Owner |
| --- | --- | --- |
| F11-1 | Unlisted events have no working web link. P14 writes `URL:/events/by-token/<token>` and P16 builds `/events/<id>?share=<token>`, but the web app has no by-token route and doesn't read `share`. Both open "not found" for an anonymous visitor. The API already has `GET /events/by-token/{token}`. Proposal: one agreed URL format (P14/P16) plus web handling (F2) | Dias (F2); Dos (P14) and Dima (P16) to agree the format |
| F11-2 | P2 `GET /events/{id}` returns 404 for a cancelled event to anyone without event access, while P14 serves its `.ics` publicly. Attendees therefore can't see the cancelled page or the updated calendar file, and their ticket page can't load event details. Proposal: return cancelled public events publicly, read-only | Dos (P2) |
| F11-3 | Signed in, in Kazakh at 1280 px, the header navigation clips "Менің тапсырыстарым". The shared date format shows "2026 M12 19" in Kazakh (ICU month names) | Yernur Slyamshaikhov (F0/F1), follow-up |
| F11-4 | `e2e/events.spec.ts:51` fails in strict mode: "Protected preview" now matches both the organizer side nav (white UI, PR #29) and the editor link. The locator needs scoping | Dias (F2 test) |
| F11-5 | The web session is in memory by design (F1). A full reload of a protected page asks the user to sign in again, then `returnTo` brings them back. This is documented behavior, not a defect, and is noted here for the demo | — |
| F11-6 | P6 `checkout_url_for` points at `/checkout/simulated/<ref>`, which has no web route. F4 deliberately ignores `checkout_url` and pays in-page, so the demo is unaffected. The backend URL is unused | Dima (P6), informational |

## Remaining proof (not yet done)

- iPhone and Android device runs of the Event Admin app against this demo stack (see F7 "Remaining proof").
- Import the downloaded `.ics` into Apple Calendar and Google Calendar (via file import), confirm the local time, then import the cancelled version and confirm the entry updates.
- Screen-reader pass (NVDA or VoiceOver) over checkout, ticket and calendar sections, and a kk/ru copy review by a native speaker.
- Run the full [demo script](DEMO_RUNBOOK.md#4-demo-script-core-acceptance-journey) end to end from a clean reset with both frontend owners.
- GA4 (optional) is not implemented. It needs an agreed consent and data policy first.
