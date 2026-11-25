/** A native screen the app can open in place of a web page. */
export type NativeTarget =
  | { screen: "Tickets" }
  | { screen: "TicketDetail"; params: { ticketId: string } };

/**
 * Web paths (copied from web/src/App.tsx) that already have a native screen. Each work package
 * adds its patterns here; the BiletFlow web tab and deep links then open the native screen.
 */
export const nativeRoutes: readonly {
  pattern: string;
  to: (params: Record<string, string>) => NativeTarget;
}[] = [
  { pattern: "/account/tickets", to: () => ({ screen: "Tickets" }) },
  {
    pattern: "/account/tickets/:ticketId",
    to: (params) => ({ screen: "TicketDetail", params: { ticketId: params.ticketId } }),
  },
];

function segments(path: string): string[] {
  const trimmed = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  return trimmed.split("/").slice(1);
}

/** Exact segment match; `:name` captures one non-empty segment, decoded once. */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const expected = segments(pattern);
  const actual = segments(path);
  if (expected.length !== actual.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < expected.length; i++) {
    const part = expected[i];
    const value = actual[i];
    if (part.startsWith(":")) {
      if (!value) return null;
      try {
        params[part.slice(1)] = decodeURIComponent(value);
      } catch {
        return null;
      }
    } else if (part !== value) return null;
  }
  return params;
}

/** The native screen for a same-origin URL or a root-relative path, or null to stay on the web. */
export function nativeRouteFor(url: string, origin: string): NativeTarget | null {
  let pathname: string;
  try {
    const resolved = new URL(url, origin);
    if (resolved.origin !== new URL(origin).origin) return null;
    pathname = resolved.pathname;
  } catch {
    return null;
  }
  for (const route of nativeRoutes) {
    const params = matchPath(route.pattern, pathname);
    if (params) return route.to(params);
  }
  return null;
}
