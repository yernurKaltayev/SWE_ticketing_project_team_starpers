import type { Locale } from "../../index";

/**
 * Event categories the platform suggests. The API stores free text and filters it
 * case-insensitively, so these keys are stored as-is and anything else an organizer
 * typed still shows (untranslated) and still filters.
 */
const labels = {
  concert: { en: "Concert", ru: "Концерт", kk: "Концерт" },
  festival: { en: "Festival", ru: "Фестиваль", kk: "Фестиваль" },
  theatre: { en: "Theatre", ru: "Театр", kk: "Театр" },
  cinema: { en: "Cinema", ru: "Кино", kk: "Кино" },
  sport: { en: "Sport", ru: "Спорт", kk: "Спорт" },
  conference: { en: "Conference", ru: "Конференция", kk: "Конференция" },
  meetup: { en: "Meetup", ru: "Митап", kk: "Митап" },
  education: { en: "Education", ru: "Обучение", kk: "Білім" },
  exhibition: { en: "Exhibition", ru: "Выставка", kk: "Көрме" },
  kids: { en: "For kids", ru: "Детям", kk: "Балаларға" },
  other: { en: "Other", ru: "Другое", kk: "Басқа" },
} satisfies Record<string, Record<Locale, string>>;

export const knownCategories = Object.keys(labels) as (keyof typeof labels)[];

/** "Concert" or "concert" -> "Концерт" in Russian; unknown text is returned unchanged. */
export function categoryLabel(category: string, locale: Locale): string {
  const key = category.trim().toLowerCase() as keyof typeof labels;
  return labels[key]?.[locale] ?? category.trim();
}
