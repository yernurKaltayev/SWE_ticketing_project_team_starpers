import { ApiError } from "@biletflow/shared";
import type { ApiRequestOptions } from "@biletflow/shared";
/** Mirrors the implemented P4 schemas; the checked-in P0 OpenAPI is older. */
export type Seat = {
  id: string;
  section: string;
  row: string;
  label: string;
  price_category: string | null;
  accessible: boolean;
  status: "available" | "held" | "sold";
};
export type SeatMap = {
  event_id: string;
  venue_id: string;
  layout_id: string;
  seats: Seat[];
};
export type Layout = {
  id: string;
  venue_id: string;
  name: string;
};
export type Hold = {
  id: string;
  event_id: string;
  seat_ids: string[];
  status: "held" | "released" | "expired" | "sold";
  expires_at: string;
};
export type SeatOffer = {
  id: string;
  name: string;
  category: string | null;
  priceTiyn: number;
  limit: number;
};
export type SeatingSelection = {
  eventId: string;
  holdIds: string[];
  expiresAt: string;
  items: {
    ticket_type_id: string;
    quantity: number;
    seat_ids: string[];
  }[];
};
export type Request = <T>(
  path: string,
  options?: ApiRequestOptions,
) => Promise<T>;
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === "string" && v.length > 0;
function invalid(): never {
  throw new ApiError(200, "invalid_response", "Invalid seating response.");
}
export function parseSeatMap(v: unknown): SeatMap {
  if (
    !record(v) ||
    ![v.event_id, v.venue_id, v.layout_id].every(str) ||
    !Array.isArray(v.seats)
  )
    return invalid();
  const seats = v.seats.map((s) => {
    if (
      !record(s) ||
      ![s.id, s.section, s.row, s.label].every(str) ||
      !(s.price_category === null || typeof s.price_category === "string") ||
      typeof s.accessible !== "boolean" ||
      !["available", "held", "sold"].includes(String(s.status))
    )
      return invalid();
    return s as Seat;
  });
  if (new Set(seats.map((s) => s.id)).size !== seats.length) return invalid();
  return {
    event_id: v.event_id as string,
    venue_id: v.venue_id as string,
    layout_id: v.layout_id as string,
    seats,
  };
}
export function parseLayouts(v: unknown): Layout[] {
  if (
    !Array.isArray(v) ||
    !v.every((x) => record(x) && [x.id, x.venue_id, x.name].every(str))
  )
    return invalid();
  return v as Layout[];
}
export function parseHold(v: unknown): Hold {
  if (
    !record(v) ||
    ![v.id, v.event_id].every(str) ||
    !Array.isArray(v.seat_ids) ||
    !v.seat_ids.length ||
    !v.seat_ids.every(str) ||
    new Set(v.seat_ids).size !== v.seat_ids.length ||
    !["held", "released", "expired", "sold"].includes(String(v.status)) ||
    typeof v.expires_at !== "string" ||
    !/(Z|[+-]\d\d:\d\d)$/.test(v.expires_at) ||
    !Number.isFinite(Date.parse(v.expires_at))
  )
    return invalid();
  return v as Hold;
}
export const categoryMatches = (a: string | null, b: string | null) =>
  a === null || b === null
    ? a === b
    : a.trim().toLowerCase() === b.trim().toLowerCase();
export const remainingSeconds = (expiry: string, now = Date.now()) =>
  Math.max(0, Math.ceil((Date.parse(expiry) - now) / 1000));
export function selection(
  hold: Hold,
  offer: SeatOffer,
  now = Date.now(),
): SeatingSelection {
  if (hold.status !== "held" || remainingSeconds(hold.expires_at, now) <= 0)
    throw new Error("hold_expired");
  return {
    eventId: hold.event_id,
    holdIds: [hold.id],
    expiresAt: hold.expires_at,
    items: [
      {
        ticket_type_id: offer.id,
        quantity: hold.seat_ids.length,
        seat_ids: [...hold.seat_ids],
      },
    ],
  };
}
/** One controller per signed-in user/event. Never automatically replay hold writes. */
export class HoldController {
  hold: Hold | null = null;
  uncertain = false;
  private busy = false;
  private releasePending: Promise<void> | null = null;
  private disposed = false;
  private request: Request;
  readonly eventId: string;
  private offerId: string | null = null;
  constructor(request: Request, eventId: string) {
    this.request = request;
    this.eventId = eventId;
  }
  activate() {
    this.disposed = false;
  }
  async reserve(map: SeatMap, ids: string[], offer: SeatOffer) {
    if (
      this.disposed ||
      this.busy ||
      this.releasePending ||
      this.hold ||
      this.uncertain
    )
      throw new Error("hold_busy");
    if (
      !Number.isSafeInteger(offer.priceTiyn) ||
      offer.priceTiyn < 0 ||
      !Number.isSafeInteger(offer.limit) ||
      offer.limit < 1 ||
      !offer.id ||
      map.event_id !== this.eventId ||
      !ids.length ||
      ids.length > Math.min(10, offer.limit) ||
      new Set(ids).size !== ids.length ||
      ids.some(
        (id) =>
          !map.seats.some(
            (s) =>
              s.id === id &&
              s.status === "available" &&
              categoryMatches(s.price_category, offer.category),
          ),
      )
    )
      throw new Error("selection_invalid");
    this.busy = true;
    try {
      const hold = parseHold(
        await this.request(
          `/api/v1/events/${encodeURIComponent(this.eventId)}/holds`,
          {
            method: "POST",
            body: { ticket_type_id: offer.id, seat_ids: ids },
          },
        ),
      );
      if (
        hold.event_id !== this.eventId ||
        hold.status !== "held" ||
        hold.seat_ids.length !== ids.length ||
        hold.seat_ids.some((id) => !ids.includes(id))
      )
        return invalid();
      this.hold = hold;
      this.offerId = offer.id;
      if (this.disposed) await this.release();
      return hold;
    } catch (e) {
      // A transport/5xx/malformed response may follow a committed hold. No new POST.
      if (!(
        e instanceof ApiError &&
        e.status >= 400 &&
        e.status < 500 &&
        e.status !== 408
      ))
        this.uncertain = true;
      throw e;
    } finally {
      this.busy = false;
    }
  }
  release(): Promise<void> {
    if (this.releasePending) return this.releasePending;
    if (!this.hold) return Promise.resolve();
    const hold = this.hold;
    this.releasePending = this.request(
      `/api/v1/events/${encodeURIComponent(this.eventId)}/holds/${encodeURIComponent(hold.id)}`,
      { method: "DELETE" },
    )
      .then(() => {
        if (this.hold === hold) this.hold = null;
      })
      .finally(() => {
        this.releasePending = null;
      });
    return this.releasePending;
  }
  /** Checkout takes responsibility only immediately before dispatching its order. */
  transfer(offer: SeatOffer): SeatingSelection {
    if (
      this.disposed ||
      this.busy ||
      this.releasePending ||
      this.uncertain ||
      !this.hold ||
      offer.id !== this.offerId
    )
      throw new Error("hold_unavailable");
    const result = selection(this.hold, offer);
    this.hold = null;
    this.disposed = true;
    return result;
  }
  dispose() {
    this.disposed = true;
    void this.release().catch(() => {});
  }
}
