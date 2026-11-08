import { ApiError } from "@biletflow/shared";
import type { Session } from "@biletflow/shared";
import { parseOrder } from "./model";
import type { Order, OrderBody } from "./model";

type Recovery = { key: string; orderId?: string };
type Attempt = {
  body: OrderBody;
  serialized: string;
  key: string;
  flight?: Promise<Order>;
};
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const coordinators = new WeakMap<Session, CheckoutCoordinator>();
export function checkoutCoordinator(session: Session) {
  let coordinator = coordinators.get(session);
  if (!coordinator) {
    let storage: Store | null;
    try {
      storage = window.localStorage;
    } catch {
      storage = null;
    }
    coordinator = new CheckoutCoordinator(session, storage);
    coordinators.set(session, coordinator);
  }
  return coordinator;
}

/** PII stays in this process. Persist only the opaque attempt/order identifiers.
 * A reload with an unknown outcome cannot safely reconstruct a lost POST body:
 * P5 has no lookup-by-idempotency-key route. Keep it blocked instead of guessing. */
export class CheckoutCoordinator {
  private attempts = new Map<string, Attempt>();
  private userId: string | null;
  private session: Session;
  private storage: Store | null;
  constructor(session: Session, storage: Store | null) {
    this.session = session;
    this.storage = storage;
    this.userId = session.getSnapshot().user?.id ?? null;
    session.subscribe(() => {
      const next = session.getSnapshot().user?.id ?? null;
      if (next !== this.userId) this.attempts.clear();
      this.userId = next;
    });
  }
  private storageKey(eventId: string) {
    if (!this.userId)
      throw new ApiError(401, "session_changed", "Sign in again.");
    return `biletflow:f3:attempt:${encodeURIComponent(this.userId)}:${encodeURIComponent(eventId)}`;
  }
  recovery(eventId: string): Recovery | null {
    try {
      const raw = this.storage?.getItem(this.storageKey(eventId));
      if (!raw) return null;
      const data: unknown = JSON.parse(raw);
      if (
        !data ||
        typeof data !== "object" ||
        !("key" in data) ||
        typeof data.key !== "string" ||
        !/^[\da-f-]{36}$/i.test(data.key) ||
        ("orderId" in data && typeof data.orderId !== "string")
      )
        return { key: "unavailable" };
      return data as Recovery;
    } catch {
      return { key: "unavailable" };
    }
  }
  draft(eventId: string): OrderBody | undefined {
    const body = this.attempts.get(eventId)?.body;
    return body ? structuredClone(body) : undefined;
  }
  private persist(eventId: string, value: Recovery) {
    if (!this.storage)
      throw new ApiError(
        0,
        "storage_unavailable",
        "Recovery storage is unavailable.",
      );
    try {
      this.storage.setItem(this.storageKey(eventId), JSON.stringify(value));
    } catch {
      throw new ApiError(
        0,
        "storage_unavailable",
        "Recovery storage is unavailable.",
      );
    }
  }
  async startAnother(eventId: string) {
    const recovery = this.recovery(eventId);
    if (!recovery?.orderId)
      throw new ApiError(
        0,
        "outcome_unknown",
        "Review the existing registration first.",
      );
    const order = parseOrder(
      await this.session.request(
        `/api/v1/orders/${encodeURIComponent(recovery.orderId)}`,
      ),
    );
    if (
      ![
        "free_confirmed",
        "paid",
        "cancelled",
        "failed",
        "expired",
        "refunded",
      ].includes(order.status)
    )
      throw new ApiError(
        409,
        "outcome_unknown",
        "The existing order is still pending.",
      );
    try {
      this.storage!.removeItem(this.storageKey(eventId));
    } catch {
      throw new ApiError(
        0,
        "storage_unavailable",
        "Recovery storage is unavailable.",
      );
    }
    this.attempts.delete(eventId);
  }
  submit(body: OrderBody): Promise<Order> {
    const eventId = body.event_id;
    const serialized = JSON.stringify(body);
    let attempt = this.attempts.get(eventId);
    if (attempt?.flight) return attempt.flight;
    if (attempt && attempt.serialized !== serialized)
      return Promise.reject(
        new ApiError(
          409,
          "outcome_unknown",
          "Resolve the previous registration first.",
        ),
      );
    if (!attempt && this.recovery(eventId))
      return Promise.reject(
        new ApiError(
          409,
          "outcome_unknown",
          "Check My orders for the previous registration.",
        ),
      );
    if (!attempt) {
      attempt = {
        body: structuredClone(body),
        serialized,
        key: crypto.randomUUID(),
      };
      try {
        this.persist(eventId, { key: attempt.key });
      } catch (error) {
        return Promise.reject(error);
      }
      this.attempts.set(eventId, attempt);
    }
    const current = attempt;
    const userId = this.userId;
    current.flight = (async () => {
      try {
        const order = parseOrder(
          await this.session.request("/api/v1/orders", {
            method: "POST",
            headers: { "Idempotency-Key": current.key },
            body: current.body,
          }),
        );
        if (userId !== this.userId)
          throw new ApiError(401, "session_changed", "The session changed.");
        // If persistence is unavailable now, preserve the in-memory attempt and
        // still show the confirmed server order. A reload remains safely blocked.
        try {
          this.persist(eventId, { key: current.key, orderId: order.id });
        } catch {
          /* no false retry */
        }
        return order;
      } catch (error) {
        const definitelyRejected =
          error instanceof ApiError &&
          error.status >= 400 &&
          error.status < 500 &&
          !["session_changed", "request_not_replayed", "key_reused"].includes(
            error.code,
          );
        if (definitelyRejected && userId === this.userId) {
          this.attempts.delete(eventId);
          try {
            this.storage?.removeItem(this.storageKey(eventId));
          } catch {
            /* fail closed on the next read */
          }
        }
        throw error;
      } finally {
        current.flight = undefined;
      }
    })();
    return current.flight;
  }
}
