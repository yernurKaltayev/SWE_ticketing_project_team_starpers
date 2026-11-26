/** Public origin for links and event images; deployed web and API share one origin, so the API origin is the fallback. */
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
