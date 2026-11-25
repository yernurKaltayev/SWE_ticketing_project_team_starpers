import { describe, it, expect, vi } from "vitest";
import { ApiError } from "@biletflow/shared";
import {
  canCancel,
  canRefund,
  csvCell,
  definiteFailure,
  filterOrders,
  impact,
  loadOrders,
  OperationJournal,
  parseRefund,
  resolved,
  safeOffset,
} from "@biletflow/shared/features/operations/model";
import type { Order, Request, Action } from "@biletflow/shared/features/operations/model";
const order: Order = {
  id: "a",
  order_number: "ORDER-A",
  event_id: "event",
  status: "paid",
  subtotal: 150000,
  discount_amount: 0,
  processing_fee: 0,
  total: 150000,
  currency: "KZT",
  is_simulated: true,
  items: [
    {
      id: "item",
      ticket_type_id: "type",
      quantity: 1,
      unit_price: 150000,
      line_total: 150000,
      seat: null,
    },
  ],
  tickets: [],
};
const refund = {
  id: "refund",
  order_id: "a",
  amount: 150000,
  currency: "KZT",
  reason: "Requested",
  status: "completed",
  completed_at: "2026-11-15T00:00:00Z",
};
it("validates authoritative refund amounts/statuses without rounding", () => {
  expect(parseRefund(refund).amount).toBe(150000);
  for (const patch of [
    { amount: 1.1 },
    { amount: -1 },
    { status: "success" },
    { currency: "USD" },
    { completed_at: "bad" },
  ])
    expect(() => parseRefund({ ...refund, ...patch })).toThrow();
});
it("loads every order page before searching and rejects moving/truncated snapshots", async () => {
  const page = (rows: Order[], offset: number, total = 2) => ({
    items: rows,
    total,
    offset,
    limit: 1,
  });
  const request = vi
    .fn()
    .mockResolvedValueOnce(page([order], 0))
    .mockResolvedValueOnce(
      page([{ ...order, id: "b", order_number: "SECOND" }], 1),
    );
  const result = await loadOrders(request as Request, "event");
  expect(filterOrders(result, "second", "paid")).toHaveLength(1);
  expect(request.mock.calls[1]?.[0]).toContain("offset=1");
  for (const bad of [
    { items: [], total: 2, limit: 100, offset: 0 },
    { items: [order], total: 10001, limit: 100, offset: 0 },
  ])
    await expect(
      loadOrders(vi.fn().mockResolvedValue(bad) as Request, "event"),
    ).rejects.toThrow();
  const changing = vi
    .fn()
    .mockResolvedValueOnce(page([order], 0))
    .mockResolvedValueOnce(page([order], 1, 3));
  await expect(loadOrders(changing as Request, "event")).rejects.toThrow();
});
it("calculates event impact with integer amounts and safe terminal action gating", () => {
  expect(
    impact([
      order,
      { ...order, id: "b", status: "free_confirmed", total: 0 },
      { ...order, id: "c", status: "pending" },
    ]),
  ).toEqual({ free: 1, paid: 1, pending: 1, amount: 150000 });
  expect(canRefund(order)).toBe(true);
  expect(canCancel(order)).toBe(false);
  expect(canCancel({ ...order, status: "free_confirmed", total: 0 })).toBe(
    true,
  );
  expect(canRefund({ ...order, status: "refunded" })).toBe(false);
  const used = {
    ...order,
    tickets: [
      {
        id: "ticket",
        ticket_number: "T",
        event_id: "event",
        attendee_name: "A",
        ticket_type: "VIP",
        status: "checked_in",
        seat: null,
        qr_url: "",
        pdf_url: "",
      },
    ],
  };
  expect(canRefund(used)).toBe(false);
  expect(canCancel({ ...used, status: "free_confirmed" })).toBe(false);
});
it("quotes CSV data and neutralizes spreadsheet formulas with Cyrillic intact", () => {
  expect(csvCell('Dias,"Диас"')).toBe('"Dias,""Диас"""');
  expect(csvCell(" =HYPERLINK(1)")).toBe('"\' =HYPERLINK(1)"');
  expect(csvCell("Қазақ")).toBe('"Қазақ"');
  expect(safeOffset("-1")).toBe(0);
  expect(safeOffset("NaN")).toBe(0);
  expect(safeOffset("20")).toBe(20);
});
describe("uncertain mutation recovery", () => {
  const action: Action = { kind: "refund", target: "a" };
  function memory() {
    const data = new Map<string, string>();
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        data.set(k, v);
      },
      removeItem: (k: string) => {
        data.delete(k);
      },
    };
  }
  it("retains only opaque operation identity and scopes it by user/event", () => {
    const storage = memory();
    const a = new OperationJournal(storage, "organizer", "event");
    a.begin(action);
    expect(a.read()).toEqual(action);
    expect(() => a.begin(action)).toThrow();
    expect(new OperationJournal(storage, "other", "event").read()).toBeNull();
    a.clear();
    expect(a.read()).toBeNull();
  });
  it("fails closed for corrupt or unavailable recovery storage", () => {
    const unavailable = {
      getItem: () => {
        throw new Error();
      },
      setItem: () => {},
      removeItem: () => {},
    };
    expect(() =>
      new OperationJournal(unavailable, "a", "e").begin(action),
    ).toThrow();
    expect(() =>
      new OperationJournal(
        { ...unavailable, getItem: () => "broken" },
        "a",
        "e",
      ).read(),
    ).toThrow();
  });
  it("only clears uncertainty after authoritative terminal state, never elapsed time", () => {
    expect(resolved(action, [order], [], "published")).toBe(false);
    expect(
      resolved(action, [{ ...order, status: "refunded" }], [], "published"),
    ).toBe(true);
    expect(
      resolved(
        action,
        [order],
        [parseRefund({ ...refund, status: "pending", completed_at: null })],
        "published",
      ),
    ).toBe(false);
    expect(resolved({ kind: "event", target: "e" }, [], [], "cancelled")).toBe(
      true,
    );
    expect(definiteFailure(new ApiError(409, "refund_failed", "Refused"))).toBe(
      true,
    );
    expect(definiteFailure(new ApiError(408, "timeout", "Timeout"))).toBe(
      false,
    );
    expect(definiteFailure(new Error("network"))).toBe(false);
  });
});
it("does not resolve an uncertain new refund using an unrelated historical failed attempt", () => {
  const failed = parseRefund({
    ...refund,
    status: "failed",
    completed_at: null,
  });
  expect(
    resolved({ kind: "refund", target: "a" }, [order], [failed], "published"),
  ).toBe(false);
  expect(
    resolved(
      { kind: "refund", target: "a", refundId: failed.id },
      [order],
      [failed],
      "published",
    ),
  ).toBe(true);
});
