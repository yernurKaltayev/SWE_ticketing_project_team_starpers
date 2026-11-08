import { expect, it, vi } from "vitest";
import { ApiError } from "@biletflow/shared";
import type { Session } from "@biletflow/shared";
import { CheckoutCoordinator } from "./attempt";
import type { Order, OrderBody } from "./model";
const body: OrderBody = {
  event_id: "event",
  items: [{ ticket_type_id: "ticket", quantity: 1, seat_ids: [] }],
  attendees: [{ full_name: "Private Person", email: "private@example.com" }],
  hold_ids: [],
  promo_code: null,
};
const order: Order = {
  id: "order",
  order_number: "O1",
  status: "free_confirmed",
  subtotal: 0,
  discount_amount: 0,
  processing_fee: 0,
  total: 0,
  currency: "KZT",
  is_simulated: false,
  items: [],
  tickets: [],
};
function setup() {
  const storage = new Map<string, string>();
  const store = {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => {
      storage.set(k, v);
    },
    removeItem: (k: string) => {
      storage.delete(k);
    },
  };
  let userId = "first-user";
  const listeners: (() => void)[] = [];
  const request = vi.fn<Session["request"]>();
  const session = {
    request,
    getSnapshot: () => ({ user: { id: userId } }),
    subscribe: (f: () => void) => {
      listeners.push(f);
      return () => undefined;
    },
  } as unknown as Session;
  return {
    request,
    session,
    store,
    storage,
    coordinator: new CheckoutCoordinator(session, store),
    switchAccount: () => {
      userId = "second-user";
      listeners.forEach((f) => f());
    },
  };
}

it("deduplicates concurrent submission and persists only opaque IDs", async () => {
  const { request, coordinator, storage } = setup();
  let finish!: (v: Order) => void;
  request.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve as typeof finish;
      }),
  );
  const first = coordinator.submit(body),
    second = coordinator.submit(body);
  expect(request).toHaveBeenCalledTimes(1);
  expect(first).toBe(second);
  expect([...storage.values()].join()).not.toContain("Private Person");
  expect([...storage.values()].join()).not.toContain("private@example.com");
  finish(order);
  await expect(first).resolves.toEqual(order);
  expect(coordinator.recovery("event")?.orderId).toBe("order");
});

it("retries uncertain outcomes with the identical body/key and prevents edited retries", async () => {
  const { request, coordinator } = setup();
  request.mockRejectedValueOnce(
    new ApiError(0, "network_error", "Connection lost"),
  );
  await expect(coordinator.submit(body)).rejects.toMatchObject({
    code: "network_error",
  });
  const changed = {
    ...body,
    attendees: [{ full_name: "Changed", email: "changed@example.com" }],
  };
  await expect(coordinator.submit(changed)).rejects.toMatchObject({
    code: "outcome_unknown",
  });
  request.mockResolvedValueOnce(order);
  await coordinator.submit(body);
  expect(request.mock.calls[0]?.[1]?.headers).toEqual(
    request.mock.calls[1]?.[1]?.headers,
  );
  expect(request.mock.calls[0]?.[1]?.body).toEqual(
    request.mock.calls[1]?.[1]?.body,
  );
  expect(request).toHaveBeenCalledTimes(2);
});

it("blocks a new order after a reload loses an uncertain attempt body", async () => {
  const { request, coordinator, session, store } = setup();
  request.mockRejectedValueOnce(
    new ApiError(503, "database_unavailable", "Unavailable"),
  );
  await expect(coordinator.submit(body)).rejects.toThrow();
  const restarted = new CheckoutCoordinator(session, store);
  expect(restarted.draft("event")).toBeUndefined();
  await expect(restarted.submit(body)).rejects.toMatchObject({
    code: "outcome_unknown",
  });
  expect(request).toHaveBeenCalledTimes(1);
});

it("allows correction after a definite server rejection, using a new attempt key", async () => {
  const { request, coordinator } = setup();
  request.mockRejectedValueOnce(
    new ApiError(409, "inventory_unavailable", "Sold out"),
  );
  await expect(coordinator.submit(body)).rejects.toThrow();
  expect(coordinator.recovery("event")).toBeNull();
  request.mockResolvedValueOnce(order);
  await coordinator.submit(body);
  expect(request.mock.calls[0]?.[1]?.headers).not.toEqual(
    request.mock.calls[1]?.[1]?.headers,
  );
});

it("clears attendee details on account change and keeps recovery scoped to its owner", async () => {
  const { request, coordinator, switchAccount } = setup();
  request.mockRejectedValueOnce(new ApiError(0, "network_error", "Lost"));
  await expect(coordinator.submit(body)).rejects.toThrow();
  switchAccount();
  expect(coordinator.draft("event")).toBeUndefined();
  expect(coordinator.recovery("event")).toBeNull();
});

it("does not dispatch a write without recovery storage and treats malformed success as uncertain", async () => {
  const { request, session, coordinator } = setup();
  await expect(
    new CheckoutCoordinator(session, null).submit(body),
  ).rejects.toMatchObject({ code: "storage_unavailable" });
  expect(request).not.toHaveBeenCalled();
  request.mockResolvedValueOnce({ unexpected: "reply" });
  await expect(coordinator.submit(body)).rejects.toMatchObject({
    code: "invalid_response",
  });
  expect(coordinator.recovery("event")).not.toBeNull();
});

it("requires a confirmed server result before starting another registration", async () => {
  const { request, coordinator } = setup();
  request.mockResolvedValueOnce(order);
  await coordinator.submit(body);
  request.mockResolvedValueOnce({ ...order, status: "pending" });
  await expect(coordinator.startAnother("event")).rejects.toMatchObject({
    code: "outcome_unknown",
  });
  request.mockResolvedValueOnce(order);
  await coordinator.startAnother("event");
  expect(coordinator.recovery("event")).toBeNull();
});
