import type { Order, PriceQuote, PromoCode, Ticket, User } from '@/lib/types'
import { addAudit, admissionCode, delay, MockApiError, nowIso, readDb, transact, uid, type MockDb } from './db'

export type Selection = Record<string, number>

function applicablePromo(db: MockDb, eventId: string, code: string | null): PromoCode | null {
  if (!code) return null
  const promo = db.promos.find(
    (p) => p.eventId === eventId && p.code.toUpperCase() === code.trim().toUpperCase(),
  )
  if (!promo || !promo.active) throw new MockApiError(422, 'this promo code is not valid for this event')
  if (promo.redemptions >= promo.maxRedemptions) {
    throw new MockApiError(422, 'this promo code has reached its redemption limit')
  }
  return promo
}

/** Server-side pricing: the client never supplies a trusted discount. */
function price(db: MockDb, eventId: string, selection: Selection, promoCode: string | null): PriceQuote {
  const event = db.events.find((e) => e.id === eventId)
  if (!event) throw new MockApiError(404, 'event not found')

  let subtotal = 0
  for (const [typeId, quantity] of Object.entries(selection)) {
    const type = event.ticketTypes.find((t) => t.id === typeId)
    if (!type) throw new MockApiError(422, 'unknown ticket type')
    subtotal += type.price * quantity
  }

  const promo = applicablePromo(db, eventId, promoCode)
  let discount = 0
  if (promo) {
    discount = promo.kind === 'percent' ? Math.round((subtotal * promo.value) / 100) : promo.value
    discount = Math.min(discount, subtotal)
  }
  return { subtotal, discount, total: subtotal - discount, promo }
}

export async function quote(eventId: string, selection: Selection, promoCode: string | null) {
  return delay(price(readDb(), eventId, selection, promoCode), 150)
}

export async function validatePromo(eventId: string, code: string): Promise<PromoCode> {
  const promo = applicablePromo(readDb(), eventId, code)
  if (!promo) throw new MockApiError(422, 'enter a promo code')
  return delay(promo)
}

export type PaymentOutcome = 'approve' | 'decline'

export interface CheckoutResult {
  order: Order
  tickets: Ticket[]
}

/**
 * Reserve → simulated payment → issue tickets, as one transaction. A declined payment
 * records a failed order and leaves inventory and tickets untouched.
 */
export async function placeOrder(
  user: User,
  eventId: string,
  selection: Selection,
  promoCode: string | null,
  outcome: PaymentOutcome,
): Promise<CheckoutResult> {
  await delay(null, 1200)
  return transact((db) => {
    const event = db.events.find((e) => e.id === eventId)
    if (!event || event.status !== 'published') {
      throw new MockApiError(409, 'this event is not on sale')
    }
    if (new Date(event.startsAt).getTime() < Date.now()) {
      throw new MockApiError(409, 'this event has already started')
    }

    const entries = Object.entries(selection).filter(([, quantity]) => quantity > 0)
    if (entries.length === 0) throw new MockApiError(422, 'select at least one ticket')

    const items = entries.map(([typeId, quantity]) => {
      const type = event.ticketTypes.find((t) => t.id === typeId && !t.hidden)
      if (!type) throw new MockApiError(422, 'unknown ticket type')
      if (type.price > 0 && !event.paidSalesActive) {
        throw new MockApiError(409, `"${type.name}" is not on sale yet`)
      }
      if (quantity > type.perOrderLimit) {
        throw new MockApiError(422, `at most ${type.perOrderLimit} "${type.name}" tickets per order`)
      }
      if (type.sold + quantity > type.quantity) {
        throw new MockApiError(409, `only ${type.quantity - type.sold} "${type.name}" tickets left`)
      }
      return { type, quantity }
    })

    const pricing = price(db, eventId, selection, promoCode)
    const paid = pricing.total === 0 || outcome === 'approve'

    const order: Order = {
      id: uid('ord'),
      eventId,
      userId: user.id,
      buyerName: user.full_name,
      buyerEmail: user.email,
      items: items.map(({ type, quantity }) => ({
        ticketTypeId: type.id,
        name: type.name,
        quantity,
        unitPrice: type.price,
      })),
      subtotal: pricing.subtotal,
      discount: pricing.discount,
      total: pricing.total,
      promoCode: pricing.promo?.code ?? null,
      status: paid ? 'paid' : 'failed',
      createdAt: nowIso(),
    }
    db.orders.push(order)

    if (!paid) {
      return { order, tickets: [] }
    }

    if (pricing.promo) {
      const promo = db.promos.find((p) => p.id === pricing.promo?.id)
      if (promo) promo.redemptions++
    }

    const tickets: Ticket[] = []
    for (const { type, quantity } of items) {
      type.sold += quantity
      for (let i = 0; i < quantity; i++) {
        tickets.push({
          id: uid('tkt'),
          code: admissionCode(),
          orderId: order.id,
          eventId,
          userId: user.id,
          ticketTypeName: type.name,
          holderName: user.full_name,
          holderEmail: user.email,
          status: 'valid',
          issuedAt: order.createdAt,
        })
      }
    }
    db.tickets.push(...tickets)
    if (order.total > 0) {
      addAudit(db, eventId, 'System', `Order ${order.id.slice(-6)} paid (simulated) — ${tickets.length} ticket(s)`)
    }
    return { order, tickets }
  })
}
