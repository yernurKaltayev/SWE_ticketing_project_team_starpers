// @vitest-environment jsdom
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  it,
  expect,
  vi,
} from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
  cleanup,
} from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { SessionContext } from "../auth/session";
import { handlers } from "../mocks/handlers";
import { mockOperationsOrder } from "../mocks/orders";
import { actor, demoEventId, reset, seed } from "./testFixtures";
import Workspace from "./Workspace";
const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  reset();
  sessionStorage.clear();
  URL.createObjectURL = vi.fn(() => "blob:csv");
  URL.revokeObjectURL = vi.fn();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.restoreAllMocks();
});
async function mount(
  orderId?: string,
  query = "",
  locale: "en" | "kk" | "ru" = "en",
  email = "organizer@example.com",
) {
  const session = await actor(email);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <SessionContext.Provider value={session}>
        <MemoryRouter
          initialEntries={[
            `/organizer/events/${demoEventId}/orders${orderId ? "/" + orderId : ""}${query}`,
          ]}
        >
          <Routes>
            {[
              "/organizer/events/:eventId/orders",
              "/organizer/events/:eventId/orders/:orderId",
            ].map((path) => (
              <Route
                key={path}
                path={path}
                element={<Workspace locale={locale} />}
              />
            ))}
          </Routes>
        </MemoryRouter>
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
  return { view, client, session };
}
it("shows identity, zero amount and consequences, then cancels a free registration once", async () => {
  const { order, buyer } = await seed();
  await mount(order.id);
  const cancel = await screen.findByRole("button", {
    name: "Cancel registration",
  });
  fireEvent.click(cancel);
  const dialog = screen.getByRole("dialog");
  expect(
    within(dialog).getByText(/affected tickets become invalid/),
  ).toBeTruthy();
  expect(within(dialog).getByText(new RegExp(order.id))).toBeTruthy();
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Keep unchanged" }),
  );
  expect(mockOperationsOrder(order.id)!.value.status).toBe("free_confirmed");
  fireEvent.click(cancel);
  const confirm = within(screen.getByRole("dialog")).getByRole("button", {
    name: "Confirm action",
  });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  await screen.findByText(/Server confirmed the operation/);
  expect(mockOperationsOrder(order.id)!.value.tickets[0]?.status).toBe(
    "cancelled",
  );
  await expect(
    buyer.request(`/api/v1/tickets/${order.tickets[0]!.id}/qr`, {
      responseType: "blob",
    }),
  ).rejects.toThrow();
});
it("requires a reason and displays completed full refund with server amount", async () => {
  const { order } = await seed(true);
  await mount(order.id);
  fireEvent.click(await screen.findByRole("button", { name: "Full refund" }));
  let dialog = screen.getByRole("dialog");
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Confirm action" }),
  );
  expect(within(dialog).getByText(/Enter a reason/)).toBeTruthy();
  expect(mockOperationsOrder(order.id)!.value.status).toBe("paid");
  fireEvent.change(within(dialog).getByLabelText("Refund reason"), {
    target: { value: "Requested by attendee" },
  });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Confirm action" }),
  );
  await screen.findByText(/Server confirmed the operation/);
  expect(mockOperationsOrder(order.id)!.value.status).toBe("refunded");
  fireEvent.click(screen.getByRole("link", { name: "Refunds" }));
  await screen.findByText("Requested by attendee");
  expect(screen.getByText("Completed")).toBeTruthy();
});
it("keeps a refused refund visible/retryable without changing ticket validity", async () => {
  const { order } = await seed(true);
  server.use(
    http.post("*/api/v1/orders/:id/refund", () =>
      HttpResponse.json(
        { code: "refund_failed", message: "Refused" },
        { status: 409 },
      ),
    ),
  );
  await mount(order.id);
  fireEvent.click(await screen.findByRole("button", { name: "Full refund" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Refund reason"), {
    target: { value: "Refund" },
  });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Confirm action" }),
  );
  await waitFor(() => expect(within(dialog).getByRole("alert")).toBeTruthy());
  expect(mockOperationsOrder(order.id)!.value.status).toBe("paid");
  expect(mockOperationsOrder(order.id)!.value.tickets[0]?.status).toBe("valid");
  expect(
    (
      within(dialog).getByRole("button", {
        name: "Confirm action",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
});
it("reconciles a lost completed response after reload without posting a second refund", async () => {
  const { order } = await seed(true);
  let writes = 0;
  server.use(
    http.post("*/api/v1/orders/:id/refund", () => {
      writes++;
      const row = mockOperationsOrder(order.id)!.value;
      row.status = "refunded";
      row.tickets.forEach((t) => {
        t.status = "refunded";
      });
      return HttpResponse.error();
    }),
  );
  const first = await mount(order.id);
  fireEvent.click(await screen.findByRole("button", { name: "Full refund" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Refund reason"), {
    target: { value: "Reason stays in memory" },
  });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Confirm action" }),
  );
  await waitFor(() => expect(writes).toBe(1));
  await waitFor(() =>
    expect(
      within(dialog)
        .getByRole("button", { name: "Keep unchanged" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  first.view.unmount();
  await mount(order.id);
  fireEvent.click(await screen.findByRole("button", { name: "Check outcome" }));
  await screen.findByText(/Server confirmed the operation/);
  expect(writes).toBe(1);
  expect(sessionStorage.length).toBe(0);
});
it("keeps pending and failed refund statuses distinct from completion", async () => {
  const { order } = await seed(true);
  server.use(
    http.get("*/api/v1/events/:id/refunds", () =>
      HttpResponse.json({
        items: [
          {
            id: "r",
            order_id: order.id,
            amount: 150000,
            currency: "KZT",
            reason: "Waiting",
            status: "pending",
            completed_at: null,
          },
          {
            id: "r2",
            order_id: order.id,
            amount: 150000,
            currency: "KZT",
            reason: "Refused",
            status: "failed",
            completed_at: null,
          },
        ],
        total: 2,
        limit: 20,
        offset: 0,
      }),
    ),
  );
  await mount(undefined, "?view=refunds");
  await screen.findByText("Waiting");
  expect(screen.getByText("Pending")).toBeTruthy();
  expect(screen.getByText("Failed")).toBeTruthy();
  expect(screen.queryByText("Completed")).toBeNull();
});
it("shows event-wide impact before cancellation and preserves records afterward", async () => {
  await seed();
  await seed(true);
  await mount();
  fireEvent.click(await screen.findByRole("button", { name: "Cancel event" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText("Free registrations")).toBeTruthy();
  expect(within(dialog).getByText("Paid orders")).toBeTruthy();
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Confirm action" }),
  );
  await screen.findByText(/Event cancelled. Historical records/);
  expect(screen.queryByRole("button", { name: "Cancel event" })).toBeNull();
  expect(screen.getAllByRole("link", { name: /MOCK-/ })).toHaveLength(2);
});
it("filters attendees using server query parameters and exports those same filters", async () => {
  await seed();
  const exportSpy = vi.fn();
  HTMLAnchorElement.prototype.click = exportSpy;
  await mount(undefined, "?view=attendees");
  await screen.findByText("dias@example.com");
  const status = screen.getByRole("combobox", { name: "Status" });
  expect((status as HTMLSelectElement).labels?.[0]?.textContent).toBe("Status");
  const ticketType = screen.getByRole("combobox", { name: "Ticket type" });
  expect((ticketType as HTMLSelectElement).labels?.[0]?.textContent).toBe(
    "Ticket type",
  );
  fireEvent.change(status, { target: { value: "valid" } });
  fireEvent.change(screen.getByLabelText("Search"), {
    target: { value: "Диас" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
  await screen.findByText("dias@example.com");
  let url = "";
  server.use(
    http.get("*/api/v1/events/:id/attendees.csv", ({ request }) => {
      url = request.url;
      return new HttpResponse("name\r\nДиас", {
        headers: { "Content-Type": "text/csv" },
      });
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
  await waitFor(() => expect(exportSpy).toHaveBeenCalledOnce());
  expect(new URL(url).searchParams.get("q")).toBe("Диас");
  expect(new URL(url).searchParams.get("status")).toBe("valid");
  expect(new URL(url).searchParams.has("offset")).toBe(false);
});
it("hides private records when the event orders read is denied", async () => {
  await seed();
  server.use(
    http.get("*/api/v1/events/:id/orders", () =>
      HttpResponse.json(
        { code: "forbidden", message: "Forbidden" },
        { status: 403 },
      ),
    ),
  );
  await mount();
  await screen.findByText("You do not have access to these event records.");
  expect(screen.queryByText("dias@example.com")).toBeNull();
  expect(screen.queryByRole("button", { name: "Cancel event" })).toBeNull();
});
it("blocks writes when recovery storage is unavailable", async () => {
  const { order } = await seed(true);
  const write = vi.fn();
  server.use(
    http.post("*/api/v1/orders/:id/refund", () => {
      write();
      return HttpResponse.json({});
    }),
  );
  await mount(order.id);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  fireEvent.click(await screen.findByRole("button", { name: "Full refund" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Refund reason"), {
    target: { value: "Requested" },
  });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Confirm action" }),
  );
  await within(dialog).findByText(
    "Recovery storage is unavailable. No new action can be submitted.",
  );
  expect(write).not.toHaveBeenCalled();
});
it("keeps a truly unresolved request blocked after checking the outcome", async () => {
  const { order } = await seed(true);
  let writes = 0;
  server.use(
    http.post("*/api/v1/orders/:id/refund", () => {
      writes++;
      return HttpResponse.error();
    }),
  );
  await mount(order.id);
  fireEvent.click(await screen.findByRole("button", { name: "Full refund" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Refund reason"), {
    target: { value: "Requested" },
  });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Confirm action" }),
  );
  await waitFor(() =>
    expect(
      (
        within(dialog).getByRole("button", {
          name: "Keep unchanged",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Keep unchanged" }),
  );
  fireEvent.click(await screen.findByRole("button", { name: "Check outcome" }));
  await screen.findByText(/server has not confirmed a final outcome/);
  expect(
    (screen.getByRole("button", { name: "Full refund" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(writes).toBe(1);
});
it("does not report a pending refund response as completed", async () => {
  const { order } = await seed(true);
  server.use(
    http.post("*/api/v1/orders/:id/refund", () =>
      HttpResponse.json(
        {
          id: "pending-r",
          order_id: order.id,
          amount: order.total,
          currency: "KZT",
          reason: "Pending",
          status: "pending",
          completed_at: null,
        },
        { status: 201 },
      ),
    ),
  );
  await mount(order.id);
  fireEvent.click(await screen.findByRole("button", { name: "Full refund" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Refund reason"), {
    target: { value: "Requested" },
  });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Confirm action" }),
  );
  await screen.findByText(/refund is pending. It is not complete/);
  expect(screen.queryByText(/Server confirmed the operation/)).toBeNull();
  expect(mockOperationsOrder(order.id)!.value.status).toBe("paid");
  expect(
    JSON.parse(
      sessionStorage.getItem(
        `biletflow:f6:${(await actor()).getSnapshot().user!.id}:${demoEventId}`,
      )!,
    ).refundId,
  ).toBe("pending-r");
});
it("invalidates stale attendee ticket, QR and finance caches after mutation", async () => {
  const { order } = await seed();
  const { client, session } = await mount(order.id);
  await screen.findByRole("button", { name: "Cancel registration" });
  const key = ["f3-qr", session.getSnapshot().user!.id, "ticket", "valid"];
  client.setQueryData(key, new Blob(["old QR"], { type: "image/png" }));
  client.setQueryData(["f4", "finances"], { old: true });
  fireEvent.click(screen.getByRole("button", { name: "Cancel registration" }));
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Confirm action",
    }),
  );
  await screen.findByText(/Server confirmed the operation/);
  await waitFor(() => expect(client.getQueryData(key)).toBeUndefined());
  expect(client.getQueryData(["f4", "finances"])).toBeUndefined();
});
it("keeps private order details hidden outside the selected event's membership", async () => {
  await seed();
  await mount("foreign-order");
  await screen.findByRole("table", { name: "Orders" });
  expect(
    screen.getByText("You do not have access to these event records."),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Full refund" })).toBeNull();
});
it("exports the complete filtered order snapshot rather than the visible page", async () => {
  const { order } = await seed();
  const rows = Array.from({ length: 25 }, (_, i) => ({
    ...order,
    id: `order-${i}`,
    order_number: `ORDER-${i}`,
  }));
  server.use(
    http.get("*/api/v1/events/:id/orders", () =>
      HttpResponse.json({ items: rows, total: 25, limit: 100, offset: 0 }),
    ),
  );
  let csv: Blob | undefined;
  URL.createObjectURL = vi.fn((blob: Blob) => {
    csv = blob;
    return "blob:csv";
  });
  HTMLAnchorElement.prototype.click = vi.fn();
  await mount();
  await screen.findByRole("link", { name: "ORDER-0" });
  expect(screen.queryByRole("link", { name: "ORDER-24" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
  await waitFor(() => expect(csv).toBeTruthy());
  const text = await csv!.text();
  expect(text).toContain("ORDER-24");
  expect(text.split("\r\n")).toHaveLength(26);
});
it("does not reuse private cached records after a permission failure", async () => {
  await seed();
  await mount();
  await screen.findByRole("link", { name: "MOCK-1" });
  server.use(
    http.get("*/api/v1/events/:id/orders", () =>
      HttpResponse.json(
        { code: "forbidden", message: "Forbidden" },
        { status: 403 },
      ),
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Refresh records" }));
  await screen.findByText("You do not have access to these event records.");
  expect(screen.queryByRole("link", { name: "MOCK-1" })).toBeNull();
});
it("rejects another organizer's actual list and refund requests", async () => {
  const { order } = await seed(true);
  const register = await fetch("http://localhost:3000/api/v1/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "other-organizer@example.com",
      password: "BiletFlow123!",
      full_name: "Other organizer",
      role: "organizer",
    }),
  });
  expect(register.status).toBe(201);
  await fetch("http://localhost:3000/api/v1/auth/verify-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: `mock-verify-${encodeURIComponent("other-organizer@example.com")}`,
    }),
  });
  const other = await actor("other-organizer@example.com");
  await expect(
    other.request(`/api/v1/events/${demoEventId}/orders`),
  ).rejects.toThrow();
  await expect(
    other.request(`/api/v1/orders/${order.id}/refund`, {
      method: "POST",
      body: { reason: "Forbidden" },
    }),
  ).rejects.toThrow();
  expect(mockOperationsOrder(order.id)!.value.status).toBe("paid");
});
it.each(["kk", "ru"] as const)(
  "renders organizer records and cancellation controls in %s",
  async (locale) => {
    await seed();
    await mount(undefined, "", locale);
    await screen.findByRole("link", { name: "MOCK-1" });
    expect(
      screen.getByRole("heading", {
        name:
          locale === "kk"
            ? "Тапсырыстар мен қатысушылар"
            : "Заказы и участники",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: locale === "kk" ? "Іс-шараны болдырмау" : "Отменить событие",
      }),
    ).toBeTruthy();
  },
);
