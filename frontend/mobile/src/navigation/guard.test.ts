/// <reference types="node" />
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { guardScript, nativePatternSources, parseGuardMessage } from "./guard";

function page(href = "https://site.example/events") {
  const pushState = vi.fn();
  const replaceState = vi.fn();
  const postMessage = vi.fn();
  const history = { pushState, replaceState };
  const location = { href, origin: new URL(href).origin };
  const window = { ReactNativeWebView: { postMessage } };
  const context = { history, location, window, URL };
  const result: unknown = runInNewContext(guardScript(nativePatternSources()), context);
  return { history, pushState, replaceState, postMessage, result };
}

describe("guardScript", () => {
  it("hands a mapped in-page navigation to the app instead of navigating", () => {
    const p = page();
    p.history.pushState({}, "", "/account/tickets");
    expect(p.pushState).not.toHaveBeenCalled();
    expect(JSON.parse(p.postMessage.mock.calls[0][0])).toEqual({
      type: "native-route",
      path: "/account/tickets",
    });
  });

  it("keeps the query and hash in the message", () => {
    const p = page();
    p.history.pushState({}, "", "/account/tickets/t-1?from=mail#top");
    expect(JSON.parse(p.postMessage.mock.calls[0][0]).path).toBe("/account/tickets/t-1?from=mail#top");
  });

  it("lets every other navigation through unchanged", () => {
    const p = page();
    const state = { a: 1 };
    p.history.pushState(state, "", "/events/1");
    p.history.pushState(state, "", "/account/tickets-archive");
    p.history.pushState(state, "", "https://other.example/account/tickets");
    expect(p.postMessage).not.toHaveBeenCalled();
    expect(p.pushState).toHaveBeenCalledTimes(3);
    expect(p.pushState).toHaveBeenNthCalledWith(1, state, "", "/events/1");
  });

  it("guards replaceState the same way", () => {
    const p = page();
    p.history.replaceState({}, "", "/account/tickets");
    p.history.replaceState({}, "", "/events");
    expect(p.postMessage).toHaveBeenCalledTimes(1);
    expect(p.replaceState).toHaveBeenCalledTimes(1);
  });

  it("installs once even when injected twice (document start and page end)", () => {
    const pushState = vi.fn();
    const postMessage = vi.fn();
    const context = {
      history: { pushState, replaceState: vi.fn() },
      location: { href: "https://site.example/events", origin: "https://site.example" },
      window: { ReactNativeWebView: { postMessage } } as Record<string, unknown>,
      URL,
    };
    const script = guardScript(nativePatternSources());
    runInNewContext(script, context);
    runInNewContext(script, context);
    context.history.pushState({}, "", "/account/tickets");
    context.history.pushState({}, "", "/events");
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(pushState).toHaveBeenCalledTimes(1);
  });

  it("evaluates to true, as the WebView requires", () => {
    expect(page().result).toBe(true);
  });
});

describe("parseGuardMessage", () => {
  it("accepts only native-route messages with a rooted path", () => {
    expect(parseGuardMessage('{"type":"native-route","path":"/account/tickets"}')).toEqual({
      path: "/account/tickets",
    });
    expect(parseGuardMessage("not json")).toBeNull();
    expect(parseGuardMessage('{"type":"other","path":"/x"}')).toBeNull();
    expect(parseGuardMessage('{"type":"native-route","path":"x"}')).toBeNull();
    expect(parseGuardMessage('{"type":"native-route","path":"//evil.example/x"}')).toBeNull();
    expect(parseGuardMessage("null")).toBeNull();
  });
});
