import type { Availability } from "@biletflow/shared/features/checkout/model";
import type { SeatOffer } from "@biletflow/shared/features/seating/model";

/**
 * Ticket types the buyer can pick seats for. The server counts a seat hold as reserved, so the
 * type the buyer is holding can show 0 left; it stays listed, with the held seats added back,
 * so Proceed keeps working until the hold ends.
 */
export function seatOffers(
  availability: Availability | undefined,
  held: { offerId: string; heldSeats: number } | null,
): SeatOffer[] {
  if (!availability?.registrationOpen) return [];
  return availability.choices.flatMap((choice) => {
    const extra = held && held.offerId === choice.id ? held.heldSeats : 0;
    const available = choice.available + extra;
    if (!choice.open || available <= 0 || (!choice.free && choice.price === undefined)) return [];
    return [{
      id: choice.id,
      name: choice.name,
      category: choice.priceCategory ?? null,
      priceTiyn: choice.price ?? 0,
      limit: Math.min(choice.limit, available),
    }];
  });
}
