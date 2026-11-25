import { describe, expect, it } from "vitest";
import {
  eventBody,
  parsePrice,
  priceInput,
  salesState,
  activeRange,
  categoryTone,
  dayBoundary,
  offerSummary,
  quickRange,
  searchQuery,
  ticketBody,
  toInstant,
  zonedInput,
} from "./model";
import type { Event, Availability } from "./model";
function form(values: Record<string, string | undefined>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) {
    if (v !== undefined) f.set(k, v);
  }
  return f;
}
const values = {
  title: "Demo",
  description: "Test",
  category: "student",
  venue_id: "venue",
  timezone: "Asia/Almaty",
  visibility: "public",
  capacity: "100",
  starts_at: "2027-01-20T18:00",
  ends_at: "2027-01-20T20:00",
};
describe("F2 money, time and recovery inputs", () => {
  it("parses exact minor units and rejects rounding, negative, exponential and unsafe amounts", () => {
    expect(parsePrice("1234,56")).toBe(123456);
    expect(priceInput(Number.MAX_SAFE_INTEGER)).toBe("90071992547409.91");
    expect(parsePrice("0")).toBe(0);
    expect(parsePrice("90071992547409.91")).toBe(Number.MAX_SAFE_INTEGER);
    for (const value of ["-1", "1.001", "1e3", "", "NaN", "90071992547409.92"])
      expect(() => parsePrice(value)).toThrow();
  });
  it("converts event wall time independently of the host timezone and roundtrips", () => {
    expect(toInstant("2027-01-20T18:00", "Asia/Almaty", "starts_at")).toBe(
      "2027-01-20T13:00:00.000Z",
    );
    expect(zonedInput("2027-01-20T13:00:00Z", "Asia/Almaty")).toBe(
      "2027-01-20T18:00",
    );
    expect(toInstant("2027-06-01T10:00", "Asia/Kathmandu", "starts_at")).toBe(
      "2027-06-01T04:15:00.000Z",
    );
  });
  it("rejects DST gaps, duplicate wall times, invalid calendar dates and zones", () => {
    for (const [time, zone] of [
      ["2027-03-14T02:30", "America/New_York"],
      ["2027-11-07T01:30", "America/New_York"],
      ["2027-02-30T10:00", "UTC"],
      ["2027-01-20T18:00", "Invalid/Zone"],
    ])
      expect(() => toInstant(time!, zone!, "starts_at")).toThrow();
  });
  it("validates event and registration windows and retains nullable clearing semantics", () => {
    expect(eventBody(form(values))).toMatchObject({
      capacity: 100,
      registration_closes_at: null,
      starts_at: "2027-01-20T13:00:00.000Z",
    });
    for (const change of [
      { ends_at: values.starts_at },
      { capacity: "0" },
      {
        registration_opens_at: "2027-01-20T19:00",
        registration_closes_at: "2027-01-20T18:00",
      },
      { registration_closes_at: "2027-01-21T20:00" },
      // Ticket sales stop when the event starts, so closing during the event is rejected.
      { registration_closes_at: "2027-01-20T19:00" },
    ])
      expect(() => eventBody(form({ ...values, ...change }))).toThrow();
    expect(
      eventBody(form({ ...values, registration_closes_at: values.starts_at })),
    ).toMatchObject({ registration_closes_at: "2027-01-20T13:00:00.000Z" });
  });
  it("creates free/paid ticket inputs and leaves the sales window to the event", () => {
    const input = {
      name: "General",
      price: "12.34",
      quantity_total: "20",
      max_per_order: "2",
      sales_start: "2027-01-01T00:00",
      is_hidden: "on",
    };
    expect(ticketBody(form(input))).toMatchObject({
      price_amount: 1234,
      quantity_total: 20,
      is_hidden: true,
      // Per-ticket dates are cleared on save; the event's ticket sales window applies.
      sales_start: null,
      sales_end: null,
    });
  });
  it("preserves filters safely and bounds offsets", () => {
    const q = new URLSearchParams(
      searchQuery(
        new URLSearchParams({
          q: "a & b",
          city: "Astana",
          date_to: "2027-01-20",
          offset: "-1",
        }),
      ),
    );
    expect(q.get("q")).toBe("a & b");
    expect(q.get("offset")).toBe("0");
    expect(q.get("date_to")).toBe(dayBoundary("2027-01-20", true));
  });
  it("never presents a draft, cancellation, inactive paid sale or sold out ticket as purchasable", () => {
    const e = {
      status: "published",
      ends_at: "2027-01-21T00:00:00Z",
      paid_sales_status: "disabled",
    } as Event;
    const a = { available: 1, on_sale: true, price_amount: 0 } as Availability;
    const now = Date.parse("2027-01-01T00:00:00Z");
    expect(salesState(e, a, now)).toBe("onSale");
    expect(salesState({ ...e, status: "cancelled" }, a, now)).toBe("cancelled");
    expect(salesState(e, { ...a, available: 0 }, now)).toBe("soldOut");
    expect(salesState(e, { ...a, price_amount: 100 }, now)).toBe("paidBlocked");
    expect(
      salesState(
        { ...e, registration_opens_at: "2027-01-10T00:00:00Z" },
        a,
        now,
      ),
    ).toBe("notOpen");
  });
  it("calls a ticket sold out only when it is on sale with nothing left", () => {
    const e = {
      status: "published",
      starts_at: "2027-01-20T00:00:00Z",
      ends_at: "2027-01-21T00:00:00Z",
      paid_sales_status: "disabled",
    } as Event;
    const now = Date.parse("2027-01-01T00:00:00Z");
    // Public availability reports 0 for any ticket that is off sale.
    const closed = {
      available: 0,
      on_sale: false,
      price_amount: 0,
    } as Availability;
    expect(salesState(e, { ...closed, price_amount: 10000 }, now)).toBe(
      "paidBlocked",
    );
    expect(salesState(e, closed, now)).toBe("unavailable");
    expect(salesState(e, closed, Date.parse("2027-01-20T12:00:00Z"))).toBe(
      "ended",
    );
    expect(salesState(e, { ...closed, on_sale: true }, now)).toBe("soldOut");
  });
});

