import { describe, expect, it } from "vitest";
import { createMemoryTokenStore } from "../src/token-store";
import { formatEventDateTime, formatMoney } from "../src/format";
import { isLocale, locales, messages } from "../src/locales";

describe("non-persistent token storage", () => {
  it("isolates sessions, copies token pairs, and clears access and refresh together", async () => {
    const first = createMemoryTokenStore();
    const second = createMemoryTokenStore();
    const pair = { accessToken: "access", refreshToken: "refresh" };
    await first.set(pair);
    pair.accessToken = "modified";
    const returned = await first.get();
    returned!.refreshToken = "modified";
    await expect(first.get()).resolves.toEqual({
      accessToken: "access",
      refreshToken: "refresh",
    });
    await expect(first.getAccessToken()).resolves.toBe("access");
    await expect(second.get()).resolves.toBeNull();
    await first.clear();
    await expect(first.get()).resolves.toBeNull();
    await expect(first.getAccessToken()).resolves.toBeNull();
  });

  it("rejects incomplete credentials", async () => {
    const store = createMemoryTokenStore();
    await expect(
      store.set({ accessToken: "access", refreshToken: "" }),
    ).rejects.toBeInstanceOf(TypeError);
    await expect(store.get()).resolves.toBeNull();
  });
});

describe("canonical KZT formatting", () => {
  it("formats integer tiyn in all required locales, including negative sub-unit values", () => {
    for (const locale of locales) {
      const rendered = formatMoney(12345, locale);
      expect(rendered).toMatch(/123[.,]45/);
      const negative = formatMoney(-1, locale);
      expect(negative).toContain("-");
      expect(negative).toMatch(/0[.,]01/);
      expect(formatMoney(0, locale)).toMatch(/0[.,]00/);
    }
  });

  it("preserves the last tiyn even at the safe-integer limit", () => {
    const rendered = formatMoney(Number.MAX_SAFE_INTEGER, "en").replace(
      /[\s,]/g,
      "",
    );
    expect(rendered).toContain("90071992547409.91");
  });

  it.each([NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid canonical money: %s",
    (amount) => {
      expect(() => formatMoney(amount)).toThrow(RangeError);
    },
  );

  it("does not guess minor-unit semantics for unsupported currencies", () => {
    expect(() => formatMoney(100, "en", "JPY")).toThrow(RangeError);
  });
});

describe("event time and baseline locales", () => {
  it("uses the explicit event zone instead of the local computer zone", () => {
    const instant = "2026-11-04T12:00:00Z";
    expect(formatEventDateTime(instant, "UTC", "en")).not.toBe(
      formatEventDateTime(instant, "Asia/Qyzylorda", "en"),
    );
    expect(formatEventDateTime(instant, "Asia/Qyzylorda", "en")).toContain(
      "Asia/Qyzylorda",
    );
    expect(() => formatEventDateTime("2026-11-04T12:00:00", "UTC")).toThrow(
      RangeError,
    );
    expect(() => formatEventDateTime(instant, "")).toThrow(RangeError);
    expect(() => formatEventDateTime("invalidZ", "UTC")).toThrow(RangeError);
  });

  it("has complete matching F0 message keys for kk, ru and en", () => {
    for (const locale of locales) {
      expect(Object.keys(messages[locale]).sort()).toEqual(
        Object.keys(messages.en).sort(),
      );
      expect(
        Object.values(messages[locale]).every(
          (value) => value.trim().length > 0,
        ),
      ).toBe(true);
    }
    expect(isLocale("kk")).toBe(true);
    expect(isLocale("ru")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(false);
  });
});
