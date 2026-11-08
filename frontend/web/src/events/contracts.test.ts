import { expect, it } from "vitest";
import { parseTicketTypes, parseVenues } from "./contracts";
const venue = { id: "venue", name: "Hall", address: "1 Abay", city: "Almaty" };
it("accepts live venue arrays and paginated fixtures without offering another page of a complete array", () => {
  const values = Array.from({ length: 101 }, (_, i) => ({
    ...venue,
    id: `venue-${i}`,
  }));
  const array = parseVenues(values);
  expect(array.items).toHaveLength(101);
  expect(array.offset + array.limit).toBe(array.total);
  expect(
    parseVenues({ items: [venue], total: 2, limit: 1, offset: 0 }).total,
  ).toBe(2);
  expect(parseVenues([]).items).toEqual([]);
  expect(() => parseVenues({ items: null })).toThrow();
  expect(() => parseVenues([null])).toThrow();
});
it("normalizes live P3 decimal prices and inventory counters without changing money units", () => {
  const row = {
    id: "ticket",
    name: "Paid",
    description: null,
    quantity_total: 10,
    max_per_order: 2,
    is_hidden: false,
    price_amount: "2500.00",
    qty_available: 8,
    qty_reserved: 1,
    qty_sold: 2,
    qty_refunded: 0,
    qty_checked_in: 1,
  };
  expect(parseTicketTypes([row]).items[0]).toMatchObject({
    price_amount: 2500,
    available: 8,
    reserved: 1,
    sold: 2,
    refunded: 0,
    checked_in: 1,
  });
  expect(() => parseTicketTypes([{ ...row, price_amount: "25.01" }])).toThrow();
});
