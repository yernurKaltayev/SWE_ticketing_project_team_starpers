import { describe, expect, it } from "vitest";
import { ApiError } from "@biletflow/shared";
import { storedPaymentIsStale } from "./payment-state";

const ok = { kind: "ticket" as const, amount: 5000 };

describe("storedPaymentIsStale", () => {
  it("forgets a remembered payment the server no longer has or allows", () => {
    expect(storedPaymentIsStale({ ...ok, error: new ApiError(404, "not_found", "x"), data: undefined })).toBe(true);
    expect(storedPaymentIsStale({ ...ok, error: new ApiError(403, "forbidden", "x"), data: undefined })).toBe(true);
  });
  it("forgets a payment for another kind or amount", () => {
    expect(storedPaymentIsStale({ ...ok, error: null, data: { kind: "activation_fee", amount: 5000 } })).toBe(true);
    expect(storedPaymentIsStale({ ...ok, error: null, data: { kind: "ticket", amount: 9000 } })).toBe(true);
  });
  it("keeps it on a matching record, while loading, or on errors that may pass", () => {
    expect(storedPaymentIsStale({ ...ok, error: null, data: { kind: "ticket", amount: 5000 } })).toBe(false);
    expect(storedPaymentIsStale({ ...ok, error: null, data: undefined })).toBe(false);
    expect(storedPaymentIsStale({ ...ok, error: new ApiError(0, "network_error", "x"), data: undefined })).toBe(false);
    expect(storedPaymentIsStale({ ...ok, error: new ApiError(401, "session_expired", "x"), data: undefined })).toBe(false);
    expect(storedPaymentIsStale({ ...ok, error: new ApiError(503, "unavailable", "x"), data: undefined })).toBe(false);
  });
  it("accepts any amount when none is expected", () => {
    expect(storedPaymentIsStale({ kind: "ticket", amount: undefined, error: null, data: { kind: "ticket", amount: 1 } })).toBe(false);
  });
});
