import { ApiError } from "@biletflow/shared";
import type { components } from "@biletflow/shared/api";
import { invalidResponse, parsePage } from "../checkout/model";

export type Payment = components["schemas"]["PaymentOut"];
export type Activation = components["schemas"]["ActivationOut"];
export type Account = components["schemas"]["PayoutAccountOut"];
export type Payout = components["schemas"]["PayoutOut"];
export type Financials = components["schemas"]["FinancialSummaryOut"];
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown) => typeof v === "string" && !!v;
const money = (v: unknown) =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const date = (v: unknown) =>
  v === null || (text(v) && Number.isFinite(Date.parse(v as string)));

export function parsePayment(v: unknown): Payment {
  if (
    !record(v) ||
    !text(v.id) ||
    !["ticket", "activation_fee"].includes(String(v.kind)) ||
    !["pending", "succeeded", "failed", "cancelled"].includes(
      String(v.status),
    ) ||
    !money(v.amount) ||
    !money(v.fee_amount) ||
    v.currency !== "KZT" ||
    typeof v.is_simulated !== "boolean" ||
    !(v.checkout_url === null || text(v.checkout_url)) ||
    !(v.failure_reason === null || typeof v.failure_reason === "string")
  )
    return invalidResponse();
  return v as Payment;
}
export function parseActivation(v: unknown): Activation {
  if (
    !record(v) ||
    !text(v.event_id) ||
    !["active", "incomplete", "suspended"].includes(String(v.status)) ||
    typeof v.identity_verified !== "boolean" ||
    typeof v.activation_fee_paid !== "boolean" ||
    typeof v.is_simulated !== "boolean" ||
    !(v.payout_account_id === null || text(v.payout_account_id)) ||
    !date(v.terms_accepted_at) ||
    !Array.isArray(v.missing_steps) ||
    !v.missing_steps.every(text)
  )
    return invalidResponse();
  return v as Activation;
}
export function parseAccount(v: unknown): Account {
  if (
    !record(v) ||
    ![v.id, v.bank_name, v.holder_name].every(text) ||
    typeof v.iban_last4 !== "string" ||
    !/^[\dA-Z]{4}$/.test(v.iban_last4) ||
    typeof v.is_verified !== "boolean" ||
    typeof v.is_simulated !== "boolean"
  )
    return invalidResponse();
  return v as Account;
}
export function parseAccounts(v: unknown): Account[] {
  if (!Array.isArray(v)) return invalidResponse();
  return v.map(parseAccount);
}
export function parseFinancials(v: unknown): Financials {
  if (
    !record(v) ||
    ![v.gross, v.fees, v.refunds].every(money) ||
    typeof v.estimated_payout !== "number" ||
    !Number.isSafeInteger(v.estimated_payout) ||
    v.currency !== "KZT" ||
    typeof v.is_simulated !== "boolean"
  )
    return invalidResponse();
  return v as Financials;
}
export function parsePayout(v: unknown): Payout {
  if (
    !record(v) ||
    ![v.id, v.event_id, v.status].every(text) ||
    ![v.gross, v.fees, v.refunds].every(money) ||
    typeof v.net !== "number" ||
    !Number.isSafeInteger(v.net) ||
    v.currency !== "KZT" ||
    !date(v.scheduled_for) ||
    !date(v.paid_at)
  )
    return invalidResponse();
  return v as Payout;
}
export const parsePayouts = (v: unknown) => parsePage(v, parsePayout);
export const accountsPath = "/api/v1/organizers/me/payout-accounts";
export const activationPath = (id: string) =>
  `/api/v1/events/${encodeURIComponent(id)}/activation`;

export function normalizeIban(value: string): string {
  const iban = value.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z\d]{11,30}$/.test(iban))
    throw new ApiError(422, "invalid_iban", "Check the IBAN.");
  let remainder = 0;
  for (const char of iban.slice(4) + iban.slice(0, 4)) {
    const digits = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of digits)
      remainder = (remainder * 10 + Number(digit)) % 97;
  }
  if (remainder !== 1)
    throw new ApiError(422, "invalid_iban", "Check the IBAN.");
  return iban;
}
