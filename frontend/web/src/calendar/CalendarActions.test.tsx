// @vitest-environment jsdom
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { createMemoryTokenStore, createSession } from "@biletflow/shared";
import { SessionContext } from "../auth/session";
import { resetAuthMocks } from "../mocks/auth";
import { demoEventId, mockSetEventState, resetEventMocks } from "../mocks/events";
import { handlers } from "../mocks/handlers";
import { EventDetail } from "../events/Detail";

// The real anonymous `api` client binds `fetch` when its module loads, before
// MSW patches it in Node. Resolve `fetch` per request instead (the browser
// worker intercepts at the network layer and needs no such change).
vi.mock("../api", async () => {
  const { createApiClient, createMemoryTokenStore } = await import(
    "@biletflow/shared"
  );
  const tokenStore = createMemoryTokenStore();
  return {
    tokenStore,
    api: createApiClient({
      baseUrl: "http://localhost:3000",
      fetch: (input, init) => fetch(input, init),
      getAccessToken: tokenStore.getAccessToken,
    }),
  };
});

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
let files: Blob[];
beforeEach(() => {
  resetAuthMocks();
  resetEventMocks();
  files = [];
  URL.createObjectURL = vi.fn((blob: Blob) => {
    files.push(blob);
    return "blob:fixture-calendar";
  });
  URL.revokeObjectURL = vi.fn();
});

async function page(locale: "en" | "ru" | "kk" = "en", email?: string) {
  const session = createSession({
    baseUrl: "http://localhost:3000",
    tokenStore: createMemoryTokenStore(),
  });
  if (email) await session.login({ email, password: "BiletFlow123!" });
  render(
    <SessionContext.Provider value={session}>
      <MemoryRouter initialEntries={[`/events/${demoEventId}`]}>
        <Routes>
          <Route path="/events/:eventId" element={<EventDetail locale={locale} />} />
        </Routes>
      </MemoryRouter>
    </SessionContext.Provider>,
  );
}

it("lets an anonymous visitor download the canonical .ics and open provider templates", async () => {
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  await page();
  const section = await screen.findByRole("region", { name: "Add to calendar" });
  const google = within(section).getByRole("link", { name: /Google Calendar/ });
  expect(google.getAttribute("target")).toBe("_blank");
  expect(google.getAttribute("rel")).toBe("noopener noreferrer");
  const params = new URL(google.getAttribute("href")!).searchParams;
  expect(params.get("ctz")).toBe("Asia/Almaty");
  expect(params.get("dates")).toBe("20270120T130000Z/20270120T150000Z");
  await waitFor(() =>
    expect(
      new URL(
        within(section).getByRole("link", { name: /Google Calendar/ }).getAttribute("href")!,
      ).searchParams.get("location"),
    ).toBe("Demo campus auditorium, Demo venue address, Astana"),
  );
  expect(within(section).getByRole("link", { name: /Outlook\.com/ })).toBeDefined();
  expect(within(section).getByText(/\(Almaty\)/)).toBeDefined();

  await userEvent.click(
    within(section).getByRole("button", { name: "Download .ics file" }),
  );
  await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
  expect(files).toHaveLength(1);
  expect(files[0].type).toContain("text/calendar");
  const text = await files[0].text();
  expect(text).toContain(`UID:${demoEventId}@biletflow.kz`);
  expect(text).toContain("STATUS:CONFIRMED");
  const anchor = click.mock.contexts[0] as HTMLAnchorElement;
  expect(anchor.download).toBe("demo-student-technology-meetup.ics");
  click.mockRestore();
});

it("offers only the updated cancellation file for a cancelled event", async () => {
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  mockSetEventState(demoEventId, { status: "cancelled" });
  // The F2 mock hides cancelled events from anonymous visitors; use the owner.
  await page("en", "organizer@example.com");
  const section = await screen.findByRole("region", { name: "Add to calendar" });
  expect(within(section).queryByRole("link")).toBeNull();
  expect(within(section).getByText(/This event was cancelled/)).toBeDefined();
  await userEvent.click(
    within(section).getByRole("button", { name: "Download updated .ics file" }),
  );
  await waitFor(() => expect(files).toHaveLength(1));
  expect(await files[0].text()).toContain("STATUS:CANCELLED");
  click.mockRestore();
});

it("reports an unavailable file and rejects a non-calendar response", async () => {
  server.use(
    http.get("*/api/v1/events/:id/calendar.ics", () =>
      HttpResponse.json(
        { code: "event_not_found", message: "nope", details: null },
        { status: 404 },
      ),
    ),
  );
  await page();
  const section = await screen.findByRole("region", { name: "Add to calendar" });
  await userEvent.click(
    within(section).getByRole("button", { name: "Download .ics file" }),
  );
  expect((await screen.findByRole("alert")).textContent).toBe(
    "The calendar file is not available for this event.",
  );

  server.use(
    http.get("*/api/v1/events/:id/calendar.ics", () =>
      new HttpResponse("<html></html>", { headers: { "Content-Type": "text/html" } }),
    ),
  );
  await userEvent.click(
    within(section).getByRole("button", { name: "Download .ics file" }),
  );
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toBe(
      "The calendar file could not be downloaded. Try again.",
    ),
  );
  expect(files).toHaveLength(0);
});

it("is localized in Kazakh and Russian", async () => {
  await page("kk");
  expect(
    await screen.findByRole("region", { name: "Күнтізбеге қосу" }),
  ).toBeDefined();
  expect(screen.getByRole("button", { name: ".ics файлын жүктеу" })).toBeDefined();
  cleanup();
  await page("ru");
  expect(
    await screen.findByRole("region", { name: "Добавить в календарь" }),
  ).toBeDefined();
});
