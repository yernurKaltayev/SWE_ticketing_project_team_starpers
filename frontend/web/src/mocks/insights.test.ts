import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { handlers } from "./handlers";
import { actor, reset, seed, demoEventId } from "../operations/testFixtures";
import { mockCheckoutEvent, mockPaidSales } from "./events";
import { mockOperationsOrder } from "./orders";
import { resetPaymentMocks } from "./payments";
import { resetStaffMocks } from "./staff";
import { resetSupportMocks } from "./support";
import { mockAllRefunds } from "./operations";
import { mockAudit, resetInsightMocks } from "./insights";
import { adminPath, parseAdminPage, parseAnalytics, parseDisputes, parseHistory, parseSettings, sections } from "../insights/model";
import type { Row } from "../insights/model";
import type { Campaign } from "../promotions/model";
import type { Order } from "../checkout/model";
const server = setupServer(...handlers);
beforeAll(() => server.listen({
  onUnhandledRequest: "error"
}));
afterAll(() => server.close());
beforeEach(() => {
  reset();
  resetPaymentMocks();
  resetStaffMocks();
  resetSupportMocks();
  resetInsightMocks();
});
afterEach(() => server.resetHandlers());
const root = `/api/v1/events/${demoEventId}`;
async function purchase(promo?: string) {
  const buyer = await actor("attendee@example.com"),
    type = mockCheckoutEvent(demoEventId)!.tickets[0]!.id;
  return {
    buyer,
    order: await buyer.request<Order>("/api/v1/orders", {
      method: "POST",
      headers: {
        "Idempotency-Key": crypto.randomUUID()
      },
      body: {
        event_id: demoEventId,
        items: [{
          ticket_type_id: type,
          quantity: 1
        }],
        attendees: [{
          full_name: "Dias",
          email: "dias@example.com"
        }],
        hold_ids: [],
        ...(promo ? {
          promo_code: promo
        } : {})
      }
    })
  };
}
async function paidSetup() {
  const organizer = await actor(),
    context = mockCheckoutEvent(demoEventId)!,
    type = context.tickets[0]!;
  await organizer.request(`${root}/ticket-types/${type.id}`, {
    method: "PATCH",
    body: {
      ...type,
      price_amount: 100000,
      is_free: false,
      currency: "KZT"
    }
  });
  mockPaidSales(demoEventId, "active");
  return organizer;
}
it("reconciles a free sale, current attendance and date-filtered revenue", async () => {
  const {
      order
    } = await seed(),
    organizer = await actor();
  mockOperationsOrder(order.id)!.value.tickets[0]!.status = "checked_in";
  const all = parseAnalytics(await organizer.request(`${root}/analytics`));
  expect(all).toMatchObject({
    capacity: 100,
    sold: 1,
    remaining: 99,
    gross: 0,
    net: 0,
    checked_in: 1,
    absent: 0,
    checkin_percent: 100
  });
  const none = parseAnalytics(await organizer.request(`${root}/analytics?date_to=2020-01-01T00:00:00Z`));
  expect(none.sold).toBe(1);
  expect(none.checked_in).toBe(1);
  expect(none.gross).toBe(0);
});
it("reconciles gross, completed refunds and net while removing refunded holders", async () => {
  const {
      order
    } = await seed(true),
    organizer = await actor();
  let report = parseAnalytics(await organizer.request(`${root}/analytics`));
  expect(report).toMatchObject({
    gross: 150000,
    refunds: 0,
    net: 150000,
    sold: 1
  });
  await organizer.request(`/api/v1/orders/${order.id}/refund`, {
    method: "POST",
    body: {
      reason: "Requested full refund"
    }
  });
  report = parseAnalytics(await organizer.request(`${root}/analytics`));
  expect(report).toMatchObject({
    gross: 150000,
    refunds: 150000,
    net: 0,
    sold: 0,
    remaining: 100
  });
});
it("reconciles paid campaign attribution only after successful simulated settlement", async () => {
  const organizer = await paidSetup();
  const campaign = await organizer.request<Campaign>(`${root}/campaigns`, {
    method: "POST",
    body: {
      name: "Dias course",
      discount_type: "percent",
      discount_value: 10,
      valid_from: "2026-01-01T00:00:00Z",
      valid_to: "2028-01-01T00:00:00Z",
      max_redemptions: 100,
      ticket_type_ids: []
    }
  });
  const {
    buyer,
    order
  } = await purchase(campaign.code);
  expect(parseAnalytics(await organizer.request(`${root}/analytics`)).gross).toBe(0);
  const payment = await buyer.request<{
    id: string;
  }>(`/api/v1/orders/${order.id}/payments`, {
    method: "POST"
  });
  await buyer.request(`/api/v1/payments/${payment.id}/simulate`, {
    method: "POST",
    body: {
      outcome: "succeeded"
    }
  });
  const report = parseAnalytics(await organizer.request(`${root}/analytics`));
  expect(report).toMatchObject({
    gross: 100000,
    discounts: 10000,
    refunds: 0,
    net: 90000,
    sold: 1
  });
  expect(report.campaigns).toEqual([{
    campaign_id: campaign.id,
    name: "Dias course",
    redemptions: 1,
    revenue: 90000
  }]);
  expect(report.by_ticket_type[0]?.revenue).toBe(90000);
  expect(report.sales_over_time.reduce((n, r) => n + r.revenue, 0)).toBe(90000);
});
it("allows assigned managers and denies check-in-only staff analytics/history", async () => {
  const organizer = await actor(),
    staff = await actor("support@example.com");
  await organizer.request(`${root}/staff`, {
    method: "POST",
    body: {
      email: "support@example.com",
      role: "checkin"
    }
  });
  await expect(staff.request(`${root}/analytics`)).rejects.toMatchObject({
    status: 403
  });
  await expect(staff.request(`${root}/history`)).rejects.toMatchObject({
    status: 403
  });
  await organizer.request(`${root}/staff/${staff.getSnapshot().user!.id}`, {
    method: "DELETE"
  });
  await organizer.request(`${root}/staff`, {
    method: "POST",
    body: {
      email: "support@example.com",
      role: "manager"
    }
  });
  expect(parseAnalytics(await staff.request(`${root}/analytics`)).capacity).toBe(100);
  expect(parseHistory(await staff.request(`${root}/history`)).total).toBe(0);
});
it("denies every admin collection, settings and exports to an organizer", async () => {
  const organizer = await actor();
  for (const section of sections) await expect(organizer.request(adminPath(section))).rejects.toMatchObject({
    status: 403
  });
  await expect(organizer.request("/api/v1/admin/settings")).rejects.toMatchObject({
    status: 403
  });
  await expect(organizer.request("/api/v1/admin/exports/orders.csv", {
    responseType: "blob"
  })).rejects.toMatchObject({
    status: 403
  });
});
it("parses the complete admin search DTOs from all nine collection endpoints", async () => {
  await seed(true);
  const organizer = await actor();
  await organizer.request(`${root}/activation`);
  await organizer.request("/api/v1/support/cases", {
    method: "POST",
    body: {
      category: "payment",
      subject: "Activation problem",
      message: "Please inspect activation",
      event_id: demoEventId
    }
  });
  await organizer.request(`${root}/reports`, {
    method: "POST",
    body: {
      reason: "Review event listing"
    }
  });
  const admin = await actor("admin@example.com");
  for (const section of sections) {
    const page = parseAdminPage(section)(await admin.request(adminPath(section)));
    if (["users", "events", "orders", "activations", "support", "reports"].includes(section)) expect(page.total).toBeGreaterThan(0);
  }
});
it("event suspension stops new sales without cancelling old tickets and creates retained history", async () => {
  const {
      order,
      buyer
    } = await seed(),
    admin = await actor("admin@example.com"),
    organizer = await actor();
  await admin.request(`/api/v1/admin/events/${demoEventId}/suspend`, {
    method: "POST",
    body: {
      suspended: true,
      reason: "Review safety concern"
    }
  });
  await expect(purchase()).rejects.toMatchObject({
    status: 409
  });
  expect((await buyer.request<Order>(`/api/v1/orders/${order.id}`)).status).toBe("free_confirmed");
  expect(parseHistory(await organizer.request(`${root}/history`)).items[0]?.description).toBe("Review safety concern");
  await admin.request(`/api/v1/admin/events/${demoEventId}/suspend`, {
    method: "POST",
    body: {
      suspended: false,
      reason: "Review complete"
    }
  });
  expect((await purchase()).order.status).toBe("free_confirmed");
});
it("paid-sales-only suspension blocks paid registration and returns activation details", async () => {
  await paidSetup();
  const admin = await actor("admin@example.com");
  const value = await admin.request(`/api/v1/admin/events/${demoEventId}/paid-sales/suspend`, {
    method: "POST",
    body: {
      suspended: true,
      reason: "Activation review"
    }
  });
  expect(parseAdminPage("activations")({
    items: [value],
    total: 1,
    offset: 0,
    limit: 20
  }).items[0]?.status).toBe("suspended");
  await expect(purchase()).rejects.toThrow();
  expect(mockCheckoutEvent(demoEventId)!.event.status).toBe("published");
});
it("report moderation changes only its review label and preserves event availability", async () => {
  const reporter = await actor("attendee@example.com"),
    admin = await actor("admin@example.com");
  const report = await reporter.request<Row>(`${root}/reports`, {
    method: "POST",
    body: {
      reason: "Misleading description"
    }
  });
  await admin.request(`/api/v1/admin/reports/${report.id}`, {
    method: "PATCH",
    body: {
      status: "actioned"
    }
  });
  expect(mockCheckoutEvent(demoEventId)!.event.status).toBe("published");
  expect(parseAdminPage("reports")(await admin.request("/api/v1/admin/reports")).items[0]?.status).toBe("actioned");
});
it("settings patch is partial, validated and atomic", async () => {
  const admin = await actor("admin@example.com"),
    before = parseSettings(await admin.request("/api/v1/admin/settings"));
  await expect(admin.request("/api/v1/admin/settings", {
    method: "PATCH",
    body: {
      settings: {
        activation_fee_amount: 999,
        hold_minutes: 0
      }
    }
  })).rejects.toMatchObject({
    status: 422
  });
  expect(parseSettings(await admin.request("/api/v1/admin/settings"))).toEqual(before);
  expect(parseSettings(await admin.request("/api/v1/admin/settings", {
    method: "PATCH",
    body: {
      settings: {
        activation_fee_amount: 123
      }
    }
  }))).toEqual({
    ...before,
    activation_fee_amount: 123
  });
});
it("filters failed refund monitoring and leaves resolved support cases out of disputes", async () => {
  await seed(true);
  mockAllRefunds().push({
    id: crypto.randomUUID(),
    order_id: crypto.randomUUID(),
    amount: 50000,
    currency: "KZT",
    reason: "Sandbox failed",
    status: "failed",
    completed_at: null
  });
  const organizer = await actor();
  const c = await organizer.request<{
    id: string;
  }>("/api/v1/support/cases", {
    method: "POST",
    body: {
      category: "payment",
      subject: "Payment failed",
      message: "Need review",
      event_id: demoEventId
    }
  });
  const admin = await actor("admin@example.com");
  let data = parseDisputes(await admin.request("/api/v1/admin/disputes"));
  expect(data.failed_refunds).toHaveLength(1);
  expect(data.payment_cases).toHaveLength(1);
  await admin.request(`/api/v1/support/cases/${c.id}`, {
    method: "PATCH",
    body: {
      status: "resolved"
    }
  });
  data = parseDisputes(await admin.request("/api/v1/admin/disputes"));
  expect(data.payment_cases).toHaveLength(0);
});
it("filters audit dates, action and category with deterministic server order", async () => {
  const organizer = await actor(),
    user = organizer.getSnapshot().user!;
  mockAudit(demoEventId, "event_updated", "event", demoEventId, "Old update", user);
  mockAudit(demoEventId, "payment.failed", "payment", "fixture-payment", "Failure", user);
  const data = parseHistory(await organizer.request(`${root}/history?category=payment&action_type=payment.failed&date_from=2026-01-01T00:00:00Z`));
  expect(data.items.map(r => r.description)).toEqual(["Failure"]);
});
it("returns canonical CSV headers, integer tiyn and escaped spreadsheet values", async () => {
  const {
    order
  } = await seed(true);
  mockOperationsOrder(order.id)!.value.order_number = "=HYPERLINK(\"bad\")";
  const admin = await actor("admin@example.com"),
    blob = await admin.request<Blob>("/api/v1/admin/exports/orders.csv", {
      responseType: "blob"
    });
  const csv = await blob.text();
  expect(csv.split("\r\n")[0]).toBe("order_number,event_id,buyer_email,status,subtotal,discount_amount,processing_fee,total,currency,is_simulated,created_at");
  expect(csv).toContain("150000");
  expect(csv).toContain("'=HYPERLINK");
});
