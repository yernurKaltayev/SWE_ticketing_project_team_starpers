import { formatPrice } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { discoveryCopy } from "./discoveryCopy";
import type { offerSummary } from "./model";

/** "Free", "Free or 50 ₸", "from 5 000 ₸" or "5 000 ₸" for cards and CTAs. */
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
  if (offer.allFree) return d.free;
  if (offer.minPrice === 0 && offer.minPaidPrice !== null)
    return `${d.free} ${d.or} ${
      offer.paidVaries ? fromPrice(offer.minPaidPrice) : formatPrice(offer.minPaidPrice, locale)
    }`;
  return offer.priceVaries ? fromPrice(offer.minPrice) : formatPrice(offer.minPrice, locale);
}
