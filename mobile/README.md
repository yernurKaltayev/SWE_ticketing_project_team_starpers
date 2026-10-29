# BiletFlow Check-in

Expo / React Native scaffold for internally provisioned Event Admins. It provides sign-in,
SecureStore-backed token persistence, shared refresh-token rotation, assigned-event listing,
manual admission-code validation, duplicate-admission feedback and check-in reversal.

## Run

Provision a staff account and assign it to an event using backend/README.md, or use the local
seed-demo command. Then:

```bash
cd mobile
npm ci
cp .env.example .env
# Set EXPO_PUBLIC_API_URL to your computer's LAN IP when using a physical phone.
npm start
```

The Android emulator default is http://10.0.2.2:8000/api/v1; the iOS simulator default is
http://localhost:8000/api/v1. A physical phone needs the backend listening on a reachable LAN
address, such as uvicorn --host 0.0.0.0 in the development environment.
Use an Expo Go or development build compatible with this project's Expo SDK.

Attendee and organizer credentials are rejected by this app. Accounts are provisioned through
the internal backend CLI; the mobile UI never grants staff roles. The backend controls assignment
and ticket validity. It refuses a campaign QR, a used/cancelled/refunded ticket, or an event outside
the staff member's assignments. An online connection is required for admission.

## Checks and current limit

```bash
npm run check
npm test
npm run build
```

Session tests cover refresh coalescing, rejected sessions, offline retry, role rejection and restart
restoration. Expo export generates Android and iOS JavaScript/Hermes bundles; it does not generate
signed APK/IPA releases. SecureStore integration and interactions still need physical-device QA.
Camera-based QR scanning and attendee search are next-cycle work; current admission accepts a
pasted admission code and uses the real backend.
