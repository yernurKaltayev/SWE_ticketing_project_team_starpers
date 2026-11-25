# Mobile Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every web feature reachable in the Expo app: bottom tabs BiletFlow (embedded web) / Tickets (native QR) / Check-in (existing).

**Architecture:** Pure logic (paths, status tones, URL policy) in `*.ts` model files with vitest tests; thin screens in `*.tsx`. App.tsx swaps the Home stack screen for a bottom-tab navigator; existing stack screens (CheckIn, Settings, Connection) stay and gain TicketDetail.

**Tech Stack:** Expo SDK 58, React Native, `@react-navigation/bottom-tabs` v7, `react-native-webview`, vitest, `@biletflow/shared` session.

**Spec:** `docs/superpowers/specs/2026-11-25-mobile-parity-design.md`

## Global Constraints
- All new user-visible strings exist in kk, ru and en.
- QR images only from `GET /api/v1/tickets/{id}/qr` via `session.request(..., { responseType: "blob" })`; never generated on device.
- Web origin = `process.env.EXPO_PUBLIC_WEB_ORIGIN || process.env.EXPO_PUBLIC_API_ORIGIN`.
- Deps installed with `npx expo install` from `frontend/mobile` (Expo-Go compatible versions); one lockfile at `frontend/`.
- Check-in behaviour unchanged.
- `npm run check` (from `frontend/`) and `npm run export:mobile` pass before PR.

## Review Focus
- Signed-out user opens Tickets tab → sign-in panel, not an error or empty list.
- Refunded/cancelled ticket → QR still shown but status pill is danger and says it will be rejected.
- Web view link to another host (e.g. maps, Telegram) → opens system browser, web view stays.
- Web view offline / server down → error card with Reload, not a blank white screen.
- Sign-out in Settings → Tickets list and any opened ticket detail cleared (keyed by user id).

---

### Task 1: Tickets model

**Files:**
- Create: `frontend/mobile/src/tickets/model.ts`, `frontend/mobile/src/tickets/model.test.ts`

**Interfaces — Produces:**
- `type MyTicket = components["schemas"]["TicketOut"]`; `type TicketPage = components["schemas"]["PageTicketOut"]`
- `ticketPaths = { mine: (offset = 0, limit = 50) => string, qr: (id: string) => string, event: (id: string) => string }`
  → `/api/v1/me/tickets?limit=50&offset=0`, `/api/v1/tickets/{id}/qr`, `/api/v1/events/{id}`
- `ticketTone(status: string): "success" | "warning" | "danger" | "neutral"` — valid→success, checked_in→warning, refunded|cancelled→danger, else neutral
- `isAdmissible(status: string): boolean` — true only for `"valid"`
- `blobToDataUri(blob: Blob): Promise<string>` (FileReader.readAsDataURL)

- [ ] Step 1: tests — paths encode ids (`ticketPaths.qr("a/b")` contains `a%2Fb`); `ticketTone` for the four statuses + unknown; `isAdmissible("valid") === true`, `isAdmissible("checked_in") === false`.
- [ ] Step 2: `npx vitest run mobile/src/tickets` → FAIL (module missing).
- [ ] Step 3: implement.
- [ ] Step 4: same command → PASS.
- [ ] Step 5: commit `feat(f7): tickets model for mobile`.

### Task 2: Web view policy

**Files:**
- Create: `frontend/mobile/src/web/model.ts`, `frontend/mobile/src/web/model.test.ts`

**Interfaces — Produces:**
- `webOrigin: string | null` (from Global Constraints env rule; null if unset/invalid)
- `isInternal(url: string, origin: string): boolean` — same `URL.origin`; `about:blank` and `blob:`/`data:` count as internal; unparsable → false

- [ ] Step 1: tests — same origin with path/query → true; other host → false; `http` vs `https` same host → false; `about:blank` → true; `"not a url"` → false.
- [ ] Step 2: run → FAIL. Step 3: implement. Step 4: run → PASS.
- [ ] Step 5: commit `feat(f7): web view navigation policy`.

### Task 3: Screens, copy, tabs

**Files:**
- Create: `frontend/mobile/src/tickets/copy.ts`, `frontend/mobile/src/tickets/TicketsScreen.tsx`, `frontend/mobile/src/tickets/TicketDetail.tsx`, `frontend/mobile/src/web/WebScreen.tsx`, `frontend/mobile/src/web/copy.ts`
- Modify: `frontend/mobile/App.tsx` (Home → `Tabs` stack screen holding a bottom-tab navigator; add `TicketDetail: { ticketId: string }` route), `frontend/mobile/package.json` (deps), `frontend/mobile/.env.example` (document `EXPO_PUBLIC_WEB_ORIGIN`)

**Interfaces — Consumes:** Task 1 and Task 2 exports; `session`, `useSessionSnapshot` from `src/session`; ui primitives from `src/ui`.

- [ ] Step 1: `cd frontend/mobile && npx expo install react-native-webview @react-navigation/bottom-tabs`.
- [ ] Step 2: `TicketsScreen({ locale, onOpen(ticket) })` — FlatList, pull-to-refresh, reload on focus, load-failed callout, empty card, card per ticket (ticket type, event title from `ticketPaths.event`, attendee, seat, status pill via `ticketTone`). Signed out → `SessionPanel`.
- [ ] Step 3: `TicketDetail({ ticketId, locale })` — loads ticket from `/api/v1/tickets/{id}`, QR via blob → `blobToDataUri` → `<Image>` ≥ 280 px on white, ticket number, status; non-admissible status shows danger callout.
- [ ] Step 4: `WebScreen({ locale })` — `WebView` at `webOrigin`; `onShouldStartLoadWithRequest` → `isInternal` else `Linking.openURL` + false; Android `BackHandler` → `goBack()` when `canGoBack`; `pullToRefreshEnabled`; `renderError` → card with Reload; `sharedCookiesEnabled`; missing origin → callout naming the env var.
- [ ] Step 5: tabs in App.tsx: BiletFlow (initial), Tickets, Check-in (existing EventsScreen / signed-out panel); Settings header action on all tabs.
- [ ] Step 6: from `frontend/`: `npm run check` → all green; `npm run export:mobile` → succeeds.
- [ ] Step 7: commit `feat(f7): bottom tabs with embedded web and native tickets`.

### Task 4: Phone smoke + docs
- [ ] Step 1: Metro `npx expo start -c`; on phone: web tab loads deployed site, sign in, buy/register; Tickets tab shows the ticket and QR; Check-in tab scans it → accepted, rescan → already used.
- [ ] Step 2: add "Mobile parity" section to `frontend/docs/F7_CHECKLIST.md` (what's native vs embedded, known limits from spec Non-goals, smoke evidence).
- [ ] Step 3: commit `docs(f7): mobile parity checklist`, push, open PR to `master`.
