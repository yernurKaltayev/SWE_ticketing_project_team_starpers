import { formatPrice } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { discoveryCopy } from "./discoveryCopy";
import type { offerSummary } from "./model";

/** "Free", "from 5 000 ₸" or "5 000 ₸" for cards and CTAs. */
export function offerLabel(
  offer: NonNullable<ReturnType<typeof offerSummary>>,
  locale: Locale,
): string {
  const d = discoveryCopy[locale];
  // Kazakh puts "бастап" after the amount; English and Russian put "from" before it.
  const fromPrice = (amount: number) =>
    locale === "kk"
      ? `${formatPrice(amount, locale)} ${d.from}`
      : `${d.from} ${formatPrice(amount, locale)}`;
  // Any free type (even alongside paid ones) makes the cheapest option free;
  // the paid types are listed on the event page.
  if (offer.minPrice === 0) return d.free;
  return offer.priceVaries ? fromPrice(offer.minPrice) : formatPrice(offer.minPrice, locale);
}
