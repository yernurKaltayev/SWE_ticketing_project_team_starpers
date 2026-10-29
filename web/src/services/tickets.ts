import { api, patch, post } from '@/lib/api'
import type { BfEvent, Order, PromoCode, Ticket, User } from '@/lib/types'

export interface OrderWithTickets {
  order: Order
  event: BfEvent
  tickets: Ticket[]
}
export const listMyOrders = (_user: User) => api<OrderWithTickets[]>('/orders/me')
export const getMyTicket = (_user: User, ticketId: string) =>
  api<{ ticket: Ticket; event: BfEvent }>(`/tickets/${ticketId}`)
export async function refundOrder(_user: User, orderId: string): Promise<void> {
  await post(`/orders/${orderId}/refund`, {})
}
export const listEventOrders = (eventId: string) => api<Order[]>(`/events/${eventId}/orders`)
export const listEventTickets = (eventId: string) => api<Ticket[]>(`/events/${eventId}/tickets`)
export const listPromos = (eventId: string) => api<PromoCode[]>(`/events/${eventId}/promos`)
export interface PromoInput {
  code: string
  kind: PromoCode['kind']
  value: number
  maxRedemptions: number
  campaignName: string
}
export const createPromo = (_user: User, eventId: string, input: PromoInput) =>
  post<PromoCode>(`/events/${eventId}/promos`, { ...input, code: input.code.trim().toUpperCase() })
export async function setPromoActive(_user: User, promoId: string, active: boolean): Promise<void> {
  await patch(`/promos/${promoId}`, { active })
}
