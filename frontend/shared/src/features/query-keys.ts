/**
 * TanStack Query keys for both apps, identical to the arrays the web builds inline today,
 * so switching a web call site to these builders changes nothing. The second element is
 * always the signed-in user's id, so one account never reads another account's cache.
 */
type UserId = string | null | undefined;

export const queryKeys = {
  commerce: (userId: UserId, path: string) => ["f3", userId, path] as const,
  commerceAll: () => ["f3"] as const,
  ticketQr: (userId: UserId, ticketId: string, status: string | undefined) =>
    ["f3-qr", userId, ticketId, status] as const,
  payments: (userId: UserId, path: string) => ["f4", userId, path] as const,
  paymentsAll: () => ["f4"] as const,
  operations: (userId: UserId, path: string) => ["f6", userId, path] as const,
  operationsOrders: (userId: UserId, eventId: string) => ["f6", userId, eventId, "orders"] as const,
  support: (userId: UserId, path: string) => ["f9", userId, path] as const,
  supportHandler: (userId: UserId, caseId: string, status: string | undefined) =>
    ["f9", userId, "handler", caseId, status] as const,
  admin: (userId: UserId, part: string) => ["f10", userId, part] as const,
  adminEventName: (userId: UserId, eventId: string) => ["admin-event-name", userId, eventId] as const,
  organizerProfile: (userId: UserId) => ["organizer-profile", userId] as const,
};

/** Cache scopes a refund or cancellation makes stale. */
export const afterRefundScopes = ["f6", "f3", "f3-qr", "f4"] as const;
