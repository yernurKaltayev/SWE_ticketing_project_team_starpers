import { http, HttpResponse } from "msw";
import { mockManagedEvent, mockCheckoutEvent } from "./events";
import { parseCampaign } from "../promotions/model";
import type { Campaign, CampaignInput, Report } from "../promotions/model";
import type { Order } from "../checkout/model";
import { campaignPngs } from "./campaign-assets";
const campaigns = new Map<
  string,
  { value: Campaign; token: string; image: number }
>();
const redemptions = new Map<string, { campaignId: string; order: Order }>();
export function resetPromotionMocks() {
  campaigns.clear();
  redemptions.clear();
}
export function mockCampaignList() {
  return [...campaigns.values()].map((r) => r.value);
}
const fail = (status: number, code: string) =>
  HttpResponse.json(
    { code, message: "Development campaign response", details: null },
    { status },
  );
function page<T>(rows: T[], request: Request) {
  const p = new URL(request.url).searchParams,
    limit = Math.max(1, Math.min(100, Number(p.get("limit")) || 20)),
    offset = Math.max(0, Number(p.get("offset")) || 0);
  return {
    items: rows.slice(offset, offset + limit),
    total: rows.length,
    limit,
    offset,
  };
}
export function mockPromoQuote(eventId: string, code: string, ids: string[]) {
  const c = mockCampaignList().find(
    (c) => c.event_id === eventId && c.code === code.trim().toUpperCase(),
  );
  if (!c)
    return { valid: false, discount_amount: 0, reason: "promo_not_found" };
  let reason: string | null = null;
  const now = Date.now();
  if (!c.is_enabled) reason = "promo_disabled";
  else if (Date.parse(c.valid_from) > now) reason = "promo_not_started";
  else if (Date.parse(c.valid_to) <= now) reason = "promo_expired";
  else if (c.redemptions_count >= c.max_redemptions) reason = "promo_exhausted";
  if (reason) return { valid: false, discount_amount: 0, reason };
  const context = mockCheckoutEvent(eventId);
  let base = 0;
  for (const id of ids) {
    const type = context?.tickets.find((t) => t.id === id && !t.is_hidden);
    if (type && (!c.ticket_type_ids.length || c.ticket_type_ids.includes(id)))
      base += type.price_amount;
  }
  if (!base)
    return { valid: false, discount_amount: 0, reason: "promo_not_applicable" };
  const discount =
    c.discount_type === "fixed"
      ? Math.min(c.discount_value, base)
      : Math.floor((base * c.discount_value + 50) / 100);
  return { valid: true, discount_amount: discount, reason: null };
}
export function mockPromoClaim(
  eventId: string,
  code: string,
  ids: string[],
  order: Order,
) {
  const quote = mockPromoQuote(eventId, code, ids);
  if (!quote.valid) return quote;
  const campaign = mockCampaignList().find(
    (c) => c.event_id === eventId && c.code === code.trim().toUpperCase(),
  )!;
  campaign.redemptions_count++;
  redemptions.set(order.id, { campaignId: campaign.id, order });
  return quote;
}
export function mockPromoRelease(orderId: string) {
  const r = redemptions.get(orderId);
  if (!r) return;
  const c = campaigns.get(r.campaignId)?.value;
  if (c) c.redemptions_count = Math.max(0, c.redemptions_count - 1);
  redemptions.delete(orderId);
}
function report(id: string): Report {
  const rows = [...redemptions.values()].filter(
    (r) =>
      r.campaignId === id &&
      ["paid", "free_confirmed"].includes(r.order.status),
  );
  return {
    redemptions: campaigns.get(id)!.value.redemptions_count,
    orders: rows.length,
    tickets_sold: rows.reduce(
      (s, r) => s + r.order.items.reduce((n, i) => n + i.quantity, 0),
      0,
    ),
    gross_revenue: rows.reduce((s, r) => s + r.order.subtotal, 0),
    discount: rows.reduce((s, r) => s + r.order.discount_amount, 0),
    net_revenue: rows.reduce((s, r) => s + r.order.total, 0),
  };
}
export const promotionHandlers = [
  http.get("*/api/v1/events/:id/campaigns", ({ params, request }) => {
    const event = mockManagedEvent(request, String(params.id));
    if (event instanceof Response) return event;
    return HttpResponse.json(
      page(
        mockCampaignList().filter((c) => c.event_id === event.id),
        request,
      ),
    );
  }),
  http.post("*/api/v1/events/:id/campaigns", async ({ params, request }) => {
    const event = mockManagedEvent(request, String(params.id));
    if (event instanceof Response) return event;
    const body = (await request.json()) as CampaignInput;
    try {
      const c = parseCampaign({
        ...body,
        id: crypto.randomUUID(),
        event_id: event.id,
        code: `DM${String(campaigns.size + 2).padStart(6, "2")}`,
        redemptions_count: 0,
        is_enabled: true,
        qr_url: "/unused",
      });
      if (
        (body.discount_type === "percent" && body.discount_value > 100) ||
        body.max_redemptions > 1000000
      )
        return fail(422, "validation_error");
      const types = mockCheckoutEvent(event.id)!.tickets;
      if (c.ticket_type_ids.some((id) => !types.some((t) => t.id === id)))
        return fail(422, "ticket_type_mismatch");
      c.qr_url = `/api/v1/campaigns/${c.id}/qr`;
      const image = campaigns.size;
      campaigns.set(c.id, { value: c, token: `demo-campaign-${image}`, image });
      return HttpResponse.json(c, { status: 201 });
    } catch {
      return fail(422, "validation_error");
    }
  }),
  http.get("*/api/v1/campaigns/:id", ({ params, request }) => {
    const c = campaigns.get(String(params.id))?.value;
    if (!c) return fail(404, "campaign_not_found");
    const event = mockManagedEvent(request, c.event_id);
    return event instanceof Response ? event : HttpResponse.json(c);
  }),
  http.patch("*/api/v1/campaigns/:id", async ({ params, request }) => {
    const c = campaigns.get(String(params.id))?.value;
    if (!c) return fail(404, "campaign_not_found");
    const event = mockManagedEvent(request, c.event_id);
    if (event instanceof Response) return event;
    const body = (await request.json()) as Partial<Campaign>;
    if (
      body.max_redemptions !== undefined &&
      body.max_redemptions < c.redemptions_count
    )
      return fail(409, "max_below_redemptions");
    try {
      const next = parseCampaign({
        ...c,
        ...body,
        discount_type: c.discount_type,
        discount_value: c.discount_value,
        ticket_type_ids: c.ticket_type_ids,
      });
      Object.assign(c, next);
      return HttpResponse.json(c);
    } catch {
      return fail(422, "validation_error");
    }
  }),
  http.get("*/api/v1/campaigns/:id/qr", ({ params, request }) => {
    const row = campaigns.get(String(params.id));
    if (!row) return fail(404, "campaign_not_found");
    const event = mockManagedEvent(request, row.value.event_id);
    if (event instanceof Response) return event;
    const b64 = campaignPngs[row.image];
    if (!b64) return fail(501, "fixture_qr_limit");
    return new HttpResponse(
      Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)),
      { headers: { "Content-Type": "image/png" } },
    );
  }),
  http.get("*/api/v1/campaigns/:id/report", ({ params, request }) => {
    const c = campaigns.get(String(params.id))?.value;
    if (!c) return fail(404, "campaign_not_found");
    const event = mockManagedEvent(request, c.event_id);
    return event instanceof Response ? event : HttpResponse.json(report(c.id));
  }),
  http.post("*/api/v1/promo/validate", async ({ request }) => {
    const b = (await request.json()) as {
      event_id: string;
      code: string;
      ticket_type_ids: string[];
    };
    if (
      typeof b.code !== "string" ||
      !Array.isArray(b.ticket_type_ids) ||
      !b.ticket_type_ids.length ||
      b.ticket_type_ids.length > 100
    )
      return fail(422, "validation_error");
    return HttpResponse.json(
      mockPromoQuote(b.event_id, b.code, b.ticket_type_ids),
    );
  }),
  http.get("*/c/:token", ({ params }) => {
    const row = [...campaigns.values()].find((r) => r.token === params.token);
    if (!row) return fail(404, "campaign_not_found");
    const c = row.value,
      now = Date.now();
    const reason = !c.is_enabled
      ? "promo_disabled"
      : Date.parse(c.valid_from) > now
        ? "promo_not_started"
        : Date.parse(c.valid_to) <= now
          ? "promo_expired"
          : c.redemptions_count >= c.max_redemptions
            ? "promo_exhausted"
            : null;
    return HttpResponse.redirect(
      `http://localhost:5173/events/${c.event_id}?${reason ? "promo_status=" + reason : "promo=" + c.code}`,
      302,
    );
  }),
];

export function mockRedemptionRows(){return [...redemptions.values()];}
