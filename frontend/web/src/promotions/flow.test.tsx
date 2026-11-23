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
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { SessionContext } from "../auth/session";
import { handlers } from "../mocks/handlers";
import { actor, reset, demoEventId } from "../operations/testFixtures";
import { mockCheckoutEvent, mockPaidSales } from "../mocks/events";
import { mockSettleOrder } from "../mocks/orders";
import { mockCampaignList } from "../mocks/promotions";
import type { Campaign, CampaignInput, Report } from "./model";
import type { Order, OrderBody } from "../checkout/model";
import Campaigns from "./Campaigns";
import { EventDetail } from "../events/Detail";
import { AuthPage } from "../auth/AuthPage";
import { checkoutLink } from "./model";
import CheckoutPage from "../checkout/CheckoutPage";
import { OrderDetail } from "../checkout/Orders";
const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
afterEach(() => {
  cleanup();
  server.resetHandlers();
  server.events.removeAllListeners();
  vi.restoreAllMocks();
});
beforeEach(() => {
  reset();
  localStorage.clear();
  URL.createObjectURL = vi.fn(() => "blob:campaign");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});
const root = `/api/v1/events/${demoEventId}`;
const input: CampaignInput = {
  name: "Student campaign",
  discount_type: "percent",
  discount_value: 25,
  valid_from: "2026-01-01T00:00:00Z",
  valid_to: "2028-01-01T00:00:00Z",
  max_redemptions: 10,
  ticket_type_ids: [],
};
async function setup(extra: Partial<CampaignInput> = {}) {
  const owner = await actor();
  const ticket = mockCheckoutEvent(demoEventId)!.tickets[0]!;
  await owner.request(`${root}/ticket-types/${ticket.id}`, {
    method: "PATCH",
    body: { price_amount: 100000, is_free: false },
  });
  mockPaidSales(demoEventId, "active");
  const campaign = await owner.request<Campaign>(`${root}/campaigns`, {
    method: "POST",
    body: { ...input, ...extra },
  });
  const buyer = await actor("attendee@example.com");
  const body: OrderBody = {
    event_id: demoEventId,
    items: [{ ticket_type_id: ticket.id, quantity: 1, seat_ids: [] }],
    attendees: [{ full_name: "Dias", email: "dias@example.com" }],
    hold_ids: [],
    promo_code: campaign.code,
  };
  return { owner, buyer, campaign, ticket, body };
}
function app(
  session: Awaited<ReturnType<typeof actor>>,
  path: string,
  locale: "en" | "ru" | "kk" = "en",
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SessionContext.Provider value={session}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path="/login"
              element={<AuthPage kind="login" locale={locale} />}
            />
            <Route
              path="/events/:eventId"
              element={<EventDetail locale={locale} />}
            />
            <Route
              path="/organizer/events/:eventId/promotions"
              element={<Campaigns locale={locale} />}
            />
            <Route
              path="/events/:eventId/checkout"
              element={<CheckoutPage locale={locale} />}
            />
            <Route
              path="/account/orders/:orderId"
              element={<OrderDetail locale={locale} />}
            />
          </Routes>
        </MemoryRouter>
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
}
async function select() {
  fireEvent.change(await screen.findByRole("spinbutton"), {
    target: { value: "1" },
  });
  await screen.findByText(/Discount preview:/);
}
it("creates percent campaigns, edits only mutable fields, disables them and loads reports", async () => {
  const owner = await actor();
  app(owner, `/organizer/events/${demoEventId}/promotions`);
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "Create campaign" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Create campaign" }),
  );
  for (const [label, value] of [
    ["Campaign name", "Launch"],
    ["Discount value · Percent", "25"],
    ["Valid from", "2026-01-01T10:00"],
    ["Valid until", "2028-01-01T10:00"],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  await userEvent.click(screen.getByRole("button", { name: "Save campaign" }));
  await screen.findByRole("heading", { name: "Launch" });
  expect(mockCampaignList()[0]!.valid_from).toBe("2026-01-01T05:00:00.000Z");
  await userEvent.click(screen.getByRole("button", { name: "Edit campaign" }));
  expect(screen.getByLabelText("Discount type").hasAttribute("disabled")).toBe(
    true,
  );
  fireEvent.change(screen.getByLabelText("Campaign name"), {
    target: { value: "Renamed" },
  });
  await userEvent.click(screen.getByRole("button", { name: "Save campaign" }));
  await screen.findByRole("heading", { name: "Renamed" });
  await userEvent.click(screen.getByRole("button", { name: "Disable" }));
  await screen.findByRole("button", { name: "Enable" });
  await userEvent.click(
    screen.getByRole("button", { name: "Campaign report" }),
  );
  await screen.findByText("Completed orders");
  expect(mockCampaignList()[0]!.is_enabled).toBe(false);
});
it("keeps uncertain campaign writes in memory and requires explicit refresh before another write", async () => {
  const { owner } = await setup();
  let writes = 0;
  server.use(
    http.patch("*/api/v1/campaigns/:id", () => {
      writes++;
      return HttpResponse.error();
    }),
  );
  app(owner, `/organizer/events/${demoEventId}/promotions`);
  await userEvent.click(await screen.findByRole("button", { name: "Disable" }));
  await screen.findByText(/save outcome is unknown/);
  expect(
    screen
      .getByRole("button", { name: "Create campaign" })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(writes).toBe(1);
});
it("downloads only the canonical authenticated campaign image and labels it separately from admission", async () => {
  const { owner } = await setup();
  let reads = 0;
  server.events.on("request:start", ({ request }) => {
    if (request.url.endsWith("/qr")) {
      reads++;
      expect(request.headers.get("Authorization")).toMatch(/^Bearer /);
    }
  });
  app(owner, `/organizer/events/${demoEventId}/promotions`);
  await userEvent.click(
    await screen.findByRole("button", { name: "Download Campaign QR" }),
  );
  await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
  expect(reads).toBe(1);
  expect(screen.getByText(/Cannot be used for entry/)).toBeDefined();
});
it("automatically validates a linked code, shows discounted tickets, and submits the promo to authoritative order totals", async () => {
  const { buyer, campaign } = await setup({ discount_value: 100 });
  app(buyer, `/events/${demoEventId}/checkout?promo=${campaign.code}`);
  await select();
  expect(
    screen.getByText(/Estimated ticket total after discount:/).textContent,
  ).toMatch(/0[.,]00/);
  await userEvent.click(
    screen.getByRole("button", { name: "Review registration" }),
  );
  await screen.findByRole("heading", { name: "Review registration" });
  await userEvent.click(
    screen.getByRole("button", { name: "Create order and continue" }),
  );
  await screen.findByRole("heading", { name: "Registration confirmed" });
  expect(mockCampaignList()[0]!.redemptions_count).toBe(1);
});
it("removes a rejected linked code and enables ordinary checkout", async () => {
  const { buyer } = await setup();
  app(buyer, `/events/${demoEventId}/checkout?promo=INVALID`);
  fireEvent.change(await screen.findByRole("spinbutton"), {
    target: { value: "1" },
  });
  await screen.findByText("This code does not exist for this event.");
  expect(
    screen
      .getByRole("button", { name: "Review registration" })
      .hasAttribute("disabled"),
  ).toBe(true);
  await userEvent.click(screen.getByRole("button", { name: "Remove code" }));
  expect(
    screen
      .getByRole("button", { name: "Review registration" })
      .hasAttribute("disabled"),
  ).toBe(false);
});
it("freezes the original code/body/key when an order response is lost, even if the code is subsequently disabled", async () => {
  const { buyer, campaign, owner } = await setup();
  const attempts: { key: string | null; body: unknown }[] = [];
  server.use(
    http.post("*/api/v1/orders", async ({ request }) => {
      attempts.push({
        key: request.headers.get("Idempotency-Key"),
        body: await request.json(),
      });
      return HttpResponse.error();
    }),
  );
  app(buyer, `/events/${demoEventId}/checkout?promo=${campaign.code}`);
  await select();
  await userEvent.click(
    screen.getByRole("button", { name: "Review registration" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Create order and continue" }),
  );
  await screen.findByText(/could not confirm the outcome/);
  await owner.request(`/api/v1/campaigns/${campaign.id}`, {
    method: "PATCH",
    body: { is_enabled: false },
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Retry the same registration" }),
  );
  await waitFor(() => expect(attempts).toHaveLength(2));
  expect(attempts[0]).toEqual(attempts[1]);
  expect((attempts[0]!.body as OrderBody).promo_code).toBe(campaign.code);
});
it("rejects a discount changed after review before posting an order", async () => {
  const { buyer, campaign } = await setup();
  let writes = 0;
  server.events.on("request:start", ({ request }) => {
    if (new URL(request.url).pathname === "/api/v1/orders") writes++;
  });
  app(buyer, `/events/${demoEventId}/checkout?promo=${campaign.code}`);
  await select();
  await userEvent.click(
    screen.getByRole("button", { name: "Review registration" }),
  );
  server.use(
    http.post("*/api/v1/promo/validate", () =>
      HttpResponse.json({ valid: true, discount_amount: 20000, reason: null }),
    ),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Create order and continue" }),
  );
  await screen.findByText(/Prices or discount changed/);
  expect(writes).toBe(0);
});
it.each([
  [{ valid_to: "2026-02-01T00:00:00Z" }, "promo_expired"],
  [{ valid_from: "2027-12-01T00:00:00Z" }, "promo_not_started"],
  [{ ticket_type_ids: ["different"] }, "promo_not_applicable"],
] as const)("handles campaign rejection %s", async (extra, reason) => {
  const { owner, buyer, campaign, ticket } = await setup();
  if (reason === "promo_not_applicable") {
    const types = await owner.request<{ id: string }>(`${root}/ticket-types`, {
      method: "POST",
      body: {
        name: "Other",
        price_amount: 50000,
        is_free: false,
        quantity_total: 10,
        max_per_order: 5,
        is_hidden: false,
      },
    });
    mockCampaignList()[0]!.ticket_type_ids = [types.id];
  } else
    await owner.request(`/api/v1/campaigns/${campaign.id}`, {
      method: "PATCH",
      body: extra,
    });
  expect(
    await buyer.request("/api/v1/promo/validate", {
      method: "POST",
      body: {
        event_id: demoEventId,
        code: campaign.code,
        ticket_type_ids: [ticket.id],
      },
    }),
  ).toEqual({ valid: false, discount_amount: 0, reason });
});
it("reserves the last redemption once, replays idempotently, attributes only completed orders", async () => {
  const { buyer, owner, campaign, body } = await setup({ max_redemptions: 1 });
  const key = crypto.randomUUID();
  const submit = (k: string) =>
    buyer.request<Order>("/api/v1/orders", {
      method: "POST",
      headers: { "Idempotency-Key": k },
      body,
    });
  const results = await Promise.allSettled([
    submit(key),
    submit(crypto.randomUUID()),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const order = (
    results.find(
      (r) => r.status === "fulfilled",
    ) as PromiseFulfilledResult<Order>
  ).value;
  expect(order.discount_amount).toBe(25000);
  expect(order.total).toBe(75000);
  if (results[0]!.status === "fulfilled")
    expect((await submit(key)).id).toBe(order.id);
  let report = await owner.request<Report>(
    `/api/v1/campaigns/${campaign.id}/report`,
  );
  expect(report).toMatchObject({ redemptions: 1, orders: 0, net_revenue: 0 });
  mockSettleOrder(order.id, true);
  report = await owner.request<Report>(
    `/api/v1/campaigns/${campaign.id}/report`,
  );
  expect(report).toMatchObject({
    orders: 1,
    tickets_sold: 1,
    gross_revenue: 100000,
    discount: 25000,
    net_revenue: 75000,
  });
});
it("releases a failed pending order's redemption for another purchase", async () => {
  const { buyer, campaign, body } = await setup({
    discount_type: "fixed",
    discount_value: 12345,
    max_redemptions: 1,
  });
  const submit = () =>
    buyer.request<Order>("/api/v1/orders", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body,
    });
  const order = await submit();
  mockSettleOrder(order.id, false);
  expect(mockCampaignList()[0]!.redemptions_count).toBe(0);
  expect((await submit()).discount_amount).toBe(12345);
  expect(campaign.code).toBeTruthy();
});
it("enforces organizer ownership and preserves resolver event/code", async () => {
  const { buyer, campaign } = await setup();
  await expect(buyer.request(`${root}/campaigns`)).rejects.toMatchObject({
    status: 403,
  });
  const response = await fetch("http://localhost:3000/c/demo-campaign-0", {
    redirect: "manual",
  });
  expect(response.status).toBe(302);
  expect(response.headers.get("Location")).toBe(
    `http://localhost:5173/events/${demoEventId}?promo=${campaign.code}`,
  );
});
it.each(["ru", "kk"] as const)(
  "renders campaign controls in %s",
  async (locale) => {
    const { owner } = await setup();
    app(owner, `/organizer/events/${demoEventId}/promotions`, locale);
    await screen.findByRole("heading", { name: "Student campaign" });
    // One page of campaigns: no pager is rendered.
    expect(screen.queryByRole("navigation")).toBeNull();
  },
);

it("keeps code and share context through real sign-in navigation", async () => {
  const { buyer, campaign } = await setup();
  await buyer.logout();
  const destination = checkoutLink(
    demoEventId,
    `?promo=${campaign.code}&share=demo-share`,
  );
  app(buyer, `/login?returnTo=${encodeURIComponent(destination)}`);
  fireEvent.change(await screen.findByLabelText("Email"), {
    target: { value: "attendee@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "BiletFlow123!" },
  });
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await select();
  expect(screen.getByText(/Applied code:/).textContent).toContain(
    campaign.code,
  );
});
it("carries the event page's promo context into its registration link", async () => {
  const { buyer, campaign } = await setup();
  app(buyer, `/events/${demoEventId}?promo=${campaign.code}&share=demo-share`);
  // The ticket panel and the phone CTA both carry the same context.
  const links = await screen.findAllByRole("link", { name: "Registration" });
  for (const link of links)
    expect(link.getAttribute("href")).toBe(
      `/events/${demoEventId}/checkout?promo=${campaign.code}&share=demo-share`,
    );
});
it("discards a stale validation when ticket quantity changes", async () => {
  const { buyer, campaign } = await setup();
  let release: () => void = () => {};
  let requests = 0;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.use(
    http.post("*/api/v1/promo/validate", async ({ request }) => {
      const body = (await request.json()) as { ticket_type_ids: string[] };
      requests++;
      if (body.ticket_type_ids.length === 1) await barrier;
      return HttpResponse.json({
        valid: true,
        discount_amount: body.ticket_type_ids.length === 1 ? 999 : 50000,
        reason: null,
      });
    }),
  );
  app(buyer, `/events/${demoEventId}/checkout?promo=${campaign.code}`);
  const quantity = await screen.findByRole("spinbutton");
  fireEvent.change(quantity, { target: { value: "1" } });
  await waitFor(() => expect(requests).toBe(1));
  fireEvent.change(quantity, { target: { value: "2" } });
  await screen.findByText(/Discount preview:/);
  release();
  await waitFor(() =>
    expect(screen.getByText(/Discount preview:/).textContent).toMatch(
      /500[.,]00/,
    ),
  );
  expect(
    screen.getByText(/Estimated ticket total after discount:/).textContent,
  ).toMatch(/1[, .\u00a0\u202f]?500[.,]00/);
});
it.each(["promo_disabled", "promo_exhausted"])(
  "shows a specific %s message when the server rejects a code",
  async (reason) => {
    const { buyer, campaign } = await setup();
    server.use(
      http.post("*/api/v1/promo/validate", () =>
        HttpResponse.json({ valid: false, discount_amount: 0, reason }),
      ),
    );
    app(buyer, `/events/${demoEventId}/checkout?promo=${campaign.code}`);
    fireEvent.change(await screen.findByRole("spinbutton"), {
      target: { value: "1" },
    });
    await screen.findByText(
      reason === "promo_disabled"
        ? "This promotion is disabled."
        : "This promotion has no redemptions left.",
    );
    expect(
      screen
        .getByRole("button", { name: "Review registration" })
        .hasAttribute("disabled"),
    ).toBe(true);
  },
);
it("rejects a malformed quote larger than the selected subtotal", async () => {
  const { buyer, campaign } = await setup();
  server.use(
    http.post("*/api/v1/promo/validate", () =>
      HttpResponse.json({ valid: true, discount_amount: 100001, reason: null }),
    ),
  );
  app(buyer, `/events/${demoEventId}/checkout?promo=${campaign.code}`);
  fireEvent.change(await screen.findByRole("spinbutton"), {
    target: { value: "1" },
  });
  await screen.findByText(/Could not validate the promotion/);
  expect(
    screen
      .getByRole("button", { name: "Review registration" })
      .hasAttribute("disabled"),
  ).toBe(true);
});
it("prevents the redemption maximum being lowered beneath reserved slots", async () => {
  const { buyer, owner, campaign, body } = await setup({ max_redemptions: 2 });
  for (let n = 0; n < 2; n++)
    await buyer.request("/api/v1/orders", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body,
    });
  await expect(
    owner.request(`/api/v1/campaigns/${campaign.id}`, {
      method: "PATCH",
      body: { max_redemptions: 1 },
    }),
  ).rejects.toMatchObject({ status: 409, code: "max_below_redemptions" });
});
it("applies fixed discount once per order and caps it to the eligible ticket subtotal", async () => {
  const { owner, buyer, campaign, ticket } = await setup({
    discount_type: "fixed",
    discount_value: 150000,
  });
  const other = await owner.request<{ id: string }>(`${root}/ticket-types`, {
    method: "POST",
    body: {
      name: "Other",
      price_amount: 500000,
      is_free: false,
      quantity_total: 10,
      max_per_order: 5,
      is_hidden: false,
    },
  });
  mockCampaignList()[0]!.ticket_type_ids = [ticket.id];
  const quote = (ids: string[]) =>
    buyer.request("/api/v1/promo/validate", {
      method: "POST",
      body: {
        event_id: demoEventId,
        code: campaign.code,
        ticket_type_ids: ids,
      },
    });
  expect(await quote([ticket.id, other.id])).toEqual({
    valid: true,
    discount_amount: 100000,
    reason: null,
  });
  expect(await quote([ticket.id, ticket.id, other.id])).toEqual({
    valid: true,
    discount_amount: 150000,
    reason: null,
  });
});
it("returns a cancelled free order's redemption and excludes it from attribution", async () => {
  const { owner, buyer, campaign, body } = await setup({
    discount_value: 100,
    max_redemptions: 1,
  });
  const order = await buyer.request<Order>("/api/v1/orders", {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body,
  });
  await owner.request(`/api/v1/orders/${order.id}/cancel`, {
    method: "POST",
    body: { reason: "Customer request" },
  });
  expect(
    await owner.request<Report>(`/api/v1/campaigns/${campaign.id}/report`),
  ).toMatchObject({
    redemptions: 0,
    orders: 0,
    tickets_sold: 0,
    net_revenue: 0,
  });
});
