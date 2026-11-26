import { expect, it } from "vitest";
import {
  decodeAppSession,
  encodeAppSession,
  normalizeIban,
  parseHalykSession,
  parsePayment,
  parsePaymentConfig,
  parseFinancials,
  parseAccounts,
} from "@biletflow/shared/features/payments/model";
import { makeOrderBody, parseAvailability } from "@biletflow/shared/features/checkout/model";
it("validates IBAN checksums without retaining full account responses", () => {
  expect(normalizeIban("kz86 125K ZT50 0410 0100")).toBe(
    "KZ86125KZT5004100100",
  );
  expect(() => normalizeIban("KZ00125KZT5004100100")).toThrow();
  expect(() =>
    parseAccounts([
      { id: "a", bank_name: "Bank", holder_name: "Demo", iban: "secret" },
    ]),
  ).toThrow();
});
it("rejects malformed payment amounts and unsupported outcomes instead of inventing success", () => {
  const p = {
    id: "payment",
    kind: "ticket",
    status: "pending",
    amount: 12345,
    fee_amount: 123,
    currency: "KZT",
    is_simulated: true,
    checkout_url: null,
    failure_reason: null,
  };
  expect(parsePayment(p).amount).toBe(12345);
  expect(() => parsePayment({ ...p, amount: 1.5 })).toThrow();
  expect(() => parsePayment({ ...p, status: "unknown" })).toThrow();
  expect(() => parseFinancials({ gross: "2500" })).toThrow();
});
it("preserves P3 persisted tiyn values and allows paid orders only with active sales", () => {
  const choices = parseAvailability({
    registration_open: true,
    ticket_types: [
      {
        id: "paid",
        name: "Paid",
        is_free: false,
        price_amount: "250000.00",
        currency: "KZT",
        quantity_available: 2,
        max_per_order: 2,
        sales_open: true,
      },
    ],
  }).choices;
  expect(choices[0]?.price).toBe(250000);
  const attendees = [{ full_name: "Demo", email: "demo@example.com" }];
  expect(() =>
    makeOrderBody("event", choices, { paid: 1 }, attendees),
  ).toThrow();
  expect(
    makeOrderBody("event", choices, { paid: 1 }, attendees, true).items,
  ).toEqual([{ ticket_type_id: "paid", quantity: 1, seat_ids: [] }]);
  expect(() =>
    makeOrderBody(
      "event",
      [{ ...choices[0]!, price: undefined }],
      { paid: 1 },
      attendees,
      true,
    ),
  ).toThrow();
});

it("defaults older payments to the sandbox and validates Halyk sessions", () => {
  const p = {
    id: "payment",
    kind: "ticket",
    status: "pending",
    amount: 250000,
    fee_amount: 7500,
    currency: "KZT",
    is_simulated: true,
    checkout_url: null,
    failure_reason: null,
  };
  expect(parsePayment(p).provider).toBe("sandbox");
  expect(parsePayment(p).order_id).toBeNull();
  expect(parsePayment({ ...p, provider: "halyk", order_id: "o" }).provider).toBe("halyk");
  expect(() => parsePayment({ ...p, provider: "stripe" })).toThrow();
  expect(parsePaymentConfig({ ticket_provider: "halyk", is_simulated: true }).ticket_provider).toBe("halyk");
  expect(() => parsePaymentConfig({ ticket_provider: "real", is_simulated: false })).toThrow();

  const session = {
    payment_id: "payment",
    order_id: "order",
    script_url: "https://test-epay.epayment.kz/payform/payment-api.js",
    is_simulated: true,
    payment_object: {
      invoiceId: "123456789012345",
      terminal: "t",
      backLink: "https://web/return?app=1",
      failureBackLink: "https://web/return?app=1&failed=1",
      amount: 2500,
      description: "BiletFlow order #1 & co",
      auth: { access_token: "tok" },
    },
  };
  expect(parseHalykSession(decodeAppSession(`#${encodeAppSession(session)}`))).toEqual(session);
  expect(() => parseHalykSession({ ...session, script_url: "http://evil/x.js" })).toThrow();
  expect(() => parseHalykSession({ ...session, payment_object: { ...session.payment_object, auth: {} } })).toThrow();
  expect(decodeAppSession("#%E0%A4%A")).toBeNull();
  expect(decodeAppSession("")).toBeNull();
});
