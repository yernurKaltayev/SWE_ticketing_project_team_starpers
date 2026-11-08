import { http, HttpResponse } from "msw";
import { mockCurrentUser } from "./auth";
import type {
  Event,
  Page,
  Ticket,
  Venue,
  EventInput,
  TicketInput,
} from "../events/model";
const venue: Venue = {
  id: "4aab9cc5-d54c-47e8-9b53-09085463ce4c",
  name: "Demo campus auditorium",
  address: "Demo venue address",
  city: "Astana",
  lat: null,
  lng: null,
};
export const demoEventId = "04e1dfa3-c0a1-43d7-a774-32c7dc9fb419";
type Record = { value: Event; owner: string; policy?: { summary: string } };
const events = new Map<string, Record>();
const tickets = new Map<string, Ticket[]>();
export function resetEventMocks() {
  events.clear();
  tickets.clear();
  events.set(demoEventId, {
    owner: "organizer@example.com",
    value: {
      id: demoEventId,
      title: "Demo · Student technology meetup",
      description: "Demonstration event for frontend development.",
      category: "student",
      venue_id: venue.id,
      layout_id: null,
      starts_at: "2027-01-20T13:00:00Z",
      ends_at: "2027-01-20T15:00:00Z",
      timezone: "Asia/Almaty",
      visibility: "public",
      seating_mode: "general_admission",
      capacity: 100,
      registration_opens_at: null,
      registration_closes_at: null,
      status: "published",
      paid_sales_status: "disabled",
      share_token: "demo-share",
      images: [],
    },
  });
  tickets.set(demoEventId, [
    {
      id: crypto.randomUUID(),
      name: "Demo · General admission",
      description: null,
      price_amount: 0,
      quantity_total: 100,
      max_per_order: 10,
      is_hidden: false,
      price_category: null,
      sales_start: null,
      sales_end: null,
      available: 100,
      reserved: 0,
      sold: 0,
      refunded: 0,
      checked_in: 0,
    },
  ]);
}
resetEventMocks();
const fail = (status: number, code: string) =>
  HttpResponse.json(
    { code, message: "Development fixture response.", details: null },
    { status, headers: { "X-Request-ID": "f2-mock" } },
  );
