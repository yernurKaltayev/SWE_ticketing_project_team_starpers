# F1 — Authentication, profiles and permissions

Frontend owner: **Yernur Slyamshaikhov** (distinct from Yernur, backend). This follow-up implements the F1 frontend against the existing P1 contract. It does not certify the integrated acceptance criteria. F0's remaining runtime/device/review gates remain pending in [F0_CHECKLIST.md](F0_CHECKLIST.md).

Follow the dependency-based incremental workflow and module ownership in [FRONTEND_PLAN.md](../../FRONTEND_PLAN.md). Pending acceptance evidence does not become passed when independent client implementation proceeds. Figma screens, structure, university logo, burgundy palette and DM Sans remain exploratory and have **not** been applied to application code; a design pass requires Yernur Slyamshaikhov's explicit approval and implementation request.

## Implemented scope

- Web routes: `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password`, `/account`, `/organizer/profile`.
- Register attendee/organizer accounts, explicitly submit email verification, resend verification, sign in/out, reset passwords, edit current-user and organizer contact profiles. Registration does not automatically authenticate an unverified account. Recovery/resend success messages do not reveal whether an account exists.
- Reusable labeled inputs, validation/error summaries, request IDs, pending/success states, navigation, status badges and permission/loading/error states, with kk/ru/en copy. Further tables/dialogs/pagination will be added when a module needs them.
- Organizer profiles are created by backend registration. The UI edits only `organization_name`, `contact_email` and `contact_phone`; it shows email confirmation separately from simulated organizer verification (`unverified`, `pending`, `verified`, `rejected`).
- P1 exposes no payout-account fields or terms-acceptance mutation. The organizer UI explains that payout setup belongs to the later payment integration. These controls are **pending the relevant contract/F4**, not implemented with invented fields.
- Global organizer/admin guards cover their route boundaries; those modules' business screens are not implemented here. Per-event manager/check-in/support access is not inferred from a global role. Event resources, ownership and assignments remain backend-authorized and require later integrated checks; staff-assignment screens remain F7.
- Expo Home has native sign-in/out, current user/email status, account reload and startup refresh via SecureStore. Connection/locales/the isolated F0 SecureStore probe remain available. Native registration/reset/profile editing is not added to the dedicated staff app; the web provides those account-management flows. Camera/check-in/assigned-event screens remain F7.

## Session and safety behavior

- One portable session controller per platform. Web credentials remain in memory; **browser reload signs out**. There is no local/session-storage persistence and no new cookie contract.
- Native persists only the refresh credential through the existing SecureStore adapter. Startup exchanges it before authenticated reads; access tokens stay in memory.
- Concurrent 401s share one rotating refresh operation. A late 401 does not spend the already-rotated credential again. An uncertain refresh response clears the local session instead of retrying the spent credential.
- Before sending a refresh, the controller removes the stored credential and waits for confirmed removal. Only its in-memory copy is used for that attempt. If the native process ends before a replacement is saved, the next launch requires sign-in instead of replaying the spent token and triggering P1's account-wide refresh-session revocation. A storage-removal failure prevents the refresh request entirely.
- Only GET/HEAD requests can be replayed after refresh. An expired PATCH refreshes the session but leaves the action for explicit resubmission, retaining the form draft while the session remains valid. Other failures do not silently retry writes.
- Logout/expiry/account switches clear identity and user query caches. Generation checks and serialized storage operations prevent old async responses from restoring a discarded session. Failed remote logout is reported without claiming server revocation succeeded.
- Authenticated visits to login/register redirect to the safe destination; changing accounts requires sign-out. Delayed auth-form continuations do not redirect an abandoned form or log out a newly established account after a password reset.
- Return paths must be app-relative and same-origin. External/protocol-relative/backslash/control-character URLs and auth loops (including mixed case) fall back to `/account`; valid query/fragment context is retained.
- Link tokens are consumed in memory and removed from the address bar with history replacement. Verification/reset is explicitly submitted, not triggered automatically by opening a link. The document uses a no-referrer policy. Tokens/passwords are not displayed in errors.
- PATCH sends changed fields only; clearing user phone sends `null`. Organizer fields are strings, never explicit `null`. Stable API error codes are localized instead of displaying raw backend messages/validation payloads; request IDs and `Retry-After` are retained.

