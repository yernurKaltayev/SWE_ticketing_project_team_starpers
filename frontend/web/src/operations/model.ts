import { ApiError } from "@biletflow/shared";
import type { ApiRequestOptions } from "@biletflow/shared";
import { parseOrder, parsePage, invalidResponse } from "../checkout/model";
import type { Order } from "../checkout/model";
export type { Order };
export type Request = <T>(
  path: string,
  options?: ApiRequestOptions,
) => Promise<T>;
export type Refund = {
  id: string;
  order_id: string;
  amount: number;
  currency: "KZT";
  reason: string;
  status: "pending" | "completed" | "failed";
  completed_at: string | null;
};
export type Attendee = {
  id: string;
  order_id: string;
  full_name: string;
  email: string;
  ticket_type: string;
  ticket_status: string;
};
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const strings = (v: Record<string, unknown>, keys: string[]) =>
  keys.every((k) => typeof v[k] === "string");
export function parseRefund(v: unknown): Refund {
  if (
    !record(v) ||
    !strings(v, ["id", "order_id", "reason"]) ||
    v.currency !== "KZT" ||
    !Number.isSafeInteger(v.amount) ||
    Number(v.amount) < 0 ||
    !["pending", "completed", "failed"].includes(String(v.status)) ||
    !(
      v.completed_at === null ||
      (typeof v.completed_at === "string" &&
        Number.isFinite(Date.parse(v.completed_at)))
    )
  )
    return invalidResponse();
  return v as Refund;
}
export function parseAttendee(v: unknown): Attendee {
  if (
    !record(v) ||
    !strings(v, [
      "id",
      "order_id",
      "full_name",
      "email",
      "ticket_type",
      "ticket_status",
    ])
  )
    return invalidResponse();
  return v as Attendee;
}
export const parseAttendees = (v: unknown) => parsePage(v, parseAttendee);
export const parseRefunds = (v: unknown) => parsePage(v, parseRefund);
export const eventRoot = (id: string) =>
  `/api/v1/events/${encodeURIComponent(id)}`;
/** P5 has no order-search API. Read a complete bounded snapshot before filtering
 * or calculating cancellation impact. Never present/export a truncated result. */
export async function loadOrders(
  request: Request,
  eventId: string,
  signal?: AbortSignal,
): Promise<Order[]> {
  const rows: Order[] = [];
  let total: number | undefined;
  for (let offset = 0; offset <= 10000;) {
    const page = parsePage(
      await request(`${eventRoot(eventId)}/orders?limit=100&offset=${offset}`, {
        signal,
      }),
      parseOrder,
    );
    if (
      page.offset !== offset ||
      page.limit < 1 ||
      page.total > 10000 ||
      (total !== undefined && page.total !== total)
    )
      throw new ApiError(
        409,
        "snapshot_changed",
        "Order snapshot changed or exceeds the client limit.",
      );
    total = page.total;
    rows.push(...page.items);
    if (new Set(rows.map((r) => r.id)).size !== rows.length)
      throw new ApiError(409, "snapshot_changed", "Order snapshot changed.");
    if (rows.length === total) return rows;
    if (!page.items.length || rows.length > total) return invalidResponse();
    offset += page.items.length;
  }
  return invalidResponse();
}
export function filterOrders(rows: Order[], q: string, status: string) {
  const needle = q.trim().toLocaleLowerCase();
  return rows.filter(
    (o) =>
      (!status || o.status === status) &&
      (!needle ||
        [
          o.id,
          o.order_number,
          ...o.tickets.flatMap((t) => [
            t.ticket_number,
            t.attendee_name,
            t.ticket_type,
          ]),
        ].some((s) => s.toLocaleLowerCase().includes(needle))),
  );
}
export function impact(rows: Order[]) {
  const paid = rows.filter((o) => o.status === "paid");
  const amount = paid.reduce((n, o) => n + o.total, 0);
  if (!Number.isSafeInteger(amount)) return invalidResponse();
  return {
    free: rows.filter((o) => o.status === "free_confirmed").length,
    paid: paid.length,
    pending: rows.filter((o) => o.status === "pending").length,
    amount,
  };
}
export function canCancel(o: Order) {
  return (
    ["free_confirmed", "pending"].includes(o.status) &&
    !o.tickets.some((t) => t.status === "checked_in")
  );
}
export function canRefund(o: Order) {
  return (
    o.status === "paid" && !o.tickets.some((t) => t.status === "checked_in")
  );
}
export function csvCell(v: unknown) {
  let s = String(v ?? "");
  if (/^[\s]*[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function ordersCsv(rows: Order[]) {
  return (
    "\ufeff" +
    [
      [
        "order_id",
        "order_number",
        "status",
        "total_tiyn",
        "currency",
        "ticket_count",
      ],
      ...rows.map((o) => [
        o.id,
        o.order_number,
        o.status,
        o.total,
        o.currency,
        o.items.reduce((n, i) => n + i.quantity, 0),
      ]),
    ]
      .map((r) => r.map(csvCell).join(","))
      .join("\r\n")
  );
}
export function safeOffset(v: string | null) {
  return v && /^\d+$/.test(v) && Number.isSafeInteger(Number(v))
    ? Number(v)
    : 0;
}
export type Action = {
  kind: "cancel" | "refund" | "event";
  target: string;
  refundId?: string;
};
export type Journal = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export class OperationJournal {
  private key: string;
  constructor(privateStorage: Journal, userId: string, eventId: string) {
    this.storage = privateStorage;
    this.key = `biletflow:f6:${userId}:${eventId}`;
  }
  private storage: Journal;
  read(): Action | null {
    try {
      const raw = this.storage.getItem(this.key);
      if (!raw) return null;
      const v: unknown = JSON.parse(raw);
      if (
        !record(v) ||
        !["cancel", "refund", "event"].includes(String(v.kind)) ||
        typeof v.target !== "string" ||
        (v.refundId !== undefined && typeof v.refundId !== "string")
      )
        throw new Error();
      return v as Action;
    } catch {
      throw new ApiError(
        0,
        "storage_unavailable",
        "Operation recovery is unavailable.",
      );
    }
  }
  begin(action: Action) {
    if (this.read())
      throw new ApiError(
        409,
        "outcome_unknown",
        "Check existing operation first.",
      );
    this.retain(action);
  }
  retain(action: Action) {
    try {
      const raw = JSON.stringify(action);
      this.storage.setItem(this.key, raw);
      if (this.storage.getItem(this.key) !== raw) throw new Error();
    } catch {
      throw new ApiError(
        0,
        "storage_unavailable",
        "Cannot retain operation recovery.",
      );
    }
  }
  clear() {
    this.storage.removeItem(this.key);
  }
}
export function definiteFailure(e: unknown) {
  return (
    e instanceof ApiError &&
    e.status >= 400 &&
    e.status < 500 &&
    e.status !== 408
  );
}
export function resolved(
  action: Action,
  orders: Order[],
  refunds: Refund[],
  eventStatus: string,
) {
  if (action.kind === "event") return eventStatus === "cancelled";
  const order = orders.find((o) => o.id === action.target);
  if (action.kind === "cancel") return order?.status === "cancelled";
  return (
    order?.status === "refunded" ||
    refunds.some(
      (r) =>
        r.order_id === action.target &&
        r.id === action.refundId &&
        ["completed", "failed"].includes(r.status),
    )
  );
}
