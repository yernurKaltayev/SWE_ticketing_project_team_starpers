/**
 * In-browser stand-in for the backend domains that are not implemented yet
 * (events, ticketing, checkout, promos, analytics — PROJECT_PLAN.md §7, weeks 5–9).
 *
 * Everything lives in localStorage so the UI can be exercised end to end. The service
 * modules built on top of this file validate and price the way the server will
 * (payment gating, inventory, promo maths), so each one can be swapped for a `fetch`
 * call without touching the pages. No real money moves: payments are simulated.
 */
import type {
  AuditEntry,
  BfEvent,
  EventCategory,
  Order,
  PromoCode,
  Ticket,
  TicketType,
} from '@/lib/types'

export interface MockDb {
  version: number
  events: BfEvent[]
  orders: Order[]
  tickets: Ticket[]
  promos: PromoCode[]
  audit: AuditEntry[]
}

const STORAGE_KEY = 'bf.mockdb'
const VERSION = 1
export const SEED_ORGANIZER_ID = 'seed-organizer'

let cache: MockDb | null = null

export function uid(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
}

/** Unguessable admission token; the real one will be signed server-side. */
export function admissionCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18))
  return 'BFT-' + btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '').slice(0, 22)
}

export function nowIso(): string {
  return new Date().toISOString()
}

/** Simulated network latency, so loading states are visible and honest. */
export function delay<T>(value: T, ms = 250): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

export class MockApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function readDb(): MockDb {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as MockDb) : null
    if (parsed?.version === VERSION) {
      cache = parsed
      return cache
    }
  } catch {
    // Corrupt or unavailable storage: fall through to a fresh seed.
  }
  cache = seed()
  persist()
  return cache
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  } catch {
    // Storage full or blocked: keep working in memory for this session.
  }
}

/** Runs a mutation against the store and persists it, like a single DB transaction. */
export function transact<T>(fn: (db: MockDb) => T): T {
  const db = readDb()
  const draft = structuredClone(db)
  const result = fn(draft)
  cache = draft
  persist()
  return result
}

export function resetDb() {
  cache = seed()
  persist()
}

export function addAudit(db: MockDb, eventId: string, actor: string, action: string) {
  db.audit.push({ id: uid('aud'), eventId, at: nowIso(), actor, action })
}

// ---------------------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------------------

function daysFromNow(days: number, hour: number, minute = 0): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + days)
  // Hours are given in Almaty time (UTC+5).
  date.setUTCHours(hour - 5, minute, 0, 0)
  return date.toISOString()
}

function tt(name: string, price: number, quantity: number, sold: number, description = ''): TicketType {
  return { id: uid('tt'), name, description, price, quantity, sold, perOrderLimit: 6, hidden: false }
}

interface SeedEvent {
  title: string
  summary: string
  description: string
  category: EventCategory
  city: string
  venueName: string
  venueAddress: string
  inDays: number
  hour: number
  durationHours: number
  posterHue: number
  organizerName: string
  ticketTypes: TicketType[]
}

