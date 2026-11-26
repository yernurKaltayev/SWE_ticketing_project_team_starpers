import { featureNames, featureParams, featurePaths } from "./features";
import type { FeatureName, FeatureParams } from "./features";
import { discoveryParams } from "../events/discovery-filters";
import type { DiscoveryParams } from "../events/discovery-filters";
import { authScreenNames, authScreens } from "./auth-routes";
import type { AuthParams, AuthScreenName } from "./auth-routes";

/** A native screen the app can open in place of a web page. */
export type NativeTarget =
  | { screen: FeatureName; params: FeatureParams }
  | { screen: "Tickets" }
  | { screen: "Account" }
  | { screen: "Discover"; params: DiscoveryParams }
  | { screen: AuthScreenName; params: AuthParams }
  | { screen: "TicketDetail"; params: { ticketId: string } };

/**
 * Web paths in web/src/App.tsx and their native destinations, including the email aliases.
 * Specific routes precede their wildcard fallbacks.
 */
export const nativeRoutes: readonly {
  pattern: string;
  to: (params: Record<string, string>, query: URLSearchParams) => NativeTarget;
}[] = [
  ...authScreenNames.map((screen) => ({
    pattern: `/${authScreens[screen]}`,
    to: (_params: Record<string, string>, query: URLSearchParams): NativeTarget => ({
      screen,
      params: {
        returnTo: query.get("returnTo") ?? undefined,
        token: screen === "VerifyEmail" || screen === "ResetPassword" ? query.get("token") ?? undefined : undefined,
      },
    }),
  })),
  ...["/", "/events"].map((pattern) => ({
    pattern,
    to: (_params: Record<string, string>, query: URLSearchParams): NativeTarget => ({
      screen: "Discover",
      params: discoveryParams(query),
    }),
  })),
  { pattern: "/account", to: () => ({ screen: "Account" }) },
  { pattern: "/account/tickets", to: () => ({ screen: "Tickets" }) },
  { pattern: "/tickets", to: () => ({ screen: "Tickets" }) },
  {
    pattern: "/account/tickets/:ticketId",
    to: (params) => ({ screen: "TicketDetail", params: { ticketId: params.ticketId } }),
  },
  ...featureNames.flatMap((screen) => featurePaths[screen].map((pattern) => ({
    pattern,
    to: (params: Record<string, string>, query: URLSearchParams): NativeTarget => ({
      screen,
      params: featureParams(params, query),
    }),
  }))),
];

function segments(path: string): string[] {
  const trimmed = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  return trimmed.split("/").slice(1);
}

/** Exact segment match; `:name` captures one non-empty segment, decoded once. */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const expected = pattern === "*" ? ["*"] : segments(pattern);
  const actual = segments(path);
  const wildcard = expected.at(-1) === "*";
  const length = wildcard ? expected.length - 1 : expected.length;
  if (wildcard ? actual.length < length : actual.length !== length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < length; i++) {
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

/** The native screen for a same-origin URL or a root-relative path, or null for an external or malformed URL. */
export function nativeRouteFor(url: string, origin: string): NativeTarget | null {
  if (!url.startsWith("/") && !/^https?:\/\//i.test(url)) return null;
  let resolved: URL;
  try {
    resolved = new URL(url, origin);
    if (resolved.origin !== new URL(origin).origin) return null;
  } catch {
    return null;
  }
  for (const route of nativeRoutes) {
    const params = matchPath(route.pattern, resolved.pathname);
    if (params) return route.to(params, resolved.searchParams);
  }
  return null;
}
