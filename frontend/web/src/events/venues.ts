import type { Locale } from "@biletflow/shared";

export type VenueRef = { id: string; name: string; city: string };

/**
 * Live P4 returns a bare array whose address/city may be null; older fixtures
 * return a page. Rows without a usable id/name are skipped, never invented.
 */
export function parseVenueRefs(value: unknown): VenueRef[] {
  const rows = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { items?: unknown }).items)
      ? (value as { items: unknown[] }).items
      : [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const { id, name, city } = row as Record<string, unknown>;
    if (typeof id !== "string" || typeof name !== "string") return [];
    return [{ id, name, city: typeof city === "string" ? city.trim() : "" }];
  });
}

/** Venues store the city as typed (often Latin); show the usual local spelling. */
const cityNames: Record<string, Record<Locale, string>> = {
  almaty: { en: "Almaty", ru: "Алматы", kk: "Алматы" },
  astana: { en: "Astana", ru: "Астана", kk: "Астана" },
  shymkent: { en: "Shymkent", ru: "Шымкент", kk: "Шымкент" },
  karaganda: { en: "Karaganda", ru: "Караганда", kk: "Қарағанды" },
  aktobe: { en: "Aktobe", ru: "Актобе", kk: "Ақтөбе" },
  atyrau: { en: "Atyrau", ru: "Атырау", kk: "Атырау" },
  aktau: { en: "Aktau", ru: "Актау", kk: "Ақтау" },
  pavlodar: { en: "Pavlodar", ru: "Павлодар", kk: "Павлодар" },
  "ust-kamenogorsk": { en: "Oskemen", ru: "Усть-Каменогорск", kk: "Өскемен" },
  kostanay: { en: "Kostanay", ru: "Костанай", kk: "Қостанай" },
  taraz: { en: "Taraz", ru: "Тараз", kk: "Тараз" },
  turkistan: { en: "Turkistan", ru: "Туркестан", kk: "Түркістан" },
};
const aliases: Record<string, string> = {
  алматы: "almaty",
  астана: "astana",
  "nur-sultan": "astana",
  шымкент: "shymkent",
  караганда: "karaganda",
  қарағанды: "karaganda",
  oskemen: "ust-kamenogorsk",
  өскемен: "ust-kamenogorsk",
};

export function cityLabel(city: string, locale: Locale): string {
  const key = city.trim().toLowerCase();
  return cityNames[aliases[key] ?? key]?.[locale] ?? city.trim();
}
