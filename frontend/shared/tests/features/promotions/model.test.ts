import { expect, it } from "vitest";
import {
  campaignBody,
  campaignPatch,
  checkoutLink,
  parseCampaign,
  parseReport,
  parseValidation,
  selectedCart,
} from "@biletflow/shared/features/promotions/model";
import type { Choice } from "@biletflow/shared/features/checkout/model";
function form(extra: Record<string, string | undefined> = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    name: "Student week",
    discount_type: "fixed",
    discount_value: "12.35",
    valid_from: "2026-11-01T10:00",
    valid_to: "2026-12-01T10:00",
    max_redemptions: "20",
    ...extra,
  }))
    f.set(k, v ?? "");
  return f;
}
it("converts KZT to integer tiyn and event-zone wall times to UTC", () => {
  const b = campaignBody(form(), "Asia/Almaty");
  expect(b.discount_value).toBe(1235);
  expect(b.valid_from).toBe("2026-11-01T05:00:00.000Z");
  expect(b.ticket_type_ids).toEqual([]);
});
it.each([
  { discount_type: "percent", discount_value: "101" },
  { discount_type: "percent", discount_value: "1.5" },
  { discount_value: "0" },
  { discount_value: "1.234" },
  { max_redemptions: "1000001" },
  { max_redemptions: "-1" },
  { valid_to: "2026-10-01T10:00" },
  { name: " " },
])("rejects invalid campaign input %j", (extra) =>
  expect(() => campaignBody(form(extra), "Asia/Almaty")).toThrow(),
);
it("only sends mutable API fields when editing", () => {
  const b = campaignBody(form(), "Asia/Almaty");
  expect(Object.keys(campaignPatch(b, false)).sort()).toEqual([
    "is_enabled",
    "max_redemptions",
    "name",
    "valid_from",
    "valid_to",
  ]);
});
it("preserves promotion and share context on the canonical checkout link without accepting an external destination", () => {
  expect(
    checkoutLink(
      "a/b",
      "?promo=A%26B&share=token&promo_status=promo_expired&returnTo=https://evil.invalid",
    ),
  ).toBe(
    "/events/a%2Fb/checkout?promo=A%26B&promo_status=promo_expired&share=token",
  );
});
it("uses one ticket id per unit for authoritative promo validation", () => {
  const c: Choice = {
    id: "a",
    name: "A",
    price: 123,
    free: false,
    available: 10,
    open: true,
    limit: 10,
  };
  expect(selectedCart([c], { a: 2 })?.ids).toEqual(["a", "a"]);
  expect(selectedCart([c], { a: 2 })?.subtotal).toBe(246);
  expect(selectedCart([c], { a: 101 })).toBeNull();
  expect(selectedCart([{ ...c, price: undefined }], { a: 1 })).toBeNull();
});
it("rejects malformed API money, contradictory validation, and campaign/report payloads", () => {
  expect(() =>
    parseValidation({ valid: true, discount_amount: -1, reason: null }),
  ).toThrow();
  expect(() =>
    parseValidation({
      valid: false,
      discount_amount: 1,
      reason: "promo_expired",
    }),
  ).toThrow();
  expect(() => parseReport({ redemptions: 0 })).toThrow();
  expect(() => parseCampaign({})).toThrow();
});
