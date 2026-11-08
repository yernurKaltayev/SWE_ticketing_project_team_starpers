import { expect, it } from "vitest";
import {
  normalizeIban,
  parsePayment,
  parseFinancials,
  parseAccounts,
} from "./model";
import { makeOrderBody, parseAvailability } from "../checkout/model";
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
