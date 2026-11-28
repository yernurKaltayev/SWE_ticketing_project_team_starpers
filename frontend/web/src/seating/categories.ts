import type { Locale } from "@biletflow/shared";

const known: Record<string, Record<Locale, string>> = {
  standard: { en: "Standard", ru: "Стандарт", kk: "Стандарт" },
  vip: { en: "VIP", ru: "VIP", kk: "VIP" },
};

/** A seat price category as buyers read it ("vip" → "VIP"); unknown ones are capitalised. */
export function categoryLabelOf(category: string | null, locale: Locale) {
  const key = category?.trim().toLowerCase() ?? "";
  if (!key) return locale === "ru" ? "Без категории" : locale === "kk" ? "Санатсыз" : "Any seat";
  return known[key]?.[locale] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

/** "Row A, seat 5" in the buyer's language, for tickets and orders. */
export function seatLabel(seat: { row_label: string; seat_number: number }, locale: Locale) {
  const [row, place] =
    locale === "ru" ? ["Ряд", "место"] : locale === "kk" ? ["Қатар", "орын"] : ["Row", "seat"];
  return `${row} ${seat.row_label}, ${place} ${seat.seat_number}`;
}
