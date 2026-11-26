import { ApiError } from "../../index";
import type { components } from "../../generated/api";
import { invalidResponse, parsePage } from "../checkout/model";

export type Payment = components["schemas"]["PaymentOut"];
export type Activation = components["schemas"]["ActivationOut"];
export type Account = components["schemas"]["PayoutAccountOut"];
export type Payout = components["schemas"]["PayoutOut"];
export type Financials = components["schemas"]["FinancialSummaryOut"];
export type PaymentConfig = components["schemas"]["PaymentConfigOut"];
export type HalykSession = components["schemas"]["HalykSessionOut"];
/** Halyk ePay's published TEST card (https://epayment.kz/en-US/docs, "Test credentials").
 * It works only on Halyk's test payment form; nothing real is charged. */
export const HALYK_TEST_CARD = {
  number: "4405 6397 0401 5096",
  expiry: "01/27",
  cvc: "321",
} as const;
const PROVIDERS = ["sandbox", "halyk"];
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
    !(v.failure_reason === null || typeof v.failure_reason === "string") ||
    !(v.provider === undefined || PROVIDERS.includes(String(v.provider))) ||
    !(v.order_id === undefined || v.order_id === null || text(v.order_id))
  )
    return invalidResponse();
  // Older API builds sent no provider or order_id: they only had the sandbox.
  return {
    ...v,
    provider: v.provider ?? "sandbox",
    order_id: v.order_id ?? null,
  } as Payment;
}
export function parsePaymentConfig(v: unknown): PaymentConfig {
  if (
    !record(v) ||
    !PROVIDERS.includes(String(v.ticket_provider)) ||
    typeof v.is_simulated !== "boolean"
  )
    return invalidResponse();
  return v as PaymentConfig;
}
/** The app passes its Halyk session to the web checkout page in the URL fragment (never sent to
 * a server), so the in-app browser needs no web session. */
export function encodeAppSession(session: HalykSession): string {
  return encodeURIComponent(JSON.stringify(session));
}
export function decodeAppSession(hash: string): unknown {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
}
const HALYK_FIELDS = ["invoiceId", "terminal", "backLink", "failureBackLink"];
export function parseHalykSession(v: unknown): HalykSession {
  if (
    !record(v) ||
    !text(v.payment_id) ||
    !text(v.order_id) ||
    !text(v.script_url) ||
    !String(v.script_url).startsWith("https://") ||
    typeof v.is_simulated !== "boolean" ||
    !record(v.payment_object) ||
    !HALYK_FIELDS.every((k) => text((v.payment_object as Record<string, unknown>)[k])) ||
    typeof v.payment_object.amount !== "number" ||
    !record(v.payment_object.auth) ||
    !text(v.payment_object.auth.access_token)
  )
    return invalidResponse();
  return v as HalykSession;
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