export function seedEvents(): SeedEvent[] {
  return [
    {
      title: 'Steppe Sound Festival',
      summary: 'Two stages of Kazakh indie, electronic and ethno-jazz under the mountains.',
      description:
        'An open-air evening with a dozen acts from Almaty, Astana and Bishkek. Food courts, a craft market and a late-night DJ tent. Doors open an hour before the first set.\n\nBring a warm layer — it gets cold once the sun goes down.',
      category: 'music',
      city: 'Almaty',
      venueName: 'Medeu Open Air',
      venueAddress: 'Medeu tract, Almaty',
      inDays: 12,
      hour: 17,
      durationHours: 7,
      posterHue: 28,
      organizerName: 'Tengri Live',
      ticketTypes: [
        tt('General Admission', 12000, 800, 512, 'Standing access to both stages.'),
        tt('VIP Terrace', 35000, 80, 61, 'Seated terrace, fast-track entry, one drink included.'),
      ],
    },
    {
      title: 'Astana Frontend Meetup #14',
      summary: 'Three talks on React Server Components, design systems and web performance.',
      description:
        'Our monthly community meetup. Talks are in Russian with English slides. Pizza and networking afterwards.\n\nThe venue is on the 3rd floor — use the east entrance.',
      category: 'tech',
      city: 'Astana',
      venueName: 'Astana Hub',
      venueAddress: 'Mangilik El Ave 55/8, Astana',
      inDays: 5,
      hour: 19,
      durationHours: 3,
      posterHue: 205,
      organizerName: 'Astana JS Community',
      ticketTypes: [tt('Free registration', 0, 150, 97)],
    },
    {
      title: 'Kairat vs Ordabasy — Premier League',
      summary: 'Matchday 24 of the Kazakhstan Premier League at the Central Stadium.',
      description: 'Gates open 90 minutes before kick-off. No glass bottles or flares.',
      category: 'sports',
      city: 'Almaty',
      venueName: 'Central Stadium',
      venueAddress: 'Satpayev St 29/3, Almaty',
      inDays: 9,
      hour: 18,
      durationHours: 2,
      posterHue: 350,
      organizerName: 'FC Kairat',
      ticketTypes: [
        tt('East Stand', 3000, 6000, 4100),
        tt('West Stand', 5000, 4000, 3900),
        tt('Family Sector', 2000, 1500, 640, 'Up to 2 adults + 2 children per ticket.'),
      ],
    },
    {
      title: 'Abai Reading Night',
      summary: 'Actors and poets read Abai’s Words of Edification, with dombra interludes.',
      description:
        'An intimate evening of readings in Kazakh and Russian, followed by tea and conversation with the performers.',
      category: 'arts',
      city: 'Shymkent',
      venueName: 'Shymkent Drama Theatre',
      venueAddress: 'Tauke Khan Ave 12, Shymkent',
      inDays: 16,
      hour: 18,
      durationHours: 2,
      posterHue: 265,
      organizerName: 'Otyrar Arts',
      ticketTypes: [tt('Stalls', 4000, 300, 120), tt('Balcony', 2500, 150, 40)],
    },
    {
      title: 'Data Science Bootcamp: Weekend Intensive',
      summary: 'Hands-on pandas, SQL and model evaluation in two days. Laptops required.',
      description:
        'A practical weekend for analysts moving into data science. Includes lunch both days and a certificate of completion.',
      category: 'education',
      city: 'Almaty',
      venueName: 'KBTU Innovation Center',
      venueAddress: 'Tole Bi St 59, Almaty',
      inDays: 21,
      hour: 10,
      durationHours: 8,
      posterHue: 160,
      organizerName: 'DataCamp KZ',
      ticketTypes: [tt('Early bird', 45000, 30, 30), tt('Standard', 60000, 40, 12)],
    },
    {
      title: 'Founders Breakfast: Fundraising in Central Asia',
      summary: 'A panel of VCs and founders on raising seed rounds from the region.',
      description: 'Breakfast is served from 08:30. Panel starts 09:00, Q&A until 10:30.',
      category: 'business',
      city: 'Astana',
      venueName: 'The Ritz-Carlton Astana',
      venueAddress: 'Dostyk St 16, Astana',
      inDays: 7,
      hour: 8,
      durationHours: 2,
      posterHue: 45,
      organizerName: 'Most Ventures',
      ticketTypes: [tt('Breakfast seat', 15000, 120, 88)],
    },
    {
      title: 'Kok-Tobe Sunrise Run 10K',
      summary: 'A charity run up the hill at dawn. All proceeds go to local animal shelters.',
      description:
        'Choose the 5K or the 10K route. Timing chips, a finisher medal and breakfast are included.',
      category: 'community',
      city: 'Almaty',
      venueName: 'Kok-Tobe Park',
      venueAddress: 'Kok-Tobe hill, Almaty',
      inDays: 26,
      hour: 6,
      durationHours: 3,
      posterHue: 12,
      organizerName: 'Run Almaty',
      ticketTypes: [tt('5K runner', 5000, 400, 150), tt('10K runner', 7000, 400, 210)],
    },
    {
      title: 'Nauryz Crafts Fair',
      summary: 'Felt, silver, ceramics and street food from 60 makers across Kazakhstan.',
      description: 'Free entry. Workshops on felt-making and ornament painting run every hour.',
      category: 'community',
      city: 'Karaganda',
      venueName: 'Central Park Pavilion',
      venueAddress: 'Bukhar Zhyrau Ave, Karaganda',
      inDays: 33,
      hour: 11,
      durationHours: 6,
      posterHue: 185,
      organizerName: 'Made in KZ',
      ticketTypes: [tt('Free entry', 0, 2000, 340)],
    },
  ]
}

