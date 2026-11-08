import { ApiError } from "@biletflow/shared";
import type { components } from "@biletflow/shared/api";
export type Event = components["schemas"]["EventOut"];
export type Order = components["schemas"]["OrderOut"];
export type Ticket = components["schemas"]["TicketOut"];
export type OrderBody = components["schemas"]["OrderCreate"];
export type Attendee = components["schemas"]["AttendeeIn"];
export type Page<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};
export type Choice = {
  /** Integer tiyn, matching the persisted P3 value and P5 order amount. */
  price?: number;
  id: string;
  name: string;
  free: boolean;
  available: number;
  open: boolean;
  limit: number;
};
export type Availability = { registrationOpen: boolean; choices: Choice[] };
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const integer = (v: unknown) =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
export function invalidResponse(): never {
  throw new ApiError(200, "invalid_response", "Unexpected API response.");
}
export function parseEvent(value: unknown): Event {
  if (
    !record(value) ||
    ![
      value.id,
      value.title,
      value.venue_id,
      value.starts_at,
      value.ends_at,
      value.timezone,
      value.status,
      value.seating_mode,
    ].every((v) => typeof v === "string" && !!v) ||
    !Number.isFinite(Date.parse(value.starts_at as string)) ||
    !Number.isFinite(Date.parse(value.ends_at as string))
  )
    return invalidResponse();
  try {
    new Intl.DateTimeFormat("en", { timeZone: value.timezone as string });
  } catch {
    return invalidResponse();
  }
  return value as Event;
}
export function parseVenue(value: unknown): {
  name: string;
  address: string;
  city: string;
} {
  if (
    !record(value) ||
    ![value.name, value.address, value.city].every((v) => typeof v === "string")
  )
    return invalidResponse();
  return value as { name: string; address: string; city: string };
}
/** P3 serializes its persisted tiyn amount as a Decimal string; the older static
 * F2 contract uses an integer. Fractional tiyn is rejected rather than rounded. */
