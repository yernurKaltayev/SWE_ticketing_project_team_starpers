// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
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
import { createSession, createMemoryTokenStore } from "@biletflow/shared";
import { SessionContext } from "../auth/session";
import { handlers } from "../mocks/handlers";
import { resetAuthMocks } from "../mocks/auth";
import { demoEventId, resetEventMocks, mockPaidSales } from "../mocks/events";
import { resetOrderMocks } from "../mocks/orders";
import { resetPaymentMocks } from "../mocks/payments";
import { OrderDetail } from "../checkout/Orders";
import CheckoutPage from "../checkout/CheckoutPage";
import ActivationPage, {
  AccountsPage,
  FinancialsPage,
  PayoutsPage,
} from "./Organizer";
import type { Payment } from "./model";
const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
beforeEach(() => {
  resetAuthMocks();
  resetEventMocks();
  resetOrderMocks();
  resetPaymentMocks();
  localStorage.clear();
});
async function mount(
  path: string,
  email = "organizer@example.com",
  locale: "en" | "ru" | "kk" = "en",
) {
  const session = createSession({
    baseUrl: "http://localhost:3000",
    tokenStore: createMemoryTokenStore(),
  });
  await session.login({ email, password: "BiletFlow123!" });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <SessionContext.Provider value={session}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path="/organizer/payout-accounts"
              element={<AccountsPage locale={locale} />}
            />
            <Route
              path="/organizer/payouts"
              element={<PayoutsPage locale={locale} />}
            />
            <Route
              path="/organizer/events/:eventId/activation"
              element={<ActivationPage locale={locale} />}
            />
            <Route
              path="/organizer/events/:eventId/financials"
              element={<FinancialsPage locale={locale} />}
            />
            <Route
              path="/account/orders/:orderId"
              element={<OrderDetail locale={locale} />}
            />
            <Route
              path="/events/:eventId/checkout"
              element={<CheckoutPage locale={locale} />}
            />
          </Routes>
        </MemoryRouter>
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
  return { session, client, view };
}
const order = () => ({
  id: "paid-order",
  order_number: "PAID-1",
  status: "pending",
  subtotal: 250000,
  discount_amount: 0,
  processing_fee: 0,
  total: 250000,
  currency: "KZT",
  is_simulated: true,
  items: [],
  tickets: [],
});
function paymentFixture(loseResponse = false) {
  const value = order();
  const payment: Payment = {
    id: "payment-1",
    kind: "ticket",
    status: "pending",
    amount: 250000,
    fee_amount: 7500,
    currency: "KZT",
    is_simulated: true,
    checkout_url: "https://untrusted.example/checkout",
    failure_reason: null,
  };
  let starts = 0;
  server.use(
    http.get("*/api/v1/orders/paid-order", () => HttpResponse.json(value)),
    http.post("*/api/v1/orders/paid-order/payments", () => {
      starts++;
      return HttpResponse.json(payment, { status: 201 });
    }),
    http.get("*/api/v1/payments/payment-1", () => HttpResponse.json(payment)),
    http.post("*/api/v1/payments/payment-1/simulate", async ({ request }) => {
      const body = (await request.json()) as { outcome: string };
      payment.status = body.outcome;
      payment.checkout_url = null;
      value.status = body.outcome === "succeeded" ? "paid" : "failed";
      return loseResponse ? HttpResponse.error() : HttpResponse.json(payment);
    }),
  );
  return { value, payment, starts: () => starts };
}
it("pays only after an explicit sandbox outcome and recovers a lost response from the backend", async () => {
  const fixture = paymentFixture(true);
  await mount("/account/orders/paid-order", "attendee@example.com");
  expect(
    await screen.findByRole("button", {
      name: "Continue to simulated payment",
    }),
  ).toBeDefined();
  expect(fixture.starts()).toBe(0);
  await userEvent.click(
    screen.getByRole("button", { name: "Continue to simulated payment" }),
  );
  await screen.findByRole("button", { name: "Simulate success" });
  expect(fixture.value.status).toBe("pending");
  expect(screen.queryByRole("link", { name: /checkout/i })).toBeNull();
  await userEvent.click(
    screen.getByRole("button", { name: "Simulate success" }),
  );
  await waitFor(() => expect(fixture.value.status).toBe("paid"));
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Simulate success" }),
    ).toBeNull(),
  );
  expect(fixture.starts()).toBe(1);
  expect(localStorage.length).toBe(1);
  expect(localStorage.getItem(localStorage.key(0)!)).toBe("payment-1");
});
it("restores a pending payment after remount without creating a second intent, and handles failure", async () => {
  const fixture = paymentFixture();
  const first = await mount(
    "/account/orders/paid-order",
    "attendee@example.com",
  );
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Continue to simulated payment",
    }),
  );
  await screen.findByRole("button", { name: "Simulate failure" });
  first.view.unmount();
  await mount("/account/orders/paid-order", "attendee@example.com");
  await screen.findByRole("button", { name: "Simulate failure" });
  expect(fixture.starts()).toBe(1);
  await userEvent.click(
    screen.getByRole("button", { name: "Simulate failure" }),
  );
  await waitFor(() => expect(fixture.value.status).toBe("failed"));
  expect(fixture.value.tickets).toHaveLength(0);
});
it("creates a masked payout account, rejects a bad checksum and blocks linked-account removal", async () => {
  const { session } = await mount("/organizer/payout-accounts");
  await screen.findByText(/No payout accounts yet/);
  fireEvent.change(screen.getByLabelText("Bank name"), {
    target: { value: "Demo Bank" },
  });
  fireEvent.change(screen.getByLabelText("Account holder"), {
    target: { value: "Demo Organizer" },
  });
  fireEvent.change(screen.getByLabelText("IBAN"), {
    target: { value: "KZ00125KZT5004100100" },
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Add payout account" }),
  );
  expect(await screen.findByRole("alert")).toBeDefined();
  fireEvent.change(screen.getByLabelText("IBAN"), {
    target: { value: "KZ86125KZT5004100100" },
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Add payout account" }),
  );
  await screen.findByText("Demo Bank · •••• 0100");
  expect((screen.getByLabelText("IBAN") as HTMLInputElement).value).toBe("");
  const list = await session.request<{ id: string }[]>(
    "/api/v1/organizers/me/payout-accounts",
  );
  await session.request(`/api/v1/events/${demoEventId}/activation`, {
    method: "PATCH",
    body: { payout_account_id: list[0]!.id },
  });
  await userEvent.click(screen.getByRole("button", { name: "Remove account" }));
  await userEvent.click(
    screen.getByRole("button", { name: "Confirm removal" }),
  );
  await screen.findByText(/This account is linked/);
  expect(screen.getByText("Demo Bank · •••• 0100")).toBeDefined();
});
it("completes the activation steps and enables only the selected event", async () => {
  const { session } = await mount(
    `/organizer/events/${demoEventId}/activation`,
  );
  const account = await session.request<{ id: string }>(
    "/api/v1/organizers/me/payout-accounts",
    {
      method: "POST",
      body: {
        bank_name: "Demo Bank",
        holder_name: "Demo",
        iban: "KZ86125KZT5004100100",
      },
    },
  );
  await session.request(`/api/v1/events/${demoEventId}/ticket-types`, {
    method: "POST",
    body: {
      name: "Paid",
      price_amount: 250000,
      quantity_total: 10,
      max_per_order: 2,
      is_hidden: false,
    },
  });
  await userEvent.click(
    await screen.findByRole("button", { name: "Refresh status" }),
  );
  await screen.findByRole("option", { name: /Demo Bank/ });
  await userEvent.click(
    screen.getByRole("button", { name: "Run simulated verification" }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Run simulated verification" }),
    ).toBeNull(),
  );
  await userEvent.selectOptions(screen.getByRole("combobox"), account.id);
  await userEvent.click(
    screen.getByRole("button", { name: "Use this account" }),
  );
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(screen.getByRole("button", { name: "Accept terms" }));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Accept terms" })).toBeNull(),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Review activation fee" }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Simulate failure" }),
  );
  await screen.findByRole("button", {
    name: "Start another simulated payment",
  });
  expect(screen.queryByText("Paid sales are active")).toBeNull();
  await userEvent.click(
    screen.getByRole("button", { name: "Start another simulated payment" }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Simulate success" }),
  );
  await screen.findByText("Paid sales are active");
  const result = await session.request<{ event_id: string; status: string }>(
    `/api/v1/events/${demoEventId}/activation`,
  );
  expect(result).toMatchObject({ event_id: demoEventId, status: "active" });
});
it("keeps a suspended activation blocked while showing the server's checklist", async () => {
  server.use(
    http.get("*/api/v1/events/:id/activation", () =>
      HttpResponse.json({
        event_id: demoEventId,
        status: "suspended",
        identity_verified: false,
        payout_account_id: null,
        activation_fee_paid: false,
        terms_accepted_at: null,
        missing_steps: [
          "identity_verification",
          "activation_fee",
          "terms",
          "payout_account",
        ],
        is_simulated: true,
      }),
    ),
  );
  await mount(`/organizer/events/${demoEventId}/activation`);
  await screen.findByText(/Paid sales are suspended/);
  expect(
    (
      screen.getByRole("button", {
        name: "Run simulated verification",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(
    screen.queryByRole("button", { name: "Review activation fee" }),
  ).toBeNull();
});
it("blocks unavailable paid selections and preserves free registration", async () => {
  const mounted = await mount(
    `/events/${demoEventId}/checkout`,
    "attendee@example.com",
  );
  // Existing free fixture remains usable; paid selection is covered below with an explicit contract fixture.
  expect(await screen.findByRole("spinbutton")).toBeDefined();
  mounted.view.unmount();
  server.use(
    http.get("*/api/v1/events/:id/availability", () =>
      HttpResponse.json({
        registration_open: true,
        ticket_types: [
          {
            id: "paid-type",
            name: "Paid admission",
            is_free: false,
            price_amount: "250000.00",
            currency: "KZT",
            quantity_available: 5,
            max_per_order: 2,
            sales_open: true,
          },
        ],
      }),
    ),
  );
  await mount(`/events/${demoEventId}/checkout`, "attendee@example.com");
  expect(
    ((await screen.findByRole("spinbutton")) as HTMLInputElement).disabled,
  ).toBe(true);
  await screen.findByText(/Paid tickets are unavailable/);
});
it("registers an active paid ticket, shows the authoritative order, then issues tickets after payment", async () => {
  const setup = await mount(`/organizer/events/${demoEventId}/activation`);
  await setup.session.request(`/api/v1/events/${demoEventId}/ticket-types`, {
    method: "POST",
    body: {
      name: "Paid admission",
      price_amount: 250000,
      quantity_total: 10,
      max_per_order: 2,
      is_hidden: false,
    },
  });
  mockPaidSales(demoEventId, "active");
  setup.view.unmount();
  await mount(`/events/${demoEventId}/checkout`, "attendee@example.com");
  const quantity = await screen.findByRole("spinbutton", {
    name: "Quantity · Paid admission",
  });
  expect((quantity as HTMLInputElement).disabled).toBe(false);
  fireEvent.change(quantity, { target: { value: "1" } });
  await userEvent.click(
    screen.getByRole("button", { name: "Review registration" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Create order and continue" }),
  );
  await userEvent.click(
    await screen.findByRole("button", {
      name: "Continue to simulated payment",
    }),
  );
  expect(screen.queryByRole("link", { name: /MOCK-TICKET/ })).toBeNull();
  await userEvent.click(
    await screen.findByRole("button", { name: "Simulate success" }),
  );
  await screen.findByRole("link", { name: /MOCK-TICKET/ });
  expect(screen.getByText("Paid", { exact: true })).toBeDefined();
});
it("renders payout and financial empty states and localized simulation notices", async () => {
  const first = await mount(
    "/organizer/payouts",
    "organizer@example.com",
    "ru",
  );
  await screen.findByText(/Выплат пока нет/);
  first.view.unmount();
  const second = await mount(`/organizer/events/${demoEventId}/financials`);
  await screen.findByText("Estimated payout");
  expect(screen.getAllByText(/0\.00/).length).toBe(4);
  second.view.unmount();
  await mount("/organizer/payouts", "organizer@example.com", "kk");
  await screen.findByText(/Әзірге төлем жоқ/);
});
it("shows scheduled and paid payout records and retrieves the next page", async () => {
  const offsets: number[] = [];
  server.use(
    http.get("*/api/v1/organizers/me/payouts", ({ request }) => {
      const offset = Number(new URL(request.url).searchParams.get("offset"));
      offsets.push(offset);
      return HttpResponse.json({
        items: [
          {
            id: `payout-${offset}`,
            event_id: "event-fixture",
            gross: 250000,
            fees: 7500,
            refunds: 0,
            net: 242500,
            currency: "KZT",
            status: offset ? "paid" : "scheduled",
            scheduled_for: "2026-12-01T00:00:00Z",
            paid_at: offset ? "2026-12-01T01:00:00Z" : null,
          },
        ],
        limit: 20,
        offset,
        total: 21,
      });
    }),
  );
  await mount("/organizer/payouts");
  await screen.findByRole("cell", { name: "Scheduled" });
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByRole("cell", { name: "Paid" });
  expect(offsets).toEqual([0, 20]);
  expect(
    (screen.getByRole("button", { name: "Next" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});
