# Phone verification via Telegram bot — design

Date: 2026-11-24 · Owner: Yernur Slyamshaikhov · Part: P1 (accounts) + web account page

## Why

Accounts already confirm their email. Phones are collected at registration (PR #44) but not
checked. The owner wants phones verified the same way, and Telegram is the free way to prove a
person owns a number: Telegram only shares the number attached to the user's own account.

## Goals

- A signed-in user can verify the phone on their account through a BiletFlow Telegram bot.
- The account page shows whether the phone is verified, with a "Verify with Telegram" action.
- A verified phone is reset to unverified when the user changes the number.

## Non-goals

- Blocking anything on an unverified phone (sign-in, checkout, publishing). Decided: option 1,
  show and prompt only. Tightening later is a separate change.
- Verifying phones of people without Telegram (no SMS fallback now).
- Mobile (Event Admin) app UI; seeded demo accounts stay unverified.
- Sending notifications through Telegram: the next, separately designed step.

## Anti-goals

- Accepting a number the person does not own: only a contact the user shares *of themselves*
  (contact.user_id == sender id) counts.
- Breaking the app when no bot is configured: without a token the feature is hidden and nothing
  else changes.
- Putting the bot token in code, chat or the repo.

## Approaches considered

1. **Worker polls Telegram `getUpdates` every ~3 s (chosen).** Reuses the existing APScheduler
   worker, needs no public URL, works the same locally and on the deployed server.
2. Webhook endpoint Telegram calls. Instant, but only works on public HTTPS (not locally) and
   needs registration plus a second secret.
3. A bot library (aiogram / python-telegram-bot). Large dependency with its own process, for one
   "share contact" exchange; plain `httpx` (already a dependency) is enough.

## Flow

1. Account page → "Verify with Telegram". `POST /me/phone-verification` creates a single-use,
   15-minute token (stored hashed, like email tokens) and returns a deep link
   `https://t.me/<bot>?start=<token>`; the page opens it in a new tab and starts polling
   `GET /me` every few seconds while waiting.
2. In Telegram the user presses Start. The worker reads `/start <token>`, finds the pending
   request and replies asking them to tap a "Share my phone number" button (a contact-request
   keyboard). The token is bound to that Telegram chat.
3. The user shares their contact. The worker checks it is their own contact, normalises the
   number with the existing Kazakhstan rule and compares it with the account phone.
   - Match → set `users.phone_verified_at`, reply "Your phone is verified. You can return to
     BiletFlow." The page sees it on the next poll.
   - Mismatch → reply with the reason (number differs from the one on the account) and leave
     it unverified. Wrong person's contact, expired or used token → clear reply, no change.

## Data and API

- `users.phone_verified_at` (nullable timestamptz), exposed on `UserOut`.
- `users.telegram_chat_id` (nullable bigint), set when the phone is verified, so a later step can
  send event notifications through the bot without asking the user to link Telegram again. Not
  exposed in the API. (Added 2026-11-24 at the owner's request for future notifications.)
- `phone_verifications` table: id, user_id, token_hash, telegram_chat_id (null until Start),
  expires_at, used_at. One open request per user (a new one replaces the old).
- `POST /me/phone-verification` → `{ link, expires_at }`; 409 `phone_missing` without a
  phone; 503 `telegram_unavailable` when no bot is configured.
- `PATCH /me` with a different phone clears `phone_verified_at`.
- Settings: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` (env only). The worker job runs only
  when both are set. It keeps the `getUpdates` offset in memory: Telegram itself remembers which
  updates were confirmed, so a restart re-delivers at most the last unconfirmed batch, and every
  handler is safe to run twice. (Builder's call; storing it in `platform_settings` would surface
  it on the admin settings page.)
- `GET /me/phone-verification` → `{ available }` so the page can hide the button when no bot is
  configured.
- Contract (`docs/openapi.yaml`) updated first; one Alembic migration.

## Web

Account page phone field shows a "Verified" or "Not verified" badge. When unverified and the bot
is configured, a "Verify with Telegram" button and short instructions; "Waiting for Telegram…"
while polling (stops after 15 minutes or on leaving the page). kk/ru/en copy.

## Left to the builder

Exact copy wording, poll interval within a few seconds, how the bot configuration is exposed to
the page (e.g. a field on the verification response or a small config endpoint), test doubles
for the Telegram API.

## Owner actions

Create the bot with @BotFather, then put `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME` in
`backend/.env` locally and in the server's environment for the deployed site.
