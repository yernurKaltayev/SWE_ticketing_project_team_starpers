import { describe, expect, it } from "vitest";
import {
  eventBody,
  parsePrice,
  priceInput,
  salesState,
  searchQuery,
  ticketBody,
  toInstant,
  zonedInput,
} from "./model";
import type { Event, Availability } from "./model";
function form(values: Record<string, string | undefined>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) { if (v !== undefined) f.set(k, v); }
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
    ])
      expect(() => eventBody(form({ ...values, ...change }))).toThrow();
  });
  it("creates free/paid ticket inputs with hidden and sales-window semantics", () => {
    const input = {
      name: "General",
      price: "12.34",
      quantity_total: "20",
      max_per_order: "2",
      sales_start: "2027-01-01T00:00",
      is_hidden: "on",
    };
    expect(ticketBody(form(input), "Asia/Almaty")).toMatchObject({
      price_amount: 1234,
      quantity_total: 20,
      is_hidden: true,
      sales_start: "2026-12-31T19:00:00.000Z",
    });
    expect(() =>
      ticketBody(
        form({ ...input, sales_end: "2026-12-01T00:00" }),
        "Asia/Almaty",
      ),
    ).toThrow();
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
    expect(q.get("date_to")).toBe("2027-01-20T23:59:59.999Z");
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
});