export function parseAvailability(value: unknown): Availability {
  const live = record(value) && Array.isArray(value.ticket_types);
  const rows = live
    ? (value.ticket_types as unknown[])
    : Array.isArray(value)
      ? value
      : invalidResponse();
  if (live && typeof value.registration_open !== "boolean") invalidResponse();
  return {
    registrationOpen: live ? (value.registration_open as boolean) : true,
    choices: rows.map((row) => {
      if (!record(row)) return invalidResponse();
      const id = live ? row.id : row.ticket_type_id;
      const available = live ? row.quantity_available : row.available;
      const open = live ? row.sales_open : row.on_sale;
      const limit = live ? row.max_per_order : 100;
      const price = row.price_amount;
      if (
        typeof id !== "string" ||
        !id ||
        typeof row.name !== "string" ||
        !integer(available) ||
        typeof open !== "boolean" ||
        !integer(limit) ||
        (limit as number) < 1 ||
        row.currency !== "KZT" ||
        !["number", "string"].includes(typeof price) ||
        !/^\d+(?:\.\d+)?$/.test(String(price)) ||
        (live && typeof row.is_free !== "boolean")
      )
        return invalidResponse();
      return {
        id,
        name: row.name,
        available: available as number,
        open,
        limit: Math.min(100, limit as number),
        free: Number(price) === 0 && (!live || row.is_free === true),
        ...(Number(price) === 0
          ? {}
          : {
              price: Number.isSafeInteger(Number(price))
                ? Number(price)
                : undefined,
            }),
      };
    }),
  };
}
export function registrationOpen(
  event: Event,
  availability: Availability,
  now = Date.now(),
) {
  return (
    event.status === "published" &&
    event.seating_mode === "general_admission" &&
    availability.registrationOpen &&
    Date.parse(event.starts_at) > now &&
    (!event.registration_opens_at ||
      Date.parse(event.registration_opens_at) <= now) &&
    (!event.registration_closes_at ||
      Date.parse(event.registration_closes_at) > now)
  );
}
export function makeOrderBody(
  eventId: string,
  choices: Choice[],
  quantities: Record<string, number>,
  attendees: Attendee[],
  paidSalesActive = false,
): OrderBody {
  const items = choices
    .filter((c) => (quantities[c.id] ?? 0) > 0)
    .map((c) => {
      const quantity = quantities[c.id]!;
      if (
        (!c.free &&
          (!paidSalesActive || !c.price || !Number.isSafeInteger(c.price))) ||
        !c.open ||
        !Number.isSafeInteger(quantity) ||
        quantity < 1 ||
        quantity > Math.min(c.available, c.limit)
      )
        throw new ApiError(
          422,
          "selection_invalid",
          "Check the ticket quantities.",
        );
      return { ticket_type_id: c.id, quantity, seat_ids: [] };
    });
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  if (
    !count ||
    count > 100 ||
    items.length > 20 ||
    count !== attendees.length ||
    attendees.some(
      (a) =>
        !a.full_name.trim() ||
        a.full_name.trim().length > 200 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email.trim()),
    )
  )
    throw new ApiError(
      422,
      "selection_invalid",
      "Enter one name and email per ticket.",
    );
  return {
    event_id: eventId,
    items,
    attendees: attendees.map((a) => ({
      full_name: a.full_name.trim(),
      email: a.email.trim(),
    })),
    hold_ids: [],
    promo_code: null,
  };
}
export function parseOrder(value: unknown): Order {
  if (
    !record(value) ||
    typeof value.id !== "string" ||
    typeof value.order_number !== "string" ||
    typeof value.status !== "string" ||
    value.currency !== "KZT" ||
    typeof value.is_simulated !== "boolean" ||
    ![
      value.subtotal,
      value.discount_amount,
      value.processing_fee,
      value.total,
    ].every(integer) ||
    !Array.isArray(value.items) ||
    !Array.isArray(value.tickets)
  )
    return invalidResponse();
  if (
    value.items.some(
      (v) =>
        !record(v) ||
        typeof v.id !== "string" ||
        typeof v.ticket_type_id !== "string" ||
        !integer(v.quantity) ||
        !v.quantity ||
        !integer(v.unit_price) ||
        !integer(v.line_total),
    )
  )
    return invalidResponse();
  value.tickets.forEach(parseTicket);
  return value as Order;
}
export function parseTicket(value: unknown): Ticket {
  if (
    !record(value) ||
    ![
      value.id,
      value.ticket_number,
      value.event_id,
      value.ticket_type,
      value.attendee_name,
      value.status,
      value.qr_url,
      value.pdf_url,
    ].every((v) => typeof v === "string" && !!v) ||
    (value.seat !== null &&
      (!record(value.seat) ||
        typeof value.seat.section_name !== "string" ||
        typeof value.seat.row_label !== "string" ||
        !integer(value.seat.seat_number)))
  )
    return invalidResponse();
  return value as Ticket;
}
export function parsePage<T>(
  value: unknown,
  parse: (item: unknown) => T,
): Page<T> {
  if (
    !record(value) ||
    !Array.isArray(value.items) ||
    ![value.total, value.offset, value.limit].every(integer) ||
    !value.limit
  )
    return invalidResponse();
  return { ...value, items: value.items.map(parse) } as Page<T>;
}
export function ticketPath(ticket: Ticket, kind: "qr" | "pdf") {
  // Never put a bearer credential in a URL or follow a response-supplied external URL.
  return `/api/v1/tickets/${encodeURIComponent(ticket.id)}/${kind}`;
}
export function validateBinary(blob: Blob, kind: "qr" | "pdf") {
  if (
    !blob.size ||
    blob.type.split(";")[0] !==
      (kind === "qr" ? "image/png" : "application/pdf")
  )
    invalidResponse();
  return blob;
}
