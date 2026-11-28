import { describe, expect, it } from "vitest";
import type { Choice, OrderBody } from "../../../src/features/checkout/model";
import type { Seat } from "../../../src/features/seating/model";
import {
  canAddSeat,
  hallCategories,
  hallSections,
  maxSeats,
  offerForSeat,
  parseSeatCart,
  seatGroups,
  withSeats,
} from "../../../src/features/seating/booking";

const seat = (id: string, row: string, label: string, category: string | null, section = "Parterre"): Seat => ({
  id, section, row, label, price_category: category, accessible: false, status: "available",
});
const choice = (id: string, category: string | null, extra: Partial<Choice> = {}): Choice => ({
  id, name: id, free: false, price: 500_000, available: 50, open: true, limit: 4, priceCategory: category, ...extra,
});

describe("seat booking", () => {
  it("lays the hall out by section and row with seats in number order", () => {
    const seats = [seat("b1", "B", "1", "standard"), seat("a10", "A", "10", "standard"),
      seat("v1", "V1", "1", "vip", "VIP"), seat("a2", "A", "2", "standard")];
    const hall = hallSections(seats);
    expect(hall.map((s) => s.name)).toEqual(["Parterre", "VIP"]);
    expect(hall[0]!.rows.map((r) => r.label)).toEqual(["A", "B"]);
    expect(hall[0]!.rows[0]!.seats.map((s) => s.label)).toEqual(["2", "10"]);
    expect(hallCategories(seats)).toEqual(["standard", "vip"]);
  });

  it("sells each seat as the open ticket type of its price category", () => {
    const choices = [choice("std", "Standard"), choice("vip", "vip"), choice("closed", "balcony", { open: false })];
    expect(offerForSeat({ price_category: "standard" }, choices)?.id).toBe("std");
    expect(offerForSeat({ price_category: "balcony" }, choices)).toBeUndefined();
    const groups = seatGroups([seat("a1", "A", "1", "standard"), seat("v1", "V", "1", "vip"), seat("a2", "A", "2", "standard")], choices);
    expect(groups.map((g) => [g.choice.id, g.seats.length])).toEqual([["std", 2], ["vip", 1]]);
  });

  it("stops at the ticket type's limit and the booking cap", () => {
    const choices = [choice("std", "standard", { limit: 2 })];
    const two = [seat("a1", "A", "1", "standard"), seat("a2", "A", "2", "standard")];
    expect(canAddSeat(seat("a3", "A", "3", "standard"), two, choices)).toBe(false);
    expect(canAddSeat(seat("a3", "A", "3", "standard"), two.slice(0, 1), choices)).toBe(true);
    const many = Array.from({ length: maxSeats }, (_, i) => seat(`s${i}`, "A", String(i), "x"));
    expect(canAddSeat(seat("z", "A", "99", "x"), many, [choice("x", "x", { limit: 100 })])).toBe(false);
  });

  it("puts held seats and holds into the order body", () => {
    const now = Date.parse("2026-11-28T10:00:00Z");
    const cart = parseSeatCart({
      eventId: "e", holdIds: ["h1"], expiresAt: "2026-11-28T10:10:00Z",
      items: [{ ticket_type_id: "std", quantity: 2, seat_ids: ["a1", "a2"] }],
      seats: [{ id: "a1", section: "P", row: "A", label: "1" }, { id: "a2", section: "P", row: "A", label: "2" }],
    }, "e", now)!;
    expect(cart).not.toBeNull();
    expect(parseSeatCart({ ...cart, expiresAt: "2026-11-28T09:00:00Z" }, "e", now)).toBeNull();
    expect(parseSeatCart(cart, "other", now)).toBeNull();
    const body = { event_id: "e", items: [{ ticket_type_id: "std", quantity: 2, seat_ids: [] }],
      attendees: [], hold_ids: [], promo_code: null } as unknown as OrderBody;
    const seated = withSeats(body, cart);
    expect(seated.items[0]!.seat_ids).toEqual(["a1", "a2"]);
    expect(seated.hold_ids).toEqual(["h1"]);
    expect(() => withSeats({ ...body, items: [{ ticket_type_id: "std", quantity: 1, seat_ids: [] }] } as OrderBody, cart)).toThrow();
  });
});
