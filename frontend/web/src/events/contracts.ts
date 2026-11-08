import { ApiError } from "@biletflow/shared";
import type { Availability, Event, Page, Ticket, Venue } from "./model";
import {
  parseAvailability,
  parseEvent as parseCheckoutEvent,
} from "../checkout/model";

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
function invalid(): never {
  throw new ApiError(200, "invalid_response", "Unexpected event API response.");
}
const nullableDate = (value: unknown) =>
  value === null ||
  value === undefined ||
  (typeof value === "string" && Number.isFinite(Date.parse(value)));
export function parseEvent(value: unknown): Event {
  const event = parseCheckoutEvent(value);
  if (
    typeof event.description !== "string" ||
    typeof event.category !== "string" ||
    !Array.isArray(event.images) ||
    !event.images.every((v) => typeof v === "string") ||
    typeof event.paid_sales_status !== "string" ||
    !integer(event.capacity) ||
    !event.capacity ||
    !nullableDate(event.registration_opens_at) ||
    !nullableDate(event.registration_closes_at)
  )
    return invalid();
  return event;
}
export const parseEvents = (value: unknown): Page<Event> =>
  list(value, parseEvent);
export function parseVenue(value: unknown): Venue {
  if (
    !record(value) ||
    ![value.id, value.name, value.address, value.city].every(
      (v) => typeof v === "string",
    )
  )
    return invalid();
  return value as Venue;
}
/** Normalize the live P3 envelope before the detail page renders its ticket list. */
export function parsePublicAvailability(value: unknown): Availability[] {
  const availability = parseAvailability(value);
  return availability.choices.map((choice) => ({
    ticket_type_id: choice.id,
    name: choice.name,
    price_amount: choice.free ? 0 : (choice.price ?? invalid()),
    currency: "KZT",
    available: choice.available,
    on_sale: availability.registrationOpen && choice.open,
  }));
}
/** Live P3/P4 return complete arrays; older contract fixtures return pages. */
function list<T>(value: unknown, parse: (row: unknown) => T): Page<T> {
  if (Array.isArray(value))
    return {
      items: value.map(parse),
      total: value.length,
      limit: Math.max(1, value.length),
      offset: 0,
    };
  if (
    !record(value) ||
    !Array.isArray(value.items) ||
    !integer(value.total) ||
    !integer(value.limit) ||
    !value.limit ||
    !integer(value.offset)
  )
    return invalid();
  return {
    items: value.items.map(parse),
    total: value.total,
    limit: value.limit,
    offset: value.offset,
  };
}
export function parseVenues(value: unknown): Page<Venue> {
  return list(value, parseVenue);
}
export function parseTicketTypes(value: unknown): Page<Ticket> {
  return list(value, (row) => {
    if (
      !record(row) ||
      typeof row.id !== "string" ||
      typeof row.name !== "string"
    )
      return invalid();
    // P3 serializes the persisted tiyn amount as Decimal; do not multiply it by 100.
    const price =
      typeof row.price_amount === "string" &&
      /^\d+(?:\.0+)?$/.test(row.price_amount)
        ? Number(row.price_amount)
        : row.price_amount;
    const counters = {
      available: row.qty_available ?? row.available,
      reserved: row.qty_reserved ?? row.reserved,
      sold: row.qty_sold ?? row.sold,
      refunded: row.qty_refunded ?? row.refunded,
      checked_in: row.qty_checked_in ?? row.checked_in,
    };
    if (
      !integer(price) ||
      !Object.values(counters).every(integer) ||
      !integer(row.quantity_total) ||
      !row.quantity_total ||
      !integer(row.max_per_order) ||
      !row.max_per_order ||
      typeof row.is_hidden !== "boolean" ||
      !(row.description === null || typeof row.description === "string") ||
      !nullableDate(row.sales_start) ||
      !nullableDate(row.sales_end)
    )
      return invalid();
    return { ...row, ...counters, price_amount: price } as Ticket;
  });
}
