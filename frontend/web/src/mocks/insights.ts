/** Development-only P11/P12/P13 responses. Live reporting/authorization needs backend acceptance. */
import { http, HttpResponse } from "msw";
import { mockCurrentUser, mockAllUsers, mockUserById, mockUserByEmail, mockSuspendUser } from "./auth";
import { mockCheckoutEvent, mockAllEvents, mockSetEventState, mockOwnsEvent, mockPaidSales } from "./events";
import { mockAllOrders } from "./orders";
import { mockAllRefunds } from "./operations";
import { mockPaymentRows, mockActivationRows, mockSetActivation } from "./payments";
import { mockCampaignList, mockRedemptionRows } from "./promotions";
import { mockStaffMembers } from "./staff";
import { mockSupportCases, mockNotify } from "./support";
import { lifecycle, parseSettings, sections } from "../insights/model";
import type { AdminSection, Analytics, Row, Settings, History } from "../insights/model";
import { csvCell } from "../operations/model";
type User = NonNullable<ReturnType<typeof mockUserById>>;
const audits = new Map<string, History["items"]>();
const reports: Row[] = [];
let settings: Settings = {
  activation_fee_amount: 1000000,
  processing_fee_percent: 3,
  payout_delay_days: 3,
  hold_minutes: 10
};
export function resetInsightMocks() {
  audits.clear();
  reports.length = 0;
  settings = {
    activation_fee_amount: 1000000,
    processing_fee_percent: 3,
    payout_delay_days: 3,
    hold_minutes: 10
  };
}
export function mockAudit(eventId: string, action: string, entityType: string, entityId: string, description: string, user?: User) {
  const rows = audits.get(eventId) ?? [];
  rows.unshift({
    id: crypto.randomUUID(),
    occurred_at: new Date().toISOString(),
    actor_id: user?.id ?? null,
    actor_role: user?.role ?? "system",
    action_type: action,
    entity_type: entityType,
    entity_id: entityId,
    description,
    metadata: {}
  });
  audits.set(eventId, rows);
}
const fail = (status: number, code: string) => HttpResponse.json({
  code,
  message: "Development analytics/admin response.",
  details: null
}, {
  status
});
function admin(request: Request) {
  const user = mockCurrentUser(request);
  return user instanceof Response ? user : user.role === "platform_admin" ? user : fail(403, "insufficient_role");
}
function manager(request: Request, id: string) {
  const user = mockCurrentUser(request);
  if (user instanceof Response) return user;
  if (!mockCheckoutEvent(id)) return fail(404, "event_not_found");
  return user.role === "platform_admin" || mockOwnsEvent(user.email, id) || mockStaffMembers(id).some(m => m.user_id === user.id && m.role === "manager") ? user : fail(403, "forbidden");
}
function page<T>(rows: T[], request: Request) {
  const p = new URL(request.url).searchParams,
    limit = Math.max(1, Math.min(100, Number(p.get("limit")) || 20)),
    offset = Math.max(0, Number(p.get("offset")) || 0);
  return {
    items: rows.slice(offset, offset + limit),
    total: rows.length,
    offset,
    limit
  };
}
const created = "2026-01-01T00:00:00Z",
  nil = "00000000-0000-4000-8000-000000000000";
