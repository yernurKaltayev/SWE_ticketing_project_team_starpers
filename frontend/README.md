# BiletFlow frontend

This workspace contains the responsive web application, the dedicated Event Admin mobile app, and shared API contracts for BiletFlow. F0's foundation and F1 authentication/profile/permission flows and native sessions (including `d10826b`) are merged through PRs #6/#7; real API and device acceptance remain pending. The 8 November local checkout remains on F1, behind remote master; source readiness for later modules must be checked on the checkout actually used. See [F1_CHECKLIST.md](docs/F1_CHECKLIST.md) for the current implementation and evidence.

Frontend owners are **Yernur Slyamshaikhov** and **Dias**. Yernur Slyamshaikhov is a different student from **Yernur (backend)**.

Each module has one implementer. **Yernur Slyamshaikhov owns all F0/F1/F3/F4/F7/F11 work**; **Dias owns all F2/F5/F6/F8/F9/F10 work**. F0 includes wireframes, fixtures, shared styles/layouts, locales/review and acceptance evidence as well as infrastructure. There is no split within a module; see the plan's ownership table for responsibilities.

## Required incremental workflow — Yernur Slyamshaikhov and Dias

Implement frontend modules in small increments following the dependencies and phase timeline in [FRONTEND_PLAN.md](../FRONTEND_PLAN.md#incremental-delivery-and-start-rule--both-frontend-owners). **F numbers are module identifiers, not a strict F0 → F1 → … → F11 queue.** After a usable F0 handoff, F1 and F2 can progress in parallel; dependent screens must consume stable, shared interfaces from their named owners. Do not treat another developer's uncommitted working tree as an available team dependency.

Dias's delivery lane is **F2 → F6 lists alongside F3 → F8 plus F6 cancellation/refunds → F9 → F10**, with bonus F5 only after required flows are stable. F11 verification runs throughout. Keep sole module ownership unchanged.

Backend endpoints are required for real integration and acceptance; agreed contracts and clearly labeled mocks allow earlier UI development. Record **contract agreed → UI with mocks → API integrated → acceptance verified** separately. Pending backend/device/review evidence stays pending; it does not require all independent frontend work to stop or become a passed check. The plan contains the full F-to-P dependency table.

**Design approval:** current web/mobile code implements functionality with restrained technical styling. The 43 Figma screens, their structure, gold university logo, burgundy palette and DM Sans remain exploratory. Do not implement them until Yernur Slyamshaikhov explicitly approves the design for implementation and requests the design pass.

## Requirements

- Node.js 24 LTS and npm, matching `package.json`, `.nvmrc` and the frontend CI workflow.
- An Android phone and an iPhone with compatible Expo Go for the initial launch check. The scaffold uses SDK 58 after the installed iPhone Expo Go reported SDK 58 compatibility. Keep the project and installed phone apps aligned.
- Both phones and the development computer on the same reachable network for LAN testing.
- Docker Desktop running when testing the real backend. It is not required for the web mock scenarios.

The web stack is React, TypeScript, Vite and Tailwind CSS. The mobile stack is React Native, TypeScript and Expo. Shared code contains portable contracts/helpers; web DOM components and native controls remain separate.

## Install and run

From the repository root in PowerShell:

```powershell
cd frontend
npm.cmd ci
Copy-Item web/.env.example web/.env.local
Copy-Item mobile/.env.example mobile/.env.local
```

Use the single workspace lockfile; do not run separate dependency installations inside `web/`, `mobile/` or `shared/`.

Run the web app:

```powershell
npm.cmd run dev:web
```

Open [the local web app](http://localhost:5173). The web development proxy forwards `/api/*` and root `/health` unchanged to `API_ORIGIN`, normally `http://localhost:8000`. Health is `/health`; features are under `/api/v1`. See [API_CONTRACT.md](docs/API_CONTRACT.md) for the canonical URLs and current endpoint readiness.

Open [the F0 development checks](http://localhost:5173/dev/foundation). With mocks enabled, choose success, empty, validation (422), forbidden (403), unauthorized (401), or network failure, then use **Read list**, **Send mock mutation**, or **Check connection**. The page identifies mock/live data and a signed-out session; mutations are enabled only in mock mode. Switch kk/ru/en using the language selector. The diagnostic route is omitted from production; the homepage is a minimal placeholder for later modules.

In a second terminal, from `frontend/`, run the mobile app:

```powershell
npm.cmd run dev:mobile
```

Scan the Metro terminal's QR code with Expo Go on Android and with the iPhone camera/Expo Go on iOS. Keep the terminal running while testing. A successful bundle/export is useful automation evidence, but it does not prove the app launched on either phone.

## Mobile API address

The phones must use the development computer's reachable LAN address. `localhost` on a phone means the phone itself.

Find the active Wi-Fi/Ethernet adapter's IPv4 address:

```powershell
ipconfig
```

Set `frontend/mobile/.env.local`, replacing this example address:

```dotenv
EXPO_PUBLIC_API_ORIGIN=http://192.168.1.25:8000
```

The web development server instead uses a server-side proxy setting in `frontend/web/.env.local`:

```dotenv
API_ORIGIN=http://localhost:8000
VITE_API_ORIGIN=
VITE_ENABLE_MOCKS=true
```

Leave `VITE_API_ORIGIN` blank to use the same-origin development proxy. The default development setup enables contract mocks. For a real API check, set `VITE_ENABLE_MOCKS=false`, restart Vite and confirm the UI is using the real backend; mocks are not permitted to become production payment/auth behavior.

These are API origins, without `/api/v1`. Feature requests include `/api/v1` in their paths; health uses `/health`. Environment values included in either client are public configuration, not a place for signing keys, provider secrets or passwords. Local `.env` files must not be committed.

Restart the appropriate development server after changing its environment. If either phone cannot connect, check the selected IPv4 address, shared Wi-Fi, VPN/network isolation, backend listener and local firewall permission. Follow normal local network policy; do not open the development API to the public internet.

## Real backend check

From `backend/`, with Docker Desktop running:

```powershell
docker compose up -d --build --wait
docker compose exec api python -m scripts.seed
```

Then verify the backend directly:

```powershell
Invoke-RestMethod http://localhost:8000/health
Invoke-RestMethod http://localhost:5173/health
```

Expected success is `status: ok`, `database: ok`, and the backend version. The health check queries PostgreSQL, so a database outage produces a `503 database_unavailable` error. See [the backend README](../backend/README.md) for startup and database details.

This checkout includes P1 registration/verification/login/refresh/logout, user/profile and staff operations, plus P8 ticket/QR/PDF source. On 8 November, Compose startup/seed, direct/proxied health, the real frontend's Check connection action, and a canonical anonymous API error passed with mocks disabled. Effective SMTP points to local MailHog and its inbox is reachable. Auth/profile/session and email-delivery integration remain unverified; see the dated F0 checklist. A successful mock or a source-code review does not prove a live connection.

Once the stack is running, verify health directly and through Vite with mocks disabled. Use controlled test accounts to verify a real authenticated `/api/v1/me` read, safe profile PATCH and session lifecycle through F1's `/login`, `/account` and `/organizer/profile` routes. The development diagnostic page supports live health checks, but its mutation control is deliberately mock-only; API-docs calls alone do not certify frontend authentication. Track foundation evidence in [F0_CHECKLIST.md](docs/F0_CHECKLIST.md) and auth/UI acceptance in [F1_CHECKLIST.md](docs/F1_CHECKLIST.md). Ticket/PNG/PDF UI and binary transport belong to F3.

## Validation commands

Run from `frontend/`:

```powershell
npm.cmd run generate:api
npm.cmd run check:api
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build:web
npm.cmd run export:mobile
```

`generate:api` updates the committed generated types from `../backend/docs/openapi.yaml`. `check:api` checks for drift without replacing hand-written contracts. Use the static YAML, not the live server specification, because the live specification currently describes only implemented routes.

`npm run check` runs the code-generation drift check, lint, type checks, tests and web build. `export:mobile` additionally verifies native bundling; run it before review and check the CI result. Native exports are not substitutes for the two physical-phone checks.

The mobile skeleton has native Home → Connection navigation, theme/safe-area handling, locale controls and a real health check. In development, **SecureStore · F0** probes set/read/delete using a separate temporary key, without replacing session credentials. This verifies secure-storage availability only; integrated login/refresh/logout and actual Android/iPhone evidence remain pending even though P1 now implements the backend endpoints. Access tokens stay in memory; the native session adapter persists only refresh credentials. P1 rotates refresh tokens and revokes refresh sessions on reuse, so F1 must coordinate refresh requests and avoid parallel or blindly retried refreshes.

## Tooling

Application workspaces use template-compatible TypeScript 6. Root code generation uses TypeScript 5.9 because the current `openapi-typescript` peer range requires TypeScript 5; npm resolves these through one lockfile. Review dependency advisories with `npm audit` rather than forcing breaking Expo/schema-tool changes.

See [Expo project setup](https://docs.expo.dev/get-started/create-a-project/) and [workspace support](https://docs.expo.dev/guides/monorepos/) when updating SDK/tool versions. Successful exports are not phone-launch evidence.

## F0 review and handoff

Use [F0_CHECKLIST.md](docs/F0_CHECKLIST.md) to track implementation, automated evidence, real API integration, device launches and Yernur Slyamshaikhov's F0 design/localization review separately. Use [API_CONTRACT.md](docs/API_CONTRACT.md) for backend handoff and unresolved session decisions.

F0's remaining owner work is wireframes/styles/fixtures/language review, phone verification, real API evidence, contract agreements and handoff. P1 now makes authenticated read/mutation checks possible once the backend runs; their integration results still need recording. All frontend F0 work belongs to Yernur Slyamshaikhov. Do not mark these items complete because a mock screen, successful build or assumed result exists.

The initial F0 branch was merged into `master` through PR #6. Use a new follow-up branch for remaining work, review the diff, and commit/push when ready. This scaffold does not require deploying to app stores or publishing any website.
