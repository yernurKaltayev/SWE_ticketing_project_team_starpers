/** Development-only P9/P10 fixtures. Authorization is mirrored for UI tests, not live security evidence. */
import { http, HttpResponse } from "msw";
import { mockCurrentUser, mockUserById } from "./auth";
import { mockCheckoutEvent, mockOwnsEvent } from "./events";
import { mockOperationsOrder, mockSupportTicket } from "./orders";
import { mockStaffMembers } from "./staff";
import { categories, statuses, mergeMessages } from "../support/model";
import type {
  Case,
  Category,
  CaseStatus,
  Message,
  Notice,
} from "../support/model";
type User = NonNullable<ReturnType<typeof mockUserById>>;
const cases = new Map<string, { value: Case; updated: number }>();
const messages = new Map<string, Message[]>();
const notices = new Map<string, { userId: string; value: Notice }>();
export function resetSupportMocks() {
  cases.clear();
  messages.clear();
  notices.clear();
}
export function mockNotify(
  userId: string,
  type: string,
  payload: Record<string, unknown> = {},
  title = type,
  body = "Development notification. No email is sent.",
) {
  const value: Notice = {
    id: crypto.randomUUID(),
    type,
    title,
    body,
    payload,
    read_at: null,
    created_at: new Date().toISOString(),
  };
  notices.set(value.id, { userId, value });
  return value;
}
export function mockSupportCases() {
  return [...cases.values()].map((r) => r.value);
}
export function mockHandler(user: User, c: Case) {
  return (
    user.role === "platform_admin" ||
    (c.audience === "attendee_case" &&
      !!c.event_id &&
      (mockOwnsEvent(user.email, c.event_id) ||
        mockStaffMembers(c.event_id).some(
          (m) =>
            m.user_id === user.id && ["support", "manager"].includes(m.role),
        )))
  );
}
const fail = (status: number, code: string) =>
  HttpResponse.json(
    { code, message: "Development support response.", details: null },
    { status },
  );
