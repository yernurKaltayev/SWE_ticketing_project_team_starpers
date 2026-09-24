import type { BfEvent, Order, PromoCode, Ticket, User } from '@/lib/types'
import { addAudit, delay, MockApiError, readDb, transact, uid } from './db'

export interface OrderWithTickets {
  order: Order
  event: BfEvent
  tickets: Ticket[]
}

export async function listMyOrders(user: User): Promise<OrderWithTickets[]> {
  const db = readDb()
  const result = db.orders
    .filter((o) => o.userId === user.id && o.status !== 'failed')
    .flatMap((order) => {
      const event = db.events.find((e) => e.id === order.eventId)
      if (!event) return []
      return [{ order, event, tickets: db.tickets.filter((t) => t.orderId === order.id) }]
    })
    .sort((a, b) => a.event.startsAt.localeCompare(b.event.startsAt))
  return delay(result)
}

export async function getMyTicket(user: User, ticketId: string) {
  const db = readDb()
  const ticket = db.tickets.find((t) => t.id === ticketId && t.userId === user.id)
  const event = ticket && db.events.find((e) => e.id === ticket.eventId)
  if (!ticket || !event) throw new MockApiError(404, 'ticket not found')
  return delay({ ticket, event })
}

/** Basic attendee refund (simulated): allowed until 24h before the event starts. */
export async function refundOrder(user: User, orderId: string) {
  transact((db) => {
    const order = db.orders.find((o) => o.id === orderId && o.userId === user.id)
    if (!order || order.status !== 'paid') throw new MockApiError(404, 'order not found')
    const event = db.events.find((e) => e.id === order.eventId)
    if (!event) throw new MockApiError(404, 'event not found')
    if (new Date(event.startsAt).getTime() - Date.now() < 86_400_000) {
      throw new MockApiError(409, 'refunds close 24 hours before the event starts')
    }
    const tickets = db.tickets.filter((t) => t.orderId === orderId)
    if (tickets.some((t) => t.status === 'checked_in')) {
      throw new MockApiError(409, 'a ticket in this order has already been used')
    }

    order.status = 'refunded'
    for (const ticket of tickets) ticket.status = 'refunded'
    for (const item of order.items) {
      const type = event.ticketTypes.find((t) => t.id === item.ticketTypeId)
      if (type) type.sold = Math.max(0, type.sold - item.quantity)
    }
    addAudit(db, event.id, user.full_name, `Refunded order ${order.id.slice(-6)} (simulated)`)
  })
  return delay(undefined)
}

export async function listEventOrders(eventId: string): Promise<OrderWithTickets['order'][]> {
  const orders = readDb()
    .orders.filter((o) => o.eventId === eventId && o.status !== 'failed')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return delay(orders)
}

export async function listEventTickets(eventId: string): Promise<Ticket[]> {
  return delay(readDb().tickets.filter((t) => t.eventId === eventId))
}

// ---- Promo codes ----------------------------------------------------------------------

export async function listPromos(eventId: string): Promise<PromoCode[]> {
  return delay(readDb().promos.filter((p) => p.eventId === eventId))
}

export interface PromoInput {
  code: string
  kind: PromoCode['kind']
  value: number
  maxRedemptions: number
  campaignName: string
}

export async function createPromo(user: User, eventId: string, input: PromoInput) {
  const code = input.code.trim().toUpperCase()
  if (!/^[A-Z0-9_-]{3,20}$/.test(code)) {
    throw new MockApiError(422, 'codes are 3–20 letters, digits, - or _')
  }
  if (input.kind === 'percent' && (input.value < 1 || input.value > 100)) {
    throw new MockApiError(422, 'a percentage discount must be between 1 and 100')
  }
  const promo = transact((db) => {
    if (db.promos.some((p) => p.eventId === eventId && p.code === code)) {
      throw new MockApiError(409, 'this code already exists for the event')
    }
    const promo: PromoCode = { ...input, code, id: uid('promo'), eventId, redemptions: 0, active: true }
    db.promos.push(promo)
    addAudit(db, eventId, user.full_name, `Created promo code ${code}`)
    return promo
  })
  return delay(promo)
}

export async function setPromoActive(user: User, promoId: string, active: boolean) {
  transact((db) => {
    const promo = db.promos.find((p) => p.id === promoId)
    if (!promo) throw new MockApiError(404, 'promo not found')
    promo.active = active
    addAudit(db, promo.eventId, user.full_name, `${active ? 'Enabled' : 'Disabled'} promo code ${promo.code}`)
  })
  return delay(undefined)
}