function adminRows(section: AdminSection): Row[] {
  switch (section) {
    case "users":
      return mockAllUsers().map(a => ({
        ...a.user,
        is_suspended: a.suspended,
        last_login_at: null,
        created_at: created
      }));
    case "events":
      return mockAllEvents().map(r => ({
        id: r.value.id,
        organizer_id: mockUserByEmail(r.owner)?.id ?? nil,
        title: r.value.title,
        status: r.value.status,
        paid_sales_status: r.value.paid_sales_status,
        starts_at: r.value.starts_at,
        created_at: created
      }));
    case "orders":
      return mockAllOrders().map(r => ({
        id: r.value.id,
        order_number: r.value.order_number,
        event_id: r.eventId,
        buyer_user_id: r.owner,
        buyer_email: mockUserById(r.owner)?.email ?? "",
        status: r.value.status,
        total: r.value.total,
        currency: "KZT",
        is_simulated: r.value.is_simulated,
        created_at: r.createdAt
      }));
    case "payments":
      return mockPaymentRows().map(r => ({
        id: r.payment.id,
        order_id: r.reference.startsWith("order:") ? r.reference.slice(6) : null,
        activation_id: r.reference.startsWith("event:") ? r.reference.slice(6) : null,
        kind: r.payment.kind,
        provider: "sandbox",
        provider_ref: r.payment.id,
        status: r.payment.status,
        amount: r.payment.amount,
        fee_amount: r.payment.fee_amount,
        currency: "KZT",
        is_simulated: true,
        failure_reason: r.payment.failure_reason,
        created_at: created
      }));
    case "activations":
      return mockActivationRows().map(a => ({
        id: a.event_id,
        event_id: a.event_id,
        status: a.status,
        identity_verified: a.identity_verified,
        payout_account_id: a.payout_account_id,
        activation_payment_id: null,
        terms_accepted_at: a.terms_accepted_at,
        suspended_reason: a.status === "suspended" ? "Development suspension" : null,
        activated_at: a.status === "active" ? created : null
      }));
    case "refunds":
      return mockAllRefunds().map(r => ({
        id: r.id,
        order_id: r.order_id,
        payment_id: mockPaymentRows().find(p => p.reference === `order:${r.order_id}`)?.payment.id ?? nil,
        amount: r.amount,
        currency: "KZT",
        status: r.status,
        reason: r.reason,
        initiated_by: mockUserByEmail("organizer@example.com")?.id ?? nil,
        created_at: r.completed_at ?? created
      }));
    case "support":
      return mockSupportCases().filter(c => c.audience === "organizer_case").map(c => ({
        ...c
      }));
    case "campaigns":
      return mockCampaignList().map(c => {
        const applied = mockRedemptionRows().filter(r => r.campaignId === c.id);
        return {
          campaign_id: c.id,
          event_id: c.event_id,
          name: c.name,
          is_enabled: c.is_enabled,
          max_redemptions: c.max_redemptions,
          redemptions_count: c.redemptions_count,
          applied_redemptions: applied.length,
          discount_total: applied.reduce((n, r) => n + r.order.discount_amount, 0)
        };
      });
    case "reports":
      return reports;
  }
}
const csvFields: Record<string, string[]> = {
  orders: "order_number event_id buyer_email status subtotal discount_amount processing_fee total currency is_simulated created_at".split(" "),
  payments: "id order_id kind provider provider_ref status amount fee_amount currency is_simulated failure_reason created_at".split(" "),
  refunds: "id order_id payment_id amount currency status reason created_at".split(" "),
  users: "id email full_name role is_suspended created_at".split(" "),
  events: "id organizer_id title status paid_sales_status starts_at created_at".split(" ")
};
const between = (date: string, from: string | null, to: string | null) => (!from || Date.parse(date) >= Date.parse(from)) && (!to || Date.parse(date) < Date.parse(to));
export function mockAnalytics(id: string, p = new URLSearchParams()): Analytics {
  const context = mockCheckoutEvent(id)!;
  const type = p.get("ticket_type_id"),
    from = p.get("date_from"),
    to = p.get("date_to");
  const types = context.tickets.filter(t => !type || t.id === type);
  const ids = new Set(types.map(t => t.id));
  const orders = mockAllOrders().filter(r => r.eventId === id);
  const live = orders.flatMap(r => r.value.tickets.filter(t => ["valid", "checked_in"].includes(t.status) && r.value.items.some(i => ids.has(i.ticket_type_id) && context.tickets.find(v => v.id === i.ticket_type_id)?.name === t.ticket_type)));
  const reserved = types.reduce((n, t) => n + t.reserved, 0) + orders.filter(r => r.value.status === "pending").reduce((n, r) => n + r.value.items.filter(i => ids.has(i.ticket_type_id)).reduce((s, i) => s + i.quantity, 0), 0);
  const sale = orders.filter(r => ["paid", "free_confirmed", "refunded", "partially_refunded"].includes(r.value.status) && between(r.createdAt, from, to));
  let gross = 0,
    discounts = 0,
    refunds = 0;
  const revenueByType = new Map<string, number>(),
    days = new Map<string, {
      tickets: number;
      revenue: number;
    }>();
  const dateOf = (stamp: string) => new Intl.DateTimeFormat("en-CA", {
    timeZone: context.event.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(stamp));
  for (const row of sale) {
    const items = row.value.items.filter(i => ids.has(i.ticket_type_id));
    const base = items.reduce((n, i) => n + i.line_total, 0),
      share = type ? row.value.subtotal ? base / row.value.subtotal : 0 : 1,
      disc = Math.round(row.value.discount_amount * share);
    gross += base;
    discounts += disc;
    refunds += Math.round(mockAllRefunds().filter(r => r.order_id === row.value.id && r.status === "completed").reduce((n, r) => n + r.amount, 0) * share);
    const d = dateOf(row.createdAt),
      old = days.get(d) ?? {
        tickets: 0,
        revenue: 0
      };
    days.set(d, {
      tickets: old.tickets + items.reduce((n, i) => n + i.quantity, 0),
      revenue: old.revenue + base - disc
    });
    for (const item of items) revenueByType.set(item.ticket_type_id, (revenueByType.get(item.ticket_type_id) ?? 0) + item.line_total - Math.round(row.value.discount_amount * (row.value.subtotal ? item.line_total / row.value.subtotal : 0)));
  }
  const capacity = type ? types[0]?.quantity_total ?? 0 : context.event.capacity,
    sold = live.length,
    checked = live.filter(t => t.status === "checked_in").length;
  const series: Analytics["sales_over_time"] = [];
  if (days.size || from && to) {
    let date = from ? dateOf(from) : [...days.keys()].sort()[0]!;
    const last = to ? dateOf(new Date(Date.parse(to) - 1).toISOString()) : dateOf(new Date().toISOString());
    for (let i = 0; i < 366 && date <= last; i++) {
      series.push({
        date,
        ...(days.get(date) ?? {
          tickets: 0,
          revenue: 0
        })
      });
      date = new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    }
  }
  return {
    capacity,
    sold,
    remaining: Math.max(0, capacity - sold - reserved),
    percent_sold: capacity ? Math.round(sold / capacity * 1000) / 10 : 0,
    gross,
    discounts,
    refunds,
    net: gross - discounts - refunds,
    checked_in: checked,
    absent: sold - checked,
    checkin_percent: sold ? Math.round(checked / sold * 1000) / 10 : 0,
    sales_over_time: series,
    by_ticket_type: types.map(t => ({
      ticket_type_id: t.id,
      name: t.name,
      sold: live.filter(v => v.ticket_type === t.name).length,
      revenue: revenueByType.get(t.id) ?? 0
    })),
    campaigns: mockCampaignList().filter(c => c.event_id === id).map(c => {
      const matches = mockRedemptionRows().filter(r => r.campaignId === c.id && sale.some(s => s.value.id === r.order.id) && (!type || r.order.items.some(i => i.ticket_type_id === type)));
      return {
        campaign_id: c.id,
        name: c.name,
        redemptions: matches.length,
        revenue: matches.reduce((n, r) => {
          const share = type ? r.order.subtotal ? r.order.items.filter(i => ids.has(i.ticket_type_id)).reduce((s, i) => s + i.line_total, 0) / r.order.subtotal : 0 : 1;
          return n + Math.round((r.order.subtotal - r.order.discount_amount) * share);
        }, 0)
      };
    }).filter(c => c.redemptions > 0)
  };
}
function category(action: string) {
  if (action.startsWith("event_report.")) return "admin";
  if (action.startsWith("event_") || action.startsWith("event.")) return "event";
  if (action.startsWith("ticket_type_")) return "ticket_type";
  if (action.startsWith("staff_")) return "staff";
  return action.split(".")[0];
}
export const insightHandlers = [http.get("*/api/v1/events/:id/analytics", ({
  request,
  params
}) => {
  const id = String(params.id),
    user = manager(request, id);
  if (user instanceof Response) return user;
  const p = new URL(request.url).searchParams;
  if (p.get("date_from") && p.get("date_to") && Date.parse(p.get("date_from")!) > Date.parse(p.get("date_to")!)) return fail(422, "invalid_date_range");
  if (p.get("ticket_type_id") && !mockCheckoutEvent(id)!.tickets.some(t => t.id === p.get("ticket_type_id"))) return fail(404, "ticket_type_not_found");
  return HttpResponse.json(mockAnalytics(id, p));
}), http.get("*/api/v1/events/:id/history", ({
  request,
  params
}) => {
  const id = String(params.id),
    user = manager(request, id);
  if (user instanceof Response) return user;
  const p = new URL(request.url).searchParams;
  const rows = (audits.get(id) ?? []).filter(r => between(r.occurred_at, p.get("date_from"), p.get("date_to")) && (!p.get("action_type") || r.action_type === p.get("action_type")) && (!p.get("category") || category(r.action_type) === p.get("category")));
  return HttpResponse.json({
    ...page(rows, request),
    event_status: mockCheckoutEvent(id)!.event.status,
    lifecycle: lifecycle(mockCheckoutEvent(id)!.event)
  });
}), http.post("*/api/v1/events/:id/reports", async ({
  request,
  params
}) => {
  const user = mockCurrentUser(request);
  if (user instanceof Response) return user;
  const event = mockCheckoutEvent(String(params.id))?.event;
  if (!event || event.status !== "published" || event.visibility === "private") return fail(404, "event_not_found");
  const b = (await request.json()) as {
    reason: string;
  };
  if (typeof b.reason !== "string" || !b.reason.trim() || b.reason.trim().length > 2000) return fail(422, "validation_error");
  const row: Row = {
    id: crypto.randomUUID(),
    event_id: event.id,
    reporter_id: user.id,
    reason: b.reason.trim(),
    status: "open",
    created_at: new Date().toISOString()
  };
  reports.unshift(row);
  mockAudit(event.id, "event_report.created", "event_report", String(row.id), "Event reported", user);
  return HttpResponse.json(row, {
    status: 201
  });
}), ...sections.map(section => http.get(`*/api/v1/admin/${section === "support" ? "support/cases" : section}`, ({
  request
}) => {
  const user = admin(request);
  if (user instanceof Response) return user;
  const p = new URL(request.url).searchParams,
    q = (p.get("q") ?? "").toLowerCase();
  let rows = adminRows(section);
  if (q) {
    const keys = section === "users" ? ["full_name", "email"] : section === "events" ? ["title"] : section === "orders" ? ["order_number", "buyer_email"] : ["provider_ref"];
    rows = rows.filter(r => keys.some(k => String(r[k] ?? "").toLowerCase().includes(q)));
  }
  for (const key of ["status", "role", "event_id"]) {
    if (p.get(key)) rows = rows.filter(r => r[key] === p.get(key));
  }
  if (section === "support" && !p.get("status")) rows = rows.filter(r => r.status !== "resolved");
  if (p.has("suspended")) rows = rows.filter(r => r.is_suspended === (p.get("suspended") === "true"));
  rows = rows.filter(r => !r.created_at || between(String(r.created_at), p.get("created_from"), p.get("created_to")));
  return HttpResponse.json(page(rows, request));
})), http.get("*/api/v1/admin/disputes", ({
  request
}) => {
  const user = admin(request);
  return user instanceof Response ? user : HttpResponse.json({
    failed_refunds: adminRows("refunds").filter(r => r.status === "failed").slice(0, 100),
    payment_cases: mockSupportCases().filter(c => ["payment", "refund"].includes(c.category) && c.status !== "resolved").slice(0, 100)
  });
}), http.get("*/api/v1/admin/settings", ({
  request
}) => {
  const user = admin(request);
  return user instanceof Response ? user : HttpResponse.json({
    settings
  });
}), http.patch("*/api/v1/admin/settings", async ({
  request
}) => {
  const user = admin(request);
  if (user instanceof Response) return user;
  const b = (await request.json()) as {
    settings: Partial<Settings>;
  };
  if (!b.settings || !Object.keys(b.settings).length || Object.keys(b.settings).some(k => !(k in settings))) return fail(422, "unknown_setting");
  try {
    const next = parseSettings({
      settings: {
        ...settings,
        ...b.settings
      }
    });
    settings = {
      ...next
    };
    return HttpResponse.json({
      settings
    });
  } catch {
    return fail(422, "invalid_setting");
  }
}), http.patch("*/api/v1/admin/reports/:id", async ({
  request,
  params
}) => {
  const user = admin(request);
  if (user instanceof Response) return user;
  const row = reports.find(r => r.id === params.id);
  if (!row) return fail(404, "report_not_found");
  const b = (await request.json()) as {
    status: string;
  };
  if (!["reviewed", "dismissed", "actioned"].includes(b.status)) return fail(422, "validation_error");
  row.status = b.status;
  mockAudit(String(row.event_id), `event_report.${b.status}`, "event_report", String(row.id), "Event report reviewed", user);
  return HttpResponse.json(row);
}), http.post("*/api/v1/admin/users/:id/suspend", async ({
  request,
  params
}) => {
  const user = admin(request);
  if (user instanceof Response) return user;
  const target = mockUserById(String(params.id));
  if (!target) return fail(404, "user_not_found");
  const b = (await request.json()) as {
    suspended: boolean;
    reason: string;
  };
  if (typeof b.suspended !== "boolean" || !b.reason?.trim() || b.reason.trim().length > 500) return fail(422, "validation_error");
  if (b.suspended && target.role === "platform_admin") return fail(409, target.id === user.id ? "cannot_suspend_self" : "cannot_suspend_admin");
  mockSuspendUser(target.id, b.suspended);
  return HttpResponse.json(adminRows("users").find(r => r.id === target.id));
}), http.post("*/api/v1/admin/events/:id/suspend", async ({
  request,
  params
}) => {
  const user = admin(request);
  if (user instanceof Response) return user;
  const id = String(params.id),
    event = mockCheckoutEvent(id)?.event;
  if (!event) return fail(404, "event_not_found");
  const b = (await request.json()) as {
    suspended: boolean;
    reason: string;
  };
  if (typeof b.suspended !== "boolean" || !b.reason?.trim() || b.reason.trim().length > 500) return fail(422, "validation_error");
  if (event.status !== (b.suspended ? "published" : "suspended")) return fail(409, "invalid_event_status");
  mockSetEventState(id, {
    status: b.suspended ? "suspended" : "published",
    paid_sales_status: b.suspended && event.paid_sales_status === "active" ? "suspended" : !b.suspended && event.paid_sales_status === "suspended" ? "active" : event.paid_sales_status
  });
  if (["active", "suspended"].includes(event.paid_sales_status)) mockSetActivation(id, b.suspended ? "suspended" : "active");
  mockAudit(id, b.suspended ? "event.suspended" : "event.resumed", "event", id, b.reason, user);
  const owner = mockAllEvents().find(r => r.value.id === id)?.owner;
  const recipient = owner ? mockUserByEmail(owner) : undefined;
  if (recipient) mockNotify(recipient.id, "event_update", {
    event_id: id
  });
  return HttpResponse.json(adminRows("events").find(r => r.id === id));
}), http.post("*/api/v1/admin/events/:id/paid-sales/suspend", async ({
  request,
  params
}) => {
  const user = admin(request);
  if (user instanceof Response) return user;
  const id = String(params.id),
    event = mockCheckoutEvent(id)?.event;
  if (!event) return fail(404, "event_not_found");
  const b = (await request.json()) as {
    suspended: boolean;
    reason: string;
  };
  if (!b.reason?.trim() || b.reason.trim().length > 500 || typeof b.suspended !== "boolean") return fail(422, "validation_error");
  if (event.paid_sales_status !== (b.suspended ? "active" : "suspended")) return fail(409, "invalid_event_status");
  mockPaidSales(id, b.suspended ? "suspended" : "active");
  mockSetActivation(id, b.suspended ? "suspended" : "active");
  mockAudit(id, "paid_sales.suspended", "event", id, b.reason, user);
  return HttpResponse.json(adminRows("activations").find(r => r.event_id === id));
}), http.get("*/api/v1/admin/exports/:file", ({
  request,
  params
}) => {
  const user = admin(request);
  if (user instanceof Response) return user;
  const name = String(params.file).replace(/\.csv$/, "");
  if (!["users", "events", "orders", "payments", "refunds"].includes(name)) return fail(404, "report_kind_not_found");
  const section = name as AdminSection,
    p = new URL(request.url).searchParams,
    rows = adminRows(section).filter(r => !r.created_at || between(String(r.created_at), p.get("created_from"), p.get("created_to"))).slice(0, 10000),
    keys = csvFields[section]!;
  return new HttpResponse([keys.join(","), ...rows.map(r => keys.map(k => csvCell(r[k] ?? (section === "orders" ? mockAllOrders().find(o => o.value.id === r.id)?.value[k as "subtotal" | "discount_amount" | "processing_fee"] : null))).join(","))].join("\r\n"), {
    headers: {
      "Content-Type": "text/csv"
    }
  });
})];