function page<T>(rows: T[], request: Request) {
  const p = new URL(request.url).searchParams,
    limit = Math.max(1, Math.min(100, Number(p.get("limit")) || 20)),
    offset = Math.max(0, Number(p.get("offset")) || 0);
  return {
    items: rows.slice(offset, offset + limit),
    total: rows.length,
    offset,
    limit,
  };
}
function accessible(request: Request, id: string) {
  const user = mockCurrentUser(request);
  if (user instanceof Response) return user;
  const value = cases.get(id)?.value;
  if (!value || (value.requester_id !== user.id && !mockHandler(user, value)))
    return fail(404, "support_case_not_found");
  return { user, value };
}
function updated(c: Case) {
  cases.get(c.id)!.updated = Date.now();
}
function setStatus(c: Case, s: CaseStatus, actor: string) {
  if (c.status === s) return;
  c.status = s;
  if (c.requester_id !== actor)
    mockNotify(c.requester_id, "support_status", { case_id: c.id, status: s });
}
export const supportHandlers = [
  http.get("*/api/v1/me/notifications", ({ request }) => {
    const user = mockCurrentUser(request);
    if (user instanceof Response) return user;
    const unread =
      new URL(request.url).searchParams.get("unread_only") === "true";
    const rows = [...notices.values()]
      .filter((r) => r.userId === user.id && (!unread || !r.value.read_at))
      .map((r) => r.value)
      .sort(
        (a, b) =>
          Date.parse(b.created_at) - Date.parse(a.created_at) ||
          b.id.localeCompare(a.id),
      );
    return HttpResponse.json(page(rows, request));
  }),
  http.post("*/api/v1/me/notifications/:id/read", ({ request, params }) => {
    const user = mockCurrentUser(request);
    if (user instanceof Response) return user;
    const row = notices.get(String(params.id));
    if (!row || row.userId !== user.id)
      return fail(404, "notification_not_found");
    row.value.read_at ??= new Date().toISOString();
    return HttpResponse.json(row.value);
  }),
  http.get("*/api/v1/support/cases", ({ request }) => {
    const user = mockCurrentUser(request);
    if (user instanceof Response) return user;
    const p = new URL(request.url).searchParams,
      role = p.get("role"),
      status = p.get("status"),
      event = p.get("event_id");
    const rows = [...cases.values()]
      .filter(
        (r) =>
          (role === "requester"
            ? r.value.requester_id === user.id
            : role === "handler"
              ? mockHandler(user, r.value)
              : r.value.requester_id === user.id ||
                mockHandler(user, r.value)) &&
          (!status || r.value.status === status) &&
          (!event || r.value.event_id === event),
      )
      .sort(
        (a, b) => b.updated - a.updated || b.value.id.localeCompare(a.value.id),
      )
      .map((r) => r.value);
    return HttpResponse.json(page(rows, request));
  }),
  http.post("*/api/v1/support/cases", async ({ request }) => {
    const user = mockCurrentUser(request);
    if (user instanceof Response) return user;
    const b = (await request.json()) as {
      subject: string;
      message: string;
      category: Category;
      event_id?: string;
      order_id?: string;
      ticket_id?: string;
    };
    if (
      typeof b.subject !== "string" ||
      !b.subject.trim() ||
      b.subject.trim().length > 200 ||
      typeof b.message !== "string" ||
      !b.message.trim() ||
      b.message.trim().length > 5000 ||
      !categories.includes(b.category)
    )
      return fail(422, "validation_error");
    let eventId = b.event_id ?? null,
      orderId = b.order_id ?? null;
    if (b.ticket_id) {
      const found = mockSupportTicket(b.ticket_id);
      if (
        !found ||
        (found.row.owner !== user.id &&
          found.attendeeEmail.toLowerCase() !== user.email.toLowerCase())
      )
        return fail(404, "ticket_not_found");
      if (
        (eventId && eventId !== found.row.eventId) ||
        (orderId && orderId !== found.row.value.id)
      )
        return fail(422, "support_context_mismatch");
      eventId = found.row.eventId;
      orderId = found.row.value.id;
    } else if (orderId) {
      const row = mockOperationsOrder(orderId);
      if (!row || row.owner !== user.id) return fail(404, "order_not_found");
      if (eventId && eventId !== row.eventId)
        return fail(422, "support_context_mismatch");
      eventId = row.eventId;
    }
    if (eventId && !mockCheckoutEvent(eventId))
      return fail(404, "event_not_found");
    const c: Case = {
      id: crypto.randomUUID(),
      requester_id: user.id,
      audience:
        user.role === "organizer" &&
        (!eventId || mockOwnsEvent(user.email, eventId))
          ? "organizer_case"
          : "attendee_case",
      category: b.category,
      status: "open",
      assignee_id: null,
      event_id: eventId,
      order_id: orderId,
      ticket_id: b.ticket_id ?? null,
      subject: b.subject.trim(),
      created_at: new Date().toISOString(),
    };
    cases.set(c.id, { value: c, updated: Date.now() });
    messages.set(c.id, [
      {
        id: crypto.randomUUID(),
        case_id: c.id,
        author_id: user.id,
        body: b.message.trim(),
        created_at: new Date().toISOString(),
      },
    ]);
    return HttpResponse.json(c, { status: 201 });
  }),
  http.get("*/api/v1/support/cases/:id", ({ request, params }) => {
    const row = accessible(request, String(params.id));
    return row instanceof Response ? row : HttpResponse.json(row.value);
  }),
  http.patch("*/api/v1/support/cases/:id", async ({ request, params }) => {
    const row = accessible(request, String(params.id));
    if (row instanceof Response) return row;
    const { value: c, user } = row;
    if (!mockHandler(user, c)) return fail(403, "support_handler_required");
    const b = (await request.json()) as {
      status?: CaseStatus;
      assignee_id?: string | null;
    };
    if (b.status && !statuses.includes(b.status))
      return fail(422, "validation_error");
    if (b.assignee_id) {
      const target = mockUserById(b.assignee_id);
      if (!target || !mockHandler(target, c))
        return fail(422, "invalid_assignee");
    }
    if (b.status) setStatus(c, b.status, user.id);
    if ("assignee_id" in b && b.assignee_id !== c.assignee_id) {
      c.assignee_id = b.assignee_id ?? null;
      if (c.assignee_id && c.assignee_id !== user.id)
        mockNotify(c.assignee_id, "support_assigned", {
          case_id: c.id,
          status: c.status,
        });
    }
    updated(c);
    return HttpResponse.json(c);
  }),
  http.get("*/api/v1/support/cases/:id/messages", ({ request, params }) => {
    const row = accessible(request, String(params.id));
    if (row instanceof Response) return row;
    const after = new URL(request.url).searchParams.get("after");
    const all = mergeMessages(messages.get(row.value.id) ?? []);
    const index = after ? all.findIndex((m) => m.id === after) : -1;
    if (after && index < 0) return fail(422, "invalid_after_cursor");
    return HttpResponse.json(all.slice(index + 1, index + 201));
  }),
  http.post(
    "*/api/v1/support/cases/:id/messages",
    async ({ request, params }) => {
      const row = accessible(request, String(params.id));
      if (row instanceof Response) return row;
      const b = (await request.json()) as { body: string };
      if (
        typeof b.body !== "string" ||
        !b.body.trim() ||
        b.body.trim().length > 5000
      )
        return fail(422, "validation_error");
      const c = row.value;
      if (
        c.requester_id === row.user.id &&
        ["resolved", "waiting_customer"].includes(c.status)
      )
        setStatus(c, "in_progress", row.user.id);
      else if (c.requester_id !== row.user.id && c.status === "open")
        setStatus(c, "in_progress", row.user.id);
      const m: Message = {
        id: crypto.randomUUID(),
        case_id: c.id,
        author_id: row.user.id,
        body: b.body.trim(),
        created_at: new Date().toISOString(),
      };
      messages.get(c.id)!.push(m);
      updated(c);
      const recipient =
        c.requester_id === row.user.id ? c.assignee_id : c.requester_id;
      if (recipient && recipient !== row.user.id)
        mockNotify(recipient, "support_message", {
          case_id: c.id,
          status: c.status,
        });
      return HttpResponse.json(m, { status: 201 });
    },
  ),
];
