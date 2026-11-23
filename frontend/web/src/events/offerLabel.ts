import { formatPrice } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { discoveryCopy } from "./discoveryCopy";
import type { offerSummary } from "./model";

/** "Free", "Free · from 50 ₸", "from 5 000 ₸" or "5 000 ₸" for cards and CTAs. */
export function offerLabel(
  offer: NonNullable<ReturnType<typeof offerSummary>>,
  locale: Locale,
): string {
  const d = discoveryCopy[locale];
  if (offer.allFree) return d.free;
  if (offer.minPrice === 0 && offer.minPaidPrice !== null)
    return `${d.free} · ${d.from} ${formatPrice(offer.minPaidPrice, locale)}`;
  return `${offer.priceVaries ? `${d.from} ` : ""}${formatPrice(offer.minPrice, locale)}`;
}
