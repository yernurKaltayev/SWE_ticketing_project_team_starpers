import { parseSeatCart } from "@biletflow/shared/features/seating/booking";
import type { SeatCart } from "@biletflow/shared/features/seating/booking";

/** Held seats travel from the hall plan to checkout in this tab only (sessionStorage). */
const key = (eventId: string) => `biletflow:seats:${eventId}`;

export function loadSeatCart(eventId: string, now = Date.now()): SeatCart | null {
  try {
    const raw = sessionStorage.getItem(key(eventId));
    return raw ? parseSeatCart(JSON.parse(raw), eventId, now) : null;
  } catch {
    return null;
  }
}

export function saveSeatCart(cart: SeatCart) {
  try {
    sessionStorage.setItem(key(cart.eventId), JSON.stringify(cart));
  } catch {
    // Storage off (private mode): checkout then asks to choose seats again.
  }
}

export function clearSeatCart(eventId: string) {
  try {
    sessionStorage.removeItem(key(eventId));
  } catch {
    // Nothing stored.
  }
}
