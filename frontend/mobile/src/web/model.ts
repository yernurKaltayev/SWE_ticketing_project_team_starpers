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

/** Pages of our own site stay in the web view; everything else opens in the system browser. */
export function isInternal(url: string, origin: string): boolean {
  if (url === "about:blank" || url.startsWith("blob:") || url.startsWith("data:")) return true;
  try {
    return new URL(url).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}