function access(request: Request, record?: Record) {
  const user = mockCurrentUser(request);
  if (user instanceof Response) return user;
  if (user.role !== "organizer" || (record && record.owner !== user.email))
    return fail(403, "forbidden");
  return user;
}
function canView(request: Request, record: Record) {
  return (
    (record.value.status === "published" &&
      record.value.visibility === "public") ||
    !(access(request, record) instanceof Response)
  );
}
function page<T>(items: T[], request: Request): Page<T> {
  const p = new URL(request.url).searchParams;
  const limit = Math.max(1, Math.min(100, Number(p.get("limit")) || 20));
  const offset = Math.max(0, Number(p.get("offset")) || 0);
  return {
    items: items.slice(offset, offset + limit),
    total: items.length,
    offset,
    limit,
  };
}
const visible = (e: Event) => ({ ...e, share_token: "" });
export const eventHandlers = [
  http.get("*/api/v1/events", ({ request }) => {
    const p = new URL(request.url).searchParams;
    if (!p.has("limit")) return;
    return HttpResponse.json(
      page(
        [...events.values()]
          .map((e) => e.value)
          .filter(
            (e) =>
              e.status === "published" &&
              e.visibility === "public" &&
              (!p.get("q") ||
                `${e.title} ${e.description}`
                  .toLowerCase()
                  .includes(p.get("q")!.toLowerCase())) &&
              (!p.get("category") ||
                e.category.toLowerCase() ===
                  p.get("category")!.toLowerCase()) &&
              (!p.get("city") ||
                venue.city.toLowerCase() === p.get("city")!.toLowerCase()) &&
              (!p.get("date_from") ||
                Date.parse(e.starts_at) >= Date.parse(p.get("date_from")!)) &&
              (!p.get("date_to") ||
                Date.parse(e.starts_at) <= Date.parse(p.get("date_to")!)),
          )
          .map(visible),
        request,
      ),
    );
  }),
  http.get("*/api/v1/organizers/me/events", ({ request }) => {
    const user = access(request);
    if (user instanceof Response) return user;
    return HttpResponse.json(
      page(
        [...events.values()]
          .filter((e) => e.owner === user.email)
          .map((e) => e.value),
        request,
      ),
    );
  }),
  http.get("*/api/v1/venues", ({ request }) =>
    HttpResponse.json(page([venue], request)),
  ),
  http.get("*/api/v1/venues/:id", ({ params }) =>
    params.id === venue.id
      ? HttpResponse.json(venue)
      : fail(404, "venue_not_found"),
  ),
  http.get("*/api/v1/events/:id", ({ request, params }) => {
    const r = events.get(String(params.id));
    return r && canView(request, r)
      ? HttpResponse.json(visible(r.value))
      : fail(404, "event_not_found");
  }),
  http.post("*/api/v1/events", async ({ request }) => {
    const user = access(request);
    if (user instanceof Response) return user;
    const body = (await request.json()) as EventInput;
    if (
      !body.title?.trim() ||
      body.capacity < 1 ||
      Date.parse(body.ends_at) <= Date.parse(body.starts_at)
    )
      return fail(422, "validation_error");
    if (body.venue_id !== venue.id) return fail(404, "venue_not_found");
    const id = crypto.randomUUID();
    const value: Event = {
      ...body,
      id,
      status: "draft",
      paid_sales_status: "disabled",
      share_token: crypto.randomUUID(),
      images: [],
    };
    events.set(id, { value, owner: user.email });
    tickets.set(id, []);
    return HttpResponse.json(value, { status: 201 });
  }),
  http.patch("*/api/v1/events/:id", async ({ request, params }) => {
    const r = events.get(String(params.id));
    if (!r) return fail(404, "event_not_found");
    const user = access(request, r);
    if (user instanceof Response) return user;
    if (r.value.status === "cancelled")
      return fail(409, "invalid_event_status");
    const value = {
      ...r.value,
      ...((await request.json()) as Partial<EventInput>),
    };
    if (
      value.capacity < 1 ||
      Date.parse(value.ends_at) <= Date.parse(value.starts_at)
    )
      return fail(422, "validation_error");
    r.value = value;
    return HttpResponse.json(value);
  }),
  http.post("*/api/v1/events/:id/:action", ({ request, params }) => {
    const kind = String(params.action);
    if (!["publish", "unpublish", "duplicate", "cancel"].includes(kind)) return;
    const r = events.get(String(params.id));
    if (!r) return fail(404, "event_not_found");
    const user = access(request, r);
    if (user instanceof Response) return user;
    const list = tickets.get(r.value.id) ?? [];
    if (kind === "duplicate") {
      const value = {
        ...structuredClone(r.value),
        id: crypto.randomUUID(),
        share_token: crypto.randomUUID(),
        status: "draft",
        paid_sales_status: "disabled",
      };
      events.set(value.id, { value, owner: r.owner });
      tickets.set(
        value.id,
        list.map((t) => ({
          ...t,
          id: crypto.randomUUID(),
          available: t.quantity_total,
          reserved: 0,
          sold: 0,
          refunded: 0,
          checked_in: 0,
        })),
      );
      return HttpResponse.json(value, { status: 201 });
    }
    if (kind === "cancel") {
      if (r.value.status === "cancelled")
        return fail(409, "invalid_event_status");
      if (list.some((t) => t.sold > 0))
        return fail(409, "event_cancellation_requires_refund_flow");
      r.value.status = "cancelled";
      return HttpResponse.json(r.value);
    }
    if (r.value.status !== (kind === "publish" ? "draft" : "published"))
      return fail(409, "invalid_event_status");
    if (kind === "publish") {
      if (!user.email_verified_at) return fail(403, "email_not_verified");
      if (!list.length) return fail(422, "event_requires_ticket_type");
      if (list.reduce((sum, t) => sum + t.quantity_total, 0) > r.value.capacity)
        return fail(422, "capacity_below_ticket_quantity");
    }
    r.value.status = kind === "publish" ? "published" : "draft";
    return HttpResponse.json(r.value);
  }),
  http.get("*/api/v1/events/:id/ticket-types", ({ request, params }) => {
    const r = events.get(String(params.id));
    if (!r) return fail(404, "event_not_found");
    const user = access(request, r);
    if (user instanceof Response) return user;
    return HttpResponse.json(page(tickets.get(r.value.id) ?? [], request));
  }),
  http.get("*/api/v1/events/:id/availability", ({ request, params }) => {
    const r = events.get(String(params.id));
    if (!r || !canView(request, r)) return fail(404, "event_not_found");
    return HttpResponse.json(
      (tickets.get(r.value.id) ?? [])
        .filter((t) => !t.is_hidden)
        .map((t) => ({
          ticket_type_id: t.id,
          name: t.name,
          price_amount: t.price_amount,
          currency: "KZT",
          available: t.available,
          on_sale:
            (!t.sales_start || Date.parse(t.sales_start) <= Date.now()) &&
            (!t.sales_end || Date.parse(t.sales_end) > Date.now()),
        })),
    );
  }),
  ...["POST", "PATCH"].map((method) =>
    http[method === "POST" ? "post" : "patch"](
      `*/api/v1/events/:id/ticket-types${method === "PATCH" ? "/:ticket" : ""}`,
      async ({ request, params }) => {
        const r = events.get(String(params.id));
        if (!r) return fail(404, "event_not_found");
        const user = access(request, r);
        if (user instanceof Response) return user;
        const list = tickets.get(r.value.id)!;
        const old = list.find((t) => t.id === params.ticket);
        if (method === "PATCH" && !old)
          return fail(404, "ticket_type_not_found");
        const input = { ...old, ...((await request.json()) as TicketInput) };
        if (
          !input.name?.trim() ||
          !Number.isSafeInteger(input.price_amount) ||
          input.price_amount < 0 ||
          input.quantity_total < 1
        )
          return fail(422, "validation_error");
        if (old && input.quantity_total < old.reserved + old.sold)
          return fail(422, "inventory_conflict");
        const value: Ticket = {
          ...input,
          id: old?.id ?? crypto.randomUUID(),
          available:
            input.quantity_total - (old?.reserved ?? 0) - (old?.sold ?? 0),
          reserved: old?.reserved ?? 0,
          sold: old?.sold ?? 0,
          refunded: old?.refunded ?? 0,
          checked_in: old?.checked_in ?? 0,
        };
        if (old) list[list.indexOf(old)] = value;
        else list.push(value);
        return HttpResponse.json(value, {
          status: method === "POST" ? 201 : 200,
        });
      },
    ),
  ),
  http.put("*/api/v1/events/:id/refund-policy", async ({ request, params }) => {
    const r = events.get(String(params.id));
    if (!r) return fail(404, "event_not_found");
    const user = access(request, r);
    if (user instanceof Response) return user;
    const body = (await request.json()) as { summary: string };
    if (!body.summary?.trim()) return fail(422, "validation_error");
    r.policy = body;
    return HttpResponse.json(r.value);
  }),
];
