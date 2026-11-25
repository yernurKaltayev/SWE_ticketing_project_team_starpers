import { describe, expect, it } from "vitest";
import { isInternal, resolveWebOrigin } from "./model";

const origin = "https://130-162-184-12.sslip.io";

describe("isInternal", () => {
  it("keeps same-origin pages inside the app", () => {
    expect(isInternal(`${origin}/events/1?x=2#top`, origin)).toBe(true);
    expect(isInternal(`${origin}/`, origin)).toBe(true);
  });
  it("sends other hosts and schemes to the system browser", () => {
    expect(isInternal("https://t.me/biletflow", origin)).toBe(false);
    expect(isInternal("http://130-162-184-12.sslip.io/events", origin)).toBe(false);
    expect(isInternal("mailto:help@example.com", origin)).toBe(false);
  });
  it("treats in-page technical URLs as internal", () => {
    expect(isInternal("about:blank", origin)).toBe(true);
    expect(isInternal("blob:https://130-162-184-12.sslip.io/abc", origin)).toBe(true);
    expect(isInternal("data:text/plain,hi", origin)).toBe(true);
  });
  it("rejects garbage", () => {
    expect(isInternal("not a url", origin)).toBe(false);
  });
});

describe("resolveWebOrigin", () => {
  it("prefers the web origin and falls back to the API origin", () => {
    expect(resolveWebOrigin("https://web.example", "https://api.example")).toBe("https://web.example");
    expect(resolveWebOrigin(undefined, "https://api.example/")).toBe("https://api.example");
    expect(resolveWebOrigin("", "https://api.example")).toBe("https://api.example");
  });
  it("returns null when nothing usable is configured", () => {
    expect(resolveWebOrigin(undefined, undefined)).toBeNull();
    expect(resolveWebOrigin("nonsense", undefined)).toBeNull();
  });
});
