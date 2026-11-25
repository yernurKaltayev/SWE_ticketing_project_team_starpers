/** Web origin for the embedded site; deployed web and API share one origin, so the API origin is the fallback. */
export function resolveWebOrigin(
  webOrigin: string | undefined,
  apiOrigin: string | undefined,
): string | null {
  for (const candidate of [webOrigin, apiOrigin]) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === "http:" || url.protocol === "https:") return url.origin;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

export const webOrigin = resolveWebOrigin(
  process.env.EXPO_PUBLIC_WEB_ORIGIN,
  process.env.EXPO_PUBLIC_API_ORIGIN,
);

/**
 * Pages of our own site stay in the web view; everything else opens in the system browser.
 * Same host and port count as ours whatever the scheme, so an http → https redirect on the
 * first load stays inside instead of leaving a blank tab.
 */
export function isInternal(url: string, origin: string): boolean {
  if (url === "about:blank" || url.startsWith("blob:") || url.startsWith("data:")) return true;
  try {
    const target = new URL(url);
    const ours = new URL(origin);
    return (
      (target.protocol === "http:" || target.protocol === "https:") &&
      target.hostname === ours.hostname &&
      target.port === ours.port
    );
  } catch {
    return false;
  }
}

/**
 * React key for the (incognito) web view: a new native identity, or a reload, gets a fresh
 * cookie jar, so the next person never sees the previous person's web session.
 */
export function webSessionKey(userId: string | null, attempt: number): string {
  return `${userId ?? "signed-out"}:${attempt}`;
}

/** Android back walks the web history only while a page is actually shown. */
export function handlesBack(state: { canGoBack: boolean; failed: boolean }): boolean {
  return state.canGoBack && !state.failed;
}
