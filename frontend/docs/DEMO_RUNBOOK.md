# BiletFlow demo runbook (F11)

Owner: **Yernur Slyamshaikhov**. Repeats the demo from a clean, seeded environment using the production web build. Mocks are compiled out of this build. Payments, identity checks and payouts stay labelled **DEMO/SIMULATED**.

## 1. Start the stack (Windows, PowerShell, from the repository root)

Docker Desktop must be running. Stop any `npm run dev:web` server first, because the demo web container also uses port 5173. That port is the backend's default `WEB_BASE_URL`, so links in emails and calendar files open the demo web app.

```powershell
docker compose -f frontend/docker-compose.demo.yml up -d --build --wait
docker compose -f frontend/docker-compose.demo.yml exec api python -m scripts.seed
```

The demo file includes `backend/docker-compose.yml` and adds a `web` service: an nginx container serving `frontend/web/dist` that proxies `/api/`, `/health` and the Campaign QR resolver `/c/` to the API. Any other path returns the app, so refreshing a deep link works.

Check it:

```powershell
Invoke-RestMethod http://localhost:5173/health      # status ok, database ok (through nginx)
```

| Service | URL |
| --- | --- |
| Web app (production build) | http://localhost:5173 |
| API docs | http://localhost:8000/docs |
| MailHog (verification, tickets, notifications) | http://localhost:8025 |
| MinIO console | http://localhost:9001 |

Seeded accounts use the password `ChangeMe-Demo-123`: `admin@example.com` (platform admin) and `organizer@example.com` (organizer, with the demo venue). Register attendees during the demo and verify them through MailHog.

## 2. Clean reset

This deletes all local demo data (database and object storage volumes):

```powershell
docker compose -f frontend/docker-compose.demo.yml down -v
docker compose -f frontend/docker-compose.demo.yml up -d --build --wait
docker compose -f frontend/docker-compose.demo.yml exec api python -m scripts.seed
```

The demo stack shares the Compose project name `biletflow` with `backend/docker-compose.yml`, so `down -v` here also clears data created with the backend-only stack.

## 3. Event Admin app (iOS/Android, no app store)

Follow [F7_CHECKLIST.md](F7_CHECKLIST.md#launching-the-app-no-app-store). In short: set `EXPO_PUBLIC_API_ORIGIN=http://<LAN IPv4>:8000` in `frontend/mobile/.env.local`, allow port 8000 through the Windows firewall on the private network, run `npm run dev:mobile` from `frontend/`, and open the Metro QR in Expo Go. The phone talks to the API directly, not through the web container.

## 4. Demo script: core acceptance journey

Run the steps in order. Each step names the module that owns it, so defects go back to the owner.

1. **Organizer setup (F1/F2).** Sign in as the organizer. Open **My events → Create event**, add a free ticket type, preview, then publish.
2. **Calendar (F11, bonus).** Open the public event page. Under **Add to calendar**, download the `.ics` file and open it. It should show the event in Asia/Almaty time with the venue address and the event URL. Google Calendar and Outlook.com open pre-filled templates in a new tab. BiletFlow never asks for calendar access.
3. **Attendee registration (F1/F3).** In a private window, register an attendee, verify through MailHog, sign in, register for the free ticket, and open the order. The confirmed order and the ticket offer the same calendar options. Download the A4 PDF.
4. **Paid flow (F4, simulated).** As the organizer, complete the activation checklist for a paid event. As the attendee, buy a ticket with the simulated payment. The ticket appears only after confirmation.
5. **Campaign QR (F8).** Create a campaign, open its link (`/c/<token>`). The promo is pre-applied, and the order total matches the server's.
6. **Check-in (F7).** Assign the scanner account as check-in staff, then scan the ticket QR (screen or printed PDF) in the app. The first scan is admitted and the second rejected. The Campaign QR is rejected as "not a ticket".
7. **Refund (F6).** Refund the paid order. The ticket becomes invalid, and a re-scan is rejected as refunded.
8. **Support and notifications (F9).** Open **Support** from the ticket, send a message, and reply as organizer staff.
9. **Analytics, history and admin (F10).** Event analytics and history reflect the steps above. The admin can suspend the event.
10. **Cancellation and calendar update (F2/F11).** As the organizer, cancel a test event. The organizer's view of the event page now offers **Download updated .ics file**. Importing it marks the existing calendar entry as cancelled (same UID, higher SEQUENCE, `STATUS:CANCELLED`). Attendees don't see this page yet, because P2 hides cancelled events from them (finding F11-2 in [F11_CHECKLIST.md](F11_CHECKLIST.md)).

## 5. Stop

```powershell
docker compose -f frontend/docker-compose.demo.yml down      # keeps data
```
