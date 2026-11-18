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
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Link,
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { SessionContext } from "../auth/session";
import { handlers } from "../mocks/handlers";
import { actor, reset, seed, demoEventId } from "../operations/testFixtures";
import { resetSupportMocks, mockNotify } from "../mocks/support";
import { resetStaffMocks } from "../mocks/staff";
import { expireMockAccessTokens } from "../mocks/auth";
import { ApiError } from "@biletflow/shared";
import type { Case, Notice } from "./model";
import { casePath } from "./model";
import { retryRead, readDelay } from "./data";
import { EmailOrderLink, EmailTicketsLink } from "./EmailLinks";
import Cases from "./Cases";
import NewCase from "./NewCase";
import Thread from "./Thread";
import Notifications from "./Notifications";
import { NotificationLink } from "./NotificationLink";
const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
afterEach(() => {
  cleanup();
  server.resetHandlers();
  server.events.removeAllListeners();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
beforeEach(() => {
  reset();
  resetSupportMocks();
  resetStaffMocks();
  localStorage.clear();
  sessionStorage.clear();
});
async function create(
  buyer: Awaited<ReturnType<typeof actor>>,
  extra: Record<string, unknown> = {},
) {
  return buyer.request<Case>("/api/v1/support/cases", {
    method: "POST",
    body: {
      subject: "Ticket question",
      category: "ticket_delivery",
      message: "Where is my ticket?",
      event_id: demoEventId,
      ...extra,
    },
  });
}
function app(
  session: Awaited<ReturnType<typeof actor>>,
  path = "/support",
  locale: "en" | "ru" | "kk" = "en",
) {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0 } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <SessionContext.Provider value={session}>
        <MemoryRouter initialEntries={[path]}>
          <nav aria-label="Test navigation">
            <Link to="/support/new">New form</Link>
            <Link to="/support">Inbox</Link>
            <NotificationLink locale={locale} />
          </nav>
          <Routes>
            <Route path="/support" element={<Cases locale={locale} />} />
            <Route path="/support/new" element={<NewCase locale={locale} />} />
            <Route
              path="/support/cases/:caseId"
              element={<Thread locale={locale} />}
            />
            <Route
              path="/account/notifications"
              element={<Notifications locale={locale} />}
            />
          </Routes>
        </MemoryRouter>
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
  return { ...view, client };
}
it("opens a context-linked case as the signed-in requester and displays its initial message", async () => {
  const { order, buyer } = await seed();
  let sent: unknown;
  server.events.on("request:start", ({ request }) => {
    if (
      request.method === "POST" &&
      new URL(request.url).pathname === "/api/v1/support/cases"
    )
      void request
        .clone()
        .json()
        .then((v) => {
          sent = v;
        });
  });
  app(buyer, `/support/new?order_id=${order.id}`);
  fireEvent.change(screen.getByLabelText("Subject"), {
    target: { value: "Delivery question" },
  });
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: "Please help" },
  });
  await userEvent.click(screen.getByRole("button", { name: "Open case" }));
  await screen.findByRole("heading", { name: "Delivery question" });
  await screen.findByText("Please help");
  expect(sent).toMatchObject({ order_id: order.id, category: "technical" });
  expect(sent).not.toHaveProperty("requester_id");
  expect(screen.getByText(order.id)).toBeDefined();
});
it("allows an event owner to claim, reply, resolve and retain a case without reloading", async () => {
  const buyer = await actor("attendee@example.com"),
    owner = await actor();
  const c = await create(buyer);
  app(owner, `/support/cases/${c.id}`);
  await screen.findByText("Where is my ticket?");
  await screen.findByLabelText("Choose responder");
  await userEvent.selectOptions(
    screen.getByLabelText("Choose responder"),
    owner.getSnapshot().user!.id,
  );
  await userEvent.selectOptions(
    screen.getByLabelText("Status"),
    "waiting_customer",
  );
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await screen.findByText("Server confirmed the change.");
  await waitFor(() =>
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe(
      "waiting_customer",
    ),
  );
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: "Your ticket is available." },
  });
  await userEvent.click(screen.getByRole("button", { name: "Send message" }));
  await screen.findByText("Your ticket is available.");
  await userEvent.selectOptions(screen.getByLabelText("Status"), "resolved");
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe(
      "resolved",
    ),
  );
  expect(await buyer.request(casePath(c.id))).toMatchObject({
    status: "resolved",
    assignee_id: owner.getSnapshot().user!.id,
  });
  expect(screen.getByText("Where is my ticket?")).toBeDefined();
});
it("lets a requester reply to a resolved case, reopens it and never exposes handler controls", async () => {
  const buyer = await actor("attendee@example.com"),
    owner = await actor();
  const c = await create(buyer);
  await owner.request(casePath(c.id), {
    method: "PATCH",
    body: { status: "resolved", assignee_id: owner.getSnapshot().user!.id },
  });
  app(buyer, `/support/cases/${c.id}`);
  await screen.findByText("Where is my ticket?");
  await screen.findByText(/You can reply to this case/);
  expect(screen.queryByLabelText("Choose responder")).toBeNull();
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: "I still need help" },
  });
  await userEvent.click(screen.getByRole("button", { name: "Send message" }));
  await screen.findByText("I still need help");
  expect(await buyer.request(casePath(c.id))).toMatchObject({
    status: "in_progress",
  });
});
it("routes an organizer's platform case to admins and prevents another organizer handling it", async () => {
  const organizer = await actor(),
    admin = await actor("admin@example.com");
  const c = await create(organizer, {
    event_id: null,
    category: "payment",
    subject: "Activation question",
  });
  expect(c.audience).toBe("organizer_case");
  app(admin, `/support/cases/${c.id}`);
  await screen.findByText("Where is my ticket?");
  await screen.findByLabelText("Choose responder");
  await expect(
    organizer.request(casePath(c.id), {
      method: "PATCH",
      body: { status: "resolved" },
    }),
  ).rejects.toMatchObject({ status: 403 });
});
it("denies unrelated users' case, thread and update endpoints without leaking content", async () => {
  const organizer = await actor(),
    buyer = await actor("attendee@example.com");
  const c = await create(organizer, {
    event_id: null,
    subject: "Private platform issue",
  });
  for (const [path, method, body] of [
    [casePath(c.id), "GET", undefined],
    [`${casePath(c.id)}/messages`, "GET", undefined],
    [casePath(c.id), "PATCH", { status: "resolved" }],
  ] as const)
    await expect(buyer.request(path, { method, body })).rejects.toMatchObject({
      status: 404,
    });
  app(buyer, `/support/cases/${c.id}`);
  await screen.findByText(/unavailable to this account/);
  expect(screen.queryByText("Private platform issue")).toBeNull();
  expect(screen.queryByLabelText("Message")).toBeNull();
});
it("uses support/manager assignment relationships and rejects check-in-only staff", async () => {
  const owner = await actor(),
    buyer = await actor("attendee@example.com"),
    staff = await actor("support@example.com");
  await owner.request(`/api/v1/events/${demoEventId}/staff`, {
    method: "POST",
    body: { email: "support@example.com", role: "support" },
  });
  const c = await create(buyer);
  await expect(staff.request(casePath(c.id))).resolves.toMatchObject({
    id: c.id,
  });
  await owner.request(
    `/api/v1/events/${demoEventId}/staff/${staff.getSnapshot().user!.id}`,
    { method: "DELETE" },
  );
  await owner.request(`/api/v1/events/${demoEventId}/staff`, {
    method: "POST",
    body: { email: "support@example.com", role: "checkin" },
  });
  await expect(staff.request(casePath(c.id))).rejects.toMatchObject({
    status: 404,
  });
  await expect(
    owner.request(casePath(c.id), {
      method: "PATCH",
      body: { assignee_id: staff.getSnapshot().user!.id },
    }),
  ).rejects.toMatchObject({ code: "invalid_assignee" });
});
it("preserves drafts across SPA navigation and stores no message text in browser storage", async () => {
  const buyer = await actor("attendee@example.com");
  app(buyer, "/support/new");
  fireEvent.change(screen.getByLabelText("Subject"), {
    target: { value: "Draft subject" },
  });
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: "Private draft text" },
  });
  await userEvent.click(screen.getByRole("link", { name: "Inbox" }));
  await userEvent.click(screen.getByRole("link", { name: "New form" }));
  expect((screen.getByLabelText("Message") as HTMLTextAreaElement).value).toBe(
    "Private draft text",
  );
  expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain(
    "Private draft text",
  );
});
it("clears drafts when the signed-in identity changes", async () => {
  const buyer = await actor("attendee@example.com");
  app(buyer, "/support/new");
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: "Secret draft" },
  });
  await act(() => buyer.logout());
  cleanup();
  await buyer.login({
    email: "attendee@example.com",
    password: "BiletFlow123!",
  });
  app(buyer, "/support/new");
  expect((screen.getByLabelText("Message") as HTMLTextAreaElement).value).toBe(
    "",
  );
});
it("keeps an uncertain reply and prevents automatic resend until refreshed and explicitly checked", async () => {
  const buyer = await actor("attendee@example.com");
  const c = await create(buyer);
  let writes = 0;
  server.use(
    http.post("*/api/v1/support/cases/:id/messages", () => {
      writes++;
      return HttpResponse.error();
    }),
  );
  app(buyer, `/support/cases/${c.id}`);
  await screen.findByText("Where is my ticket?");
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: "Uncertain reply" },
  });
  await userEvent.click(screen.getByRole("button", { name: "Send message" }));
  await screen.findByText(/request outcome is unknown/);
  expect((screen.getByLabelText("Message") as HTMLTextAreaElement).value).toBe(
    "Uncertain reply",
  );
  expect(
    screen
      .getByRole("button", { name: "Send message" })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(writes).toBe(1);
  await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: /I checked existing records/ })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  expect(writes).toBe(1);
});
it("preserves failed case creation and never auto-replays the POST", async () => {
  const buyer = await actor("attendee@example.com");
  let writes = 0;
  server.use(
    http.post("*/api/v1/support/cases", () => {
      writes++;
      return HttpResponse.error();
    }),
  );
  app(buyer, "/support/new");
  fireEvent.change(screen.getByLabelText("Subject"), {
    target: { value: "Lost case" },
  });
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: "My message" },
  });
  await userEvent.click(screen.getByRole("button", { name: "Open case" }));
  await screen.findByText(/request outcome is unknown/);
  expect(writes).toBe(1);
  expect(
    screen.getByRole("button", { name: "Open case" }).hasAttribute("disabled"),
  ).toBe(true);
});
it("shows unread counts, marks a notification read and uses an existing contextual route", async () => {
  const buyer = await actor("attendee@example.com"),
    uid = buyer.getSnapshot().user!.id;
  const id = crypto.randomUUID();
  mockNotify(
    uid,
    "purchase_confirmation",
    { order_id: id },
    "Order ready",
    "Confirmed",
  );
  app(buyer, "/account/notifications");
  await screen.findByRole("heading", { name: "Order ready" });
  expect(
    screen
      .getByRole("link", { name: "Open related page" })
      .getAttribute("href"),
  ).toBe(`/account/orders/${id}`);
  await userEvent.click(screen.getByRole("button", { name: "Mark as read" }));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Mark as read" })).toBeNull(),
  );
  expect(
    (
      await buyer.request<{ total: number }>(
        "/api/v1/me/notifications?unread_only=true",
      )
    ).total,
  ).toBe(0);
});
it("notifies requester/responder on reply, status and assignment with case context", async () => {
  const buyer = await actor("attendee@example.com"),
    owner = await actor(),
    admin = await actor("admin@example.com");
  const c = await create(buyer);
  await owner.request(casePath(c.id), {
    method: "PATCH",
    body: {
      assignee_id: admin.getSnapshot().user!.id,
      status: "waiting_customer",
    },
  });
  await owner.request(`${casePath(c.id)}/messages`, {
    method: "POST",
    body: { body: "A reply" },
  });
  const notes = await buyer.request<{ items: Notice[] }>(
    "/api/v1/me/notifications",
  );
  expect(notes.items.map((n) => n.type)).toEqual(
    expect.arrayContaining(["support_message", "support_status"]),
  );
  expect(notes.items.every((n) => n.payload.case_id === c.id)).toBe(true);
  const assigned = await admin.request<{ items: Notice[] }>(
    "/api/v1/me/notifications",
  );
  expect(assigned.items.some((n) => n.type === "support_assigned")).toBe(true);
});
it("does not reveal another account's notifications or mark them read", async () => {
  const buyer = await actor("attendee@example.com"),
    owner = await actor();
  const n = mockNotify(
    owner.getSnapshot().user!.id,
    "payout_status",
    {},
    "Private payout",
  );
  await expect(
    buyer.request(`/api/v1/me/notifications/${n.id}/read`, { method: "POST" }),
  ).rejects.toMatchObject({ status: 404 });
  app(buyer, "/account/notifications");
  await screen.findByText("No records found.");
  expect(screen.queryByText("Private payout")).toBeNull();
});
it("recovers expired access through the existing session refresh", async () => {
  const buyer = await actor("attendee@example.com");
  mockNotify(
    buyer.getSnapshot().user!.id,
    "account_verification",
    {},
    "Email confirmed",
  );
  expireMockAccessTokens();
  app(buyer, "/account/notifications");
  await screen.findByRole("heading", { name: "Email confirmed" });
});
it("hides an already rendered private thread when a subsequent read is denied", async () => {
  const buyer = await actor("attendee@example.com");
  const c = await create(buyer, { subject: "Private title" });
  app(buyer, `/support/cases/${c.id}`);
  await screen.findByText("Where is my ticket?");
  server.use(
    http.get("*/api/v1/support/cases/:id/messages", () =>
      HttpResponse.json({ code: "support_case_not_found" }, { status: 404 }),
    ),
  );
  await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByText(/unavailable to this account/);
  expect(screen.queryByText("Where is my ticket?")).toBeNull();
  expect(screen.queryByText("Private title")).toBeNull();
  expect(screen.queryByLabelText("Message")).toBeNull();
});
it("bounds read retries, backs off and does not retry authorization failures", () => {
  expect(retryRead(2, new Error())).toBe(false);
  expect(retryRead(0, new Error())).toBe(true);
  expect(retryRead(0, new ApiError(403, "forbidden", "Denied"))).toBe(false);
  expect(retryRead(0, new ApiError(401, "unauthorized", "Expired"))).toBe(
    false,
  );
  expect(readDelay(5)).toBe(15000);
});
it.each(["ru", "kk"] as const)(
  "renders localized support controls in %s",
  async (locale) => {
    const owner = await actor();
    app(owner, "/support/new", locale);
    expect(
      screen.getByRole("textbox", {
        name: locale === "ru" ? "Тема" : "Тақырып",
      }),
    ).toBeDefined();
    expect(
      screen.getByLabelText(locale === "ru" ? "Категория" : "Мәселе санаты"),
    ).toBeDefined();
  },
);
it("pauses notification reads while hidden and resumes when visible", async () => {
  const buyer = await actor("attendee@example.com");
  const state = vi
    .spyOn(document, "visibilityState", "get")
    .mockReturnValue("hidden");
  let reads = 0;
  server.events.on("request:start", ({ request }) => {
    if (request.url.includes("/me/notifications")) reads++;
  });
  const { client } = app(buyer, "/account/notifications");
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(reads).toBe(0);
  mockNotify(
    buyer.getSnapshot().user!.id,
    "account_verification",
    {},
    "Visible notification",
  );
  await act(async () => {
    state.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await screen.findByRole("heading", { name: "Visible notification" });
  await act(async () => {
    state.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const previous = reads;
  await act(async () => {
    await client.invalidateQueries({ queryKey: ["f9"] });
  });
  expect(reads).toBe(previous);
});
it("deduplicates polling and an overlapping POST response using message IDs", async () => {
  const buyer = await actor("attendee@example.com");
  const c = await create(buyer);
  const existing = await buyer.request<import("./model").Message[]>(
    `${casePath(c.id)}/messages`,
  );
  const duplicate = {
    ...existing[0]!,
    id: crypto.randomUUID(),
    body: "One accepted reply",
    created_at: "2026-11-18T12:00:00Z",
  };
  server.use(
    http.post("*/api/v1/support/cases/:id/messages", () =>
      HttpResponse.json(duplicate, { status: 201 }),
    ),
    http.get("*/api/v1/support/cases/:id/messages", ({ request }) =>
      HttpResponse.json(
        new URL(request.url).searchParams.has("after")
          ? []
          : [...existing, duplicate],
      ),
    ),
  );
  app(buyer, `/support/cases/${c.id}`);
  await screen.findByText("One accepted reply");
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: "One accepted reply" },
  });
  await userEvent.click(screen.getByRole("button", { name: "Send message" }));
  await screen.findByText("Server confirmed the change.");
  expect(screen.getAllByText("One accepted reply")).toHaveLength(1);
});
it("attaches ticket, derived order and event context and rejects mismatched records", async () => {
  const { buyer, order } = await seed();
  const ticket = order.tickets[0]!;
  const c = await create(buyer, { event_id: undefined, ticket_id: ticket.id });
  expect(c).toMatchObject({
    event_id: demoEventId,
    order_id: order.id,
    ticket_id: ticket.id,
  });
  await expect(
    create(buyer, { event_id: crypto.randomUUID(), ticket_id: ticket.id }),
  ).rejects.toMatchObject({ code: "support_context_mismatch" });
  const owner = await actor();
  await expect(
    create(owner, { event_id: undefined, ticket_id: ticket.id }),
  ).rejects.toMatchObject({ status: 404 });
});
it("retains a draft after a known validation failure and focuses its error", async () => {
  const buyer = await actor("attendee@example.com");
  app(buyer, "/support/new");
  await userEvent.click(screen.getByRole("button", { name: "Open case" }));
  await screen.findByText(/Enter a subject/);
  expect(screen.getByRole("alert").parentElement).toBe(document.activeElement);
  expect(
    screen.getByRole("button", { name: "Open case" }).hasAttribute("disabled"),
  ).toBe(false);
});
it("polls a newly posted responder reply without navigating or reloading", async () => {
  const buyer = await actor("attendee@example.com"),
    owner = await actor();
  const c = await create(buyer);
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  app(buyer, `/support/cases/${c.id}`);
  await screen.findByText("Where is my ticket?");
  await owner.request(`${casePath(c.id)}/messages`, {
    method: "POST",
    body: { body: "Live responder reply" },
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5100);
  });
  await screen.findByText("Live responder reply");
  vi.useRealTimers();
});
it("resumes notification reads on window focus after a terminal error", async () => {
  const buyer = await actor("attendee@example.com");
  let failing = true;
  server.use(
    http.get("*/api/v1/me/notifications", () =>
      failing
        ? HttpResponse.json({ code: "temporary_denied" }, { status: 403 })
        : HttpResponse.json({ items: [], total: 0, limit: 20, offset: 0 }),
    ),
  );
  app(buyer, "/account/notifications");
  await screen.findByText(/unavailable to this account/);
  failing = false;
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
  });
  await screen.findByText("No records found.");
});
it("keeps equal message bodies with different server IDs as separate messages", async () => {
  const buyer = await actor("attendee@example.com"),
    owner = await actor();
  const c = await create(buyer);
  for (let n = 0; n < 2; n++)
    await owner.request(`${casePath(c.id)}/messages`, {
      method: "POST",
      body: { body: "Same reply" },
    });
  app(buyer, `/support/cases/${c.id}`);
  expect(await screen.findAllByText("Same reply")).toHaveLength(2);
});
it("unassigns a case using explicit null and retains previous messages", async () => {
  const buyer = await actor("attendee@example.com"),
    owner = await actor();
  const c = await create(buyer);
  await owner.request(casePath(c.id), {
    method: "PATCH",
    body: { assignee_id: owner.getSnapshot().user!.id },
  });
  app(owner, `/support/cases/${c.id}`);
  await screen.findByText("Where is my ticket?");
  await userEvent.selectOptions(
    await screen.findByLabelText("Choose responder"),
    "",
  );
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(async () =>
    expect(await owner.request(casePath(c.id))).toMatchObject({
      assignee_id: null,
    }),
  );
  expect(screen.getByText("Where is my ticket?")).toBeDefined();
});

function LocationProbe() {
  return <p>{useLocation().pathname}</p>;
}
it.each([
  [
    "/orders/11111111-1111-4111-8111-111111111111",
    "/account/orders/11111111-1111-4111-8111-111111111111",
  ],
  ["/orders/invalid", "/account/orders"],
  ["/tickets", "/account/tickets"],
])(
  "resolves existing notification-email path %s",
  async (path, destination) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/orders/:orderId" element={<EmailOrderLink />} />
          <Route path="/tickets" element={<EmailTicketsLink />} />
          <Route path="/account/*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText(destination);
  },
);
