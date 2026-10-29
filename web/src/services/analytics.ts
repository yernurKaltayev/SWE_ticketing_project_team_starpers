import type { User } from '@/lib/types'
import { api } from '@/lib/api'

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

/** Analytics are calculated by the backend from persisted order/ticket records. */
export function organizerAnalytics(_user: User, eventId?: string): Promise<Analytics> {
  return api<Analytics>(`/analytics${eventId ? `?event_id=${encodeURIComponent(eventId)}` : ''}`)
}
