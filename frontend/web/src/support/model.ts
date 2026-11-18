import { ApiError } from "@biletflow/shared";
import type { ApiRequestOptions } from "@biletflow/shared";
import { parsePage, invalidResponse } from "../checkout/model";
export type Request = <T>(
  path: string,
  options?: ApiRequestOptions,
) => Promise<T>;
export const categories = [
  "ticket_delivery",
  "payment",
  "refund",
  "seating",
  "event_info",
  "check_in",
  "account",
  "technical",
] as const;
export const statuses = [
  "open",
  "in_progress",
  "waiting_customer",
  "resolved",
] as const;
export type Category = (typeof categories)[number];
export type CaseStatus = (typeof statuses)[number];
export type Case = {
  id: string;
  requester_id: string;
  audience: "attendee_case" | "organizer_case";
  category: Category;
  status: CaseStatus;
  assignee_id: string | null;
  event_id: string | null;
  order_id: string | null;
  ticket_id: string | null;
  subject: string;
  created_at: string;
};
export type Message = {
  id: string;
  case_id: string;
  author_id: string;
  body: string;
  created_at: string;
};
export type Notice = {
  id: string;
  type: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};
export type Context = {
  event_id?: string;
  order_id?: string;
  ticket_id?: string;
};
export type Draft = {
  subject: string;
  body: string;
  category: Category;
  uncertain?: boolean;
};
export const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && !!v;
const instant = (v: unknown): v is string =>
  typeof v === "string" &&
  Number.isFinite(Date.parse(v)) &&
  /(Z|[+-]\d\d:\d\d)$/.test(v);
