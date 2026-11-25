import { nativeRoutes } from "./routes";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** One anchored RegExp source per native pattern, matched against a URL pathname. */
export function nativePatternSources(): string[] {
  return nativeRoutes.map((route) => {
    const body = route.pattern
      .split("/")
      .map((part) => (part.startsWith(":") ? "[^/]+" : escapeRegExp(part)))
      .join("/");
    return `^${body}/?$`;
  });
}

/**
 * Runs in the web page before its own scripts. React Router moves between pages with
 * history.pushState/replaceState, which never reaches onShouldStartLoadWithRequest, so the
 * wrapper asks the app to open a native screen instead of navigating. popstate (browser
 * back/forward) is left alone.
 */
export function guardScript(sources: string[]): string {
  return `(function () {
  var patterns = ${JSON.stringify(sources)}.map(function (s) { return new RegExp(s); });
  function nativePath(url) {
    if (url === undefined || url === null) return null;
    var target;
    try { target = new URL(String(url), location.href); } catch (e) { return null; }
    if (target.origin !== location.origin) return null;
    for (var i = 0; i < patterns.length; i++)
      if (patterns[i].test(target.pathname)) return target.pathname + target.search + target.hash;
    return null;
  }
  ["pushState", "replaceState"].forEach(function (name) {
    var original = history[name];
    history[name] = function (state, title, url) {
      var path = nativePath(url);
      if (path && window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: "native-route", path: path }));
        return;
      }
      return original.apply(history, arguments);
    };
  });
})();
true;`;
}

/** Accepts only the guard's own message shape with a rooted, same-site path. */
export function parseGuardMessage(data: string): { path: string } | null {
  try {
    const message: unknown = JSON.parse(data);
    if (!message || typeof message !== "object") return null;
    const { type, path } = message as { type?: unknown; path?: unknown };
    if (type !== "native-route" || typeof path !== "string") return null;
    if (!path.startsWith("/") || path.startsWith("//")) return null;
    return { path };
  } catch {
    return null;
  }
}