## Run and review with development mocks

From `frontend/` in PowerShell:

```powershell
npm.cmd run dev:web
```

Keep `VITE_ENABLE_MOCKS=true` in the local web environment and open [sign-in](http://localhost:5173/login). The visible development notice explicitly identifies mock data. There are no emails or real registrations in this mode. Mocks are absent from production behavior; fixtures reset on full browser reload.

All seeded accounts use the **fixture-only** password `BiletFlow123!`:

| Email | Scenario |
|---|---|
| `organizer@example.com` | Verified email; organizer profile |
| `attendee@example.com` | Verified email; organizer route denied |
| `admin@example.com` | Platform admin; no implied organizer role |
| `unverified@example.com` | Attendee; login requires confirmation |
| `suspended@example.com` | Suspended account |
| `rate-limited@example.com` | 429, `Retry-After: 60` |
| `network@example.com` | Simulated connection failure |

Mock-only links: `/verify-email?token=mock-verify-unverified` and `/reset-password?token=mock-reset-organizer`. Invalid tokens exercise the expired-link recovery state. The initial tokens are single-use within the current mock lifetime. Register/resend creates `mock-verify-${encodeURIComponent(email)}`; forgot-password creates `mock-reset-${encodeURIComponent(email)}`. These deterministic fixture tokens are development helpers and are never returned by the real API or shown in product success messages. For newly registered mock accounts, use client-side navigation within the current mock lifetime; reloading reconstructs the seeded fixtures.

For native development, use the existing README LAN-origin/Expo launch instructions. Native connects to the configured real origin; it does not silently use web MSW fixtures. The device SecureStore probe alone does not prove sign-in/session recovery.

## Verification evidence — 5 November 2026

| Check | Evidence | Result |
|---|---|---|
| API type drift, lint, TypeScript, tests, production web build | `npm.cmd run check`; 65 tests across seven files, including the refresh interruption follow-up | Passed locally |
| Native bundling | `npm.cmd run export:mobile`; iOS and Android Hermes exports | Passed locally; not device proof |
| Session/storage tests | Single-flight/late-401 rotation, no write replay, uncertain refresh discard, suspension, startup exchange, stale login/logout/storage races and failures | Passed with mocked transport/storage |
| Native refresh interruption regression | Two deterministic crash/restart cases failed before the fix by replaying `old-refresh`: pending server response and pending replacement SecureStore write. Both now require sign-in without replay or revoking an unrelated simulated session. Completed rotation recovers using its replacement. Storage-removal failure and logout during removal prevent refresh dispatch | Passed with mocked P1 transport/storage; not physical-device proof |
| Auth contract fixtures and helper tests | Seven MSW auth/profile tests and eight safe-return/permission/validation tests | Passed with mocks |
| Chromium auth/profile journeys | Validation and focus; organizer login/user+organizer PATCH; attendee role denial; safe protected return; suspended/unverified/429/network states; resend; expired-link recovery; verification; password reset/new login; registration; expired PATCH retained draft and explicit retry; reload signed out | Passed with development mocks |
| Responsive/locales | Register at 390px/1280px in kk/ru/en with long Cyrillic/Kazakh name; organizer at 320px/390px/1280px; login error at 390px. No horizontal page overflow. Captures under ignored `web/output/f1/` | Browser checks passed; owner translation review pending |
| Mechanical design checks | Impeccable detector on changed web UI/native session panel returned `[]` | Passed at checked scope |
| Independent visual review | Five final web captures reviewed; disposition `ship`; incumbent system font/paper/green style preserved | Passed at reviewed scope; no Figma implementation |
| Production boundary | Chromium production preview displays auth UI, `/dev/foundation` shows Page not found, no mock disclosure or service-worker registration; built bundles contain no fixture-token markers | Passed locally |
| Real health | Direct `http://localhost:8000/health` attempt timed out after four seconds on 5 November | Unreachable; no real auth/profile integration evidence |
| Remote CI | [PR #7](https://github.com/yernurKaltayev/SWE_ticketing_project_team_starpers/pull/7): Frontend foundation and Plan Gate passed for `c27e64a`. The native refresh interruption fix is still local and requires its own commit/push and fresh PR checks | Original F1 passed CI; current follow-up not yet checked remotely |
| Android/iPhone launch, SecureStore and lifecycle | No physical phone interaction observed | Not verified |

## Remaining integrated acceptance

### Current preflight — 8 November 2026

GitHub confirms [PR #7](https://github.com/yernurKaltayev/SWE_ticketing_project_team_starpers/pull/7) merged on 5 November with head `d10826b` and merge commit `2058599`. This supersedes the historical row above saying the refresh fix was only local; no fresh automated/CI passes are asserted here. The local checkout remains at `d10826b`, 18 commits behind remote master `793243c`.

The initial Docker startup failed on its inaccessible `sailor-ingest.sock`; after Docker's update, its engine responded. A separate CRLF startup-script issue was confirmed and corrected locally without changing the script's commands. Compose startup/seed, direct/proxied health, the real frontend's Check connection action, and a canonical anonymous API error passed at 14:33 (UTC+05:00). See [F0 recovery evidence](F0_CHECKLIST.md#recovery-observed-on-8-november-2026-1433-utc0500). The API's effective SMTP is local MailHog; its empty inbox is reachable. Web mocks are now explicitly disabled. No real registration, mail delivery, login, profile, session or device pass was recorded. Existing changes and stash were preserved; no publication actions were performed.

The local event router contains only an `APIRouter` scaffold. Remote master has newer event functionality, but it has not been checked out or exercised here. Cross-organizer event isolation remains dependent on the actual event endpoints/F2 flow; attendee profile denial is not substitute evidence. Payout setup remains dependent on the agreed later contract/F4. Assigned-event and scanning work remains F7.

### Revalidation after syncing master — 8 November 2026

The acceptance branch now includes master `793243c` through merge commit `4b3ced4`; the earlier local-scaffold statement describes the pre-sync checkout. New event/order source is now present, but its real integration and cross-organizer isolation have not been exercised. After stopping the earlier Vite process to release a Windows dependency-file lock, `npm.cmd ci` succeeded. `npm.cmd run check` passed API type drift, lint, all workspace TypeScript checks, **79 tests across 10 files**, and the production web build. No new real auth/profile/session, mail delivery, native export or phone pass is asserted. Rebuild/recheck the backend and deliberately restart the real-mode web app before continuing integrated acceptance.

### User-reported real web acceptance — 8 November 2026

After starting the updated app, Yernur Slyamshaikhov reported that all steps in the guided connection/registration/verification/sign-in journey worked: the diagnostic page showed Development API and Connected; organizer registration succeeded; sign-in before confirmation was refused; the confirmation email arrived in local MailHog; explicitly confirming its link enabled sign-in with the expected identity and confirmed-email status. This is user-reported manual evidence, not an independently replayed browser check. No account identifiers, credentials, response captures or request IDs were supplied.

In the next guided batch, the user reported that all five checks worked: saved user name/phone persisted after in-app navigation; clearing the phone persisted; saved organizer contact/organization changes persisted; sign-out followed by visiting the organizer-profile route required sign-in and showed no previous profile data; signing in again then reloading signed the browser out as expected for memory-only credentials. Wire-level PATCH omitted/null semantics and logout revocation/HTTP status were not inspected.

The user subsequently reported all five permission/reset steps worked: a disposable attendee account was created/verified through MailHog; visiting the protected organizer-profile route while signed out and then signing in as the attendee showed Access denied with no organizer profile data; a disposable organizer received a password-reset email in MailHog; after reset the old password failed and the new password succeeded; explicitly resubmitting the used reset link was rejected. These are user-reported manual UI outcomes. They do not establish refresh-session invalidation, HTTP/request metadata, cross-organizer event isolation or physical-device behavior.

Before phone testing, the computer's active Wi-Fi IPv4 and existing native API setting were both checked as `192.168.0.159` / `http://192.168.0.159:8000`; direct localhost health still returned the canonical success body. Running API settings report a genuine access-token lifetime of 30 minutes. No phone reachability, launch or session outcome is inferred from these computer-side checks.

The first reported iOS launch attempt stopped at Expo's requirement to sign in to both Expo Go and Expo CLI. Following terminal-login/restart/QR instructions, the user reported the procedure now works; an independent `npx.cmd expo whoami` check returns `yernursb`. This resolves the recorded CLI-login blocker, but individual phone connection, SecureStore and BiletFlow native session outcomes/model/OS/Expo Go versions have not been supplied. Keep those gates pending. See the F0 Expo sign-in recovery note. No Android outcome has been reported.

The subsequent reply to the four iPhone-specific checks confirmed all worked: connection and SecureStore probe; verified BiletFlow sign-in and Reload account; fully closing/reopening Expo Go restored the session; sign-out followed by closing/reopening stayed signed out. Record these as user-reported physical-iPhone functional passes. Model/iOS/Expo Go version are still missing; Android and genuine access-expiry/refresh, uncertain-network/storage failure and accessibility behavior are not covered by this report.

The user then clarified no Android device is currently available and requested assuming it works so other work can proceed. Android acceptance is explicitly deferred/not tested; this planning assumption is not recorded as evidence. Continue web-session and other independent checks without claiming full Android acceptance.

The user subsequently deferred the genuine web access-expiry/refresh exercise for lack of time and asked to move on. No expired-access/rotating-refresh request sequence was observed or reported. Record it as deferred/not tested; do not infer a pass from session unit tests or basic sign-in/restart checks. The current documentation is a partial acceptance checkpoint, with all other unchecked criteria retained.

- [x] Restore a running backend/database and verify direct and proxied health with mocks disabled. Passed on 8 November at local F1 `d10826b`; the browser connection action also passed. This is connectivity evidence only.
- [x] Real organizer registration → local MailHog verification → explicit confirmation → successful sign-in/identity; unconfirmed-email sign-in refused. User reported the guided journey passed on 8 November.
- [x] User and organizer profile saving/persistence, including clearing the user phone, passed in the user's manual real-web checks on 8 November.
- [x] Sign-out hid private profile data and protected the organizer-profile route; browser reload after re-login signed out. User-reported UI outcomes only, not backend revocation evidence.
- [x] Verified attendee sign-in through the protected organizer-profile return path showed Access denied and no organizer profile data, according to the user's manual check.
- [x] Real password-reset email, old-password rejection/new-password sign-in, and used reset-link rejection passed in the user's manual checks. Other-session refresh invalidation remains pending.
- [x] iPhone connection/SecureStore, sign-in/account reload, restart recovery and persistent sign-out passed in the user's guided manual report; device/version details remain to record.
- [ ] Inspect profile requests for omitted/null PATCH semantics and retain safe method/path/status/request-ID evidence.
- [ ] Verify live access expiry and one rotating refresh under concurrent reads — deferred by user on 8 November for lack of time; not tested. Reuse/revocation, other-session password-reset invalidation, backend logout status and uncertain-network behavior also remain pending. Backend source and MSW behavior are separate evidence.
- [ ] Use two real organizer accounts to prove protected event-resource isolation once the relevant module/routes are available. An attendee's mock profile denial is not proof of cross-organizer authorization.
- [ ] Confirm event-level capabilities/assigned-event discovery with Yernur (backend); do not model `organizer_staff` as a global role.
- [ ] Complete remaining native acceptance: Android is deferred because the user has no device; basic iPhone outcomes are user-reported above, with device details unrecorded. Genuine access expiry/refresh, keyboard, screen reader, text scaling and failed storage/network recovery remain to verify on the relevant devices.
- [ ] Yernur Slyamshaikhov reviews kk/ru/en wording and accessibility/flows. Screenshots and automated checks do not certify owner translation or Figma approval.
- [ ] Integrate payout information through the agreed later contract/F4; keep F1's missing contract explicit.
- [ ] Review the uncommitted diff and existing local documentation, then commit/push/merge manually when ready. No git publication actions were performed by the agent.

F1 has a reviewable implementation for the current contract. **The module is not marked fully accepted** until its real integration and device evidence is recorded.
