import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@biletflow/shared";
import {
  categoryMatches,
  HoldController,
  parseSeatMap,
  parseHold,
  remainingSeconds,
  selection,
} from "./model";
import type { Request, SeatMap, SeatOffer, Hold } from "./model";
const map: SeatMap = {
  event_id: "event",
  venue_id: "venue",
  layout_id: "layout",
  seats: [
    {
      id: "seat",
      section: "VIP",
      row: "V1",
      label: "1",
      price_category: "vip",
      accessible: true,
      status: "available",
    },
  ],
};
const offer: SeatOffer = {
  id: "ticket",
  name: "VIP",
  category: "vip",
  priceTiyn: 150000,
  limit: 2,
};
const hold: Hold = {
  id: "hold",
  event_id: "event",
  seat_ids: ["seat"],
  status: "held",
  expires_at: "2099-01-01T00:00:00Z",
};
describe("P4 seating contract and hold lifecycle", () => {
  it("rejects malformed and duplicate seat responses", () => {
    expect(parseSeatMap(map)).toEqual(map);
    expect(() =>
      parseSeatMap({ ...map, seats: [...map.seats, ...map.seats] }),
    ).toThrow();
    expect(() =>
      parseSeatMap({ ...map, seats: [{ ...map.seats[0], status: "unknown" }] }),
    ).toThrow();
    expect(() =>
      parseHold({ ...hold, expires_at: "2099-01-01T00:00:00" }),
    ).toThrow();
  });
  it("matches null categories only to null and normalizes known categories", () => {
    expect(categoryMatches(null, "vip")).toBe(false);
    expect(categoryMatches(null, null)).toBe(true);
    expect(categoryMatches(" VIP ", "vip")).toBe(true);
  });
  it("rejects sold seats, mismatched categories and duplicate choices without writes", async () => {
    const req = vi.fn();
    const c = new HoldController(req as Request, "event");
    await expect(c.reserve(map, ["seat", "seat"], offer)).rejects.toThrow();
    await expect(
      c.reserve(map, ["seat"], { ...offer, category: "standard" }),
    ).rejects.toThrow();
    await expect(
      c.reserve(
        { ...map, seats: [{ ...map.seats[0]!, status: "sold" }] },
        ["seat"],
        offer,
      ),
    ).rejects.toThrow();
    expect(req).not.toHaveBeenCalled();
  });
  it("hands off the actual group ID and seat IDs, never a fabricated expiry", async () => {
    const req = vi.fn().mockResolvedValue(hold);
    const c = new HoldController(req as Request, "event");
    await c.reserve(map, ["seat"], offer);
    expect(() => c.transfer({ ...offer, id: "other" })).toThrow();
    expect(c.transfer(offer)).toEqual({
      eventId: "event",
      holdIds: ["hold"],
      expiresAt: hold.expires_at,
      items: [{ ticket_type_id: "ticket", quantity: 1, seat_ids: ["seat"] }],
    });
    c.dispose();
    expect(req).toHaveBeenCalledTimes(1);
  });
  it("blocks automatic retry after uncertain committed writes", async () => {
    const req = vi.fn().mockRejectedValue(new Error("network"));
    const c = new HoldController(req as Request, "event");
    await expect(c.reserve(map, ["seat"], offer)).rejects.toThrow();
    await expect(c.reserve(map, ["seat"], offer)).rejects.toThrow("hold_busy");
    expect(req).toHaveBeenCalledTimes(1);
  });
  it("allows reselection after a definite seat conflict", async () => {
    const req = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(409, "seats_unavailable", "Taken"))
      .mockResolvedValueOnce(hold);
    const c = new HoldController(req as Request, "event");
    await expect(c.reserve(map, ["seat"], offer)).rejects.toThrow();
    expect(c.uncertain).toBe(false);
    await c.reserve(map, ["seat"], offer);
    expect(c.hold?.id).toBe("hold");
  });
  it("keeps failed releases recoverable and only clears on success", async () => {
    const req = vi
      .fn()
      .mockResolvedValueOnce(hold)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined);
    const c = new HoldController(req as Request, "event");
    await c.reserve(map, ["seat"], offer);
    await expect(c.release()).rejects.toThrow();
    expect(c.hold).toEqual(hold);
    await c.release();
    expect(c.hold).toBeNull();
  });
  it("releases a late hold response after navigation", async () => {
    let resolve!: (v: Hold) => void;
    const req = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Hold>((r) => {
            resolve = r;
          }),
      )
      .mockResolvedValue(undefined);
    const c = new HoldController(req as Request, "event");
    const pending = c.reserve(map, ["seat"], offer);
    c.dispose();
    resolve(hold);
    await pending;
    expect(req).toHaveBeenLastCalledWith("/api/v1/events/event/holds/hold", {
      method: "DELETE",
    });
    expect(c.hold).toBeNull();
  });
  it("rejects expired or sold holds at checkout handoff", () => {
    expect(remainingSeconds(hold.expires_at, Date.parse(hold.expires_at))).toBe(
      0,
    );
    expect(() => selection(hold, offer, Date.parse(hold.expires_at))).toThrow(
      "hold_expired",
    );
    expect(() => selection({ ...hold, status: "sold" }, offer)).toThrow();
  });
});
it("prevents transfer while a release is in flight and coalesces duplicate releases", async () => {
  let finish!: () => void;
  const req = vi
    .fn()
    .mockResolvedValueOnce(hold)
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
  const c = new HoldController(req as Request, "event");
  await c.reserve(map, ["seat"], offer);
  const a = c.release();
  const b = c.release();
  expect(a).toBe(b);
  expect(() => c.transfer(offer)).toThrow("hold_unavailable");
  finish();
  await a;
  expect(req).toHaveBeenCalledTimes(2);
  expect(c.hold).toBeNull();
});
it("rejects invalid price/limit inputs before a write", async () => {
  const req = vi.fn();
  const c = new HoldController(req as Request, "event");
  for (const bad of [
    { ...offer, limit: NaN },
    { ...offer, priceTiyn: 1.1 },
    { ...offer, priceTiyn: -1 },
  ])
    await expect(c.reserve(map, ["seat"], bad)).rejects.toThrow();
  expect(req).not.toHaveBeenCalled();
});
it("coalesces rapid reserve attempts into only one POST", async () => {
  let finish!: (h: Hold) => void;
  const req = vi.fn().mockImplementation(
    () =>
      new Promise<Hold>((r) => {
        finish = r;
      }),
  );
  const c = new HoldController(req as Request, "event");
  const a = c.reserve(map, ["seat"], offer);
  await expect(c.reserve(map, ["seat"], offer)).rejects.toThrow("hold_busy");
  finish(hold);
  await a;
  expect(req).toHaveBeenCalledTimes(1);
});
