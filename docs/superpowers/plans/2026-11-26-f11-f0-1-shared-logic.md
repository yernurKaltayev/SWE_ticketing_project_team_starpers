# F11 · F0.1 Move Portable Logic to `shared` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The web app's DOM-free logic and kk/ru/en copy live in `@biletflow/shared/features/<area>/<file>` so the mobile native rebuild reuses them; web behaviour is unchanged.

**Architecture:** `git mv` each portable file from `frontend/web/src/<area>/` to `frontend/shared/src/features/<area>/` (same folder layout, so cross-area relative imports like `../checkout/model` keep working). Each old web path keeps a one-line re-export stub, so the ~100 web importers and teammates' open branches are untouched. Pure logic tests move to `frontend/shared/tests/features/<area>/`. A guard test keeps browser APIs out of `shared`.

**Tech Stack:** TypeScript 6 / 5.9, npm workspaces, package `exports` subpath patterns, Vite 7, Metro (Expo SDK 58), vitest.

**Spec:** `docs/superpowers/plans/2026-11-26-mobile-native-rebuild.md` § Phase 0 → F0.1 (roadmap is the spec for this step).

## Global Constraints
- Branch `feat/f11-f0-1-shared-logic-slyamshaikhov` from `master` (0b30db3 or later). No Claude attribution in commits, PR text or docs.
- No behaviour change in web: every existing test still passes; `npm run check` green after every task.
- Nothing under `frontend/shared/src` may contain `document.`, `window.`, `localStorage`, `sessionStorage`, `navigator.`, `URL.createObjectURL`, `import.meta.env`, or import `react`, `react-dom`, `react-router-dom`, `@tanstack/react-query`.
- Inside `shared`, never import `@biletflow/shared` (self-import): use `../../index` and `../../generated/api`.
- Old web paths stay as stubs whose whole content is `export * from "@biletflow/shared/features/<area>/<file>";` (no `export default` exists in any moved file; keep it that way).
- `npm run export:mobile` green at the end.

## Files that move (26)

| Area | Files |
|---|---|
| auth | `copy.ts`, `helpers.ts` |
| calendar | `copy.ts`, `model.ts` |
| checkout | `copy.ts`, `model.ts` |
| seating | `copy.ts`, `model.ts` |
| staff | `copy.ts`, `model.ts` |
| events | `model.ts`, `contracts.ts`, `copy.ts`, `categories.ts`, `discoveryCopy.ts`, `offerLabel.ts` |
| support | `copy.ts`, `model.ts` |
| payments | `copy.ts`, `model.ts` |
| promotions | `copy.ts`, `model.ts` |
| operations | `copy.ts`, `model.ts` |
| insights | `copy.ts`, `model.ts` |

Stay in web (browser-bound or React-bound): every `data.ts`, `ui.tsx`, page components, `checkout/attempt.ts`, `support/drafts.ts`, `promotions/usePromotion.ts`, `seating/useSeatMap.ts`, `auth/session.ts`, `mocks/*`.

**Move procedure (used by Tasks 2 and 3, per file):**
1. `git mv frontend/web/src/<area>/<file>.ts frontend/shared/src/features/<area>/<file>.ts`
2. In the moved file: `"@biletflow/shared"` → `"../../index"`, `"@biletflow/shared/api"` → `"../../generated/api"`. Relative imports (`./copy`, `../checkout/model`) stay as they are.
3. Create `frontend/web/src/<area>/<file>.ts` containing only `export * from "@biletflow/shared/features/<area>/<file>";`
4. If `frontend/web/src/<area>/<file>.test.ts` imports only vitest, the moved module(s) and `@biletflow/shared*`: `git mv` it to `frontend/shared/tests/features/<area>/<file>.test.ts` and point its imports at `@biletflow/shared/features/<area>/...`. Otherwise leave it in web (it reaches the module through the stub).

## Review Focus
- A teammate's open branch edits a moved file (e.g. `web/src/checkout/model.ts`) → git shows a conflict on the one-line stub; the PR description must tell them to re-apply their edit in `shared/src/features/...`.
- Vite production build and Metro both resolve the `./features/*` wildcard export → covered by `build:web` in `npm run check` (every task) and `export:mobile` (Task 4).
- Mocks and MSW handlers that import moved modules (`web/src/mocks/*`) still work → covered by the full suite in every task.
- `insights/model.test.ts` depends on `web/src/mocks/events` → stays in web; ledger it.
- Type-only re-exports through `export *` (types like `Locale`-keyed copy records) keep their types → covered by `npm run typecheck` in every task.

---

### Task 1: Export map and guard test

**Files:**
- Modify: `frontend/shared/package.json` (`exports`)
- Create: `frontend/shared/tests/features.test.ts`

**Interfaces — Produces:** package subpath `@biletflow/shared/features/<area>/<file>` → `frontend/shared/src/features/<area>/<file>.ts`.

