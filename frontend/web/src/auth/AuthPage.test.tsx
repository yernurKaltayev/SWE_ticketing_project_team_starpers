// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { authCopy } from "./copy";
import { AuthPage } from "./AuthPage";
import type { AuthKind } from "./AuthPage";

// The real client binds fetch when it is created, before msw patches it; resolve it per call.
vi.mock("../api", async () => {
  const shared = await import("@biletflow/shared");
  return {
    tokenStore: shared.createMemoryTokenStore(),
    api: shared.createApiClient({
      baseUrl: window.location.origin,
      fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args),
    }),
  };
});

let calls = 0;
let outcome: "ok" | "invalid" = "ok";
const server = setupServer(
  http.post("*/api/v1/auth/verify-email", () => {
    calls += 1;
    return outcome === "ok"
      ? HttpResponse.json({ message: "ok" })
      : HttpResponse.json(
          { code: "invalid_email_token", message: "bad", details: null },
          { status: 422 },
        );
  }),
);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
afterEach(() => {
  cleanup();
  calls = 0;
  outcome = "ok";
});

// App.tsx keys the page tree on location.key, so any router navigation remounts the page. Mirror
// that here: stripping the token with a navigation would lose the in-flight verification.
function Keyed({ kind }: { kind: AuthKind }) {
  const location = useLocation();
  return <AuthPage key={location.key} kind={kind} locale="en" />;
}
const open = (path: string, kind: AuthKind = "verify-email") =>
  render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={<Keyed kind={kind} />} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  );

it("confirms the email once when the link opens, without a second click", async () => {
  open("/verify-email?token=abc");
  expect(await screen.findByText(authCopy.en.verified)).toBeTruthy();
  expect(
    screen.getByRole("heading", { name: authCopy.en.verifiedTitle }),
  ).toBeTruthy();
  expect(screen.getByRole("link", { name: authCopy.en.login })).toBeTruthy();
  expect(screen.queryByText(authCopy.en.resend)).toBeNull();
  expect(screen.queryByText(authCopy.en.verifyHelp)).toBeNull();
  expect(calls).toBe(1);
});

it("falls back to the resend form when the link is invalid", async () => {
  outcome = "invalid";
  open("/verify-email?token=used");
  expect(await screen.findByLabelText(authCopy.en.email)).toBeTruthy();
  expect(screen.getByText(/already used or has expired/)).toBeTruthy();
  expect(calls).toBe(1);
});

it("sends nothing when there is no token", async () => {
  open("/verify-email");
  expect(await screen.findByLabelText(authCopy.en.email)).toBeTruthy();
  await waitFor(() => expect(calls).toBe(0));
});

it("keeps a password reset link's token so the new-password form shows", async () => {
  open("/reset-password?token=abc", "reset-password");
  expect(await screen.findByLabelText(authCopy.en.newPassword)).toBeTruthy();
  expect(screen.queryByText(authCopy.en.tokenMissing)).toBeNull();
});