export const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(v);
export function parseCase(v: unknown): Case {
  if (
    !record(v) ||
    ![v.id, v.requester_id, v.subject].every(text) ||
    !["attendee_case", "organizer_case"].includes(String(v.audience)) ||
    !categories.includes(v.category as Category) ||
    !statuses.includes(v.status as CaseStatus) ||
    ![v.assignee_id, v.event_id, v.order_id, v.ticket_id].every(
      (x) => x === null || text(x),
    ) ||
    !instant(v.created_at)
  )
    return invalidResponse();
  return v as Case;
}
export const parseCases = (v: unknown) => parsePage(v, parseCase);
export function parseMessage(v: unknown): Message {
  if (
    !record(v) ||
    ![v.id, v.case_id, v.author_id, v.body].every(text) ||
    !instant(v.created_at)
  )
    return invalidResponse();
  return v as Message;
}
export function parseMessages(v: unknown, caseId: string): Message[] {
  if (!Array.isArray(v) || v.length > 200) return invalidResponse();
  const items = v.map(parseMessage);
  if (
    items.some((m) => m.case_id !== caseId) ||
    new Set(items.map((m) => m.id)).size !== items.length
  )
    return invalidResponse();
  return items;
}
export function parseNotice(v: unknown): Notice {
  if (
    !record(v) ||
    ![v.id, v.type, v.title].every(text) ||
    typeof v.body !== "string" ||
    !record(v.payload) ||
    !(v.read_at === null || instant(v.read_at)) ||
    !instant(v.created_at)
  )
    return invalidResponse();
  return v as Notice;
}
export const parseNotices = (v: unknown) => parsePage(v, parseNotice);
export function mergeMessages(...batches: Message[][]) {
  const rows = new Map<string, Message>();
  for (const batch of batches) for (const m of batch) rows.set(m.id, m);
  return [...rows.values()].sort(
    (a, b) =>
      Date.parse(a.created_at) - Date.parse(b.created_at) ||
      (a.created_at.match(/\.(\d+)/)?.[1] ?? "")
        .padEnd(9, "0")
        .localeCompare(
          (b.created_at.match(/\.(\d+)/)?.[1] ?? "").padEnd(9, "0"),
        ) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}
export function contextFrom(search: string): Context {
  const p = new URLSearchParams(search),
    context: Context = {};
  for (const k of ["event_id", "order_id", "ticket_id"] as const) {
    const v = p.get(k);
    if (v !== null) {
      if (!uuid(v)) throw new Error("invalid_context");
      context[k] = v;
    }
  }
  return context;
}
export function supportLink(context: Context = {}) {
  const params = new URLSearchParams();
  for (const k of ["event_id", "order_id", "ticket_id"] as const)
    if (context[k]) params.set(k, context[k]!);
  return `/support/new${params.size ? "?" + params : ""}`;
}
export const casePath = (id: string) =>
  `/api/v1/support/cases/${encodeURIComponent(id)}`;
export function createBody(draft: Draft, context: Context) {
  const subject = draft.subject.trim(),
    message = draft.body.trim();
  if (
    !subject ||
    subject.length > 200 ||
    !message ||
    message.length > 5000 ||
    !categories.includes(draft.category)
  )
    throw new Error("invalid_case");
  return { category: draft.category, subject, message, ...context };
}
export function messageBody(body: string) {
  const value = body.trim();
  if (!value || value.length > 5000) throw new Error("invalid_message");
  return { body: value };
}
export function noticeLink(
  notice: Pick<Notice, "type" | "payload">,
  role: string,
) {
  const p = notice.payload;
  const id = (key: string) =>
    uuid(p[key]) ? encodeURIComponent(p[key] as string) : null;
  if (notice.type.startsWith("support_"))
    return id("case_id") ? `/support/cases/${id("case_id")}` : "/support";
  if (notice.type === "account_verification") return "/account";
  if (
    ["purchase_confirmation", "payment_failed", "refund_completed"].includes(
      notice.type,
    )
  )
    return id("order_id")
      ? `/account/orders/${id("order_id")}`
      : "/account/orders";
  if (notice.type === "ticket_delivery") {
    const tickets = Array.isArray(p.ticket_ids)
      ? p.ticket_ids.filter(uuid)
      : [];
    return tickets.length === 1
      ? `/account/tickets/${encodeURIComponent(tickets[0]!)}`
      : "/account/tickets";
  }
  if (["event_update", "event_cancelled"].includes(notice.type))
    return id("event_id") ? `/events/${id("event_id")}` : "/events";
  if (notice.type === "payout_status")
    return role === "organizer" ? "/organizer/payouts" : "/account";
  return null;
}
export const definiteFailure = (e: unknown) =>
  e instanceof ApiError &&
  e.status >= 400 &&
  e.status < 500 &&
  e.status !== 408;
export const terminalRead = (e: unknown) =>
  e instanceof ApiError && [401, 403, 404].includes(e.status);
export function offsetValue(value: string | null) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 && n <= 100000 ? n : 0;
}
/** Current API has no can_handle flag. Membership is checked against its handler-filtered list. */
export async function canHandle(
  request: Request,
  c: Case,
  signal?: AbortSignal,
) {
  let offset = 0;
  const seen = new Set<string>();
  for (let n = 0; n < 100; n++) {
    const p = new URLSearchParams({
      role: "handler",
      limit: "100",
      offset: String(offset),
      status: c.status,
    });
    if (c.event_id) p.set("event_id", c.event_id);
    const page = parseCases(
      await request(`/api/v1/support/cases?${p}`, { signal }),
    );
    if (
      page.offset !== offset ||
      page.total > 10000 ||
      (!page.items.length && offset < page.total)
    )
      throw new Error("invalid_permissions");
    for (const row of page.items) {
      if (seen.has(row.id)) throw new Error("invalid_permissions");
      seen.add(row.id);
      if (row.id === c.id) return true;
    }
    offset += page.items.length;
    if (offset >= page.total) return false;
  }
  throw new Error("permission_limit");
}
export type Feed = { items: Message[]; cursor: string | null; more: boolean };
export async function readMessages(
  request: Request,
  id: string,
  previous?: Feed,
  signal?: AbortSignal,
): Promise<Feed> {
  let cursor = previous?.cursor ?? null;
  let items = previous?.items ?? [];
  let more = false;
  for (let i = 0; i < 5; i++) {
    const params = new URLSearchParams();
    if (cursor) params.set("after", cursor);
    const rows = parseMessages(
      await request(
        `${casePath(id)}/messages${params.size ? "?" + params : ""}`,
        { signal },
      ),
      id,
    );
    if (rows.some((row) => row.id === cursor))
      throw new Error("invalid_cursor");
    items = mergeMessages(items, rows);
    if (rows.length) cursor = rows.at(-1)!.id;
    more = rows.length === 200;
    if (!more) break;
  }
  return { items, cursor, more };
}