describe("discovery helpers", () => {
  it("turns local calendar days into instants for the viewer's zone", () => {
    // Almaty is UTC+5, so getTimezoneOffset() reports -300.
    expect(dayBoundary("2027-01-20", false, -300)).toBe("2027-01-19T19:00:00.000Z");
    expect(dayBoundary("2027-01-20", true, -300)).toBe("2027-01-20T18:59:59.999Z");
    expect(dayBoundary("2027-01-20", false, 0)).toBe("2027-01-20T00:00:00.000Z");
    expect(dayBoundary("not-a-day", false, 0)).toBe("not-a-day");
  });
  it("computes today, weekend and month shortcuts from local dates", () => {
    const wednesday = new Date(2027, 0, 20, 15);
    expect(quickRange("today", wednesday)).toEqual({
      date_from: "2027-01-20",
      date_to: "2027-01-20",
    });
    expect(quickRange("weekend", wednesday)).toEqual({
      date_from: "2027-01-23",
      date_to: "2027-01-24",
    });
    expect(quickRange("weekend", new Date(2027, 0, 23))).toEqual({
      date_from: "2027-01-23",
      date_to: "2027-01-24",
    });
    expect(quickRange("weekend", new Date(2027, 0, 24))).toEqual({
      date_from: "2027-01-24",
      date_to: "2027-01-24",
    });
    expect(quickRange("month", wednesday)).toEqual({
      date_from: "2027-01-20",
      date_to: "2027-01-31",
    });
    expect(
      activeRange(new URLSearchParams(quickRange("weekend", wednesday)), wednesday),
    ).toBe("weekend");
    expect(
      activeRange(new URLSearchParams({ date_from: "2027-01-01" }), wednesday),
    ).toBeUndefined();
  });
  it("gives each category a stable cover tone and none to blank categories", () => {
    expect(categoryTone("concert")).toBe(categoryTone(" Concert "));
    expect(categoryTone("concert")).toBeGreaterThanOrEqual(1);
    expect(categoryTone("concert")).toBeLessThanOrEqual(6);
    expect(categoryTone("")).toBe(0);
  });
  it("summarises price and stock from public availability", () => {
    const row = (price_amount: number, available: number): Availability => ({
      ticket_type_id: crypto.randomUUID(),
      name: "x",
      price_amount,
      currency: "KZT",
      available,
      on_sale: true,
    });
    expect(offerSummary([])).toBeNull();
    expect(offerSummary([row(0, 50)])).toEqual({
      minPrice: 0,
      minPaidPrice: null,
      priceVaries: false,
      allFree: true,
      soldOut: false,
      onSale: true,
      remaining: 50,
    });
    // Free and paid mixed: the cheapest paid price is still known.
    expect(offerSummary([row(0, 5), row(300_000, 5)])).toMatchObject({
      minPrice: 0,
      minPaidPrice: 300_000,
    });
    // The cheapest type is sold out, so the lowest price still on offer wins.
    expect(offerSummary([row(100_000, 0), row(250_000, 4)])).toMatchObject({
      minPrice: 250_000,
      priceVaries: false,
      allFree: false,
      remaining: 4,
    });
    expect(
      offerSummary([row(500_000, 3), row(900_000, 3)]),
    ).toMatchObject({ minPrice: 500_000, priceVaries: true });
    expect(offerSummary([row(500_000, 0)])).toMatchObject({
      minPrice: 500_000,
      soldOut: true,
    });
    // Published but not on sale yet (sales not open, paid sales inactive): stock is real,
    // so this is not "sold out".
    expect(
      offerSummary([{ ...row(500_000, 40), on_sale: false }]),
    ).toMatchObject({ soldOut: false, onSale: false, remaining: 40 });
  });
});
