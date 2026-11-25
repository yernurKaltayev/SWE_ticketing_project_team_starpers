# Mobile app parity (F7 extension) — short design

## Intent
The instructor requires the mobile app to offer everything the web app does (attendee, organizer
and admin). The demo is tomorrow (2026-11-26), so a native rebuild of ~40 web screens is out of
reach. Goal: every web feature is reachable inside the Expo app tomorrow, with the door-critical
parts native.

## Goals
- Bottom tab bar in the Expo app: **BiletFlow** (embedded web), **Tickets** (native), **Check-in** (existing).
- Native Tickets: list `GET /api/v1/me/tickets`, detail with full-screen QR (`GET /tickets/{id}/qr`
  fetched with the session's bearer token), ticket number, attendee, seat, status.
- Embedded web: the deployed web app in a `react-native-webview`; Android back goes back in the
  web history; links to other hosts open in the system browser; pull-to-refresh; reload/error state.
- kk / ru / en copy for every new string, matching existing mobile copy files.

## Non-goals (tomorrow)
- Native rebuilds of browse/checkout/organizer/admin screens.
- Automatic sign-in handoff from the native session into the web view (needs backend work).
  The web view keeps its own cookie session after one sign-in.
- PDF/CSV downloads inside the web view.

## Anti-goals
- No change to check-in behaviour or its server-authoritative rules.
- No QR generated on the device: the QR image always comes from the server.

## Approaches considered
- **A. Native rebuild of every screen** — real native app, but weeks of work. Rejected for tomorrow;
  remains the long-term direction.
- **B. Native core + embedded web (chosen)** — everything reachable now; embedded parts feel like a
  website. Picked by the user because of the deadline.
- Shared RN-web codebase / whole-app web wrapper — dropped (throws away the web app / not a real app).

## Decisions
- Web URL: `EXPO_PUBLIC_WEB_ORIGIN`, falling back to `EXPO_PUBLIC_API_ORIGIN` (deployed: same origin).
- New deps via `npx expo install`: `react-native-webview`, `@react-navigation/bottom-tabs`.
- Branch `feat/f7-mobile-parity-slyamshaikhov`.

## Left to the builder
Tab icons, exact layout of the ticket card, QR refresh-on-focus.
