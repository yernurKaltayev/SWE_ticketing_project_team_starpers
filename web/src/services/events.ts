import type { AuditEntry, BfEvent, EventCategory, EventInput, PromoCode, User } from '@/lib/types'
import {
  addAudit,
  buildEvent,
  delay,
  generateSampleSales,
  MockApiError,
  nowIso,
  readDb,
  seedEvents,
  transact,
  uid,
  type MockDb,
} from './db'

export interface EventFilters {
  q?: string
  city?: string
  category?: EventCategory | ''
}

const isAdmin = (user: User | null) => user?.role === 'platform_admin'

function findEvent(db: MockDb, id: string): BfEvent {
  const event = db.events.find((e) => e.id === id)
  if (!event) throw new MockApiError(404, 'event not found')
  return event
}

function ownedEvent(db: MockDb, user: User, id: string): BfEvent {
  const event = findEvent(db, id)
  if (event.organizerId !== user.id && !isAdmin(user)) {
    throw new MockApiError(403, 'you do not manage this event')
  }
  return event
}

export async function listPublicEvents(filters: EventFilters = {}): Promise<BfEvent[]> {
  const q = filters.q?.trim().toLowerCase()
  const now = Date.now()
  const events = readDb()
    .events.filter(
      (e) =>
        e.status === 'published' &&
        e.visibility === 'public' &&
        new Date(e.endsAt).getTime() > now &&
        (!filters.city || e.city === filters.city) &&
        (!filters.category || e.category === filters.category) &&
        (!q ||
          [e.title, e.summary, e.venueName, e.organizerName].some((f) =>
            f.toLowerCase().includes(q),
          )),
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  return delay(events)
}

/** Drafts, private and suspended events are only visible to their organizer and admins. */
export async function getEvent(id: string, viewer: User | null): Promise<BfEvent> {
  const event = findEvent(readDb(), id)
  const isOwner = viewer?.id === event.organizerId
  const publiclyVisible =
    (event.status === 'published' || event.status === 'cancelled') &&
    event.visibility !== 'private'
  if (!publiclyVisible && !isOwner && !isAdmin(viewer)) {
    throw new MockApiError(404, 'event not found')
  }
  return delay(event)
}

export async function listOrganizerEvents(user: User): Promise<BfEvent[]> {
  const events = readDb()
    .events.filter((e) => e.organizerId === user.id)
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
  return delay(events)
}

export async function listAllEvents(): Promise<BfEvent[]> {
  return delay([...readDb().events].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
}

function validateInput(input: EventInput) {
  if (new Date(input.endsAt) <= new Date(input.startsAt)) {
    throw new MockApiError(422, 'the event must end after it starts')
  }
  if (input.ticketTypes.length === 0) {
    throw new MockApiError(422, 'add at least one ticket type')
  }
  for (const type of input.ticketTypes) {
    if (type.quantity < type.sold) {
      throw new MockApiError(422, `"${type.name}" cannot have fewer tickets than already sold`)
    }
  }
}

export async function createEvent(user: User, organizerName: string, input: EventInput) {
  validateInput(input)
  const event = transact((db) => {
    const now = nowIso()
    const created: BfEvent = {
      ...input,
      id: uid('evt'),
      organizerId: user.id,
      organizerName,
      status: 'draft',
      paidSalesActive: false,
      ticketTypes: input.ticketTypes.map((t) => ({ ...t, id: t.id || uid('tt'), sold: 0 })),
      createdAt: now,
      updatedAt: now,
    }
    db.events.push(created)
    addAudit(db, created.id, user.full_name, 'Created event as draft')
    return created
  })
  return delay(event)
}

export async function updateEvent(user: User, id: string, input: EventInput) {
  const event = transact((db) => {
    const event = ownedEvent(db, user, id)
    // Sold counts are authoritative server-side; never take them from the client.
    const soldById = new Map(event.ticketTypes.map((t) => [t.id, t.sold]))
    const ticketTypes = input.ticketTypes.map((t) => ({
      ...t,
      id: t.id || uid('tt'),
      sold: soldById.get(t.id) ?? 0,
    }))
    for (const removed of event.ticketTypes) {
      if (removed.sold > 0 && !ticketTypes.some((t) => t.id === removed.id)) {
        throw new MockApiError(422, `"${removed.name}" has sales — hide it instead of deleting`)
      }
    }
    validateInput({ ...input, ticketTypes })

    const priceChanged = event.ticketTypes.some((old) => {
      const next = ticketTypes.find((t) => t.id === old.id)
      return next && (next.price !== old.price || next.quantity !== old.quantity)
    })
    Object.assign(event, input, { ticketTypes, updatedAt: nowIso() })
    addAudit(db, event.id, user.full_name, priceChanged ? 'Edited event, including price or capacity' : 'Edited event details')
    return event
  })
  return delay(event)
}

export type StatusAction = 'publish' | 'unpublish' | 'cancel'

export async function changeEventStatus(user: User, id: string, action: StatusAction) {
  const event = transact((db) => {
    const event = ownedEvent(db, user, id)
    if (event.status === 'suspended') throw new MockApiError(409, 'this event is suspended by a platform admin')
    if (event.status === 'cancelled') throw new MockApiError(409, 'this event is cancelled')

    if (action === 'publish') {
      event.status = 'published'
      addAudit(db, id, user.full_name, 'Published event')
    } else if (action === 'unpublish') {
      event.status = 'draft'
      addAudit(db, id, user.full_name, 'Unpublished event (back to draft)')
    } else {
      event.status = 'cancelled'
      // Cancelling refunds every paid order (simulated) and voids all tickets.
      let refunded = 0
      for (const order of db.orders) {
        if (order.eventId === id && order.status === 'paid') {
          order.status = 'refunded'
          refunded++
        }
      }
      for (const ticket of db.tickets) {
        if (ticket.eventId === id && ticket.status === 'valid') ticket.status = 'cancelled'
      }
      addAudit(db, id, user.full_name, `Cancelled event — ${refunded} order(s) refunded (simulated)`)
    }
    event.updatedAt = nowIso()
    return event
  })
  return delay(event)
}

/** Copies setup only: no orders, tickets, promo redemptions or history come along. */
export async function duplicateEvent(user: User, id: string) {
  const copy = transact((db) => {
    const source = ownedEvent(db, user, id)
    const now = nowIso()
    const copy: BfEvent = {
      ...structuredClone(source),
      id: uid('evt'),
      title: `${source.title} (copy)`,
      status: 'draft',
      paidSalesActive: false,
      ticketTypes: source.ticketTypes.map((t) => ({ ...t, id: uid('tt'), sold: 0 })),
      createdAt: now,
      updatedAt: now,
    }
    db.events.push(copy)
    addAudit(db, copy.id, user.full_name, `Duplicated from "${source.title}"`)
    return copy
  })
  return delay(copy)
}

/** Simulated Paid Sales Activation: verification, payout account and fee are all fake. */
export async function activatePaidSales(user: User, id: string, payoutIban: string) {
  const event = transact((db) => {
    const event = ownedEvent(db, user, id)
    if (!/^KZ\d{2}[A-Z0-9]{16}$/.test(payoutIban.replace(/\s/g, '').toUpperCase())) {
      throw new MockApiError(422, 'enter a valid Kazakh IBAN (KZ + 18 characters)')
    }
    event.paidSalesActive = true
    event.updatedAt = nowIso()
    addAudit(db, id, user.full_name, 'Completed Paid Sales Activation (simulated fee and verification)')
    return event
  })
  return delay(event, 900)
}

export async function setSuspended(admin: User, id: string, suspended: boolean) {
  if (!isAdmin(admin)) throw new MockApiError(403, 'platform admins only')
  const event = transact((db) => {
    const event = findEvent(db, id)
    event.status = suspended ? 'suspended' : 'draft'
    event.updatedAt = nowIso()
    addAudit(
      db,
      id,
      `${admin.full_name} (Platform Admin)`,
      suspended ? 'Suspended event — sales stopped' : 'Lifted suspension; event returned to draft',
    )
    return event
  })
  return delay(event)
}

export async function getEventAudit(user: User, id: string): Promise<AuditEntry[]> {
  const db = readDb()
  ownedEvent(db, user, id)
  return delay(db.audit.filter((a) => a.eventId === id).sort((a, b) => b.at.localeCompare(a.at)))
}

/** Gives a new organizer two sample events with generated sales, for demoing analytics. */
export async function createSampleEvents(user: User, organizerName: string) {
  transact((db) => {
    for (const s of seedEvents().slice(0, 3)) {
      const event = buildEvent(s, user.id, organizerName)
      db.events.push(event)
      const promo: PromoCode | null =
        event.ticketTypes.some((t) => t.price > 0)
          ? {
              id: uid('promo'),
              eventId: event.id,
              code: 'STUDENT20',
              kind: 'percent',
              value: 20,
              maxRedemptions: 100,
              redemptions: 0,
              active: true,
              campaignName: 'University posters',
            }
          : null
      generateSampleSales(db, event, promo)
      if (promo) db.promos.push(promo)
      addAudit(db, event.id, 'BiletFlow demo', 'Sample event created with generated demo sales')
    }
  })
  return delay(undefined, 600)
}
