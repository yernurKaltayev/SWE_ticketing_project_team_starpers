/**
 * Buyer seat booking: turning the P4 seat map into a hall plan, matching each seat to the ticket
 * type sold for its price category, and carrying the held seats into the P5 order.
 */
import type { Choice, OrderBody } from "../checkout/model";
import { categoryMatches } from "./model";
import type { Seat } from "./model";

/** At most this many seats in one booking. */
export const maxSeats = 10;

export type HallRow = { label: string; seats: Seat[] };
export type HallSection = { name: string; category: string | null; rows: HallRow[] };

const seatOrder = (a: Seat, b: Seat) =>
  a.label.localeCompare(b.label, undefined, { numeric: true });

/** Sections in the order the server lists them; rows from A back, seats left to right by number. */
export function hallSections(seats: Seat[]): HallSection[] {
  const sections: HallSection[] = [];
  for (const seat of seats) {
    let section = sections.find((s) => s.name === seat.section);
    if (!section) {
      section = { name: seat.section, category: seat.price_category, rows: [] };
      sections.push(section);
    }
    let row = section.rows.find((r) => r.label === seat.row);
    if (!row) {
      row = { label: seat.row, seats: [] };
      section.rows.push(row);
    }
    row.seats.push(seat);
  }
  // Row A sits nearest the stage; the seat map has no row positions, so order by label.
  for (const section of sections) {
    section.rows.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    for (const row of section.rows) row.seats.sort(seatOrder);
  }
  return sections;
}

/** Price categories in hall order, so each keeps the same colour everywhere on the page. */
export function hallCategories(seats: Seat[]): (string | null)[] {
  const seen: (string | null)[] = [];
  for (const seat of seats)
    if (!seen.some((c) => categoryMatches(c, seat.price_category))) seen.push(seat.price_category);
  return seen;
}

/** The ticket type that sells this seat: on sale, in stock, same price category. */
export function offerForSeat(seat: Pick<Seat, "price_category">, choices: Choice[]) {
  return choices.find(
    (c) => c.open && c.available > 0 && categoryMatches(seat.price_category, c.priceCategory ?? null),
  );
}

export const choicePrice = (choice: Choice) => (choice.free ? 0 : (choice.price ?? 0));

/** Chosen seats grouped by the ticket type each one is sold as (one hold per group). */
export function seatGroups(seats: Seat[], choices: Choice[]) {
  const groups: { choice: Choice; seats: Seat[] }[] = [];
  for (const seat of seats) {
    const choice = offerForSeat(seat, choices);
    if (!choice) throw new Error("seat_not_for_sale");
    const group = groups.find((g) => g.choice.id === choice.id);
    if (group) group.seats.push(seat);
    else groups.push({ choice, seats: [seat] });
  }
  for (const group of groups)
    if (group.seats.length > Math.min(group.choice.limit, group.choice.available))
      throw new Error("seat_limit");
  return groups;
}

/** Whether one more seat may be added: the total cap and the ticket type's own limits. */
export function canAddSeat(seat: Seat, chosen: Seat[], choices: Choice[]) {
  const choice = offerForSeat(seat, choices);
  if (!choice || chosen.length >= maxSeats) return false;
  const same = chosen.filter((s) => offerForSeat(s, choices)?.id === choice.id).length;
  return same < Math.min(choice.limit, choice.available);
}

/** Held seats on their way from the seat map to checkout. */
export type SeatCart = {
  eventId: string;
  holdIds: string[];
  /** Earliest hold expiry: the whole booking lapses then. */
  expiresAt: string;
  items: { ticket_type_id: string; quantity: number; seat_ids: string[] }[];
  seats: { id: string; section: string; row: string; label: string }[];
};

const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/** Reads a stored cart; anything malformed, for another event or already expired is dropped. */
export function parseSeatCart(v: unknown, eventId: string, now = Date.now()): SeatCart | null {
  if (
    !record(v) ||
    v.eventId !== eventId ||
    !Array.isArray(v.holdIds) ||
    !v.holdIds.length ||
    !v.holdIds.every(text) ||
    !text(v.expiresAt) ||
    !(Date.parse(v.expiresAt) > now) ||
    !Array.isArray(v.items) ||
    !v.items.length ||
    !Array.isArray(v.seats)
  )
    return null;
  const itemsOk = v.items.every(
    (i) =>
      record(i) &&
      text(i.ticket_type_id) &&
      Array.isArray(i.seat_ids) &&
      i.seat_ids.length > 0 &&
      i.seat_ids.every(text) &&
      i.quantity === i.seat_ids.length,
  );
  const seatsOk = v.seats.every(
    (s) => record(s) && [s.id, s.section, s.row, s.label].every(text),
  );
  return itemsOk && seatsOk ? (v as SeatCart) : null;
}

/** The order body for held seats: each item carries its seat IDs, and the holds are consumed. */
export function withSeats(body: OrderBody, cart: SeatCart): OrderBody {
  const items = body.items.map((item) => {
    const held = cart.items.find((i) => i.ticket_type_id === item.ticket_type_id);
    if (!held || held.quantity !== item.quantity) throw new Error("seat_mismatch");
    return { ...item, seat_ids: [...held.seat_ids] };
  });
  if (items.length !== cart.items.length) throw new Error("seat_mismatch");
  return { ...body, items, hold_ids: [...cart.holdIds] };
}
