import type { Locale } from "../../index";
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
  semey: { en: "Semey", ru: "Семей", kk: "Семей" },
  petropavl: { en: "Petropavl", ru: "Петропавловск", kk: "Петропавл" },
  kokshetau: { en: "Kokshetau", ru: "Кокшетау", kk: "Көкшетау" },
  taldykorgan: { en: "Taldykorgan", ru: "Талдыкорган", kk: "Талдықорған" },
  kyzylorda: { en: "Kyzylorda", ru: "Кызылорда", kk: "Қызылорда" },
  oral: { en: "Oral", ru: "Уральск", kk: "Орал" },
};
const aliases: Record<string, string> = {
  алматы: "almaty",
  астана: "astana",
  "nur-sultan": "astana",
  шымкент: "shymkent",
  караганда: "karaganda",
  қарағанды: "karaganda",
  oskemen: "ust-kamenogorsk",
  "усть-каменогорск": "ust-kamenogorsk",
  uralsk: "oral",
  уральск: "oral",
  petropavlovsk: "petropavl",
  петропавловск: "petropavl",
  semipalatinsk: "semey",
  өскемен: "ust-kamenogorsk",
};

export function cityLabel(city: string, locale: Locale): string {
  return cityNames[cityKey(city)]?.[locale] ?? city.trim();
}

/** City centres for picking the visitor's nearest city from their location. */
const cityCoords: Record<string, [number, number]> = {
  almaty: [43.238, 76.946],
  astana: [51.169, 71.449],
  shymkent: [42.317, 69.596],
  karaganda: [49.806, 73.085],
  aktobe: [50.283, 57.167],
  atyrau: [47.094, 51.924],
  aktau: [43.651, 51.197],
  pavlodar: [52.287, 76.967],
  "ust-kamenogorsk": [49.948, 82.628],
  kostanay: [53.214, 63.632],
  taraz: [42.9, 71.367],
  turkistan: [43.297, 68.252],
  semey: [50.411, 80.227],
  petropavl: [54.866, 69.135],
  kokshetau: [53.283, 69.396],
  taldykorgan: [45.017, 78.373],
  kyzylorda: [44.848, 65.482],
  oral: [51.227, 51.387],
};

function cityKey(city: string) {
  const key = city.trim().toLowerCase();
  return aliases[key] ?? key;
}

/** The listed city closest to a point; cities without known coordinates are skipped. */
export function nearestCity(cities: string[], lat: number, lng: number): string | undefined {
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const city of cities) {
    const coords = cityCoords[cityKey(city)];
    if (!coords) continue;
    const dLat = coords[0] - lat;
    const dLng = (coords[1] - lng) * Math.cos((lat * Math.PI) / 180);
    const distance = dLat * dLat + dLng * dLng;
    if (distance < bestDistance) {
      best = city;
      bestDistance = distance;
    }
  }
  return best;
}

/** Where to start when location is unavailable: Almaty if listed, else the first city. */
export function defaultCity(cities: string[]): string | undefined {
  return cities.find((c) => cityKey(c) === "almaty") ?? cities[0];
}

/** Every city the site offers, as stored on venues (the usual Latin spelling). */
export const knownCities = Object.values(cityNames).map((names) => names.en);

/** The same city however it is spelled (Almaty / Алматы / almaty). */
export function sameCity(a: string, b: string) {
  return cityKey(a) === cityKey(b);
}
