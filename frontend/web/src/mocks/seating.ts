import { http, HttpResponse } from "msw";
import { mockCurrentUser } from "./auth";
import { categoryMatches } from "../seating/model";
import { mockCheckoutEvent } from "./events";
import type { Seat } from "../seating/model";
const layoutId = "ee4c8d20-68f0-4772-9d20-11ab133ec821";
/** Mirrors backend/scripts/seed.py's geometry, with explicitly synthetic IDs. */
export const demoSeats: Seat[] = [
  {
    section: "Parterre",
    category: "standard",
    rows: ["A", "B", "C", "D"],
    count: 10,
  },
  { section: "VIP", category: "vip", rows: ["V1", "V2"], count: 6 },
].flatMap((group) =>
  group.rows.flatMap((row) =>
    Array.from({ length: group.count }, (_, i) => ({
      id: `demo-${row}-${i + 1}`,
      section: group.section,
      row,
      label: String(i + 1),
      price_category: group.category,
      accessible: false,
      status: "available" as const,
    })),
  ),
);
export const seatingHandlers = [
  http.get("*/api/v1/events/f5-demo/seat-map", () => {
    expire();
    return HttpResponse.json({
      event_id: seatingDemoEventId,
      venue_id: "demo-venue",
      layout_id: layoutId,
      seats: demoSeats.map((s) => ({
        ...s,
        status: [...demoHolds.values()].some(
          (h) => h.status === "held" && h.seat_ids.includes(s.id),
        )
          ? "held"
          : s.status,
      })),
    });
  }),
  http.post("*/api/v1/events/f5-demo/holds", async ({ request }) => {
    const user = mockCurrentUser(request);
    if (user instanceof Response) return user;
    const body = (await request.json()) as {
      ticket_type_id: string;
      seat_ids: string[];
    };
    const offer = seatingDemoOffers.find((o) => o.id === body.ticket_type_id);
    if (
      !offer ||
      !Array.isArray(body.seat_ids) ||
      !body.seat_ids.length ||
      body.seat_ids.length > offer.limit ||
      new Set(body.seat_ids).size !== body.seat_ids.length
    )
      return fail(422, "selection_invalid");
    expire();
    if (
      body.seat_ids.some(
        (id) =>
          !demoSeats.some(
            (s) =>
              s.id === id && categoryMatches(s.price_category, offer.category),
          ),
      )
    )
      return fail(422, "price_category_mismatch");
    if (
      body.seat_ids.some((id) =>
        [...demoHolds.values()].some(
          (h) => h.status === "held" && h.seat_ids.includes(id),
        ),
      )
    )
      return fail(409, "seats_unavailable");
    const hold: DemoHold = {
      id: crypto.randomUUID(),
      event_id: seatingDemoEventId,
      seat_ids: body.seat_ids,
      status: "held",
      expires_at: new Date(Date.now() + 600000).toISOString(),
      owner: user.id,
    };
    demoHolds.set(hold.id, hold);
    const { owner: _, ...out } = hold;
    return HttpResponse.json(out, { status: 201 });
  }),
  http.delete(
    "*/api/v1/events/f5-demo/holds/:holdId",
    ({ request, params }) => {
      const user = mockCurrentUser(request);
      if (user instanceof Response) return user;
      const hold = demoHolds.get(String(params.holdId));
      if (!hold || hold.owner !== user.id) return fail(404, "hold_not_found");
      expire();
      if (hold.status === "held") hold.status = "released";
      return new HttpResponse(null, { status: 204 });
    },
  ),
  http.get("*/api/v1/venues/:id/layouts", ({ params }) =>
    HttpResponse.json([
      {
        id: layoutId,
        venue_id: String(params.id),
        name: "Demo · Standard hall",
      },
    ]),
  ),
  http.get("*/api/v1/events/:id/seat-map", ({ params }) => {
    const data = mockCheckoutEvent(String(params.id));
    if (
      !data ||
      data.event.status !== "published" ||
      data.event.visibility !== "public"
    )
      return HttpResponse.json(
        { code: "event_not_found", message: "Event not found" },
        { status: 404 },
      );
    if (
      data.event.seating_mode !== "assigned" ||
      data.event.layout_id !== layoutId
    )
      return HttpResponse.json(
        { code: "not_assigned_seating", message: "No assigned layout" },
        { status: 409 },
      );
    return HttpResponse.json({
      event_id: data.event.id,
      venue_id: data.event.venue_id,
      layout_id: layoutId,
      seats: demoSeats,
    });
  }),
];

/** Development-only hold ledger. HTTP fixtures do not establish database safety. */
export const seatingDemoEventId = "f5-demo";
export const seatingDemoOffers = [
  {
    id: "standard",
    name: "Demo · Standard",
    category: "standard",
    priceTiyn: 0,
    limit: 4,
  },
  {
    id: "vip",
    name: "Demo · VIP",
    category: "vip",
    priceTiyn: 150000,
    limit: 2,
  },
];
type DemoHold = {
  id: string;
  event_id: string;
  seat_ids: string[];
  status: "held" | "released" | "expired";
  expires_at: string;
  owner: string;
};
const demoHolds = new Map<string, DemoHold>();
export function resetSeatingMocks() {
  demoHolds.clear();
}
function expire() {
  for (const hold of demoHolds.values())
    if (hold.status === "held" && Date.parse(hold.expires_at) <= Date.now())
      hold.status = "expired";
}
const fail = (status: number, code: string) =>
  HttpResponse.json({ code, message: code }, { status });