export function buildEvent(s: SeedEvent, organizerId: string, organizerName: string): BfEvent {
  const created = daysFromNow(-30, 12)
  return {
    id: uid('evt'),
    organizerId,
    organizerName,
    title: s.title,
    summary: s.summary,
    description: s.description,
    category: s.category,
    city: s.city,
    venueName: s.venueName,
    venueAddress: s.venueAddress,
    startsAt: daysFromNow(s.inDays, s.hour),
    endsAt: daysFromNow(s.inDays, s.hour + s.durationHours),
    status: 'published',
    visibility: 'public',
    posterHue: s.posterHue,
    paidSalesActive: s.ticketTypes.some((t) => t.price > 0),
    ticketTypes: s.ticketTypes.map((t) => ({ ...t, id: uid('tt') })),
    createdAt: created,
    updatedAt: created,
  }
}

function seed(): MockDb {
  return {
    version: VERSION,
    events: seedEvents().map((s) => buildEvent(s, SEED_ORGANIZER_ID, s.organizerName)),
    orders: [],
    tickets: [],
    promos: [],
    audit: [],
  }
}

// ---------------------------------------------------------------------------------------
// Sample sales for an organizer's demo events
// ---------------------------------------------------------------------------------------

const FIRST_NAMES = ['Aruzhan', 'Dias', 'Aigerim', 'Nurlan', 'Madina', 'Timur', 'Dana', 'Yerlan', 'Kamila', 'Arman', 'Zhanna', 'Sanzhar']
const LAST_NAMES = ['Abenova', 'Seitkali', 'Nurpeisova', 'Omarov', 'Zhaksylykova', 'Bekov', 'Tulegenova', 'Sadykov', 'Ermekova', 'Kassymov']

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

/**
 * Generates paid orders and their tickets spread over the last three weeks,
 * so the analytics dashboard has something to show. Ticket-type `sold` counts are set to
 * match the generated tickets exactly.
 */
export function generateSampleSales(db: MockDb, event: BfEvent, promo: PromoCode | null) {
  for (const type of event.ticketTypes) type.sold = 0
  const orderCount = 25 + Math.floor(Math.random() * 20)

  for (let i = 0; i < orderCount; i++) {
    const type = pick(event.ticketTypes)
    const quantity = 1 + Math.floor(Math.random() * 3)
    if (type.sold + quantity > type.quantity) continue

    const first = pick(FIRST_NAMES)
    const last = pick(LAST_NAMES)
    const createdAt = new Date(Date.now() - Math.random() * 21 * 86_400_000).toISOString()
    const subtotal = type.price * quantity
    const usePromo = promo && subtotal > 0 && Math.random() < 0.25
    const discount = usePromo ? Math.round((subtotal * promo.value) / 100) : 0
    if (usePromo) promo.redemptions++

    const order: Order = {
      id: uid('ord'),
      eventId: event.id,
      userId: uid('usr'),
      buyerName: `${first} ${last}`,
      buyerEmail: `${first}.${last}@example.kz`.toLowerCase(),
      items: [{ ticketTypeId: type.id, name: type.name, quantity, unitPrice: type.price }],
      subtotal,
      discount,
      total: subtotal - discount,
      promoCode: usePromo ? promo.code : null,
      status: Math.random() < 0.05 ? 'refunded' : 'paid',
      createdAt,
    }
    db.orders.push(order)
    if (order.status === 'paid') type.sold += quantity

    for (let n = 0; n < quantity; n++) {
      db.tickets.push({
        id: uid('tkt'),
        code: admissionCode(),
        orderId: order.id,
        eventId: event.id,
        userId: order.userId,
        ticketTypeName: type.name,
        holderName: order.buyerName,
        holderEmail: order.buyerEmail,
        status: order.status === 'refunded' ? 'refunded' : 'valid',
        issuedAt: createdAt,
      })
    }
  }
}
