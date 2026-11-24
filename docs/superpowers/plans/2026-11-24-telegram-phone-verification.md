# Telegram Phone Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user verify the phone on their account by sharing their own contact with a BiletFlow Telegram bot; show Verified / Not verified on the account page, block nothing.

**Architecture:** A start endpoint issues a single-use hashed token and a `t.me/<bot>?start=<token>` link. An APScheduler job in the existing worker long-polls Telegram `getUpdates` every 3 s through a thin `httpx` client and hands each update to a pure handler that binds the chat on `/start`, then checks a shared contact and sets `users.phone_verified_at`. The web account page shows the state and polls `/me` while waiting.

**Tech Stack:** FastAPI, SQLAlchemy 2 async, Alembic, APScheduler, httpx (all existing); React + TanStack Query + MSW on the web.

**Spec:** `docs/superpowers/specs/2026-11-24-telegram-phone-verification-design.md`

## Global Constraints

- Nothing is blocked by an unverified phone (sign-in, checkout, publishing unchanged).
- Only a contact whose `contact.user_id` equals the sender's `from.id` counts.
- Phones compare after the existing Kazakhstan rule: `app.schemas.common._kazakhstan_phone` (stored form `+77012345678`).
- Token: single use, 15-minute lifetime, stored hashed with `app.core.security.hash_token`, one open request per user.
- Without `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME` the job does nothing, `GET /me/phone-verification` says `available: false`, `POST` returns 503 `telegram_unavailable`.
- Token never in code, repo or logs. Bot replies in kk, ru and en (three lines).
- Contract first: `backend/docs/openapi.yaml`, then `npm run generate:api` in `frontend/`.
- Backend tests run in the container: `sh <scratchpad>/btest.sh "uv run --no-sync pytest ..."` (host port 5432 is a native Postgres).

## Review Focus

1. A forwarded contact card of someone else (contact.user_id ≠ from.id, or missing) → rejected, phone stays unverified. Test in Task 3.
2. The user changes their phone after pressing Start but before sharing → compared with the *current* account phone; a change also clears an earlier verification. Tests in Tasks 1 and 3.
3. The same update delivered twice after a worker restart → second run is harmless (no error, still verified once). Test in Task 3.
4. Telegram unreachable or returning `ok: false` → job logs and returns, worker keeps running, offset not advanced. Test in Task 4.
5. `/start` with no or an unknown/expired token, plain text, stickers → a short instruction reply, no crash, no state change. Test in Task 3.

---

### Task 1: Data layer, settings and reset on phone change

**Files:**
- Modify: `backend/app/core/config.py` (settings), `backend/app/models/user.py`, `backend/app/models/__init__.py`, `backend/app/schemas/user.py` (`UserOut`), `backend/app/services/user_service.py` (`update_user`)
- Create: `backend/alembic/versions/p1_phone_verification.py`
- Test: `backend/tests/api/test_users.py`

**Interfaces:**
- Produces: `Settings.telegram_bot_token: SecretStr | None = None`, `Settings.telegram_bot_username: str | None = None`, property `Settings.telegram_enabled -> bool` (both set).
- Produces: `User.phone_verified_at: Mapped[datetime | None]`, `User.telegram_chat_id: Mapped[int | None]` (BigInteger, not in `UserOut`); model `PhoneVerification(UUIDPrimaryKey, Timestamps, Base)`, table `phone_verifications`: `user_id` fk users, `token_hash: str unique`, `telegram_chat_id: BigInteger | None`, `expires_at: datetime`, `used_at: datetime | None`.
- Produces: `UserOut.phone_verified_at: datetime | None`.

- [ ] **Step 1: Write failing tests** in `tests/api/test_users.py`:
  - `test_me_reports_phone_verification` — a user with `phone_verified_at` set: `GET /me` returns a non-null `phone_verified_at`.
  - `test_changing_the_phone_clears_its_verification` — verified user PATCHes `{"phone": "+7 702 000 00 00"}` → response `phone_verified_at is None`.
  - `test_saving_the_same_phone_keeps_its_verification` — PATCH `{"phone": "8 (701) 123-45-67"}` when stored is `+77011234567` → still verified.
- [ ] **Step 2: Run** `pytest tests/api/test_users.py -q` — expect the three to FAIL.
- [ ] **Step 3: Implement** the settings, model, `UserOut` field, and in `update_user`: when `phone` is in the update and differs from the stored value, set `phone_verified_at = None`. Migration `p1_phone_verification` (down_revision `"p12_audit_append_only"`): add `users.phone_verified_at timestamptz null` and `users.telegram_chat_id bigint null`; create `phone_verifications` (+ index on `user_id`); downgrade drops both.
- [ ] **Step 4: Run** the full backend suite + ruff + mypy — all green.
- [ ] **Step 5: Commit** `feat(p1): store phone verification state`.

### Task 2: Start endpoint and availability (contract first)

