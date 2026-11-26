import { expect, it } from "vitest";
import {
  canHandle,
  contextFrom,
  createBody,
  mergeMessages,
  messageBody,
  noticeLink,
  parseCase,
  parseMessages,
  parseNotice,
  readMessages,
  supportLink,
} from "@biletflow/shared/features/support/model";
import type { Case, Message, Request } from "@biletflow/shared/features/support/model";
const id = "11111111-1111-4111-8111-111111111111";
const c: Case = {
  id,
  requester_id: "user",
  audience: "attendee_case",
  category: "technical",
  status: "open",
  assignee_id: null,
  event_id: id,
  order_id: null,
  ticket_id: null,
  subject: "Help",
  created_at: "2026-11-18T10:00:00Z",
};
const message = (
  id: string,
  created_at = "2026-11-18T10:00:00.000001Z",
): Message => ({
  id,
  case_id: c.id,
  author_id: "user",
  body: "Hello",
  created_at,
});
it("creates bounded, trimmed cases and messages without accepting a requester or audience from the URL", () => {
  expect(
    createBody(
      { subject: " Help ", body: " Message ", category: "technical" },
      contextFrom(`?event_id=${id}&requester_id=other&audience=organizer_case`),
    ),
  ).toEqual({
    subject: "Help",
    message: "Message",
    category: "technical",
    event_id: id,
  });
  expect(messageBody(" hi ")).toEqual({ body: "hi" });
  expect(() => messageBody(" ")).toThrow();
  expect(() => messageBody("x".repeat(5001))).toThrow();
  expect(() =>
    createBody(
      { subject: "x".repeat(201), body: "ok", category: "account" },
      {},
    ),
  ).toThrow();
});
it("keeps only valid attached IDs in app-relative support links", () => {
  expect(supportLink({ ticket_id: id })).toBe(`/support/new?ticket_id=${id}`);
  expect(() => contextFrom("?ticket_id=https://evil.invalid")).toThrow();
});
it("deduplicates by message ID, retains repeated text with different IDs and preserves microsecond order", () => {
  const a = message("z"),
    b = message("a", "2026-11-18T10:00:00.000002Z");
  expect(mergeMessages([b, a], [a])).toEqual([a, b]);
  expect(mergeMessages([a, { ...a, id: "new" }])).toHaveLength(2);
});
it("rejects malformed or cross-case server responses", () => {
  expect(() => parseMessages([message("a"), message("a")], c.id)).toThrow();
  expect(() =>
    parseMessages([{ ...message("a"), case_id: "other" }], c.id),
  ).toThrow();
  expect(() => parseCase({ ...c, status: "deleted" })).toThrow();
  expect(() => parseNotice({ id: "x" })).toThrow();
});
it.each(["purchase_confirmation", "payment_failed", "refund_completed"])(
  "maps %s to the existing order route",
  (type) => {
    const n = { type, payload: { order_id: id } };
    expect(noticeLink(n, "attendee")).toBe(`/account/orders/${id}`);
  },
);
it.each(["support_message", "support_assigned", "support_status"])(
  "maps %s to its authorized support route",
  (type) =>
    expect(noticeLink({ type, payload: { case_id: id } }, "attendee")).toBe(
      `/support/cases/${id}`,
    ),
);
it("routes notification families without trusting supplied links or email-body URLs", () => {
  const link = (
    type: string,
    payload: Record<string, unknown> = {},
    role = "attendee",
  ) => noticeLink({ type, payload }, role);
  expect(link("account_verification")).toBe("/account");
  expect(link("ticket_delivery", { ticket_ids: [id] })).toBe(
    `/account/tickets/${id}`,
  );
  expect(link("ticket_delivery", { ticket_ids: [id, id] })).toBe(
    "/account/tickets",
  );
  expect(link("event_update", { event_id: id })).toBe(`/events/${id}`);
  expect(link("event_cancelled")).toBe("/events");
  expect(link("payout_status", {}, "organizer")).toBe("/organizer/payouts");
  expect(link("payout_status")).toBe("/account");
  expect(link("unknown", { url: "https://evil.invalid" })).toBeNull();
  expect(
    link("purchase_confirmation", {
      order_id: "//evil.invalid",
      url: "https://evil.invalid",
    }),
  ).toBe("/account/orders");
});
it("uses handler-list membership, including later pages, rather than guessing from an account role", async () => {
  let reads = 0;
  const req: Request = async <T>() => {
    reads++;
    return {
      items: [reads === 1 ? { ...c, id: "other" } : c],
      limit: 1,
      total: 2,
      offset: reads - 1,
    } as T;
  };
  expect(await canHandle(req, c)).toBe(true);
  expect(reads).toBe(2);
});
it("rejects malformed permission pagination instead of granting controls", async () => {
  const req: Request = async <T>() =>
    ({ items: [], total: 1, limit: 100, offset: 0 }) as T;
  await expect(canHandle(req, c)).rejects.toThrow();
});
it("drains all 200-message pages and advances only the GET cursor, not a just-posted message", async () => {
  const paths: string[] = [];
  const req: Request = async <T>(path: string) => {
    paths.push(path);
    return (
      paths.length === 1
        ? Array.from({ length: 200 }, (_, i) => message(String(i)))
        : [message("last")]
    ) as T;
  };
  const feed = await readMessages(req, c.id, {
    items: [message("posted")],
    cursor: null,
    more: true,
  });
  expect(feed.items).toHaveLength(202);
  expect(feed.cursor).toBe("last");
  expect(paths[1]).toContain("after=199");
  expect(paths[0]).not.toContain("after=posted");
});
it("bounds a backlog fetch to five pages and exposes more instead of silently truncating", async () => {
  let n = 0;
  const req: Request = async <T>() =>
    Array.from({ length: 200 }, () => message(String(++n))) as T;
  const feed = await readMessages(req, c.id);
  expect(n).toBe(1000);
  expect(feed.more).toBe(true);
});
