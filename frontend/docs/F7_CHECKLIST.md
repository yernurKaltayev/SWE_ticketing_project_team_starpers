# F7 — Event Admin mobile app and online check-in

Owner: **Yernur Slyamshaikhov**. Evidence: **17 November 2026**. Branch: `feat/frontend-f7`. Base: `master` **5fbe787** (includes merged P11–P14).

## Status

The dedicated React Native (Expo SDK 58) app now covers sign-in and session recovery, the assigned-event list, camera scanning, attendee search with manual check-in, live counts and authorized undo. Organizers manage per-event staff on the web. Small P1/P15 backend additions supply what the app needs. **Full F7 acceptance remains open** until the app has been run on a physical Android phone and an iPhone (see "Remaining proof").

## What was added

| Requirement | Implementation |
| --- | --- |
| Native app, secure session | Existing F1 session: access token in memory, refresh token in SecureStore. Sign-out or session expiry anywhere resets navigation to sign-in, so nothing from the event stays on screen |
| Assigned-event selection | Home lists `GET /me/staff-events`, re-read whenever the screen is shown and on pull-to-refresh. Scanning is offered only for published events where the role allows check-in (owner, manager, check-in). Support-only assignments are listed read-only. Platform admins get no implicit events |
| Organizer staff assignment | Web `/organizer/events/:eventId/staff`, linked from My events and the event editor. Add by account email with a role (check-in, support, manager), list, and remove with inline confirmation. Explains unknown-account, duplicate and permission errors |
| Camera scanning | `expo-camera` QR only. Permission request, denied → "open settings", re-checked on return to the app, mount failure → use search. The camera is released when the tab, screen or app is inactive |
| Duplicate frames | `createScanGate`: one verification in flight; the scanner stays locked on the result until "Scan next"; the same code is ignored for 3 s after unlocking |
| Distinct results | ADMIT, ALREADY USED, REFUNDED, CANCELLED (split from `invalid` using the returned ticket status), NOT VALID, WRONG EVENT, NOT A TICKET (Campaign QR), RESULT UNKNOWN, NO ACCESS, SESSION ENDED. Each shows a symbol, a headline and an instruction, so color is never the only cue. Distinct vibration patterns and screen-reader announcements |
| Connection failures | A network failure, or no answer within 10 s, is shown as RESULT UNKNOWN ("do not admit"), never as invalid. Nothing is admitted or queued locally. A "slow connection" notice appears after 2 s. Retry resends the same code; if the retry returns `already_used`, the app explains that the earlier attempt most likely admitted the ticket |
| Latency | The result card shows request-to-result milliseconds |
| Session refresh during a scan | A `request_not_replayed` 401 means the server did not process the scan, so it is resent once automatically |
| Attendee search / manual check-in | Server search by name or email (`GET /events/{id}/attendees`, now with `ticket_id`/`ticket_number`). Searching grants nothing; admission only through the confirmed `POST /checkin/manual`, which applies the same atomic rules and audit as a scan (`metadata.method = "manual"`) |
| Counts | Checked-in / registered / not yet arrived / %, refreshed after every admission or undo and every 30 s while visible (picks up other scanners) |
| Undo | From an ADMIT result or a checked-in attendee; reason required (≤500), explicit confirmation, server-refreshed state; `not_checked_in` conflict explained |
| Localization | kk / ru / en for all new mobile and web text |

### Backend additions (contract first, `backend/docs/openapi.yaml`)

- `GET /me/staff-events`: events the user owns or is assigned to (drafts excluded), with `role` and `can_check_in`.
- `GET /events/{id}/staff`: staff with name, email, role and date added (owner, manager or admin).
- `POST /events/{id}/staff` accepts exactly one of `user_id` or `email` (case-insensitive).
- `AttendeeOut` gains `ticket_id` and `ticket_number` (null while pending).
- `POST /checkin/manual`: `{event_id, ticket_id}` → `VerifyOut`, check-in role required.

## Verification run on 17 November 2026

- Backend: full suite **445 passed, 6 skipped** (in the API Docker image), including 14 new tests in `tests/api/test_staff_checkin_f7.py`. Ruff, format and mypy are clean. The contract test confirms every route is declared.
- Frontend: `npm run check` passed: API types match the contract, lint, typecheck, **196 tests** (17 new check-in model tests, 5 new staff-page tests), and the web build.
- Native bundling: `expo export --platform ios --platform android` succeeded.
- Live API smoke (docker compose, seeded data), all passing:
  - A new non-admin user is assigned by email, sees the event, and scans.
  - First scan accepted in 28 ms; second scan already used; count +1.
  - Campaign QR is not a ticket; a forged QR is invalid.
  - Search gives a ticket reference; manual check-in is accepted, and a later QR scan is already used.
  - Undo with a reason works, a second undo gets 409, and a re-scan is accepted.
  - Once the staff member is removed, they cannot scan and their event list is empty.

## Launching the app (no app store)

1. Backend: `cd backend && docker compose up -d --build --wait && docker compose exec api python -m scripts.seed`.
2. Find the computer's LAN IPv4 (`ipconfig`). Put it in `frontend/mobile/.env.local` as `EXPO_PUBLIC_API_ORIGIN=http://<ip>:8000`. Allow port 8000 through the Windows firewall on the private network. The phone and the computer must be on the same Wi-Fi.
3. `cd frontend && npm install`, then `npm run dev:mobile`. Scan the Metro QR with Expo Go (Android) or the iPhone Camera (iOS). `expo-camera` is part of Expo Go, so no custom build is needed.
4. On the web (`npm run dev:web`), sign in as `organizer@example.com` / `ChangeMe-Demo-123`, open **My events → Event staff**, and add the scanner's account email with the **Check-in** role.
5. In the app, sign in with that account, open the event, and scan a ticket QR from **My tickets** (web) or a printed PDF.

## Remaining proof (not yet done)

- Run on a physical Android phone and an iPhone: camera allow, deny, and re-enable in settings; scan both a digital and a printed (color and grayscale) ticket, where the first is admitted and the second rejected; check refunded, cancelled, wrong-event and Campaign QR results; sign-out and session expiry; airplane mode (unknown result); and record on-device latency.
- TalkBack/VoiceOver pass over the result announcements.
- Design pass: the app keeps the restrained styling. The Figma direction is still awaiting approval.