**Files:**
- Modify: `backend/docs/openapi.yaml`, `backend/app/routers/users.py`, `backend/app/schemas/user.py`
- Create: `backend/app/services/phone_verification.py`
- Test: `backend/tests/api/test_phone_verification.py`

**Interfaces:**
- Consumes: Task 1 model/settings.
- Produces: `PhoneVerificationStatusOut {available: bool}`, `PhoneVerificationStartOut {link: str, expires_at: datetime}`.
- Produces: `async def start(db, user, settings) -> tuple[str, datetime]` (link, expires_at); `TOKEN_LIFETIME = timedelta(minutes=15)`.
- Routes: `GET /me/phone-verification`, `POST /me/phone-verification` (both `CurrentUser`).

- [ ] **Step 1: Write failing tests** (monkeypatch settings via `get_settings` override or env + `get_settings.cache_clear()`):
  - `test_status_says_unavailable_without_a_bot` → `{"available": false}`.
  - `test_start_without_a_bot_is_503` → status 503, code `telegram_unavailable`.
  - `test_start_without_a_phone_is_409` (bot configured, `phone=None`) → 409, code `phone_missing`.
  - `test_start_returns_a_deep_link` → 201, `link` matches `^https://t\.me/biletflow_test_bot\?start=[A-Za-z0-9_-]{20,64}$`, `expires_at` ≈ now + 15 min, DB row stores `hash_token(token)` not the token.
  - `test_starting_again_replaces_the_open_request` → two starts leave one row with `used_at is None`.
