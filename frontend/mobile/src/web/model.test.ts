import { describe, expect, it } from "vitest";
import { handlesBack, isInternal, resolveWebOrigin, webSessionKey } from "./model";

const origin = "https://130-162-184-12.sslip.io";

describe("isInternal", () => {
  it("keeps same-origin pages inside the app", () => {
    expect(isInternal(`${origin}/events/1?x=2#top`, origin)).toBe(true);
    expect(isInternal(`${origin}/`, origin)).toBe(true);
  });
  it("sends other hosts and schemes to the system browser", () => {
    expect(isInternal("https://t.me/biletflow", origin)).toBe(false);
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

describe("isInternal across an http/https redirect", () => {
  it("keeps the same host inside the app whatever the scheme", () => {
    expect(isInternal("https://130-162-184-12.sslip.io/", "http://130-162-184-12.sslip.io")).toBe(true);
    expect(isInternal("http://130-162-184-12.sslip.io/events", origin)).toBe(true);
    expect(isInternal("https://130-162-184-12.sslip.io:8443/", origin)).toBe(false);
  });
});

describe("webSessionKey", () => {
  it("gives each native identity its own web session", () => {
    expect(webSessionKey("u-1", 0)).not.toBe(webSessionKey("u-2", 0));
    expect(webSessionKey(null, 0)).not.toBe(webSessionKey("u-1", 0));
    expect(webSessionKey("u-1", 0)).not.toBe(webSessionKey("u-1", 1));
  });
});

describe("handlesBack", () => {
  it("only consumes Android back while the web view can go back", () => {
    expect(handlesBack({ canGoBack: true, failed: false })).toBe(true);
    expect(handlesBack({ canGoBack: false, failed: false })).toBe(false);
    expect(handlesBack({ canGoBack: true, failed: true })).toBe(false);
  });
});
