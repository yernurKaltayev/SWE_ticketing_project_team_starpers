import type { ApiRequestOptions } from "../../index";
import { parsePage, invalidResponse } from "../checkout/model";
import type { Choice } from "../checkout/model";
import { parsePrice, positive, toInstant } from "../events/model";
export type Request = <T>(
  path: string,
  options?: ApiRequestOptions,
) => Promise<T>;
export type Campaign = {
  id: string;
  event_id: string;
  name: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  valid_from: string;
  valid_to: string;
  max_redemptions: number;
  ticket_type_ids: string[];
  code: string;
  redemptions_count: number;
  is_enabled: boolean;
  qr_url: string;
};
export type CampaignInput = Pick<
  Campaign,
  | "name"
  | "discount_type"
  | "discount_value"
  | "valid_from"
  | "valid_to"
  | "max_redemptions"
  | "ticket_type_ids"
>;
export type Report = {
  redemptions: number;
  orders: number;
  tickets_sold: number;
  gross_revenue: number;
  discount: number;
  net_revenue: number;
};
export type Validation = {
  valid: boolean;
  discount_amount: number;
  reason: string | null;
};
const obj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const integer = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const instant = (v: unknown): v is string =>
  typeof v === "string" &&
  Number.isFinite(Date.parse(v)) &&
  /(Z|[+-]\d\d:\d\d)$/.test(v);
export function parseCampaign(v: unknown): Campaign {
  if (
    !obj(v) ||
    !["id", "event_id", "name", "code", "qr_url"].every(
      (k) => typeof v[k] === "string" && !!v[k],
    ) ||
    !["percent", "fixed"].includes(String(v.discount_type)) ||
    !integer(v.discount_value) ||
    !v.discount_value ||
    (v.discount_type === "percent" && v.discount_value > 100) ||
    !instant(v.valid_from) ||
    !instant(v.valid_to) ||
    Date.parse(v.valid_to) <= Date.parse(v.valid_from) ||
    !integer(v.max_redemptions) ||
    !v.max_redemptions ||
    !integer(v.redemptions_count) ||
    typeof v.is_enabled !== "boolean" ||
    !Array.isArray(v.ticket_type_ids) ||
    !v.ticket_type_ids.every((x) => typeof x === "string")
  )
    return invalidResponse();
  return v as Campaign;
}
export const parseCampaigns = (v: unknown) => parsePage(v, parseCampaign);
export function parseReport(v: unknown): Report {
  if (
    !obj(v) ||
    ![
      "redemptions",
      "orders",
      "tickets_sold",
      "gross_revenue",
      "discount",
      "net_revenue",
    ].every((k) => integer(v[k]))
  )
    return invalidResponse();
  return v as Report;
}
export function parseValidation(v: unknown): Validation {
  if (
    !obj(v) ||
    typeof v.valid !== "boolean" ||
    !integer(v.discount_amount) ||
    !(v.reason === null || typeof v.reason === "string") ||
    (!v.valid && v.discount_amount !== 0) ||
    (v.valid && v.reason !== null)
  )
    return invalidResponse();
  return v as Validation;
}
export const codeValue = (v: string) => v.trim().toUpperCase();
export function campaignBody(form: FormData, zone: string): CampaignInput {
  const value = (key: string) => String(form.get(key) ?? "").trim();
  const name = value("name");
  if (!name || name.length > 200) throw new Error("name");
  const type = value("discount_type");
  if (type !== "percent" && type !== "fixed") throw new Error("discount_type");
  const discount =
    type === "fixed"
      ? parsePrice(value("discount_value"))
      : positive(value("discount_value"), "discount_value");
  if (!discount || (type === "percent" && discount > 100))
    throw new Error("discount_value");
  const from = toInstant(value("valid_from"), zone, "valid_from"),
    to = toInstant(value("valid_to"), zone, "valid_to");
  if (Date.parse(to) <= Date.parse(from)) throw new Error("valid_to");
  const limit = positive(value("max_redemptions"), "max_redemptions");
  if (limit > 1000000 || form.getAll("ticket_type_ids").length > 100)
    throw new Error("max_redemptions");
  return {
    name,
    discount_type: type,
    discount_value: discount,
    valid_from: from,
    valid_to: to,
    max_redemptions: limit,
    ticket_type_ids: [...new Set(form.getAll("ticket_type_ids").map(String))],
  };
}
export function campaignPatch(body: CampaignInput, enabled: boolean) {
  return {
    name: body.name,
    valid_from: body.valid_from,
    valid_to: body.valid_to,
    max_redemptions: body.max_redemptions,
    is_enabled: enabled,
  };
}
export function selectedCart(
  choices: Choice[],
  quantities: Record<string, number>,
) {
  const ids: string[] = [];
  let subtotal = 0;
  for (const c of choices) {
    const n = quantities[c.id] ?? 0;
    if (!Number.isSafeInteger(n) || n < 0 || n > 100) return null;
    const price = c.free ? 0 : c.price;
    if (n && price === undefined) return null;
    for (let i = 0; i < n; i++) ids.push(c.id);
    subtotal += (price ?? 0) * n;
  }
  if (!ids.length || ids.length > 100 || !Number.isSafeInteger(subtotal))
    return null;
  return { ids, subtotal, key: JSON.stringify(ids) };
}
export async function validatePromo(
  request: Request,
  eventId: string,
  code: string,
  ids: string[],
  signal?: AbortSignal,
) {
  const result = parseValidation(
    await request("/api/v1/promo/validate", {
      method: "POST",
      body: { event_id: eventId, code: codeValue(code), ticket_type_ids: ids },
      signal,
    }),
  );
  return result;
}
export function checkoutLink(eventId: string, search: string) {
  const src = new URLSearchParams(search);
  const p = new URLSearchParams();
  for (const key of ["promo", "promo_status", "share"]) {
    const v = src.get(key);
    if (v && v.length <= 256) p.set(key, v);
  }
  return `/events/${encodeURIComponent(eventId)}/checkout${p.size ? "?" + p : ""}`;
}
