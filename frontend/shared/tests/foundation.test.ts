import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryTokenStore } from "../src/token-store";
import { formatDateTime, formatEventDateTime, formatMoney } from "../src/format";
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

  describe("Kazakh dates in engines without Kazakh month names", () => {
    // Chrome and Hermes ship no Kazakh calendar data and print "2027 M03 1 19:00".
    const RealFormat = Intl.DateTimeFormat;
    beforeEach(() => {
      const chromeLike = function (
        locales?: string | string[],
        options?: Intl.DateTimeFormatOptions,
      ) {
        const asked = Array.isArray(locales) ? locales[0] : locales;
        if (!asked?.startsWith("kk")) return new RealFormat(locales, options);
        const english = new RealFormat("en-CA", { ...options, month: options?.month ? "2-digit" : undefined });
        return {
          format: (date?: Date | number) =>
            english.format(date).replace(/(\d{4})-(\d{2})-(\d{2})/, "$1 M$2 $3"),
          formatToParts: (date?: Date | number) => english.formatToParts(date),
          resolvedOptions: () => english.resolvedOptions(),
        } as Intl.DateTimeFormat;
      } as unknown as typeof Intl.DateTimeFormat;
      vi.stubGlobal("Intl", { ...Intl, DateTimeFormat: chromeLike });
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("writes the event date with Kazakh month names", () => {
      expect(formatEventDateTime("2027-03-01T14:00:00Z", "Asia/Almaty", "kk")).toBe(
        "2027 ж. 1 нау., 19:00 GMT+5 · Asia/Almaty",
      );
    });

    it("writes timestamps and plain dates the same way", () => {
      const instant = "2026-11-23T18:20:00Z";
      expect(formatDateTime(instant, "kk", { time: true, timeZone: "Asia/Almaty" })).toBe(
        "2026 ж. 23 қар., 23:20",
      );
      expect(formatDateTime(instant, "kk", { timeZone: "Asia/Almaty" })).toBe("2026 ж. 23 қар.");
      expect(formatDateTime(instant, "en", { time: true, timeZone: "UTC" })).toContain("2026");
    });
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