- [ ] **Step 1: Write the failing test** `shared/tests/features.test.ts`:
  - `it("exposes moved modules through the package path")`: `await import("@biletflow/shared/features/calendar/copy")` resolves and has an `en`-keyed or locale-keyed export (assert `Object.keys(mod).length > 0`).
  - `it("keeps browser and React APIs out of shared")`: walk `shared/src` (node `fs`, recursive), for every `.ts` file assert no match of `/\b(document|window|localStorage|sessionStorage|navigator)\.|URL\.createObjectURL|import\.meta\.env|from "(react|react-dom|react-router-dom|@tanstack\/react-query)"|from "@biletflow\/shared/` and no `export default`.
- [ ] **Step 2:** `npx vitest run shared/tests/features.test.ts` → FAIL (cannot resolve `@biletflow/shared/features/calendar/copy`); the guard case passes.
- [ ] **Step 3:** add `"./features/*": "./src/features/*.ts"` to `shared/package.json` `exports`; move `calendar/copy.ts` with the move procedure (the first real file).
- [ ] **Step 4:** same vitest command → PASS; `npm run check` → green.
- [ ] **Step 5:** commit `refactor(f11): shared feature export path and no-DOM guard`.

### Task 2: Leaf areas (no cross-area imports)

**Files:** move procedure for `calendar/model`, `checkout/copy`, `checkout/model`, `seating/copy`, `seating/model`, `staff/model`, `staff/copy` (after `staff/model`), `auth/copy`, `auth/helpers` (after `auth/copy`).
Tests moved: `calendar/model.test.ts`, `checkout/model.test.ts`, `seating/model.test.ts`, `auth/helpers.test.ts`.

- [ ] **Step 1:** extend `features.test.ts` with `it.each` over the 9 paths above → each `import()` resolves. Run → FAIL on the first unmoved path.
- [ ] **Step 2:** move the files, in the order listed.
- [ ] **Step 3:** `npx vitest run shared/tests` → PASS; `npm run check` → green (test count unchanged from master: tests only moved).
- [ ] **Step 4:** commit `refactor(f11): move calendar, checkout, seating, staff, auth logic to shared`.

### Task 3: Dependent areas

**Files:** move procedure, in this order: `events/model`, `events/categories`, `events/discoveryCopy`, `events/offerLabel`, `events/contracts`, `events/copy`, `support/model`, `support/copy`, `payments/model`, `payments/copy`, `promotions/model`, `promotions/copy`, `operations/model`, `operations/copy`, `insights/model`, `insights/copy`.
Tests moved: `events/model.test.ts`, `events/contracts.test.ts`, `support/model.test.ts`, `payments/model.test.ts`, `promotions/model.test.ts`, `operations/model.test.ts`. Stays in web: `insights/model.test.ts` (imports `../mocks/events`).

- [ ] **Step 1:** extend the `it.each` list with the 16 paths → run → FAIL.
- [ ] **Step 2:** move the files in the listed order (each one's relative dependencies are already in `shared`).
- [ ] **Step 3:** `npx vitest run shared/tests` → PASS; `npm run check` → green, same total test count as master.
- [ ] **Step 4:** commit `refactor(f11): move events, support, payments, promotions, operations, insights logic to shared`.

### Task 4: Prove mobile can use it, then docs

**Files:**
- Modify: `frontend/mobile/src/tickets/copy.ts` — `status` labels come from the shared checkout copy instead of the local duplicate.
- Modify: `frontend/README.md` (where shared logic lives, stub rule), `docs/superpowers/plans/2026-11-26-mobile-native-rebuild.md` (mark F0.1 done; record ruling below).

- [ ] **Step 1:** add to `mobile/src/tickets/model.test.ts`: `it("uses the shared ticket status labels")` — for each locale in `["en","ru","kk"]` and each status in `["valid","checked_in","refunded","cancelled"]`, `expect(ticketsCopy[l].status[s]).toBe(commerceCopy[l].states[s])`, importing `commerceCopy` from `@biletflow/shared/features/checkout/copy`. Run `npx vitest run mobile/src/tickets` → PASS is expected (the strings were copied by hand); this test is the guard that keeps them identical after Step 2.
- [ ] **Step 2:** in `mobile/src/tickets/copy.ts`, replace each locale's hand-written `status` object with `commerceCopy[<locale>].states`; rerun → PASS.
- [ ] **Step 3:** `npm run check` → green; `npm run export:mobile` → succeeds (proves Metro resolves `@biletflow/shared/features/*`).
- [ ] **Step 4:** docs updates; commit `docs(f11): shared feature logic location; mobile reuses checkout copy`.
- [ ] **Step 5:** push branch; PR to `master` whose description lists the 26 moved files and says: "If your branch edits one of these web files, re-apply the edit in `frontend/shared/src/features/<area>/<file>.ts`; the old path is now a one-line re-export."
