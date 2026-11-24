// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { createMemoryTokenStore, createSession } from "@biletflow/shared";
import { handlers } from "../mocks/handlers";
import { mockPassword, resetAuthMocks } from "../mocks/auth";
import { SessionContext } from "./session";
import { ProfilePage } from "./ProfilePage";
import { authCopy } from "./copy";

const t = authCopy.en;
const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
beforeEach(() => resetAuthMocks());

let verified = false;
let started = 0;
function backend({ available = true }: { available?: boolean } = {}) {
  verified = false;
  started = 0;
  server.use(
    http.get("*/api/v1/me", () =>
      HttpResponse.json({
        id: "u1",
        email: "organizer@example.com",
        full_name: "Aida",
        phone: "+77012345678",
        role: "organizer",
        email_verified_at: "2026-01-01T00:00:00Z",
        phone_verified_at: verified ? "2026-11-24T10:00:00Z" : null,
      }),
    ),
    http.get("*/api/v1/me/phone-verification", () =>
      HttpResponse.json({ available }),
    ),
    http.post("*/api/v1/me/phone-verification", () => {
      started += 1;
      return HttpResponse.json(
        {
          link: "https://t.me/biletflow_test_bot?start=tok",
          expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
        },
        { status: 201 },
      );
    }),
  );
}

async function page() {
  const session = createSession({
    baseUrl: "http://localhost:3000",
    tokenStore: createMemoryTokenStore(),
  });
  await session.login({ email: "organizer@example.com", password: mockPassword });
  render(
    <SessionContext.Provider value={session}>
      <MemoryRouter>
        <ProfilePage locale="en" pollMs={20} />
      </MemoryRouter>
    </SessionContext.Provider>,
  );
}

it("shows not verified and the Telegram action when the bot is available", async () => {
  backend();
  await page();
  expect(await screen.findByText(t.phoneUnverified)).toBeTruthy();
  expect(
    await screen.findByRole("button", { name: t.verifyTelegram }),
  ).toBeTruthy();
});

it("hides the Telegram action when no bot is configured", async () => {
  backend({ available: false });
  await page();
  expect(await screen.findByText(t.phoneUnverified)).toBeTruthy();
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(screen.queryByRole("button", { name: t.verifyTelegram })).toBeNull();
});

it("gives the Telegram link and shows verified once the account reports it", async () => {
  backend();
  await page();
  fireEvent.click(await screen.findByRole("button", { name: t.verifyTelegram }));

  const link = await screen.findByRole("link", { name: t.openTelegram });
  expect(link.getAttribute("href")).toBe(
    "https://t.me/biletflow_test_bot?start=tok",
  );
  expect(link.getAttribute("target")).toBe("_blank");
  expect(screen.getByText(t.waitingTelegram)).toBeTruthy();
  expect(started).toBe(1);

  verified = true;
  expect(await screen.findByText(t.phoneVerified)).toBeTruthy();
  expect(screen.queryByRole("link", { name: t.openTelegram })).toBeNull();
});

it("asks to save a changed phone before verifying it", async () => {
  backend();
  await page();
  await screen.findByRole("button", { name: t.verifyTelegram });

  fireEvent.change(screen.getByLabelText(t.phone, { exact: true }), {
    target: { value: "+7 702 000 00 00" },
  });

  expect(screen.getByText(t.phoneSaveFirst)).toBeTruthy();
  expect(screen.queryByRole("button", { name: t.verifyTelegram })).toBeNull();
});
