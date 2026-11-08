import type { components } from "@biletflow/shared/api";
export type Event = components["schemas"]["EventOut"];
export type Ticket = components["schemas"]["TicketTypeOut"];
export type Venue = components["schemas"]["VenueOut"];
export type Availability = components["schemas"]["AvailabilityOut"];
export type Page<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};
export type EventInput = components["schemas"]["EventCreate"];
export type TicketInput = components["schemas"]["TicketTypeIn"];
export class InputError extends Error {
  readonly field: string;
  constructor(field: string) {
    super(field);
    this.field = field;
  }
}
export function parsePrice(value: string): number {
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value)) throw new InputError("price");
  const [major, minor = ""] = value.replace(",", ".").split(".");
  const amount = BigInt(major!) * 100n + BigInt(minor.padEnd(2, "0"));
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new InputError("price");
  return Number(amount);
}
export function positive(value: string, field: string) {
  const n = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(n) || n < 1)
    throw new InputError(field);
  return n;
}
export function zonedInput(
  timestamp: string | null | undefined,
  zone: string,
): string {
  if (!timestamp) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
/** Reject missing/ambiguous wall times rather than silently shifting a DST date. */
export function toInstant(wall: string, zone: string, field: string): string {
  try {
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(wall)) throw new Error();
    const naive = Date.parse(`${wall}:00Z`);
    if (
      !Number.isFinite(naive) ||
      new Date(naive).toISOString().slice(0, 16) !== wall
    )
      throw new Error();
    const offsets = new Set<number>();
    for (const hours of [-36, -12, 0, 12, 36]) {
      const probe = naive + hours * 3600000;
      const displayed = Date.parse(
        `${zonedInput(new Date(probe).toISOString(), zone)}:00Z`,
      );
      offsets.add(displayed - probe);
    }
    const candidates = [...offsets]
      .map((offset) => naive - offset)
      .filter(
        (time) => zonedInput(new Date(time).toISOString(), zone) === wall,
      );
    if (candidates.length !== 1) throw new Error();
    return new Date(candidates[0]!).toISOString();
  } catch {
    throw new InputError(field);
  }
}
export function eventBody(form: FormData): EventInput {
  const value = (key: string) => String(form.get(key) ?? "").trim();
  for (const key of [
    "title",
    "description",
    "category",
    "venue_id",
    "timezone",
  ])
    if (!value(key)) throw new InputError(key);
  const timezone = value("timezone");
  const starts_at = toInstant(value("starts_at"), timezone, "starts_at");
  const ends_at = toInstant(value("ends_at"), timezone, "ends_at");
  if (ends_at <= starts_at) throw new InputError("ends_at");
  const registration_opens_at = value("registration_opens_at")
    ? toInstant(
        value("registration_opens_at"),
        timezone,
        "registration_opens_at",
      )
    : null;
  const registration_closes_at = value("registration_closes_at")
    ? toInstant(
        value("registration_closes_at"),
        timezone,
        "registration_closes_at",
      )
    : null;
  if (
    registration_closes_at &&
    (registration_closes_at > ends_at ||
      (registration_opens_at && registration_opens_at > registration_closes_at))
  )
    throw new InputError("registration_closes_at");
  const visibility = value("visibility");
  if (!["public", "unlisted", "private"].includes(visibility))
    throw new InputError("visibility");
  return {
    title: value("title"),
    description: value("description"),
    category: value("category"),
    venue_id: value("venue_id"),
    starts_at,
    ends_at,
    timezone,
    visibility: visibility as EventInput["visibility"],
    capacity: positive(value("capacity"), "capacity"),
    registration_opens_at,
    registration_closes_at,
    seating_mode: "general_admission",
    layout_id: null,
  };
}
export function ticketBody(
  form: FormData,
  zone: string,
): TicketInput & { is_free: boolean; currency: string } {
  const value = (key: string) => String(form.get(key) ?? "").trim();
  if (!value("name")) throw new InputError("name");
  const sales_start = value("sales_start")
    ? toInstant(value("sales_start"), zone, "sales_start")
    : null;
  const sales_end = value("sales_end")
    ? toInstant(value("sales_end"), zone, "sales_end")
    : null;
  if (sales_start && sales_end && sales_start > sales_end)
    throw new InputError("sales_end");
  const price = parsePrice(value("price"));
  return {
    name: value("name"),
    description: value("ticket_description") || null,
    price_amount: price,
    is_free: price === 0,
    currency: "KZT",
    quantity_total: positive(value("quantity_total"), "quantity_total"),
    max_per_order: positive(value("max_per_order"), "max_per_order"),
    is_hidden: form.has("is_hidden"),
    price_category: null,
    sales_start,
    sales_end,
  };
}
export function searchQuery(params: URLSearchParams) {
  const query = new URLSearchParams();
  for (const key of ["q", "category", "city", "date_from", "date_to"]) {
    const value = params.get(key)?.trim();
    if (value)
      query.set(
        key,
        key.startsWith("date_")
          ? `${value}T${key === "date_to" ? "23:59:59.999" : "00:00:00"}Z`
          : value,
      );
  }
  const offset = Number(params.get("offset"));
  query.set(
    "offset",
    String(Number.isSafeInteger(offset) && offset > 0 ? offset : 0),
  );
  query.set("limit", "12");
  return query.toString();
}
export function salesState(
  event: Event,
  ticket: Availability,
  now = Date.now(),
) {
  if (event.status !== "published")
    return event.status === "cancelled" ? "cancelled" : "unavailable";
  if (Date.parse(event.ends_at) <= now) return "ended";
  if (
    event.registration_opens_at &&
    Date.parse(event.registration_opens_at) > now
  )
    return "notOpen";
  if (
    event.registration_closes_at &&
    Date.parse(event.registration_closes_at) <= now
  )
    return "ended";
  if (ticket.available <= 0) return "soldOut";
  if (ticket.price_amount > 0 && event.paid_sales_status !== "active")
    return "paidBlocked";
  return ticket.on_sale ? "onSale" : "unavailable";
}

/** Exact display value for editable KZT amounts, including the safe integer boundary. */
export function priceInput(amount: number) {
  if (!Number.isSafeInteger(amount) || amount < 0)
    throw new InputError("price");
  const n = BigInt(amount);
  return `${n / 100n}.${String(n % 100n).padStart(2, "0")}`;
}
