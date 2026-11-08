/** Development fixtures only; live P6 remains authoritative for acceptance. */
import { http, HttpResponse } from "msw";
import { mockCurrentUser } from "./auth";
import { mockCheckoutEvent, mockPaidSales } from "./events";
import { mockOrder, mockSettleOrder } from "./orders";
import { normalizeIban } from "../payments/model";
import type { Account, Activation, Payment } from "../payments/model";
const activations = new Map<string, Activation>();
const accounts = new Map<string, { owner: string; account: Account }>();
const payments = new Map<
  string,
  { owner: string; reference: string; payment: Payment }
>();
const response = (v: object, status = 200) => HttpResponse.json(v, { status });
const error = (status: number, code: string) =>
  response({ code, message: "Development payment fixture." }, status);
export function resetPaymentMocks() {
  activations.clear();
  accounts.clear();
  payments.clear();
}
function organizer(request: Request, eventId?: string) {
  const user = mockCurrentUser(request);
  if (user instanceof Response) return user;
  if (user.role !== "organizer") return error(403, "forbidden");
  // Event fixtures belong to the demo organizer.
  if (
    eventId &&
    (user.email !== "organizer@example.com" || !mockCheckoutEvent(eventId))
  )
    return error(404, "event_not_found");
  return user;
}
function activation(id: string) {
  let value = activations.get(id);
  if (!value) {
    value = {
      event_id: id,
      status: "incomplete",
      identity_verified: false,
      payout_account_id: null,
      activation_fee_paid: false,
      terms_accepted_at: null,
      missing_steps: [],
      is_simulated: true,
    };
    activations.set(id, value);
  }
  value.missing_steps = [
    ...(mockCheckoutEvent(id)?.tickets.some((t) => t.price_amount > 0)
      ? []
      : ["paid_ticket_type"]),
    ...(value.identity_verified ? [] : ["identity_verification"]),
    ...(value.payout_account_id &&
    accounts.get(value.payout_account_id)?.account.is_verified
      ? []
      : ["payout_account"]),
    ...(value.activation_fee_paid ? [] : ["activation_fee"]),
    ...(value.terms_accepted_at ? [] : ["terms"]),
  ];
  if (value.status !== "suspended" && !value.missing_steps.length) {
    value.status = "active";
    mockPaidSales(id, "active");
  }
  return value;
}
function start(
  owner: string,
  reference: string,
  amount: number,
  kind: Payment["kind"],
) {
  const existing = [...payments.values()].find(
    (p) =>
      p.owner === owner &&
      p.reference === reference &&
      p.payment.status === "pending",
  );
  if (existing) return response(existing.payment, 201);
  const id = crypto.randomUUID();
  const payment: Payment = {
    id,
    amount,
    kind,
    fee_amount: kind === "ticket" ? Math.round(amount * 0.03) : 0,
    currency: "KZT",
    status: "pending",
    is_simulated: true,
    checkout_url: `/demo/payments/${id}`,
    failure_reason: null,
  };
  payments.set(id, { owner, reference, payment });
  return response(payment, 201);
}
export const paymentHandlers = [
  http.get("*/api/v1/events/:id/activation", ({ request, params }) => {
    const user = organizer(request, String(params.id));
    return user instanceof Response
      ? user
      : response(activation(String(params.id)));
  }),
  http.post(
    "*/api/v1/events/:id/activation/verify-identity",
    ({ request, params }) => {
      const user = organizer(request, String(params.id));
      if (user instanceof Response) return user;
      activation(String(params.id)).identity_verified = true;
      return response(activation(String(params.id)));
    },
  ),
  http.patch("*/api/v1/events/:id/activation", async ({ request, params }) => {
    const user = organizer(request, String(params.id));
    if (user instanceof Response) return user;
    const body = (await request.json()) as {
      payout_account_id?: string;
      accept_terms?: boolean;
    };
    const value = activation(String(params.id));
    if (body.payout_account_id) {
      const row = accounts.get(body.payout_account_id);
      if (!row || row.owner !== user.id)
        return error(404, "payout_account_not_found");
      value.payout_account_id = row.account.id;
    }
    if (body.accept_terms === true)
      value.terms_accepted_at = new Date().toISOString();
    return response(activation(String(params.id)));
  }),
  http.post("*/api/v1/events/:id/activation/pay", ({ request, params }) => {
    const user = organizer(request, String(params.id));
    if (user instanceof Response) return user;
    if (activation(String(params.id)).activation_fee_paid)
      return error(409, "activation_fee_already_paid");
    return start(user.id, `event:${params.id}`, 1000000, "activation_fee");
  }),
  http.get("*/api/v1/organizers/me/payout-accounts", ({ request }) => {
    const user = organizer(request);
    return user instanceof Response
      ? user
      : response(
          [...accounts.values()]
            .filter((a) => a.owner === user.id)
            .map((a) => a.account),
        );
  }),
  ...(["post", "patch"] as const).map((method) =>
    http[method](
      method === "post"
        ? "*/api/v1/organizers/me/payout-accounts"
        : "*/api/v1/organizers/me/payout-accounts/:id",
      async ({ request, params }) => {
        const user = organizer(request);
        if (user instanceof Response) return user;
        const id = method === "post" ? crypto.randomUUID() : String(params.id);
        if (method === "patch" && accounts.get(id)?.owner !== user.id)
          return error(404, "payout_account_not_found");
        const body = (await request.json()) as {
          bank_name: string;
          holder_name: string;
          iban: string;
        };
        let iban: string;
        try {
          iban = normalizeIban(body.iban);
        } catch {
          return error(422, "invalid_iban");
        }
        const account: Account = {
          id,
          bank_name: body.bank_name,
          holder_name: body.holder_name,
          iban_last4: iban.slice(-4),
          is_verified: true,
          is_simulated: true,
        };
        accounts.set(id, { owner: user.id, account });
        return response(account, method === "post" ? 201 : 200);
      },
    ),
  ),
  http.delete(
    "*/api/v1/organizers/me/payout-accounts/:id",
    ({ request, params }) => {
      const user = organizer(request);
      if (user instanceof Response) return user;
      if (accounts.get(String(params.id))?.owner !== user.id)
        return error(404, "payout_account_not_found");
      if (
        [...activations.values()].some((a) => a.payout_account_id === params.id)
      )
        return error(409, "payout_account_in_use");
      accounts.delete(String(params.id));
      return new HttpResponse(null, { status: 204 });
    },
  ),
  http.post("*/api/v1/orders/:id/payments", ({ request, params }) => {
    const order = mockOrder(request, String(params.id));
    if (order instanceof Response) return order;
    const user = mockCurrentUser(request);
    if (user instanceof Response) return user;
    if (order.status !== "pending" || order.total <= 0)
      return error(409, "order_not_pending");
    return start(user.id, `order:${params.id}`, order.total, "ticket");
  }),
  http.get("*/api/v1/payments/:id", ({ request, params }) => {
    const user = mockCurrentUser(request);
    if (user instanceof Response) return user;
    const row = payments.get(String(params.id));
    return row?.owner === user.id
      ? response(row.payment)
      : error(404, "payment_not_found");
  }),
  http.post("*/api/v1/payments/:id/simulate", async ({ request, params }) => {
    const user = mockCurrentUser(request);
    if (user instanceof Response) return user;
    const row = payments.get(String(params.id));
    if (row?.owner !== user.id) return error(404, "payment_not_found");
    const body = (await request.json()) as { outcome: string };
    if (!["succeeded", "failed"].includes(body.outcome))
      return error(422, "validation_error");
    if (row.payment.status === "pending") {
      row.payment.status = body.outcome;
      row.payment.checkout_url = null;
      if (row.reference.startsWith("order:"))
        mockSettleOrder(row.reference.slice(6), body.outcome === "succeeded");
      else if (body.outcome === "succeeded") {
        activation(row.reference.slice(6)).activation_fee_paid = true;
        activation(row.reference.slice(6));
      }
    }
    return response(row.payment);
  }),
  http.get("*/api/v1/events/:id/financials", ({ request, params }) => {
    const user = organizer(request, String(params.id));
    return user instanceof Response
      ? user
      : response({
          gross: 0,
          fees: 0,
          refunds: 0,
          estimated_payout: 0,
          currency: "KZT",
          is_simulated: true,
        });
  }),
  http.get("*/api/v1/organizers/me/payouts", ({ request }) => {
    const user = organizer(request);
    const offset = Number(new URL(request.url).searchParams.get("offset") || 0);
    return user instanceof Response
      ? user
      : response({ items: [], total: 0, offset, limit: 20 });
  }),
];
