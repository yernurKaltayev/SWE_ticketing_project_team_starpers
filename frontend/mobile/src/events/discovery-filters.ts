import { isoDay } from "@biletflow/shared/features/events/model";

export const discoveryKeys = ["q", "category", "city", "date_from", "date_to"] as const;
export type DiscoveryFilters = Record<(typeof discoveryKeys)[number], string>;
export type DiscoveryParams = Partial<DiscoveryFilters>;

export function discoveryParams(query: URLSearchParams): DiscoveryParams {
  return Object.fromEntries(discoveryKeys.map((key) => [key, query.get(key) ?? ""]));
}

export function discoveryFilters(params?: DiscoveryParams): DiscoveryFilters {
  return {
    q: typeof params?.q === "string" ? params.q.trim() : "",
    category: typeof params?.category === "string" ? params.category.trim() : "",
    city: typeof params?.city === "string" ? params.city.trim() : "",
    date_from: dateOnly(params?.date_from),
    date_to: dateOnly(params?.date_to),
  };
}

function dateOnly(value?: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && isoDay(date) === value ? value : "";
}

/** Filters from the sheet; the search text stays the last one the user actually submitted. */
export function withSheetValues(current: DiscoveryFilters, values: DiscoveryParams): DiscoveryFilters {
  return discoveryFilters({ ...values, q: current.q });
}

/** Banner slides: soonest events with a cover photo first; events without one only fill the gaps (as on the web). */
export function featuredSlides<T extends { images: string[] }>(events: T[], limit = 5): T[] {
  return [
    ...events.filter((e) => e.images.length > 0),
    ...events.filter((e) => e.images.length === 0),
  ].slice(0, limit);
}
