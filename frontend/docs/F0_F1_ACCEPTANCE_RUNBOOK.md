# Finish F0/F1: real integration and owner review

Owner: Yernur Slyamshaikhov. This runbook describes checks to perform; observed results belong in the F0/F1 checklists. Existing mock/unit/build/CI evidence does not certify the checks below. Use a local development database and disposable test accounts. Keep the existing uncommitted documentation and local environment files intact.

**8 November current state:** local checkout is still F1 at `d10826b`, 18 commits behind remote master `793243c`; F1 including the refresh fix is merged through PR #7. After Docker's update and a local CRLF-to-LF startup-script correction, Compose startup/seed and direct/proxied/browser health passed. No socket deletion, reset or database deletion was performed. Web mocks are now disabled and effective API mail settings point to local MailHog. See [observed F0 recovery](F0_CHECKLIST.md#recovery-observed-on-8-november-2026-1433-utc0500). The web app and backend are running; resume with section 3. Registration/mail delivery, authenticated profiles/sessions and physical phones still require their own observations.

## 1. Start the real backend

Open Docker Desktop and wait for its Linux engine. In PowerShell:

```powershell
cd C:\Users\user\Desktop\swe_project\SWE_ticketing_project_team_starpers\backend
docker version
docker compose version
if (!(Test-Path -LiteralPath '.env')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env'
}
```

Before starting Compose, confirm the following values in `backend/.env` for this local acceptance run, preserving its other settings. Make sure existing PowerShell environment overrides do not select a different SMTP provider or frontend URL:

```dotenv
SMTP_HOST=mailhog
SMTP_PORT=1025
SMTP_STARTTLS=false
SMTP_USERNAME=
SMTP_PASSWORD=
WEB_BASE_URL=http://localhost:5173
```

This explicitly directs test mail to the local MailHog container rather than an externally configured SMTP service. Then run from the same `backend/` directory:

```powershell
docker compose up -d --build --wait
docker compose exec api python -m scripts.seed
docker compose ps -a
curl.exe -i --max-time 10 http://localhost:8000/health
curl.exe -i --max-time 10 http://localhost:8000/api/v1/me
```

Expected:

- Docker reports a working server/engine, not only a client version.
- API/database and required services run. `minio-init` is a one-shot initializer; a successful completed exit is normal. `backup` is an optional profile, not a prerequisite.
- `/health`: HTTP 200, `{"status":"ok","database":"ok","version":"0.1.0"}`, with `X-Request-ID`.
- Anonymous `/api/v1/me`: HTTP 401, `code: unauthorized`, `details: null`, with a request ID. This expected rejection proves an error response, not authenticated integration.

If the engine or health check fails, retain the exact error and leave these gates pending. Useful nondestructive diagnostics:

```powershell
docker context show
docker info
wsl --status
wsl --list --verbose
docker compose logs --tail 100 api postgres minio-init mailhog
```

The previous Docker startup problem must be resolved before real API acceptance. This runbook does not require resetting Docker or deleting database volumes.

## 2. Run the web app with mocks disabled

In a separate PowerShell terminal:

```powershell
cd C:\Users\user\Desktop\swe_project\SWE_ticketing_project_team_starpers\frontend
if (!(Test-Path -LiteralPath 'web/.env.local')) {
    Copy-Item -LiteralPath 'web/.env.example' -Destination 'web/.env.local'
}
```

Edit `web/.env.local` in your editor, retaining any other required local settings:

```dotenv
API_ORIGIN=http://localhost:8000
VITE_API_ORIGIN=
VITE_ENABLE_MOCKS=false
```

Stop an existing Vite process with Ctrl+C and restart it:

```powershell
npm.cmd run dev:web
```

Keep it running. Open `http://localhost:5173/dev/foundation`, then press Check connection. The page must identify the real development API, not Mock API, and health must succeed. Its mutation control remains mock-only; use the F1 account screens for real writes.

In another terminal, verify the Vite proxy:

```powershell
curl.exe -i --max-time 10 http://localhost:5173/health
```

Expect the same canonical health body and a request ID. Inspect browser Network requests during the following checks; record method/path/status/request ID, not passwords, bearer tokens, refresh tokens or complete email-link URLs.

## 3. Create controlled real accounts and verify email

Open `http://localhost:5173/register` and the MailHog inbox at `http://localhost:8025`. Use unique disposable addresses, for example `f1-organizer-a@example.com`, `f1-organizer-b@example.com` and `f1-attendee@example.com`; choose your own test passwords. MailHog captures the outgoing messages locally.

For organizer A and the attendee:

