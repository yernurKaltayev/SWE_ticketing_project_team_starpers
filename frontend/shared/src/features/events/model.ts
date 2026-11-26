import type { components } from "../../generated/api";
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
export function eventBody(form: Pick<FormData, "get">): EventInput {
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
    // Sales stop when the event starts, so a later close date is never honoured.
    (registration_closes_at > starts_at ||
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
  form: Pick<FormData, "get" | "has">,
): TicketInput & { is_free: boolean; currency: string } {
  const value = (key: string) => String(form.get(key) ?? "").trim();
  if (!value("name")) throw new InputError("name");
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
    // The event's ticket sales window applies to every ticket type. Clearing old
    // per-ticket dates on save keeps them from silently blocking sales.
    sales_start: null,
    sales_end: null,
  };
}
/**
 * Instant at the start (or end) of a calendar day in the viewer's own time
 * zone, so "today" means the attendee's today rather than UTC's.
 */
export function dayBoundary(
  day: string,
  end: boolean,
  offsetMinutes?: number,
): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return day;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const local = end
    ? Date.UTC(y, m - 1, d, 23, 59, 59, 999)
    : Date.UTC(y, m - 1, d);
  const offset =
    offsetMinutes ?? new Date(y, m - 1, d, end ? 23 : 0).getTimezoneOffset();
  return new Date(local + offset * 60_000).toISOString();
}
export type QuickRange = "today" | "weekend" | "month";
export const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Local calendar days for the discovery shortcuts; the weekend is Sat–Sun. */
export function quickRange(kind: QuickRange, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (kind === "today") return { date_from: isoDay(start), date_to: isoDay(start) };
  if (kind === "month") {
    const last = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    return { date_from: isoDay(start), date_to: isoDay(last) };
  }
  const day = start.getDay();
  const saturday = new Date(start);
  if (day !== 0) saturday.setDate(start.getDate() + (6 - day));
  const sunday = new Date(saturday);
  if (day !== 0) sunday.setDate(saturday.getDate() + 1);
  return {
    date_from: isoDay(day === 0 || day === 6 ? start : saturday),
    date_to: isoDay(sunday),
  };
}
/** Which shortcut, if any, the current date filters correspond to. */
export function activeRange(params: URLSearchParams, now = new Date()) {
  return (["today", "weekend", "month"] as const).find((kind) => {
    const r = quickRange(kind, now);
    return (
      params.get("date_from") === r.date_from &&
      params.get("date_to") === r.date_to
    );
  });
}
/** Stable cover colour per category so the grid isn't one uniform tile. */
export function categoryTone(category: string): number {
  let hash = 0;
  for (const ch of category.trim().toLowerCase())
    hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  return category.trim() ? (hash % 6) + 1 : 0;
}
/**
 * Card summary from public availability: lowest visible price and stock. Availability
 * reports real counts even while a ticket is off sale, so "sold out" means no stock left,
 * not "sales have not opened yet".
 */
export function offerSummary(tickets: Availability[]) {
  if (tickets.length === 0) return null;
  const remaining = tickets.reduce((n, t) => n + Math.max(0, t.available), 0);
  const inStock = tickets.filter((t) => t.available > 0);
  const prices = (inStock.length ? inStock : tickets).map((t) => t.price_amount);
  const min = Math.min(...prices);
  return {
    minPrice: min,
    /** Only say "from" when there is more than one price on offer. */
    priceVaries: new Set(prices).size > 1,
    allFree: prices.every((p) => p === 0),
    /** Lowest paid price when free and paid types mix. */
    minPaidPrice: prices.some((p) => p > 0)
      ? Math.min(...prices.filter((p) => p > 0))
      : null,
    soldOut: remaining === 0,
    /** Some ticket can be bought right now (low-stock hints only make sense then). */
    onSale: tickets.some((t) => t.on_sale && t.available > 0),
    remaining,
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
          ? dayBoundary(value, key === "date_to")
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
  // Registration closes when the event starts. Check every reason a ticket is off sale before
  // "sold out": public availability reports 0 for any ticket that is not on sale.
  if (
    Date.parse(event.ends_at) <= now ||
    (event.starts_at && Date.parse(event.starts_at) <= now)
  )
    return "ended";
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
  if (ticket.price_amount > 0 && event.paid_sales_status !== "active")
    return "paidBlocked";
  if (!ticket.on_sale) return "unavailable";
  return ticket.available <= 0 ? "soldOut" : "onSale";
}

/** Exact display value for editable KZT amounts, including the safe integer boundary. */
export function priceInput(amount: number) {
  if (!Number.isSafeInteger(amount) || amount < 0)
    throw new InputError("price");
  const n = BigInt(amount);
  return `${n / 100n}.${String(n % 100n).padStart(2, "0")}`;
}

/** The text a saved venue shows as in the venue suggestions. */
export function venueLabel(venue: Venue) {
  return `${venue.name} · ${venue.city} · ${venue.address}`;
}

/**
 * The saved venue the organizer typed: its full suggestion label, or its bare name when
 * exactly one saved venue has that name (letter case ignored). Anything else is a new venue.
 */
export function findVenue(venues: Venue[], typed: string): Venue | undefined {
  const text = typed.trim().toLowerCase();
  if (!text) return undefined;
  const byLabel = venues.find((v) => venueLabel(v).toLowerCase() === text);
  if (byLabel) return byLabel;
  const byName = venues.filter((v) => v.name.trim().toLowerCase() === text);
  return byName.length === 1 ? byName[0] : undefined;
}
