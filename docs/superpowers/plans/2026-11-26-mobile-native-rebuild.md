# Mobile Native Rebuild — Roadmap and Work Packages (F11)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Each work package (WP) below is planned in detail (writing-plans) when its owner picks it up; this document fixes the order, boundaries, interfaces and acceptance so packages can be split between people.

**Goal:** Replace every web screen in the Expo app with a native React Native screen, until the embedded web tab (F7 parity, `2026-11-25-mobile-parity.md`) can be removed.

**Architecture:** Strangler pattern. The tab shell from F7 parity stays. Logic that is already DOM-free (`model.ts`, `copy.ts`, API paths) moves from `web/src/<area>/` into `shared/src/features/<area>/` and is imported by both apps, so web and mobile cannot drift. Each WP adds native screens for one web area and registers its web paths in a route map; the embedded web view intercepts those paths and opens the native screen instead. When the map covers every web route, the web tab is deleted.

**Tech Stack:** Expo SDK 58 (Expo Go compatible only), React Navigation 7 (native-stack + bottom-tabs), `@tanstack/react-query` (same as web), `react-native-svg` (seat map, QR, charts), `expo-image-picker`, `@react-native-community/datetimepicker`, `expo-file-system` + `expo-sharing` (PDF/CSV/ICS), vitest for logic.

**Depends on:** `docs/superpowers/plans/2026-11-25-mobile-parity.md` merged (tab shell, `WebScreen`, `isInternal`, native Tickets).

## Global Constraints
- Every user-visible string in kk / ru / en, taken from the shared `copy.ts` of the area (no new mobile-only copy files unless the text is mobile-specific).
- No browser APIs in `shared/` (`document`, `window`, `localStorage`, DOM types). Lint rule or vitest guard enforces it (WP F0.1).
- Server stays authoritative: totals, discounts, availability, check-in, permissions are never computed only on the device.
- Only Expo-Go-compatible deps, installed with `npx expo install` from `frontend/mobile`; single lockfile in `frontend/`.
- Every WP: logic tests in vitest, `npm run check` + `npm run export:mobile` green, checked on one Android and one iPhone before merge.
- Branch per WP: `feat/f11-<wp-id>-<short-name>-<owner>` (e.g. `feat/f11-a3-discovery-dias`), PR reviewed by the other frontend owner.
- A WP is done only when its web paths are in the native route map (`mobile/src/navigation/routes.ts`) so the web view stops showing them.

## Review Focus (applies to every WP)
- Signed-out or expired session on a protected screen → sign-in prompt, then return to the same screen.
- Slow / offline network → loading and error-with-retry states; no blank screens; no duplicate POSTs on retry (reuse idempotency keys like web `checkout/attempt.ts`).
- Organizer A cannot see organizer B's data → screens rely on server 403/404 and show the shared "no access" state.
- Small phone (360 pt wide) and large text setting → no clipped buttons or horizontal scrolling.
- Android hardware back and iOS swipe-back → leave forms only after a discard confirmation when there are unsaved changes.

---

## Phase 0 — Foundations (one person, before any other WP)

### F0.1 Move portable logic to `shared` — size M — **done** (`docs/superpowers/plans/2026-11-26-f11-f0-1-shared-logic.md`)
- As built: 26 files moved from `web/src/<area>/` to `shared/src/features/<area>/`, imported as `@biletflow/shared/features/<area>/<file>` (export `"./features/*": "./src/features/*.ts"`; no per-area `index.ts`, which avoids name clashes between `copy` and `model`). Each old web path is a one-line `export *` stub. Logic tests moved to `shared/tests/features/<area>/`; `insights/model.test.ts` stays in web (uses web mocks).
- Guard: `shared/tests/features.test.ts` fails if `shared/src` uses browser or React APIs, and if any old web path stops being exactly its one-line stub (no duplicated file).
- Not moved (browser-bound, stay in web): `checkout/attempt.ts` (sessionStorage), `support/data.ts`, `operations/data.ts`, every `data.ts`.
- **Deferred to F0.2:** the `KeyValueStore` interface in shared (`get/set/remove: Promise`, `localStorage` on web, SecureStore on mobile) and the query-key factories. Both are needed only once mobile has a data layer, and F0.1 was kept a pure move with no behaviour change.

### F0.2 Data layer on mobile — size M
- Add `KeyValueStore` to shared (see F0.1 deferral); web implements it with `localStorage`, mobile with SecureStore; `checkout/attempt.ts` logic that does not touch storage moves to shared on top of it.
- Move the web query keys (e.g. `["f3", user?.id, path]` in `web/src/checkout/data.ts`) into key factories in `shared/src/features/<area>/keys.ts`; web `data.ts` files use them.
- Add `@tanstack/react-query` to mobile with one `QueryClient`; `queryClient.clear()` on sign-out (session `onClear`).
- `useAuthedQuery` / `useAuthedMutation` wrappers over `session.request` in `mobile/src/data.ts`, same key factories as web.

### F0.3 Navigation shell and route map — size M
- Tabs: **Discover** (A3/A4), **Tickets** (A7/A8), **Organizer** (shown when `user.role === "organizer"`), **Check-in** (existing), **Account** (A1/A2/A9/A10, Admin entry for `platform_admin`). Until a tab's WPs land, it shows `WebScreen` at the matching web path.
- `mobile/src/navigation/routes.ts`: `nativeRouteFor(path: string): { screen: string; params: object } | null` mapping web paths (e.g. `/events/:eventId` → `EventDetail`). `WebScreen` calls it in `onShouldStartLoadWithRequest` and navigates natively when non-null. Tested in vitest with every web path from `web/src/App.tsx`.
- Deep links (`biletflow://` + https) use the same map.

