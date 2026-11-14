import { createSession, createMemoryTokenStore } from "@biletflow/shared";
import {
  demoEventId,
  mockCheckoutEvent,
  resetEventMocks,
} from "../mocks/events";
import { resetAuthMocks } from "../mocks/auth";
import { resetOrderMocks, mockOperationsOrder } from "../mocks/orders";
import { resetOperationsMocks } from "../mocks/operations";
export function reset() {
  resetAuthMocks();
  resetEventMocks();
  resetOrderMocks();
  resetOperationsMocks();
}
export async function actor(email = "organizer@example.com") {
  const session = createSession({
    baseUrl: "http://localhost:3000",
    tokenStore: createMemoryTokenStore(),
  });
  await session.login({ email, password: "BiletFlow123!" });
  return session;
}
export async function seed(paid = false) {
  const buyer = await actor("attendee@example.com");
  const context = mockCheckoutEvent(demoEventId)!;
  const order = await buyer.request<{ id: string }>("/api/v1/orders", {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: {
      event_id: demoEventId,
      items: [{ ticket_type_id: context.tickets[0]!.id, quantity: 1 }],
      attendees: [{ full_name: "Диас", email: "dias@example.com" }],
      hold_ids: [],
    },
  });
  const row = mockOperationsOrder(order.id)!;
  if (paid) {
    row.value.status = "paid";
    row.value.total = 150000;
    row.value.subtotal = 150000;
    row.value.items[0]!.line_total = 150000;
    row.value.items[0]!.unit_price = 150000;
    row.value.is_simulated = true;
  }
  return { order: row.value, buyer };
}
export { demoEventId };