- [ ] **Step 2: Run** — FAIL (404 / import errors).
- [ ] **Step 3: Implement** the contract entries, schemas, service (`secrets.token_urlsafe(24)`; mark the user's earlier open rows `used_at=now` before inserting) and routes (POST status 201). Errors: `ServiceUnavailableError(code="telegram_unavailable")`, `ConflictError(code="phone_missing")`.
- [ ] **Step 4: Run** suite incl. `tests/api/test_contract.py` — green.
- [ ] **Step 5: Commit** `feat(p1): start Telegram phone verification`.

### Task 3: Bot conversation handler and Telegram client

**Files:**
- Create: `backend/app/services/telegram.py` (client), extend `backend/app/services/phone_verification.py` (handler)
- Test: `backend/tests/unit/test_telegram_bot.py`

**Interfaces:**
- Produces: `@dataclass(frozen=True) class BotReply: chat_id: int; text: str; ask_contact: bool = False`.
- Produces: `async def handle_update(db: AsyncSession, update: dict[str, Any]) -> list[BotReply]` — never raises for malformed input.
- Produces: `class TelegramApi(token: str, client: httpx.AsyncClient | None = None)` with `async get_updates(offset: int | None, timeout: int = 0) -> list[dict]` and `async send_message(reply: BotReply) -> None`; raises `TelegramError` on HTTP failure or `ok: false`. `ask_contact=True` sends `reply_markup={"keyboard": [[{"text": <share label>, "request_contact": true}]], "one_time_keyboard": true, "resize_keyboard": true}`; otherwise `{"remove_keyboard": true}`.

Message keys (each reply is the kk, ru and en sentence on three lines): `ask_contact`, `verified`, `mismatch`, `not_own_contact`, `link_invalid` (unknown, used or expired token), `start_first` (contact with no bound open request), `help` (anything else).

- [ ] **Step 1: Write failing tests** with factory users and updates built by a helper `update(chat_id, from_id, text=None, contact=None)`:
  - `test_start_binds_the_chat_and_asks_for_the_contact` → one reply, `ask_contact=True`, row `telegram_chat_id == chat_id`.
  - `test_own_matching_contact_verifies_the_phone` (contact `phone_number="77012345678"`, account `+77012345678`) → `phone_verified_at` set, `telegram_chat_id == chat_id`, row `used_at` set, reply text contains the `verified` English line.
  - `test_contact_in_another_format_still_matches` (`"+7 701 234 56 78"`).
  - `test_someone_elses_contact_is_refused` (contact `user_id != from.id`, and missing `user_id`) → unverified, `not_own_contact`.
  - `test_a_different_number_is_refused` → unverified, `mismatch`, row stays open (can retry).
  - `test_the_current_account_phone_is_used` — account phone changed to another number after `/start` → `mismatch`.
  - `test_expired_used_or_unknown_link` → `link_invalid`, no binding.
  - `test_contact_without_start_and_other_messages` → `start_first` / `help`, nothing changes.
  - `test_the_same_update_twice_is_harmless` → second call returns a reply, no exception, still verified once.
  - `test_client_builds_the_contact_keyboard` — `TelegramApi` with `httpx.MockTransport` asserts the `sendMessage` JSON for `ask_contact=True`; `ok: false` raises `TelegramError`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** `handle_update`: `/start <token>` → look up open, unexpired row by `hash_token`, bind `telegram_chat_id`; contact message → open row bound to this chat, `contact.user_id == from.id`, `_kazakhstan_phone(contact.phone_number)` (a `ValueError` counts as mismatch) equals the user's current `phone` → set `user.phone_verified_at`, `user.telegram_chat_id = chat_id`, `row.used_at`; commit per update. Client: `https://api.telegram.org/bot{token}/{method}`, 35 s timeout.
- [ ] **Step 4: Run** — green; ruff + mypy clean.
- [ ] **Step 5: Commit** `feat(p1): Telegram bot verifies a shared contact`.

### Task 4: Worker job

**Files:**
- Create: `backend/app/tasks/telegram_updates.py`
- Modify: `backend/app/tasks/worker.py` (`JOBS`), `backend/.env.example`, `backend/docker-compose.yml` (pass both env vars), `deploy/backend.override.yml` if it lists env vars, `backend/README.md` (short "Telegram phone verification" section: BotFather steps, env vars)
- Test: `backend/tests/unit/test_telegram_job.py`

**Interfaces:**
- Consumes: `TelegramApi`, `handle_update`, `Settings.telegram_enabled`.
- Produces: `async def poll_once(db, api, offset: int | None) -> int | None` (returns next offset); `async def telegram_updates_job() -> None` (no-op when disabled; module-level `_offset`); registered in `JOBS` with interval 3.

- [ ] **Step 1: Write failing tests** with a fake api object:
  - `test_poll_handles_updates_sends_replies_and_advances` → returns `max(update_id) + 1`, replies sent in order.
  - `test_poll_keeps_the_offset_when_telegram_fails` → fake raises `TelegramError` → returns the input offset, nothing sent, no exception.
  - `test_a_failing_reply_does_not_stop_the_batch` → one `send_message` raises; later replies still sent.
  - `test_job_does_nothing_without_a_bot` → `telegram_updates_job()` returns without constructing `TelegramApi` (monkeypatch it to fail if called).
  - `test_worker_registers_the_telegram_job` → `(telegram_updates_job, 3)` in `JOBS`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** with `get_updates(offset, timeout=0)` (short poll; the 3 s schedule is the wait), logging failures at WARNING without the token.
- [ ] **Step 4: Run** full backend suite + ruff + mypy — green.
- [ ] **Step 5: Commit** `feat(p1): worker polls the Telegram bot`.

### Task 5: Account page

**Files:**
- Modify: `frontend/shared/src/generated/api.d.ts` (regenerate), `frontend/web/src/auth/ProfilePage.tsx`, `frontend/web/src/auth/copy.ts`, `frontend/web/src/mocks/auth.ts`
- Create: `frontend/web/src/auth/PhoneVerification.tsx`, `frontend/web/src/auth/ProfilePage.test.tsx`

**Interfaces:**
- Consumes: `GET`/`POST /api/v1/me/phone-verification`, `UserOut.phone_verified_at`.
- Produces: `PhoneVerification({ locale })` rendered under the phone field; copy keys `phoneVerified`, `phoneUnverified`, `verifyTelegram`, `verifyTelegramHelp`, `waitingTelegram`, `telegramExpired`, `phoneSaveFirst` in kk/ru/en.

Behaviour: badge from `user.phone_verified_at`. When unverified, the saved phone exists and status `available` → button. Click → POST, `window.open(link, "_blank", "noopener")`, show `waitingTelegram`, call `controller.reloadUser()` every 3 s until verified, `expires_at` passes (then `telegramExpired` + button again) or unmount. A phone typed but not saved shows `phoneSaveFirst` instead of the button. Unavailable → badge only.

- [ ] **Step 1: Write failing tests** (MSW handlers per test, real `createSession` like `events/ui.test.tsx`):
  - `shows not verified and the Telegram button when the bot is available`.
  - `hides the button when the bot is not configured` (`available: false`).
  - `opens the deep link and shows verified once /me reports it` — stub `window.open`, second `/me` response has `phone_verified_at` → badge text `phoneVerified`.
  - `asks to save a changed phone before verifying`.
- [ ] **Step 2: Run** `npx vitest run web/src/auth/ProfilePage.test.tsx` — FAIL.
- [ ] **Step 3: Implement** component, copy, mock handlers (mock `available: true`, POST returns `https://t.me/biletflow_mock_bot?start=mock`).
- [ ] **Step 4: Run** `npm run check` in `frontend/` — green.
- [ ] **Step 5: Commit** `feat(f1): verify the phone with Telegram on the account page`.

### Task 6: End-to-end check

- [ ] Rebuild `api` and `worker`; with no token: account page shows "Not verified" and no button; `POST` is 503.
- [ ] With the owner's bot token in `backend/.env` (owner enters it): click the button, Start in Telegram, share the contact → badge turns Verified within a few seconds; sharing a different number gives the mismatch reply.
- [ ] Commit the spec and plan under `docs/superpowers/`.
