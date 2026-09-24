import type { User } from '@/lib/types'
import { delay, readDb } from './db'

export interface DayPoint {
  date: string
  tickets: number
  revenue: number
}

export interface Analytics {
  capacity: number
  sold: number
  checkedIn: number
  gross: number
  discounts: number
  refunded: number
  net: number
  orders: number
  byDay: DayPoint[]
  byTicketType: { name: string; sold: number; quantity: number; revenue: number }[]
  campaigns: { id: string; eventTitle: string; code: string; campaignName: string; redemptions: number; discount: number }[]
}

const DAYS = 21

/** Computed only from authoritative order and ticket records (PROJECT_PLAN.md §3). */
export async function organizerAnalytics(user: User, eventId?: string): Promise<Analytics> {
  const db = readDb()
  const events = db.events.filter(
    (e) => e.organizerId === user.id && (!eventId || e.id === eventId),
  )
  const eventIds = new Set(events.map((e) => e.id))
  const orders = db.orders.filter((o) => eventIds.has(o.eventId))
  const paid = orders.filter((o) => o.status === 'paid')
  const tickets = db.tickets.filter((t) => eventIds.has(t.eventId))

  const byDay = new Map<string, DayPoint>()
  for (let i = DAYS - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10)
    byDay.set(date, { date, tickets: 0, revenue: 0 })
  }
  for (const order of paid) {
    const point = byDay.get(order.createdAt.slice(0, 10))
    if (!point) continue
    point.tickets += order.items.reduce((sum, i) => sum + i.quantity, 0)
    point.revenue += order.total
  }

  const byTicketType = events.flatMap((e) =>
    e.ticketTypes.map((t) => ({
      name: eventId ? t.name : `${t.name} · ${e.title}`,
      sold: t.sold,
      quantity: t.quantity,
      revenue: paid
        .flatMap((o) => o.items)
        .filter((i) => i.ticketTypeId === t.id)
        .reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
    })),
  )

  const campaigns = db.promos
    .filter((p) => eventIds.has(p.eventId))
    .map((p) => {
      const redeemed = paid.filter((o) => o.promoCode === p.code && o.eventId === p.eventId)
      return {
        id: p.id,
        eventTitle: events.find((e) => e.id === p.eventId)?.title ?? '',
        code: p.code,
        campaignName: p.campaignName,
        redemptions: redeemed.length,
        discount: redeemed.reduce((sum, o) => sum + o.discount, 0),
      }
    })

  const gross = paid.reduce((sum, o) => sum + o.subtotal, 0)
  const discounts = paid.reduce((sum, o) => sum + o.discount, 0)

  return delay({
    capacity: events.reduce((sum, e) => sum + e.ticketTypes.reduce((s, t) => s + t.quantity, 0), 0),
    sold: events.reduce((sum, e) => sum + e.ticketTypes.reduce((s, t) => s + t.sold, 0), 0),
    checkedIn: tickets.filter((t) => t.status === 'checked_in').length,
    gross,
    discounts,
    refunded: orders.filter((o) => o.status === 'refunded').reduce((sum, o) => sum + o.total, 0),
    net: gross - discounts,
    orders: paid.length,
    byDay: [...byDay.values()],
    byTicketType,
    campaigns,
  })
}
