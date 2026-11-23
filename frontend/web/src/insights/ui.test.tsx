// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { formatMoney } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { SessionContext } from "../auth/session";
import { handlers } from "../mocks/handlers";
import { actor, reset, seed, demoEventId } from "../operations/testFixtures";
import { mockAllEvents, mockCheckoutEvent, mockSetEventState } from "../mocks/events";
import { mockAllOrders } from "../mocks/orders";
import { resetPaymentMocks } from "../mocks/payments";
import { resetPromotionMocks } from "../mocks/promotions";
import { resetStaffMocks } from "../mocks/staff";
import { resetSupportMocks } from "../mocks/support";
import { mockAudit, resetInsightMocks } from "../mocks/insights";
import Analytics from "./Analytics";
import History from "./History";
import Archive from "./Archive";
import Admin from "./Admin";
import { ReportEvent } from "./ReportEvent";
import { label } from "./copy";
const server = setupServer(...handlers);
beforeAll(() => server.listen({
  onUnhandledRequest: "error"
}));
afterAll(() => server.close());
beforeEach(() => {
  reset();
  resetPaymentMocks();
  resetPromotionMocks();
  resetStaffMocks();
  resetSupportMocks();
  resetInsightMocks();
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
async function mount(path: string, email = "organizer@example.com", locale: Locale = "en") {
  const session = await actor(email),
    client = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0
        }
      }
    });
  const view = render(<QueryClientProvider client={client}>
  <SessionContext.Provider value={session}>
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/organizer/events/:eventId/analytics" element={<Analytics locale={locale} />} />
        <Route path="/organizer/events/:eventId/history" element={<History locale={locale} />} />
        <Route path="/organizer/events/:eventId/edit" element={<h1>Cloned draft editor</h1>} />
        <Route path="/organizer/events" element={<Archive locale={locale} />} />
        <Route path="/admin/:section" element={<Admin locale={locale} />} />
        <Route path="/report" element={<ReportEvent id={demoEventId} locale={locale} />} />
      </Routes>
    </MemoryRouter>
  </SessionContext.Provider>
</QueryClientProvider>);
  return {
    session,
    client,
    view
  };
}
const summary = {
  capacity: 100,
  sold: 7,
  remaining: 91,
  percent_sold: 7,
  gross: 10001,
  discounts: 1000,
  refunds: 2000,
  net: 7001,
  checked_in: 2,
  absent: 5,
  checkin_percent: 28.57,
  sales_over_time: [{
    date: "2026-11-18",
    tickets: 8,
    revenue: 9001
  }],
  by_ticket_type: [{
    ticket_type_id: demoEventId,
    name: "VIP fixture",
    sold: 7,
    revenue: 9001
  }],
  campaigns: []
};
const path = `/organizer/events/${demoEventId}`;
function button(name: string) {
  return screen.getByRole("button", {
    name
  });
}
function confirm() {
  return within(screen.getByRole("dialog")).getByRole("button", {
    name: "Confirm action"
  });
}
async function details(text: string) {
  const row = (await screen.findByText(text, {
    exact: true
  })).closest("tr")!;
  fireEvent.click(within(row).getByRole("button", {
    name: "View details"
  }));
}
it("renders server totals and accessible tables alongside charts without recomputing revenue", async () => {
  server.use(http.get("*/api/v1/events/:id/analytics", () => HttpResponse.json(summary)));
  await mount(`${path}/analytics`);
  expect(await screen.findByText(formatMoney(7001, "en").replace(/\s/g, " "))).toBeTruthy();
  expect(screen.getByText(formatMoney(10001, "en").replace(/\s/g, " "))).toBeTruthy();
  expect(screen.getByRole("table", {
    name: "Sales over time"
  })).toBeTruthy();
  expect(screen.getByRole("table", {
    name: "Ticket-type comparison"
  })).toBeTruthy();
  expect(screen.getAllByRole("img")).toHaveLength(2);
  expect(screen.getByText(/Processing fees are payout deductions/)).toBeTruthy();
  expect(screen.getByText(/Inventory and check-in are current/)).toBeTruthy();
});
it("sends event-zone dates and ticket type as one applied analytics filter", async () => {
  const requests: URL[] = [];
  server.use(http.get("*/api/v1/events/:id/analytics", ({
    request
  }) => {
    requests.push(new URL(request.url));
    return HttpResponse.json(summary);
  }));
  await mount(`${path}/analytics`);
  await screen.findByText(formatMoney(7001, "en").replace(/\s/g, " "));
  fireEvent.change(screen.getByLabelText("From (inclusive) · Almaty"), {
    target: {
      value: "2026-11-18T10:00"
    }
  });
  fireEvent.change(screen.getByLabelText("Until (exclusive) · Almaty"), {
    target: {
      value: "2026-11-19T10:00"
    }
  });
  const type = mockCheckoutEvent(demoEventId)!.tickets[0]!.id;
  await waitFor(() => expect(screen.getByRole("option", {
    name: "Demo · General admission"
  })).toBeTruthy());
  fireEvent.change(screen.getByLabelText("Ticket type"), {
    target: {
      value: type
    }
  });
  fireEvent.click(button("Apply filters"));
  await waitFor(() => expect(requests.at(-1)?.searchParams.get("ticket_type_id")).toBe(type));
  expect(requests.at(-1)?.searchParams.get("date_from")).toBe("2026-11-18T05:00:00.000Z");
});
it("does not request analytics for an invalid URL filter, even on refresh", async () => {
  const reads = vi.fn();
  server.use(http.get("*/api/v1/events/:id/analytics", () => {
    reads();
    return HttpResponse.json(summary);
  }));
  await mount(`${path}/analytics?ticket_type_id=bad`);
  await screen.findByText("Check the dates, selected filters and field values.");
  fireEvent.click(button("Refresh records"));
  expect(reads).not.toHaveBeenCalled();
});
it("removes cached analytics after access is denied on refresh", async () => {
  await seed();
  await mount(`${path}/analytics`);
  await screen.findByRole("table", {
    name: "Sales over time"
  });
  server.use(http.get("*/api/v1/events/:id/analytics", () => HttpResponse.json({
    code: "forbidden",
    message: "Denied"
  }, {
    status: 403
  })));
  fireEvent.click(button("Refresh records"));
  await screen.findByText("These records are unavailable to this account.");
  expect(screen.queryByRole("table", {
    name: "Sales over time"
  })).toBeNull();
});
it("denies organizer-only analytics to an unassigned attendee", async () => {
  await mount(`${path}/analytics`, "attendee@example.com");
  await screen.findByText("These records are unavailable to this account.");
  expect(screen.queryByRole("table")).toBeNull();
});
it("labels expanded campaign ticket/revenue figures as lifetime rather than current filter scope", async () => {
  const id = crypto.randomUUID();
  server.use(http.get("*/api/v1/events/:id/analytics", () => HttpResponse.json({
    ...summary,
    campaigns: [{
      campaign_id: id,
      name: "Study code",
      redemptions: 1,
      revenue: 900
    }]
  })), http.get("*/api/v1/campaigns/:id", () => HttpResponse.json({
    id,
    event_id: demoEventId,
    name: "Study code",
    discount_type: "percent",
    discount_value: 10,
    valid_from: "2026-01-01T00:00:00Z",
    valid_to: "2027-01-01T00:00:00Z",
    max_redemptions: 100,
    ticket_type_ids: [],
    code: "DIAS10",
    redemptions_count: 4,
    is_enabled: true,
    qr_url: "https://demo/qr"
  })), http.get("*/api/v1/campaigns/:id/report", () => HttpResponse.json({
    redemptions: 4,
    orders: 4,
    tickets_sold: 9,
    gross_revenue: 10000,
    discount: 1000,
    net_revenue: 9000
  })));
  await mount(`${path}/analytics`);
  fireEvent.click(await screen.findByRole("button", {
    name: "View details"
  }));
  expect(await screen.findByText(/DIAS10/)).toBeTruthy();
  expect(screen.getByText(/Lifetime campaign details/)).toBeTruthy();
  expect(screen.getByText("Attributed tickets")).toBeTruthy();
});
it("renders a read-only actor/entity timeline and applies action/category filters", async () => {
  const user = (await actor()).getSnapshot().user!;
  mockAudit(demoEventId, "event_updated", "event", demoEventId, "Venue corrected", user);
  mockAudit(demoEventId, "payment.failed", "payment", "failed-id", "Sandbox failed", user);
  await mount(`${path}/history`);
  await screen.findByText("Sandbox failed");
  expect(screen.getByText("Venue corrected")).toBeTruthy();
  expect(screen.getAllByText(new RegExp(user.id))).toHaveLength(2);
  fireEvent.change(screen.getByLabelText("Activity category"), {
    target: {
      value: "payment"
    }
  });
  fireEvent.click(button("Apply filters"));
  await waitFor(() => expect(screen.queryByText("Venue corrected")).toBeNull());
  expect(await screen.findByText("Sandbox failed")).toBeTruthy();
  expect(screen.queryByRole("button", {
    name: /delete|rollback/i
  })).toBeNull();
});
it("keeps suspended events readable to admins for history and analytics", async () => {
  mockSetEventState(demoEventId, {
    status: "suspended"
  });
  mockAudit(demoEventId, "event.suspended", "event", demoEventId, "Reviewing concern");
  await mount(`${path}/history`, "admin@example.com");
  expect(await screen.findByText("Reviewing concern")).toBeTruthy();
});
it("groups all lifecycle states and retains past operations links", async () => {
  const base = mockAllEvents()[0]!;
  const now = Date.now();
  const rows = [{
    name: "Past",
    status: "published",
    start: now - 10000,
    end: now - 5000
  }, {
    name: "Running",
    status: "published",
    start: now - 5000,
    end: now + 100000
  }, {
    name: "Cancelled history",
    status: "cancelled",
    start: now - 10000,
    end: now - 5000
  }];
  const events = [base.value, ...rows.map(r => ({
    ...base.value,
    id: crypto.randomUUID(),
    title: r.name,
    status: r.status,
    starts_at: new Date(r.start).toISOString(),
    ends_at: new Date(r.end).toISOString()
  }))];
  server.use(http.get("*/api/v1/organizers/me/events", () => HttpResponse.json({
    items: events,
    total: events.length,
    limit: 100,
    offset: 0
  })));
  await mount("/organizer/events");
  await screen.findByText("Cancelled history");
  expect(screen.getByRole("link", { name: "Completed (1)" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Active (1)" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Cancelled (1)" })).toBeTruthy();
  expect(screen.getByRole("heading", {
    name: "Completed"
  })).toBeTruthy();
  expect(screen.getByRole("heading", {
    name: "Active"
  })).toBeTruthy();
  const card = screen.getByText("Past").closest("article")!;
  expect(within(card).getByRole("link", {
    name: "Refunds"
  })).toBeTruthy();
  expect(within(card).getByRole("link", {
    name: "Activity history"
  })).toBeTruthy();
  expect(within(card).getByRole("link", {
    name: "Check-in totals"
  })).toBeTruthy();
});
it("duplicates only after confirmation and leaves source transactions unchanged", async () => {
  const {
    order
  } = await seed();
  const source = structuredClone(mockCheckoutEvent(demoEventId));
  await mount("/organizer/events");
  fireEvent.click(await screen.findByRole("button", {
    name: "Duplicate into a new draft"
  }));
  expect(document.activeElement).toBe(within(screen.getByRole("dialog")).getByRole("button", {
    name: "Keep unchanged"
  }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", {
    name: "Keep unchanged"
  }));
  const existing = new Set(mockAllEvents().map(r => r.value.id));
  expect(mockAllEvents()).toHaveLength(existing.size);
  fireEvent.click(button("Duplicate into a new draft"));
  const submit = confirm();
  fireEvent.click(submit);
  fireEvent.click(submit);
  await screen.findByRole("heading", {
    name: "Cloned draft editor"
  });
  expect(mockAllEvents()).toHaveLength(existing.size + 1);
  const clone = mockAllEvents().find(r => !existing.has(r.value.id))!.value;
  expect(clone.status).toBe("draft");
  expect(clone.paid_sales_status).toBe("disabled");
  expect(mockCheckoutEvent(clone.id)!.tickets[0]?.sold).toBe(0);
  expect(mockAllOrders().filter(r => r.eventId === clone.id)).toHaveLength(0);
  expect(mockAllOrders()[0]?.value.id).toBe(order.id);
  expect(mockCheckoutEvent(demoEventId)).toEqual(source);
});
it("blocks a second duplicate after a lost response instead of automatically retrying", async () => {
  const writes = vi.fn();
  server.use(http.post("*/api/v1/events/:id/duplicate", () => {
    writes();
    return HttpResponse.error();
  }));
  await mount("/organizer/events");
  fireEvent.click(await screen.findByRole("button", {
    name: "Duplicate into a new draft"
  }));
  fireEvent.click(confirm());
  await screen.findAllByText(/The outcome is unknown/);
  expect(writes).toHaveBeenCalledTimes(1);
  expect(confirm().hasAttribute("disabled")).toBe(true);
  fireEvent.click(confirm());
  expect(writes).toHaveBeenCalledTimes(1);
});
it.each(["organizer@example.com", "attendee@example.com"])("does not request admin data for %s", async email => {
  const reads = vi.fn();
  server.use(http.get("*/api/v1/admin/users", () => {
    reads();
    return HttpResponse.json({});
  }));
  await mount("/admin/users", email);
  await screen.findByText("These records are unavailable to this account.");
  expect(reads).not.toHaveBeenCalled();
});
it("searches users, shows selected server details and confirms suspension with a reason", async () => {
  const attendee = await actor("attendee@example.com");
  await mount("/admin/users", "admin@example.com");
  await details("attendee@example.com");
  fireEvent.click(button("Suspend"));
  expect(confirm().hasAttribute("disabled")).toBe(true);
  fireEvent.change(screen.getByLabelText("Reason"), {
    target: {
      value: "Review suspicious activity"
    }
  });
  const submit = confirm();
  fireEvent.click(submit);
  fireEvent.click(submit);
  await screen.findByText("Server confirmed the change.");
  await expect(attendee.request("/api/v1/me")).rejects.toThrow();
  fireEvent.change(screen.getByLabelText("Search"), {
    target: {
      value: "attendee@example.com"
    }
  });
  fireEvent.click(button("Apply filters"));
  await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(2));
  await details("attendee@example.com");
  expect(button("Reinstate")).toBeTruthy();
});
it("hides selected private admin details after a server denial", async () => {
  await mount("/admin/users", "admin@example.com");
  await details("attendee@example.com");
  server.use(http.get("*/api/v1/admin/users", () => HttpResponse.json({
    code: "forbidden",
    message: "Denied"
  }, {
    status: 403
  })));
  fireEvent.click(button("Refresh records"));
  await screen.findByText("These records are unavailable to this account.");
  expect(screen.queryByText("attendee@example.com")).toBeNull();
  expect(screen.queryByRole("button", {
    name: "Suspend"
  })).toBeNull();
});
it("shows and confirms fee changes in KZT while sending integer tiyn and changed keys only", async () => {
  const writes: unknown[] = [];
  server.use(http.patch("*/api/v1/admin/settings", async ({
    request
  }) => {
    const body = await request.json();
    writes.push(body);
    return HttpResponse.json({
      settings: {
        activation_fee_amount: 123,
        processing_fee_percent: 3,
        payout_delay_days: 3,
        hold_minutes: 10
      }
    });
  }));
  await mount("/admin/settings", "admin@example.com");
  fireEvent.change(await screen.findByLabelText("Activation fee (KZT)"), {
    target: {
      value: "1.23"
    }
  });
  fireEvent.click(button("Review changes"));
  expect(writes).toHaveLength(0);
  expect(within(screen.getByRole("dialog")).getByText(new RegExp("1.23"))).toBeTruthy();
  fireEvent.click(confirm());
  await screen.findByText("Server confirmed the change.");
  expect(writes).toEqual([{
    settings: {
      activation_fee_amount: 123
    }
  }]);
});
it("preserves typed settings when cancelling review and blocks invalid holds without writing", async () => {
  const writes = vi.fn();
  server.use(http.patch("*/api/v1/admin/settings", () => {
    writes();
    return HttpResponse.json({});
  }));
  await mount("/admin/settings", "admin@example.com");
  const fee = await screen.findByLabelText("Activation fee (KZT)");
  fireEvent.change(fee, {
    target: {
      value: "1.23"
    }
  });
  fireEvent.click(button("Review changes"));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", {
    name: "Keep unchanged"
  }));
  expect((fee as HTMLInputElement).value).toBe("1.23");
  fireEvent.change(screen.getByLabelText("Hold duration (minutes)"), {
    target: {
      value: "0"
    }
  });
  fireEvent.click(button("Review changes"));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(writes).not.toHaveBeenCalled();
});
it("blocks settings replay after an unknown result and retains the error", async () => {
  const writes = vi.fn();
  server.use(http.patch("*/api/v1/admin/settings", () => {
    writes();
    return HttpResponse.error();
  }));
  await mount("/admin/settings", "admin@example.com");
  fireEvent.change(await screen.findByLabelText("Hold duration (minutes)"), {
    target: {
      value: "11"
    }
  });
  fireEvent.click(button("Review changes"));
  fireEvent.click(confirm());
  await screen.findAllByText(/The outcome is unknown/);
  expect(confirm().hasAttribute("disabled")).toBe(true);
  expect(writes).toHaveBeenCalledTimes(1);
});
it("uses authenticated CSV export, safe filename and revokes its download URL", async () => {
  let observed: Request | undefined;
  server.use(http.get("*/api/v1/admin/exports/orders.csv", ({
    request
  }) => {
    observed = request;
    return new HttpResponse("order_number,total\r\nTEST,100", {
      headers: {
        "Content-Type": "text/csv"
      }
    });
  }));
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  await mount("/admin/exports", "admin@example.com");
  fireEvent.change(screen.getByLabelText("From (inclusive) · UTC"), {
    target: {
      value: "2026-11-18T10:00"
    }
  });
  fireEvent.click(button("Download CSV"));
  await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:csv"), {
    timeout: 2500
  });
  expect(observed?.headers.get("Authorization")).toMatch(/^Bearer /);
  expect(new URL(observed!.url).searchParams.get("created_from")).toBe("2026-11-18T10:00:00.000Z");
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
});
it("does not download an API error disguised as a successful JSON response", async () => {
  server.use(http.get("*/api/v1/admin/exports/orders.csv", () => HttpResponse.json({
    secret: "not csv"
  })));
  await mount("/admin/exports", "admin@example.com");
  fireEvent.click(button("Download CSV"));
  await screen.findByRole("alert");
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it("creates one public event report and does not suspend the event by reporting it", async () => {
  await mount("/report", "attendee@example.com");
  fireEvent.click(button("Report this event"));
  fireEvent.change(screen.getByLabelText("Reason"), {
    target: {
      value: "Suspicious advertised content"
    }
  });
  fireEvent.click(screen.getAllByRole("button", {
    name: "Report this event"
  })[1]!);
  await screen.findByText("Server confirmed the change.");
  expect(mockCheckoutEvent(demoEventId)!.event.status).toBe("published");
  expect(screen.getByLabelText("Reason").hasAttribute("disabled")).toBe(true);
});
it.each(["ru", "kk"] as const)("translates F10 labels in %s without changing financial data", async locale => {
  server.use(http.get("*/api/v1/events/:id/analytics", () => HttpResponse.json(summary)));
  await mount(`${path}/analytics`, "organizer@example.com", locale);
  await screen.findByRole("heading", {
    name: label(locale, "money")
  });
  expect(screen.getByText(formatMoney(7001, locale).replace(/\s/g, " "))).toBeTruthy();
  expect(screen.getByRole("button", {
    name: label(locale, "apply")
  })).toBeTruthy();
});
it("confirms event suspension separately from review labels and keeps a cancelled dialog unchanged", async () => {
  await mount("/admin/events", "admin@example.com");
  await details("Demo · Student technology meetup");
  fireEvent.click(button("Suspend"));
  fireEvent.change(screen.getByLabelText("Reason"), {
    target: {
      value: "Investigate listing"
    }
  });
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", {
    name: "Keep unchanged"
  }));
  expect(mockCheckoutEvent(demoEventId)!.event.status).toBe("published");
  fireEvent.click(button("Suspend"));
  fireEvent.change(screen.getByLabelText("Reason"), {
    target: {
      value: "Investigate listing"
    }
  });
  fireEvent.click(confirm());
  await screen.findByText("Server confirmed the change.");
  expect(mockCheckoutEvent(demoEventId)!.event.status).toBe("suspended");
  await details("Demo · Student technology meetup");
  expect(button("Reinstate")).toBeTruthy();
});
it("reviews a reported event without silently suspending it", async () => {
  const reporter = await actor("attendee@example.com");
  await reporter.request(`/api/v1/events/${demoEventId}/reports`, {
    method: "POST",
    body: {
      reason: "Review misleading advertisement"
    }
  });
  await mount("/admin/reports", "admin@example.com");
  await details("Review misleading advertisement");
  fireEvent.click(button("Reviewed"));
  expect(within(screen.getByRole("dialog")).getByText(/Review labels do not suspend/)).toBeTruthy();
  fireEvent.click(confirm());
  await screen.findByText("Server confirmed the change.");
  expect(mockCheckoutEvent(demoEventId)!.event.status).toBe("published");
});
it("keeps fee input and the confirmation available after a definite validation error", async () => {
  server.use(http.patch("*/api/v1/admin/settings", () => HttpResponse.json({
    code: "validation_error",
    message: "Rejected"
  }, {
    status: 422
  })));
  await mount("/admin/settings", "admin@example.com");
  fireEvent.change(await screen.findByLabelText("Hold duration (minutes)"), {
    target: {
      value: "11"
    }
  });
  fireEvent.click(button("Review changes"));
  fireEvent.click(confirm());
  await screen.findAllByRole("alert");
  expect(confirm().hasAttribute("disabled")).toBe(false);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", {
    name: "Keep unchanged"
  }));
  expect((screen.getByLabelText("Hold duration (minutes)") as HTMLInputElement).value).toBe("11");
});
it("shows failed payment details and simulation flags from the admin payment DTO", async () => {
  const id = crypto.randomUUID();
  server.use(http.get("*/api/v1/admin/payments", () => HttpResponse.json({
    items: [{
      id,
      order_id: demoEventId,
      activation_id: null,
      kind: "ticket",
      provider: "sandbox",
      provider_ref: "FAILED-DEMO",
      status: "failed",
      amount: 150000,
      fee_amount: 4500,
      currency: "KZT",
      is_simulated: true,
      failure_reason: "Simulated decline",
      created_at: "2026-11-18T10:00:00Z"
    }],
    total: 1,
    offset: 0,
    limit: 20
  })));
  await mount("/admin/payments?status=failed", "admin@example.com");
  await details("FAILED-DEMO");
  expect(screen.getByText("Simulated decline")).toBeTruthy();
  expect(screen.getAllByText("Simulation flag")).toHaveLength(2);
  expect(screen.getByText(formatMoney(4500, "en").replace(/\s/g, " "))).toBeTruthy();
  expect(screen.queryByRole("button", {
    name: /refund|retry payment/i
  })).toBeNull();
});
it("does not query an empty admin URL when its filter is invalid and refresh is clicked", async () => {
  const reads = vi.fn();
  server.use(http.get("*/api/v1/admin/users", () => {
    reads();
    return HttpResponse.json({});
  }));
  await mount("/admin/users?role=manager", "admin@example.com");
  await screen.findByRole("alert");
  fireEvent.click(button("Refresh records"));
  expect(reads).not.toHaveBeenCalled();
});
