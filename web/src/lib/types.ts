// ---- Mirrors of the implemented backend schemas (backend/app/schemas) ----

export type UserRole = 'attendee' | 'organizer' | 'event_admin' | 'platform_admin'

export interface User {
  id: string
  email: string
  full_name: string
  role: UserRole
  is_active: boolean
  is_email_verified: boolean
  created_at: string
}

export interface TokenPair {
  access_token: string
  refresh_token: string
  token_type: 'bearer'
  expires_in: number
}

export interface OrganizerProfile {
  id: string
  user_id: string
  display_name: string
  contact_email: string
  contact_phone: string | null
  description: string | null
  is_identity_verified: boolean
  created_at: string
}

export interface OrganizerProfileUpsert {
  display_name: string
  contact_email: string
  contact_phone: string | null
  description: string | null
}

// ---- Planned domain entities (PROJECT_PLAN.md §4), served by the mock layer for now ----

export type EventStatus = 'draft' | 'published' | 'cancelled' | 'suspended'
export type Visibility = 'public' | 'unlisted' | 'private'
export type EventCategory =
  | 'music'
  | 'tech'
  | 'sports'
  | 'arts'
  | 'education'
  | 'business'
  | 'community'

export interface TicketType {
  id: string
  name: string
  description: string
  /** Price in whole KZT; 0 means a free ticket type. */
  price: number
  quantity: number
  sold: number
  perOrderLimit: number
  hidden: boolean
}

export interface BfEvent {
  id: string
  organizerId: string
  organizerName: string
  title: string
  summary: string
  description: string
  category: EventCategory
  city: string
  venueName: string
  venueAddress: string
  startsAt: string
  endsAt: string
  status: EventStatus
  visibility: Visibility
  /** Hue (0–360) for the generated event poster. */
  posterHue: number
  paidSalesActive: boolean
  ticketTypes: TicketType[]
  createdAt: string
  updatedAt: string
}

export type EventInput = Omit<
  BfEvent,
  'id' | 'organizerId' | 'organizerName' | 'status' | 'paidSalesActive' | 'createdAt' | 'updatedAt'
>

export interface PromoCode {
  id: string
  eventId: string
  code: string
  kind: 'percent' | 'fixed'
  value: number
  maxRedemptions: number
  redemptions: number
  active: boolean
  campaignName: string
}

export type OrderStatus = 'pending' | 'paid' | 'failed' | 'refunded'

export interface OrderItem {
  ticketTypeId: string
  name: string
  quantity: number
  unitPrice: number
}

export interface Order {
  id: string
  eventId: string
  userId: string
  buyerName: string
  buyerEmail: string
  items: OrderItem[]
  subtotal: number
  discount: number
  total: number
  promoCode: string | null
  status: OrderStatus
  createdAt: string
}

export type TicketStatus = 'valid' | 'checked_in' | 'cancelled' | 'refunded'

export interface Ticket {
  id: string
  /** Opaque admission token encoded in the QR code. */
  code: string
  orderId: string
  eventId: string
  userId: string
  ticketTypeName: string
  holderName: string
  holderEmail: string
  status: TicketStatus
  issuedAt: string
}

export interface AuditEntry {
  id: string
  eventId: string
  at: string
  actor: string
  action: string
}

export interface PriceQuote {
  subtotal: number
  discount: number
  total: number
  promo: PromoCode | null
}
