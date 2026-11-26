export const DEMO_CARD = {
  number: "4242 4242 4242 4242",
  expiry: "12/34",
  cvc: "123",
} as const;

export type Card = { number: string; expiry: string; cvc: string; holder: string };

/** Browser-only format checks. The card values never leave this component. */
export function cardErrors(card: Card): (keyof Card)[] {
  const bad: (keyof Card)[] = [];
  if (!/^\d{16}$/.test(card.number.replace(/\s+/g, ""))) bad.push("number");
  const m = /^(\d{2})\/(\d{2})$/.exec(card.expiry.trim());
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) bad.push("expiry");
  if (!/^\d{3,4}$/.test(card.cvc.trim())) bad.push("cvc");
  if (!card.holder.trim()) bad.push("holder");
  return bad;
}
