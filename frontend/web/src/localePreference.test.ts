// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { readLocale, saveLocale } from "./localePreference";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

it("defaults to Kazakh when nothing was chosen", () => {
  expect(readLocale()).toBe("kk");
});

it("restores the language chosen before a reload", () => {
  saveLocale("ru");
  expect(readLocale()).toBe("ru");
  saveLocale("en");
  expect(readLocale()).toBe("en");
});

it("ignores an unknown stored value", () => {
  localStorage.setItem("biletflow.locale", "de");
  expect(readLocale()).toBe("kk");
});

it("falls back to Kazakh when storage is blocked", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new DOMException("blocked", "SecurityError");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("blocked", "SecurityError");
  });
  expect(() => saveLocale("ru")).not.toThrow();
  expect(readLocale()).toBe("kk");
});
