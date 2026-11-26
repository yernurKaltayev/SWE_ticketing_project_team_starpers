import type { components } from "../../generated/api";
import { invalidResponse, parsePage } from "../checkout/model";
import { parseEvents } from "../events/contracts";
import type { Event } from "../events/model";
import { parsePrice, toInstant } from "../events/model";
import type { Request } from "../support/model";
import { record, uuid } from "../support/model";
export type Analytics = components["schemas"]["AnalyticsOut"];
export type History = components["schemas"]["HistoryOut"];
export const lifecycles = ["upcoming", "active", "completed", "cancelled"] as const;
export type Lifecycle = typeof lifecycles[number];
export const categories = ["admin", "checkin", "event", "order", "paid_sales", "payment", "promo", "refund", "staff", "support", "ticket_type"] as const;
export const instant = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v)) && /(Z|[+-]\d\d:\d\d)$/.test(v);
const integer = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);
const count = (v: unknown): v is number => integer(v) && v >= 0;
export function parseAnalytics(v: unknown): Analytics {
  if (!record(v) || !["capacity", "sold", "remaining", "gross", "discounts", "refunds", "checked_in", "absent"].every(k => count(v[k])) || !integer(v.net) || !["percent_sold", "checkin_percent"].every(k => typeof v[k] === "number" && Number.isFinite(v[k]) && v[k] >= 0)) return invalidResponse();
  if (!Array.isArray(v.sales_over_time) || v.sales_over_time.length > 366 || !v.sales_over_time.every(r => record(r) && typeof r.date === "string" && /^\d{4}-\d\d-\d\d$/.test(r.date) && Number.isFinite(Date.parse(r.date)) && new Date(r.date).toISOString().slice(0, 10) === r.date && count(r.tickets) && count(r.revenue))) return invalidResponse();
  if (!Array.isArray(v.by_ticket_type) || !v.by_ticket_type.every(r => record(r) && typeof r.ticket_type_id === "string" && typeof r.name === "string" && count(r.sold) && count(r.revenue))) return invalidResponse();
  if (!Array.isArray(v.campaigns) || !v.campaigns.every(r => record(r) && typeof r.campaign_id === "string" && typeof r.name === "string" && count(r.redemptions) && count(r.revenue))) return invalidResponse();
  return v as Analytics;
}
export function parseHistory(v: unknown): History {
  if (!record(v) || typeof v.event_status !== "string" || !lifecycles.includes(v.lifecycle as Lifecycle)) return invalidResponse();
  const page = parsePage(v, r => {
    if (!record(r) || !["id", "actor_role", "action_type", "entity_type", "entity_id", "description"].every(k => typeof r[k] === "string") || !instant(r.occurred_at) || !(r.actor_id === null || typeof r.actor_id === "string") || !record(r.metadata)) return invalidResponse();
    return r as History["items"][number];
  });
  return {
    ...page,
    event_status: v.event_status,
    lifecycle: v.lifecycle
  } as History;
}
export function lifecycle(event: Pick<Event, "status" | "starts_at" | "ends_at">, now = Date.now()): Lifecycle {
  if (event.status === "cancelled") return "cancelled";
  if (now >= Date.parse(event.ends_at)) return "completed";
  return now >= Date.parse(event.starts_at) ? "active" : "upcoming";
}
export async function allEvents(request: Request, signal?: AbortSignal) {
  const items: Event[] = [];
  const ids = new Set<string>();
  let offset = 0;
  let total: number | undefined;
  for (let n = 0; n < 100; n++) {
    const p = parseEvents(await request(`/api/v1/organizers/me/events?limit=100&offset=${offset}`, {
      signal
    }));
    if (total !== undefined && p.total !== total) throw new Error("changed_events");
    total = p.total;
    if (p.offset !== offset || p.total > 10000 || !p.items.length && offset < p.total) throw new Error("incomplete_events");
    for (const e of p.items) {
      if (ids.has(e.id)) throw new Error("duplicate_event");
      ids.add(e.id);
      items.push(e);
    }
    offset += p.items.length;
    if (offset >= p.total) return items;
  }
  throw new Error("event_limit");
}
export function dateQuery(params: URLSearchParams, zone: string, keys: [string, string] = ["date_from", "date_to"]) {
  const query = new URLSearchParams();
  let start: string | undefined, end: string | undefined;
  const from = params.get(keys[0]),
    to = params.get(keys[1]);
  if (from) {
    start = toInstant(from, zone, keys[0]);
    query.set(keys[0], start);
  }
  if (to) {
    end = toInstant(to, zone, keys[1]);
    query.set(keys[1], end);
  }
  if (start && end && Date.parse(start) >= Date.parse(end)) throw new Error("invalid_date_range");
  return query;
}
export function analyticsQuery(params: URLSearchParams, zone: string) {
  const q = dateQuery(params, zone);
  const id = params.get("ticket_type_id");
  if (id) {
    if (!uuid(id)) throw new Error("ticket_type_id");
    q.set("ticket_type_id", id);
  }
  return q;
}
export type AdminSection = "users" | "events" | "orders" | "payments" | "activations" | "refunds" | "support" | "campaigns" | "reports";
export const sections: AdminSection[] = ["users", "events", "orders", "payments", "activations", "refunds", "support", "campaigns", "reports"];
export type Row = Record<string, string | number | boolean | null>;
const required: Record<AdminSection, string> = {
  users: "id email full_name role is_suspended email_verified_at last_login_at created_at",
  events: "id organizer_id title status paid_sales_status starts_at created_at",
  orders: "id order_number event_id buyer_user_id buyer_email status total currency is_simulated created_at",
  payments: "id order_id activation_id kind provider provider_ref status amount fee_amount currency is_simulated failure_reason created_at",
  activations: "id event_id status identity_verified payout_account_id activation_payment_id terms_accepted_at suspended_reason activated_at",
  refunds: "id order_id payment_id amount currency status reason initiated_by created_at",
  support: "id requester_id audience category status assignee_id event_id order_id subject created_at",
  campaigns: "campaign_id event_id name is_enabled max_redemptions redemptions_count applied_redemptions discount_total",
  reports: "id event_id reporter_id reason status created_at"
};
const boolFields = new Set(["is_suspended", "is_simulated", "is_enabled", "identity_verified"]);
export const moneyFields = new Set(["total", "amount", "fee_amount", "discount_total"]);
const numberFields = new Set([...moneyFields, "max_redemptions", "redemptions_count", "applied_redemptions"]);
const nullable = new Set(["email_verified_at", "last_login_at", "buyer_user_id", "order_id", "activation_id", "failure_reason", "payout_account_id", "activation_payment_id", "terms_accepted_at", "suspended_reason", "activated_at", "assignee_id", "event_id", "created_at"]);
export function parseRow(section: AdminSection, v: unknown): Row {
  if (!record(v)) return invalidResponse();
  for (const k of required[section].split(" ")) {
    const value = v[k];
    if (value === null && nullable.has(k)) continue;
    if (boolFields.has(k) ? typeof value !== "boolean" : numberFields.has(k) ? !count(value) : k.endsWith("_at") ? !instant(value) : typeof value !== "string") return invalidResponse();
  }
  if ("currency" in v && v.currency !== "KZT") return invalidResponse();
  return v as Row;
}
export const parseAdminPage = (section: AdminSection) => (v: unknown) => parsePage(v, r => parseRow(section, r));
export function parseDisputes(v: unknown) {
  if (!record(v) || !Array.isArray(v.failed_refunds) || !Array.isArray(v.payment_cases)) return invalidResponse();
  return {
    failed_refunds: v.failed_refunds.map(r => parseRow("refunds", r)),
    payment_cases: v.payment_cases.map(r => parseRow("support", r))
  };
}
export const adminFields = (section: AdminSection) => required[section].split(" ");
export const adminStatuses: Partial<Record<AdminSection, string[]>> = {
  events: ["draft", "published", "suspended", "cancelled"],
  orders: ["pending", "paid", "free_confirmed", "failed", "expired", "cancelled", "refunded", "partially_refunded"],
  payments: ["pending", "succeeded", "failed", "cancelled"],
  activations: ["incomplete", "active", "suspended"],
  refunds: ["pending", "completed", "failed"],
  support: ["open", "in_progress", "waiting_customer", "resolved"],
  reports: ["open", "reviewed", "dismissed", "actioned"]
};
export const hasSearch = (s: AdminSection) => ["users", "events", "orders", "payments"].includes(s);
export const hasDates = (s: AdminSection) => ["users", "events", "orders", "payments", "refunds"].includes(s);
export function adminQuery(section: AdminSection, p: URLSearchParams) {
  const q = hasDates(section) ? dateQuery(p, "UTC", ["created_from", "created_to"]) : new URLSearchParams();
  const term = p.get("q")?.trim();
  if (term && hasSearch(section)) {
    if (term.length > 200) throw new Error("q");
    q.set("q", term);
  }
  const status = p.get("status");
  if (status) {
    if (!adminStatuses[section]?.includes(status)) throw new Error("status");
    q.set("status", status);
  }
  if (section === "users") {
    const role = p.get("role"),
      suspended = p.get("suspended");
    if (role) {
      if (!["attendee", "organizer", "platform_admin"].includes(role)) throw new Error("role");
      q.set("role", role);
    }
    if (suspended) {
      if (!["true", "false"].includes(suspended)) throw new Error("suspended");
      q.set("suspended", suspended);
    }
  }
  if (section === "orders" && p.get("event_id")) {
    if (!uuid(p.get("event_id"))) throw new Error("event_id");
    q.set("event_id", p.get("event_id")!);
  }
  const offset = Number(p.get("offset") ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw new Error("offset");
  q.set("offset", String(offset));
  q.set("limit", "20");
  return q;
}
export const adminPath = (s: AdminSection) => `/api/v1/admin/${s === "support" ? "support/cases" : s}`;
export type Settings = {
  activation_fee_amount: number;
  processing_fee_percent: number;
  payout_delay_days: number;
  hold_minutes: number;
};
export function parseSettings(v: unknown): Settings {
  if (!record(v) || !record(v.settings)) return invalidResponse();
  const s = v.settings;
  if (!count(s.activation_fee_amount) || !s.activation_fee_amount || !count(s.payout_delay_days) || !count(s.hold_minutes) || !s.hold_minutes || typeof s.processing_fee_percent !== "number" || !Number.isFinite(s.processing_fee_percent) || s.processing_fee_percent < 0 || s.processing_fee_percent > 100) return invalidResponse();
  return s as Settings;
}
export function settingsBody(form: Pick<FormData, "get">, current: Settings) {
  const f = (key: string) => String(form.get(key) ?? "").trim();
  const fee = parsePrice(f("activation_fee_amount"));
  const percent = f("processing_fee_percent");
  if (!fee || !/^\d+(?:\.\d+)?$/.test(percent) || !Number.isFinite(Number(percent)) || Number(percent) > 100) throw new Error("settings");
  const n = (k: string, min: number) => {
    const s = f(k),
      value = Number(s);
    if (!/^\d+$/.test(s) || !Number.isSafeInteger(value) || value < min) throw new Error(k);
    return value;
  };
  const next: Settings = {
    activation_fee_amount: fee,
    processing_fee_percent: Number(percent),
    payout_delay_days: n("payout_delay_days", 0),
    hold_minutes: n("hold_minutes", 1)
  };
  const changes: Partial<Settings> = {};
  for (const key of Object.keys(next) as (keyof Settings)[]) if (next[key] !== current[key]) changes[key] = next[key];
  if (!Object.keys(changes).length) throw new Error("no_changes");
  return {
    settings: changes
  };
}
export const exportKinds = ["orders", "payments", "refunds", "users", "events"] as const;
export function exportPath(kind: string, params: URLSearchParams) {
  if (!exportKinds.includes(kind as typeof exportKinds[number])) throw new Error("report");
  const q = dateQuery(params, "UTC", ["created_from", "created_to"]);
  return `/api/v1/admin/exports/${kind}.csv${q.size ? "?" + q : ""}`;
}
