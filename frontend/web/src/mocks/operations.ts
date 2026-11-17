import { http, HttpResponse } from "msw";
import { mockCurrentUser } from "./auth";
import { mockPromoRelease } from "./promotions";
import { mockManagedEvent, mockReleaseCheckout } from "./events";
import { mockOperationsOrder, mockOperationsOrders } from "./orders";
import { csvCell } from "../operations/model";
import type { Refund } from "../operations/model";
const refunds: Refund[] = [];
export function resetOperationsMocks() {
  refunds.length = 0;
}
const fail = (status: number, code: string) =>
  HttpResponse.json(
    { code, message: "Development fixture", details: null },
    { status },
  );
function page<T>(rows: T[], request: Request) {
  const p = new URL(request.url).searchParams;
  const limit = Math.max(1, Math.min(100, Number(p.get("limit")) || 20));
  const offset = Math.max(0, Number(p.get("offset")) || 0);
  return {
    items: rows.slice(offset, offset + limit),
    total: rows.length,
    limit,
    offset,
  };
}
function cancel(id: string, refund: boolean) {
  const row = mockOperationsOrder(id)!;
  if (["cancelled", "refunded"].includes(row.value.status)) return;
  mockReleaseCheckout(row.eventId, row.value.items);
  if (!refund) mockPromoRelease(row.value.id);
  row.value.status = refund ? "refunded" : "cancelled";
  row.value.tickets.forEach((t) => {
    t.status = refund ? "refunded" : "cancelled";
  });
}
function refund(id: string, reason: string) {
  const previous = refunds.find(
    (r) => r.order_id === id && r.status === "completed",
  );
  if (previous) return previous;
  const order = mockOperationsOrder(id)!.value;
  const result: Refund = {
    id: crypto.randomUUID(),
    order_id: id,
    amount: order.total,
    currency: "KZT",
    reason,
    status: "completed",
    completed_at: new Date().toISOString(),
  };
  refunds.unshift(result);
  cancel(id, true);
  return result;
}
export const operationHandlers = [
  http.get("*/api/v1/events/:id/orders", ({ request, params }) => {
    const event = mockManagedEvent(request, String(params.id));
    if (event instanceof Response) return event;
    return HttpResponse.json(
      page(
        mockOperationsOrders(event.id).map((r) => r.value),
        request,
      ),
    );
  }),
  http.get("*/api/v1/orders/:id", ({ request, params }) => {
    const actor = mockCurrentUser(request);
    if (actor instanceof Response) return actor;
    const row = mockOperationsOrder(String(params.id));
    if (!row) return fail(404, "order_not_found");
    if (row.owner !== actor.id) {
      const allowed = mockManagedEvent(request, row.eventId);
      if (allowed instanceof Response) return allowed;
    }
    return HttpResponse.json(row.value);
  }),
  http.get("*/api/v1/events/:id/attendees", ({ request, params }) =>
    attendees(request, String(params.id), false),
  ),
  http.get("*/api/v1/events/:id/attendees.csv", ({ request, params }) =>
    attendees(request, String(params.id), true),
  ),
  http.get("*/api/v1/events/:id/refunds", ({ request, params }) => {
    const event = mockManagedEvent(request, String(params.id));
    if (event instanceof Response) return event;
    const ids = new Set(mockOperationsOrders(event.id).map((r) => r.value.id));
    return HttpResponse.json(
      page(
        refunds.filter((r) => ids.has(r.order_id)),
        request,
      ),
    );
  }),
  http.post("*/api/v1/orders/:id/cancel", ({ request, params }) => {
    const row = mockOperationsOrder(String(params.id));
    if (!row) return fail(404, "order_not_found");
    const access = mockManagedEvent(request, row.eventId);
    if (access instanceof Response) return access;
    if (!["pending", "free_confirmed", "cancelled"].includes(row.value.status))
      return fail(409, "order_not_cancellable");
    if (row.value.tickets.some((t) => t.status === "checked_in"))
      return fail(409, "already_checked_in");
    cancel(row.value.id, false);
    return HttpResponse.json(row.value);
  }),
  http.post("*/api/v1/orders/:id/refund", async ({ request, params }) => {
    const row = mockOperationsOrder(String(params.id));
    if (!row) return fail(404, "order_not_found");
    const access = mockManagedEvent(request, row.eventId);
    if (access instanceof Response) return access;
    const body = (await request.json()) as { reason: string };
    if (
      typeof body.reason !== "string" ||
      !body.reason.trim() ||
      body.reason.length > 500
    )
      return fail(422, "validation_error");
    if (!["paid", "refunded"].includes(row.value.status))
      return fail(409, "order_not_refundable");
    if (row.value.tickets.some((t) => t.status === "checked_in"))
      return fail(409, "already_checked_in");
    return HttpResponse.json(refund(row.value.id, body.reason), {
      status: 201,
    });
  }),
  http.post("*/api/v1/events/:id/cancel", ({ request, params }) => {
    const event = mockManagedEvent(request, String(params.id));
    if (event instanceof Response) return event;
    if (event.status === "cancelled") return fail(409, "event_cancelled");
    for (const row of mockOperationsOrders(event.id)) {
      if (row.value.status === "paid")
        refund(row.value.id, "Event cancelled by the organizer");
      else if (["pending", "free_confirmed"].includes(row.value.status))
        cancel(row.value.id, false);
    }
    event.status = "cancelled";
    event.paid_sales_status = "disabled";
    return HttpResponse.json(event);
  }),
];
function attendees(request: Request, eventId: string, csv: boolean) {
  const event = mockManagedEvent(request, eventId);
  if (event instanceof Response) return event;
  const p = new URL(request.url).searchParams;
  const q = (p.get("q") ?? "").toLowerCase();
  const rows = mockOperationsOrders(eventId)
    .flatMap((r) =>
      r.attendees.map((a, i) => ({
        id: a.id,
        order_id: r.value.id,
        full_name: a.full_name,
        email: a.email,
        ticket_type: a.typeName,
        ticket_status: r.value.tickets[i]?.status ?? r.value.status,
        typeId: a.typeId,
      })),
    )
    .filter(
      (a) =>
        (!q || `${a.full_name} ${a.email}`.toLowerCase().includes(q)) &&
        (!p.get("status") || a.ticket_status === p.get("status")) &&
        (!p.get("ticket_type_id") || a.typeId === p.get("ticket_type_id")),
    )
    .map((a) => ({
      id: a.id,
      order_id: a.order_id,
      full_name: a.full_name,
      email: a.email,
      ticket_type: a.ticket_type,
      ticket_status: a.ticket_status,
    }));
  if (csv)
    return new HttpResponse(
      "\ufeff" +
        [
          [
            "attendee_id",
            "order_id",
            "full_name",
            "email",
            "ticket_type",
            "ticket_status",
          ],
          ...rows.map((a) => [
            a.id,
            a.order_id,
            a.full_name,
            a.email,
            a.ticket_type,
            a.ticket_status,
          ]),
        ]
          .map((r) => r.map(csvCell).join(","))
          .join("\r\n"),
      { headers: { "Content-Type": "text/csv;charset=utf-8" } },
    );
  return HttpResponse.json(page(rows, request));
}
