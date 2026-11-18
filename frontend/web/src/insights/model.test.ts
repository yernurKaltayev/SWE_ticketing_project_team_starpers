import { expect, it, vi } from "vitest";
import { adminQuery, allEvents, analyticsQuery, dateQuery, exportPath, lifecycle, parseAdminPage, parseAnalytics, parseHistory, parseSettings, settingsBody } from "./model";
import type { Request } from "../support/model";
import type { Settings } from "./model";
import { mockCheckoutEvent, demoEventId } from "../mocks/events";
const strings = (value: object): Record<string, string> => Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
const analytics = {
  capacity: 100,
  sold: 7,
  remaining: 90,
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
    name: "General",
    sold: 7,
    revenue: 9001
  }],
  campaigns: [{
    campaign_id: demoEventId,
    name: "Welcome",
    redemptions: 2,
    revenue: 800
  }]
};
const settings: Settings = {
  activation_fee_amount: 12345,
  processing_fee_percent: 3,
  payout_delay_days: 3,
  hold_minutes: 10
};
function form(changes: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    activation_fee_amount: "123.45",
    processing_fee_percent: "3",
    payout_delay_days: "3",
    hold_minutes: "10",
    ...changes
  })) data.set(key, value);
  return data;
}
it("preserves authoritative aggregate values, signed net and fractional percentages", () => {
  expect(parseAnalytics({
    ...analytics,
    net: -1
  })).toEqual({
    ...analytics,
    net: -1
  });
});
it.each([{
  gross: 1.5
}, {
  sold: -1
}, {
  checkin_percent: Infinity
}, {
  sales_over_time: [{
    date: "bad",
    tickets: 1,
    revenue: 10
  }]
}, {
  by_ticket_type: [{}]
}, {
  campaigns: [{
    campaign_id: demoEventId,
    name: "X",
    redemptions: 1,
    revenue: "100"
  }]
}])("rejects malformed financial and count aggregates %j", change => {
  expect(() => parseAnalytics({
    ...analytics,
    ...change
  })).toThrow();
});
it("rejects an overlong daily series rather than silently truncating", () => {
  expect(() => parseAnalytics({
    ...analytics,
    sales_over_time: Array(367).fill(analytics.sales_over_time[0])
  })).toThrow();
});
it.each([["2026-11-18T09:59:59Z", "upcoming"], ["2026-11-18T10:00:00Z", "active"], ["2026-11-18T11:00:00Z", "completed"]])("classifies lifecycle at boundary %s", (now, expected) => {
  expect(lifecycle({
    status: "suspended",
    starts_at: "2026-11-18T10:00:00Z",
    ends_at: "2026-11-18T11:00:00Z"
  }, Date.parse(now))).toBe(expected);
});
it("keeps cancellation distinct from time and retains draft status separately", () => {
  expect(lifecycle({
    status: "cancelled",
    starts_at: "2020-01-01Z",
    ends_at: "2020-01-02Z"
  })).toBe("cancelled");
  expect(lifecycle({
    status: "draft",
    starts_at: "2030-01-01Z",
    ends_at: "2030-01-02Z"
  })).toBe("upcoming");
});
it("converts event-local dates and preserves the ticket type filter", () => {
  const q = analyticsQuery(new URLSearchParams({
    date_from: "2026-11-18T10:00",
    date_to: "2026-11-19T10:00",
    ticket_type_id: demoEventId
  }), "Asia/Almaty");
  expect(q.get("date_from")).toBe("2026-11-18T05:00:00.000Z");
  expect(q.get("date_to")).toBe("2026-11-19T05:00:00.000Z");
  expect(q.get("ticket_type_id")).toBe(demoEventId);
});
it.each([{
  date_from: "2026-11-19T10:00",
  date_to: "2026-11-18T10:00"
}, {
  date_from: "2026-11-18T10:00",
  date_to: "2026-11-18T10:00"
}, {
  date_from: "not-date"
}, {
  ticket_type_id: "invalid"
}])("rejects invalid analytics filters %j", params => {
  expect(() => analyticsQuery(new URLSearchParams(strings(params)), "UTC")).toThrow();
});
it("rejects nonexistent daylight-saving wall time", () => {
  expect(() => dateQuery(new URLSearchParams({
    date_from: "2026-03-08T02:30"
  }), "America/New_York")).toThrow();
});
it("fetches all organizer pages before applying lifecycle grouping", async () => {
  const event = mockCheckoutEvent(demoEventId)!.event;
  const rows = Array.from({
    length: 103
  }, (_, i) => ({
    ...event,
    id: crypto.randomUUID(),
    title: `Event ${i}`
  }));
  const request = vi.fn(async (path: string) => {
    const offset = Number(new URL(path, "https://demo").searchParams.get("offset"));
    return {
      items: rows.slice(offset, offset + 100),
      limit: 100,
      offset,
      total: 103
    };
  });
  expect(await allEvents(request as Request)).toHaveLength(103);
  expect(request).toHaveBeenCalledTimes(2);
});
it("rejects an incomplete organizer snapshot instead of hiding past events", async () => {
  await expect(allEvents((async () => ({
    items: [],
    total: 1,
    limit: 100,
    offset: 0
  })) as Request)).rejects.toThrow();
});
it("rejects duplicate organizer IDs across pages", async () => {
  const e = mockCheckoutEvent(demoEventId)!.event;
  await expect(allEvents((async (path: string) => ({
    items: [e],
    total: 2,
    limit: 1,
    offset: Number(new URL(path, "https://demo").searchParams.get("offset"))
  })) as Request)).rejects.toThrow("duplicate_event");
});
it("uses only filters supported by each admin collection", () => {
  const q = adminQuery("campaigns", new URLSearchParams({
    q: "ignored",
    created_from: "bad"
  }));
  expect(q.toString()).toBe("offset=0&limit=20");
  expect(adminQuery("users", new URLSearchParams({
    q: "  Dias  ",
    role: "organizer",
    suspended: "true"
  })).get("q")).toBe("Dias");
});
it.each([{
  status: "bogus"
}, {
  role: "manager"
}, {
  suspended: "yes"
}, {
  offset: "-1"
}, {
  offset: "1.2"
}])("rejects invalid admin filters %j", p => {
  expect(() => adminQuery("users", new URLSearchParams(strings(p)))).toThrow();
});
it("exports only canonical resource and UTC date scope", () => {
  const path = exportPath("orders", new URLSearchParams({
    q: "ignored",
    status: "paid",
    created_from: "2026-11-18T10:00"
  }));
  expect(path).toContain("/admin/exports/orders.csv?created_from=2026-11-18T10%3A00%3A00.000Z");
  expect(path).not.toMatch(/q=|status=/);
  expect(() => exportPath("settings", new URLSearchParams())).toThrow();
});
it("converts KZT fee to integer tiyn and submits only changed settings", () => {
  expect(settingsBody(form({
    activation_fee_amount: "1.23",
    processing_fee_percent: "2.75"
  }), settings)).toEqual({
    settings: {
      activation_fee_amount: 123,
      processing_fee_percent: 2.75
    }
  });
});
it.each([{
  activation_fee_amount: "0"
}, {
  activation_fee_amount: "1.001"
}, {
  processing_fee_percent: "100.01"
}, {
  processing_fee_percent: "-1"
}, {
  hold_minutes: "0"
}, {
  hold_minutes: "1.5"
}, {
  payout_delay_days: "-1"
}])("rejects invalid fee/hold settings %j", changes => {
  expect(() => settingsBody(form(strings(changes)), settings)).toThrow();
});
it("accepts zero payout days and percent, but does not send unchanged settings", () => {
  expect(settingsBody(form({
    payout_delay_days: "0",
    processing_fee_percent: "0"
  }), settings)).toEqual({
    settings: {
      payout_delay_days: 0,
      processing_fee_percent: 0
    }
  });
  expect(() => settingsBody(form(), settings)).toThrow("no_changes");
});
it("validates settings received from the server before editing", () => {
  expect(parseSettings({
    settings
  })).toEqual(settings);
  expect(() => parseSettings({
    settings: {
      ...settings,
      hold_minutes: 0
    }
  })).toThrow();
});
it("rejects incomplete admin rows and malformed pagination", () => {
  expect(() => parseAdminPage("payments")({
    items: [{
      id: "x"
    }],
    total: 1,
    limit: 20,
    offset: 0
  })).toThrow();
  expect(() => parseAdminPage("users")({
    items: [],
    total: -1,
    limit: 20,
    offset: 0
  })).toThrow();
});
it("validates actor, timestamp and lifecycle before rendering history", () => {
  const value = {
    event_status: "cancelled",
    lifecycle: "cancelled",
    items: [{
      id: "x",
      occurred_at: "2026-11-18T10:00:00Z",
      actor_id: null,
      actor_role: "system",
      action_type: "event_cancelled",
      entity_type: "event",
      entity_id: demoEventId,
      description: "Cancelled",
      metadata: {}
    }],
    offset: 0,
    limit: 20,
    total: 1
  };
  expect(parseHistory(value).items[0]?.actor_id).toBe(null);
  expect(() => parseHistory({
    ...value,
    items: [{
      ...value.items[0],
      occurred_at: "bad"
    }]
  })).toThrow();
  expect(() => parseHistory({
    ...value,
    lifecycle: "archived"
  })).toThrow();
});