1. Register with the correct account type. Registration should create the account without signing it in.
2. Try signing in before email verification: expect `403 email_not_verified` and actionable UI copy.
3. Request a new confirmation link on `/verify-email`. Check that a real message appears in MailHog; an accepted API response alone does not prove delivery.
4. Open the newest email link, explicitly submit confirmation, and sign in. Confirm the displayed identity matches the account.
5. Reopen the used link: expect `422 invalid_email_token` and a way to request another link. Resending invalidates earlier unused confirmation links.
6. Try one wrong password: expect `401 invalid_credentials` and a request ID, with no authenticated account displayed.

Repeat organizer registration for organizer B before the later isolation check. Do not use a shared seeded account for password-reset/reuse-revocation tests.

Public backend demo defaults are `organizer@example.com` and `admin@example.com`, password `ChangeMe-Demo-123`; they are already verified. Local backend settings may override them, and rerunning seed does not reset existing passwords. The MSW password `BiletFlow123!` applies only to web mocks.

## 4. Verify real account/profile and permission behavior

Using app navigation, without reloading the browser:

- As organizer A, open Account, change the name/phone, save, navigate away and back, and verify the saved values. Network should show authenticated `/api/v1/me` GET/PATCH. Clearing the phone must send `phone: null`; unchanged fields should be omitted from PATCH.
- Open Organizer profile, change organization/contact information and save. Verify GET/PATCH `/api/v1/organizers/me` and persisted values. Only the supported contact fields are editable; email confirmation and simulated organizer verification are separate statuses.
- Sign out: verify local identity/private views disappear and the successful backend logout returns 204. Opening a protected path must require sign-in.
- Open `/organizer/profile` while signed out, then sign in as the attendee. The return path should be preserved, but the organizer page must show Access denied. No organizer identity/contact data may appear.
- Switch between the two accounts through sign-out/sign-in and check that the previous user's profile data does not remain visible.
- Reload the web page: expect sign-out under the current memory-only web contract. This is intentional and is different from native startup recovery.

Full cross-organizer **event** resource isolation remains pending until the relevant P2 endpoints/F2 flow exist. Test it with organizer A/B once available; do not use an attendee profile denial as substitute evidence. Missing payout fields remain explicitly deferred to the agreed later contract/F4.

## 5. Verify recovery, expiry and failure states

**8 November deferral:** the user postponed the genuine web access-expiry/refresh check for lack of time and requested moving on. Keep it deferred/not tested in the acceptance record. Basic password-reset behavior was user-reported passed; cross-session refresh invalidation and other unchecked failure/recovery cases remain pending. The procedures below are retained for later execution, not evidence of completion.

- Forgot password: request a link for a disposable verified account, inspect MailHog, set a new password and sign in with it. The old password must fail. Reusing the reset link must show an invalid/expired-link error. Known/unknown addresses receive generic success wording.
- Password reset revokes refresh sessions under P1. Existing access tokens on other sessions may remain valid until their configured expiry; do not expect immediate access-token revocation from this backend contract.
- With a disposable signed-in account, wait beyond the configured access-token lifetime (default 30 minutes). Keep the web page open; reloading it would discard credentials and would not test refresh. Navigate to a profile that requires a real read. Inspect Network for rejected access → one rotating refresh → successful read.
- To verify concurrent recovery from the existing development client, after expiry run the following in the browser DevTools console while still signed in. It performs two real read requests without extracting credentials:

```javascript
const { session: acceptanceSession } = await import('/src/auth/session.ts');
await Promise.all([
  acceptanceSession.request('/api/v1/me'),
  acceptanceSession.request('/api/v1/me'),
]);
```

- Expect at most one refresh for those concurrent reads. Use a fresh expired session for a separate write test: submit a changed profile. If its PATCH receives 401, recovery should retain the draft and require an explicit Save retry rather than automatically replaying the write.
- Simulate a connection loss during a read/save, then restore it. Expect an actionable network error; the UI must not announce success without a successful response. Retry writes explicitly.
- Use a separate disposable account to exercise the default login rate limit (more than ten attempts for the same email within five minutes). Expect 429 and retry guidance. Do not repeatedly lock the shared demo account.
- Ask Yernur (backend) for a suspended disposable account and controlled invalid/expired-session fixtures if needed; verify the real suspended/expired UI behavior when those fixtures are available. Keep those cases pending until observed.
- Have the backend owner review recorded refresh rotation/revocation results. Do not manually replay a spent token belonging to a shared account: P1 intentionally revokes that account's other refresh sessions.

`ACCESS_TOKEN_TTL_MINUTES=1` in backend `.env` alone does not change the current Compose API: Compose forwards selected keys and omits that setting. Use genuine configured expiry or a separately reviewed local test configuration, not an altered/fake JWT labeled as real expiry evidence.

## 6. Launch and verify both physical phones

**Current availability (8 November):** the user reports the basic iPhone connection/SecureStore/sign-in/restart/logout checks passed, without model/OS/Expo Go details. The user has no Android device yet and requested proceeding under an assumption of Android success. Continue independent checks, but record Android as deferred/not tested. Do not convert the planning assumption or native exports into a physical-Android pass. The procedures below remain for the outstanding device work when available.