### F0.4 Native UI kit additions — size M
In `mobile/src/ui.tsx` (or `ui/` folder): `FormField` (label, hint, error), `Select` (bottom-sheet list), `DateTimeField` (datetimepicker, shows event time zone), `MoneyInput` (KZT, stores tiyn), `ImageField` (expo-image-picker → presigned upload helper), `ConfirmSheet`, `EmptyState`, `ErrorState` (retry), `ListScreen` (FlatList + pull-to-refresh + pagination), `Tabs/Segmented` (exists), `Badge/Pill` (exists).
- `mobile/src/files.ts`: `downloadAndShare(path, filename, mime)` for PDF / CSV / ICS through the session (bearer) → expo-file-system → expo-sharing.

---

## Phase 1 — Attendee (demo-critical; packages are independent after Phase 0)

| WP | Screen(s) | Web source to port | Notes | Size |
|---|---|---|---|---|
| A1 | Register, sign in, verify email, forgot/reset password, phone verification | `auth/AuthPage.tsx`, `auth/PhoneVerification.tsx` | Extends existing `SessionPanel`; email links open the app via deep link | M |
| A2 | Account / profile | `auth/ProfilePage.tsx` (attendee part) | | S |
| A3 | Event discovery: list, search, category/date/city filters | `events/Discovery.tsx` | `ListScreen` + filter sheet | M |
| A4 | Event detail, add to calendar, report event | `events/Detail.tsx`, `calendar/CalendarActions.tsx`, `insights/ReportEvent.tsx` | ICS via `downloadAndShare` | M |
| A5 | Seat picker | `seating/SeatPicker.tsx`, `seating/useSeatMap.ts` | `react-native-svg`, pinch-zoom/pan, 44 pt touch targets, accessible list fallback | L |
| A6 | Checkout incl. promo entry and sandbox payment | `checkout/CheckoutPage.tsx`, `promotions/PromoEntry.tsx`, `payments/PaymentPanel.tsx`, `checkout/attempt.ts` | Idempotency keys via `KeyValueStore`; "DEMO/SIMULATED" label kept | L |
| A7 | My orders, order detail | `checkout/Orders.tsx` | | M |
| A8 | My tickets: finish (PDF share) | `checkout/Tickets.tsx` | List/QR already native from F7 parity; add PDF via `downloadAndShare` | S |
| A9 | Notifications | `support/Notifications.tsx` | mark-as-read; badge on Account tab | S |
| A10 | Support: case list, new case, thread (polling) | `support/Cases.tsx`, `NewCase.tsx`, `Thread.tsx`, `drafts.ts` | Poll `?after=` only while screen focused | M |

Suggested split for two people: person 1 → A1, A2, A3, A4, A9; person 2 → A5, A6, A7, A8, A10 (A6 waits for A5 only for assigned-seating events; GA checkout can ship first).

## Phase 2 — Organizer

| WP | Screen(s) | Web source to port | Notes | Size |
|---|---|---|---|---|
| O1 | Organizer profile | `auth/ProfilePage.tsx` (organizer part) | | S |
| O2 | My events list, create/edit event, ticket types, new venue | `events/Editor.tsx`, `events/ui.tsx` | Split into steps (details → date/venue → tickets → publish) instead of one long form; images via `ImageField` | L |
| O3 | Event seating setup | `seating/Pages.tsx` | | M |
| O4 | Preview, duplicate, archive | `events/Detail.tsx` (preview), `insights/DuplicateEvent.tsx`, `insights/Archive.tsx` | | S |
| O5 | Event staff | `staff/StaffPage.tsx` | | S |
| O6 | Promotions: campaigns, codes, Campaign QR, report | `promotions/Campaigns.tsx` | Campaign QR image shared via `downloadAndShare` | M |
| O7 | Orders, attendees, refunds workspace + CSV | `operations/Workspace.tsx` | Tables become cards; CSV via `downloadAndShare` | L |
| O8 | Paid-sales activation, financials, payout accounts, payouts | `payments/Organizer.tsx` | | L |
| O9 | Analytics, event history | `insights/Analytics.tsx`, `insights/History.tsx` | Charts with `react-native-svg` (no web chart lib) | M |

## Phase 3 — Platform admin

| WP | Screen(s) | Web source to port | Notes | Size |
|---|---|---|---|---|
| X1 | Admin search: users, events, orders, refunds, activations, reports, support | `insights/Admin.tsx` (`Search`) | One generic list screen driven by shared `adminFields/adminQuery` | M |
| X2 | Disputes, settings, exports | `insights/Admin.tsx` (`Disputes`, `SettingsPage`, `Exports`) | CSV via `downloadAndShare` | M |

## Phase 4 — Finish

- **Z1** Route map covers every path in `web/src/App.tsx` (vitest asserts it) → delete `WebScreen`, the web tab and `react-native-webview`. Size S.
- **Z2** Full acceptance on Android + iPhone: free flow, paid flow with seats and promo, refund → rejected at check-in, organizer creates and publishes an event from the phone, admin settings change. Record evidence in `frontend/docs/F11_CHECKLIST.md`. Size M.

## Dependency order
Phase 0 (F0.1 → F0.2, F0.3, F0.4 in parallel) → any Phase 1 WP → Phase 2 (O2 before O3/O4/O6) → Phase 3 → Phase 4. Phases 2 and 3 can start while Phase 1 is still in progress if people are free.
