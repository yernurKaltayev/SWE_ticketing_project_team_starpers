import { describe, expect, it } from "vitest";
import type { Availability } from "@biletflow/shared/features/checkout/model";
import { seatOffers } from "./offers";

const availability = (available: number): Availability => ({
  registrationOpen: true,
  choices: [
    { id: "vip", name: "VIP", free: false, price: 500000, available, open: true, limit: 4, priceCategory: "vip" },
    { id: "gone", name: "Gone", free: false, price: 100000, available: 0, open: true, limit: 4 },
  ],
});

describe("seatOffers", () => {
  it("lists open types with seats left and hides sold-out ones", () => {
    expect(seatOffers(availability(3), null).map((offer) => offer.id)).toEqual(["vip"]);
    expect(seatOffers(availability(3), null)[0]).toMatchObject({ limit: 3, category: "vip", priceTiyn: 500000 });
  });

  it("keeps the type the buyer is holding even when the hold took the last seats", () => {
    const offers = seatOffers(availability(0), { offerId: "vip", heldSeats: 2 });
    expect(offers.map((offer) => offer.id)).toEqual(["vip"]);
    expect(offers[0]!.limit).toBe(2);
  });

  it("shows nothing while registration is closed", () => {
    expect(seatOffers({ ...availability(3), registrationOpen: false }, null)).toEqual([]);
    expect(seatOffers(undefined, null)).toEqual([]);
  });
});
