import { isLocale } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";

const storageKey = "biletflow.locale";
const defaultLocale: Locale = "kk";

/** The interface language chosen earlier in this browser, so a reload keeps it.
 * Storage can be blocked (private mode, site-data settings): fall back to Kazakh. */
export function readLocale(): Locale {
  try {
    const stored = localStorage.getItem(storageKey);
    return isLocale(stored) ? stored : defaultLocale;
  } catch {
    return defaultLocale;
  }
}

export function saveLocale(locale: Locale) {
  try {
    localStorage.setItem(storageKey, locale);
  } catch {
    // The choice still applies for this page view; it just won't survive a reload.
  }
}
