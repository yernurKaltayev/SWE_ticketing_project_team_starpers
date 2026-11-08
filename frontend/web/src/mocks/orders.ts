import { http, HttpResponse } from "msw";
import { mockCurrentUser } from "./auth";
import {
  mockCheckoutEvent,
  mockConfirmCheckout,
  mockReleaseCheckout,
} from "./events";
import type { Order, OrderBody, Ticket } from "../checkout/model";
import { mockTicketPng, mockTicketPdf } from "./ticket-assets";

const orders = new Map<string, { owner: string; value: Order }>();
const attempts = new Map<string, { body: string; id: string }>();
const awaiting = new Map<string, { eventId: string; tickets: Ticket[] }>();
export function mockOrder(request: Request, id: string) {
  const user = mockCurrentUser(request);
  if (user instanceof Response) return user;
  const order = orders.get(id);
  return order?.owner === user.id ? order.value : error(404, "order_not_found");
}
export function mockSettleOrder(id: string, success: boolean) {
  const row = orders.get(id);
  const held = awaiting.get(id);
  if (!row || !held || row.value.status !== "pending") return;
  row.value.status = success ? "paid" : "failed";
  if (success) row.value.tickets = held.tickets;
  else mockReleaseCheckout(held.eventId, row.value.items);
  awaiting.delete(id);
}
const headers = {
  "X-Request-ID": "f3-mock",
  "Cache-Control": "private, no-store",
};
export function resetOrderMocks() {
  orders.clear();
  attempts.clear();
  awaiting.clear();
}
const error = (status: number, code: string) =>
  HttpResponse.json(
    { code, message: "Development fixture response.", details: null },
    { status, headers },
  );
function page<T>(items: T[], request: Request) {
  const params = new URL(request.url).searchParams;
  const limit = Math.max(1, Math.min(100, Number(params.get("limit")) || 20));
  const offset = Math.max(0, Number(params.get("offset")) || 0);
  return {
    items: items.slice(offset, offset + limit),
    total: items.length,
    limit,
    offset,
  };
}
function ownTickets(request: Request): Ticket[] | Response {
  const user = mockCurrentUser(request);
  if (user instanceof Response) return user;
  return [...orders.values()]
    .filter((r) => r.owner === user.id)
    .flatMap((r) => r.value.tickets);
}
function ownTicket(request: Request, id: string): Ticket | Response {
  const list = ownTickets(request);
  return list instanceof Response
    ? list
    : (list.find((ticket) => ticket.id === id) ??
        error(404, "ticket_not_found"));
}
export const orderHandlers = [
  http.post("*/api/v1/orders", async ({ request }) => {
    const user = mockCurrentUser(request);
    if (user instanceof Response) return user;
    const key = request.headers.get("Idempotency-Key");
    if (!key) return error(422, "invalid_idempotency_key");
    const body = (await request.json()) as OrderBody;
    const scoped = `${user.id}:${key}`;
    const previous = attempts.get(scoped);
    if (previous)
      return previous.body === JSON.stringify(body)
        ? HttpResponse.json(orders.get(previous.id)!.value, {
            status: 201,
            headers,
          })
        : error(409, "key_reused");
    const context = mockCheckoutEvent(body.event_id);
    if (
      !context ||
      context.event.status !== "published" ||
      context.event.seating_mode !== "general_admission" ||
      Date.parse(context.event.starts_at) <= Date.now()
    )
      return error(409, "registration_closed");
    if (
      !Array.isArray(body.items) ||
      !Array.isArray(body.attendees) ||
      !body.items.length ||
      body.items.reduce((sum, i) => sum + i.quantity, 0) !==
        body.attendees.length
    )
      return error(422, "validation_error");
    for (const item of body.items) {
      const ticket = context.tickets.find((v) => v.id === item.ticket_type_id);
      if (
        !ticket ||
        (ticket.price_amount !== 0 &&
          context.event.paid_sales_status !== "active") ||
        ticket.is_hidden ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > Math.min(ticket.max_per_order, ticket.available)
      )
        return error(409, "inventory_unavailable");
    }
    const id = crypto.randomUUID();
    const value: Order = {
      id,
      order_number: `MOCK-${orders.size + 1}`,
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
    let index = 0;
    for (const item of body.items) {
      const type = context.tickets.find((v) => v.id === item.ticket_type_id)!;
      value.items.push({
        id: crypto.randomUUID(),
        ticket_type_id: type.id,
        seat: null,
        quantity: item.quantity,
        unit_price: 0,
        line_total: 0,
      });
      for (let n = 0; n < item.quantity; n++) {
        const ticketId = crypto.randomUUID();
        value.tickets.push({
          id: ticketId,
          ticket_number: `MOCK-TICKET-${orders.size + 1}-${index + 1}`,
          event_id: body.event_id,
          ticket_type: type.name,
          attendee_name: body.attendees[index++]!.full_name,
          seat: null,
          status: "valid",
          qr_url: `/api/v1/tickets/${ticketId}/qr`,
          pdf_url: `/api/v1/tickets/${ticketId}/pdf`,
        });
      }
    }
    mockConfirmCheckout(body.event_id, body.items);
    value.subtotal = value.items.reduce((sum, item) => {
      const type = context.tickets.find((t) => t.id === item.ticket_type_id)!;
      item.unit_price = type.price_amount;
      item.line_total = item.unit_price * item.quantity;
      return sum + item.line_total;
    }, 0);
    value.total = value.subtotal;
    if (value.total > 0) {
      value.status = "pending";
      value.is_simulated = true;
      awaiting.set(id, { eventId: body.event_id, tickets: value.tickets });
      value.tickets = [];
    }
    orders.set(id, { owner: user.id, value });
    attempts.set(scoped, { body: JSON.stringify(body), id });
    return HttpResponse.json(value, { status: 201, headers });
  }),
  http.get("*/api/v1/me/orders", ({ request }) => {
    const user = mockCurrentUser(request);
    return user instanceof Response
      ? user
      : HttpResponse.json(
          page(
            [...orders.values()]
              .filter((o) => o.owner === user.id)
              .map((o) => o.value),
            request,
          ),
          { headers },
        );
  }),
  http.get("*/api/v1/orders/:id", ({ request, params }) => {
    const user = mockCurrentUser(request);
    if (user instanceof Response) return user;
    const order = orders.get(String(params.id));
    return !order
      ? error(404, "order_not_found")
      : order.owner !== user.id
        ? error(403, "forbidden")
        : HttpResponse.json(order.value, { headers });
  }),
  http.get("*/api/v1/me/tickets", ({ request }) => {
    const list = ownTickets(request);
    return list instanceof Response
      ? list
      : HttpResponse.json(page(list, request), { headers });
  }),
  http.get("*/api/v1/tickets/:id", ({ request, params }) => {
    const ticket = ownTicket(request, String(params.id));
    return ticket instanceof Response
      ? ticket
      : HttpResponse.json(ticket, { headers });
  }),
  http.get("*/api/v1/tickets/:id/qr", ({ request, params }) => {
    const ticket = ownTicket(request, String(params.id));
    return ticket instanceof Response
      ? ticket
      : new HttpResponse(mockTicketPng(), {
          headers: { ...headers, "Content-Type": "image/png" },
        });
  }),
  http.get("*/api/v1/tickets/:id/pdf", ({ request, params }) => {
    const ticket = ownTicket(request, String(params.id));
    return ticket instanceof Response
      ? ticket
      : new HttpResponse(mockTicketPdf(), {
          headers: {
            ...headers,
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${ticket.ticket_number}.pdf"`,
          },
        });
  }),
];
