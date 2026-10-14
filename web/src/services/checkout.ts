import { post, api } from '@/lib/api'
import type { Order, PriceQuote, PromoCode, Ticket, User } from '@/lib/types'

export type Selection = Record<string, number>
export type PaymentOutcome = 'approve' | 'decline'
export interface CheckoutResult {
  order: Order
  tickets: Ticket[]
}

export async function quote(eventId: string, selection: Selection, promoCode: string | null): Promise<PriceQuote> {
  if (Object.keys(selection).length === 0) return { subtotal: 0, discount: 0, total: 0, promo: null }
  return post<PriceQuote>(`/events/${eventId}/quote`, { selection, promoCode })
}
export const validatePromo = (eventId: string, code: string) =>
  api<PromoCode>(`/events/${eventId}/promos/validate?code=${encodeURIComponent(code.trim())}`)

export function placeOrder(
  _user: User, eventId: string, selection: Selection,
  promoCode: string | null, outcome: PaymentOutcome,
): Promise<CheckoutResult> {
  // This request retains its key when the API client retries after refreshing a token.
  const idempotencyKey = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
  return post<CheckoutResult>(`/events/${eventId}/checkout`, {
    selection, promoCode, outcome, idempotencyKey,
  })
}
