import { afterEach, describe, expect, it } from "vitest";
import { formatMoney, formatPrice } from "@biletflow/shared";

// Hermes on iOS has Intl.NumberFormat without formatToParts; prices must still render.
const proto = Intl.NumberFormat.prototype as { formatToParts?: unknown };
const original = proto.formatToParts;
afterEach(() => {
  proto.formatToParts = original;
});

describe("money formatting without Intl formatToParts", () => {
  it("formats the same text as with it", () => {
    const expected = ["ru", "kk", "en"].map((locale) => [
      formatMoney(150050, locale as "ru"),
      formatMoney(0, locale as "ru"),
      formatMoney(-1, locale as "ru"),
      formatPrice(500000, locale as "ru"),
    ]);
    proto.formatToParts = undefined;
    const actual = ["ru", "kk", "en"].map((locale) => [
      formatMoney(150050, locale as "ru"),
      formatMoney(0, locale as "ru"),
      formatMoney(-1, locale as "ru"),
      formatPrice(500000, locale as "ru"),
    ]);
    expect(actual).toEqual(expected);
  });
});
