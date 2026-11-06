# BiletFlow frontend

This workspace contains the responsive web application, the dedicated Event Admin mobile app, and shared API contracts for BiletFlow. F0 establishes the foundation; authentication screens, event editing, checkout, and admission scanning are later modules.

Frontend owners are **Yernur Slyamshaikhov** and **Dias**. Yernur Slyamshaikhov is a different student from **Yernur (backend)**.

Each module has one implementer. **Yernur Slyamshaikhov owns all F0/F1/F3/F4/F7/F11 work**; **Dias owns all F2/F5/F6/F8/F9/F10 work**. F0 includes wireframes, fixtures, shared styles/layouts, locales/review and acceptance evidence as well as infrastructure. There is no split within a module; see the plan's ownership table for responsibilities.

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
npm ci
Copy-Item web/.env.example web/.env.local
Copy-Item mobile/.env.example mobile/.env.local
```

Use the single workspace lockfile; do not run separate dependency installations inside `web/`, `mobile/` or `shared/`.

Run the web app:

```powershell
npm run dev:web
```

Open [the local web app](http://localhost:5173). The web development proxy forwards `/api/*` and root `/health` unchanged to `API_ORIGIN`, normally `http://localhost:8000`. Health is `/health`; features are under `/api/v1`. See [API_CONTRACT.md](docs/API_CONTRACT.md) for the canonical URLs and current endpoint readiness.

Open [the F0 development checks](http://localhost:5173/dev/foundation). With mocks enabled, choose success, empty, validation (422), forbidden (403), unauthorized (401), or network failure, then use **Read list**, **Send mock mutation**, or **Check connection**. The page identifies mock/live data and a signed-out session; mutations are enabled only in mock mode. Switch kk/ru/en using the language selector. The diagnostic route is omitted from production; the homepage is a minimal placeholder for later modules.

In a second terminal, from `frontend/`, run the mobile app:

```powershell
npm run dev:mobile
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

At the current P0 snapshot, `/health` is the only implemented application endpoint. The contract contains planned authentication and feature operations, but their router files are empty; those calls currently return `404`. Seed accounts do not make login operational. Mocked mutation/session checks must be recorded as mocked until the real endpoints land.

## Validation commands

Run from `frontend/`:

```powershell
npm run generate:api
npm run check:api
npm run lint
npm run typecheck
npm test
npm run build:web
npm run export:mobile
```

`generate:api` updates the committed generated types from `../backend/docs/openapi.yaml`. `check:api` checks for drift without replacing hand-written contracts. Use the static YAML, not the live server specification, because the live specification currently describes only implemented routes.

`npm run check` runs the code-generation drift check, lint, type checks, tests and web build. `export:mobile` additionally verifies native bundling; run it before review and check the CI result. Native exports are not substitutes for the two physical-phone checks.

The mobile skeleton has native Home → Connection navigation, theme/safe-area handling, locale controls and a real health check. In development, **SecureStore · F0** probes set/read/delete using a separate temporary key, without replacing session credentials. This verifies secure-storage availability only; backend login/refresh/logout remains pending. Access tokens stay in memory; the native session adapter persists only refresh credentials.

## Tooling

Application workspaces use template-compatible TypeScript 6. Root code generation uses TypeScript 5.9 because the current `openapi-typescript` peer range requires TypeScript 5; npm resolves these through one lockfile. Review dependency advisories with `npm audit` rather than forcing breaking Expo/schema-tool changes.

See [Expo project setup](https://docs.expo.dev/get-started/create-a-project/) and [workspace support](https://docs.expo.dev/guides/monorepos/) when updating SDK/tool versions. Successful exports are not phone-launch evidence.

## F0 review and handoff

Use [F0_CHECKLIST.md](docs/F0_CHECKLIST.md) to track implementation, automated evidence, real API integration, device launches and Yernur Slyamshaikhov's F0 design/localization review separately. Use [API_CONTRACT.md](docs/API_CONTRACT.md) for backend handoff and unresolved session decisions.

F0's remaining owner work is wireframes/styles/fixtures/language review, phone verification, real API evidence, contract agreements and remote CI/handoff. Real authenticated operations depend on backend feature readiness; all frontend F0 work belongs to Yernur Slyamshaikhov. Do not mark those items complete because a mock screen or successful build exists.

Keep work on `feat/frontend-f0`, review the diff, and commit/push when ready. This scaffold does not require deploying to app stores or publishing any website.

## F2 — Dias's event discovery and organizer tools

The F2 client adds public discovery at `/events`, event details at `/events/:eventId`, and organizer tools at `/organizer/events`. See [F2_CHECKLIST.md](docs/F2_CHECKLIST.md) for implemented scope, fixture login/run instructions, verification evidence and backend integration gaps. Upload attachment and saved refund-policy readback need backend contracts before full acceptance. Existing F0/P0 readiness statements above are historical; check actual backend endpoint readiness with mocks disabled.