Keep Docker/backend and Metro running on the computer. Connect the computer and both phones to the same reachable LAN. Find the computer's active adapter IPv4 address:

```powershell
ipconfig
```

From `frontend/`, create `mobile/.env.local` from its example only if absent, then set its origin to the actual computer address (example below must be replaced):

```dotenv
EXPO_PUBLIC_API_ORIGIN=http://192.168.1.25:8000
```

Start/restart Metro from `frontend/`:

```powershell
npm.cmd run dev:mobile
```

For physical iOS, [Expo requires the same Expo account](https://docs.expo.dev/troubleshooting/expo-go-sign-in-required/) in Expo CLI and Expo Go. If the launch reports that sign-in is required, stop Metro with Ctrl+C and run:

```powershell
cd mobile
npx.cmd expo login
npx.cmd expo whoami
cd ..
npm.cmd run dev:mobile
```

Sign in to Expo Go on the iPhone with the same Expo account shown by `whoami`. This is separate from the BiletFlow test account used inside the app. Complete Expo sign-in interactively; do not put its credentials in project files or evidence.

Scan the Metro QR using compatible Expo Go on Android and iPhone. Record each model, OS and Expo Go version separately. A bundle/export or browser preview is not this evidence.

On **each** phone:

1. Observe the native app opening; test Home → Connection navigation and kk/ru/en controls.
2. Run the real connection check and the separate SecureStore · F0 probe. Record each result independently.
3. Sign in using a real verified disposable account and verify identity/email status. Press Reload account and confirm a real `/me` read.
4. Fully close Expo Go, reopen the same project and observe startup recovery. It must exchange the stored refresh credential before authenticated reads; signing in again must not normally be necessary after a successfully saved session.
5. After access expiry, reload the account and verify refresh works. Interrupt the connection during recovery and verify no false success or repeated reuse of an uncertain refresh credential. The deterministic crash-window unit tests are separate from observed device behavior.
6. Sign out, fully close/reopen the app and confirm it remains signed out. If sign-out reports incomplete cleanup/revocation, retain that result and investigate rather than marking it passed.
7. Check keyboard visibility, large system text, readable long names/errors and screen-reader control labels. Report any fields/actions hidden or inaccessible.

If LAN health fails, verify the active IPv4 address, Wi-Fi reachability, VPN/isolation and normal local firewall permissions. On a phone, `localhost` points to that phone, not the computer. Native currently uses the real configured API; web MSW accounts are not native test accounts. Assigned events/camera/check-in remain F7.

## 7. Complete owner review and backend handoff

- Review actual kk/ru/en labels, validation, errors and status messages at narrow and desktop widths. Correct issues or explicitly record the reviewed scope/outcome.
- Review F0's fixture shapes/shared controls and wireframe navigation/flows. Record flow/structure corrections and the owner's review separately from final visual approval. The 43 Figma explorations, gold mark, burgundy and DM Sans are still not authorized for frontend implementation.
- With Yernur (backend), record the accepted memory-only web lifecycle, native refresh policy, per-event permission/assigned-event discovery contract, and disposition of missing payout fields. A new HttpOnly-cookie implementation is an optional contract change, not an automatic prerequisite.
- Full event-resource isolation and assigned-event integration must retain explicit later dependencies. Either complete them when available or formally move their scope/acceptance to the relevant module; do not silently mark them passed.

## 8. Record evidence and close only observed gates

Update [F0_CHECKLIST.md](F0_CHECKLIST.md) and [F1_CHECKLIST.md](F1_CHECKLIST.md) with results such as:

| Check | Environment/commit/device | Observed result | Safe evidence | Status |
|---|---|---|---|---|
| Direct + proxied health | Record commit and local API | Record actual response | Status/body/request ID | Pending |
| Real auth/profile/recovery | Record disposable account role, not credentials | Record actual outcome | Method/path/status/request ID | Pending |
| Android/iPhone lifecycle | Separate row per model/OS | Record launch/storage/session results | Redacted capture or concise test notes | Pending |
| Owner copy/flow review | Yernur Slyamshaikhov, date/scope | Record corrections/approval scope | Review note | Pending |
| External contract/resource dependencies | Backend contact/module | Record agreement or blocker | Contract reference | Pending |

The 65 automated tests, web build, native exports and PR checks already passed for the F1 implementation/fix. Rerun the relevant automated checks after any code fixes made during acceptance. Review and publish documentation manually when ready; nothing in this runbook commits, pushes or merges files.

F0/F1 can be called fully accepted only after their required evidence and scope decisions are closed. Until then report **implementation merged; specific acceptance gates pending**, while independent module work may proceed under the plan's incremental rule.
