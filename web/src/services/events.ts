import { api, post, put } from '@/lib/api'
import type { AuditEntry, BfEvent, EventCategory, EventInput, User } from '@/lib/types'

export interface EventFilters {
  q?: string
  city?: string
  category?: EventCategory | ''
}

export function listPublicEvents(filters: EventFilters = {}): Promise<BfEvent[]> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value)
  return api<BfEvent[]>(`/events?${params}`)
}

export const getEvent = (id: string, _viewer: User | null) => api<BfEvent>(`/events/${id}`)
export const listOrganizerEvents = (_user: User) => api<BfEvent[]>('/events?scope=mine')
export const listAllEvents = () => api<BfEvent[]>('/events?scope=all')
export const createEvent = (_user: User, _organizerName: string, input: EventInput) =>
  post<BfEvent>('/events', input)
export const updateEvent = (_user: User, id: string, input: EventInput) =>
  put<BfEvent>(`/events/${id}`, input)

export type StatusAction = 'publish' | 'unpublish' | 'cancel'
export const changeEventStatus = (_user: User, id: string, action: StatusAction) =>
  post<BfEvent>(`/events/${id}/${action}`, {})
export const duplicateEvent = (_user: User, id: string) =>
  post<BfEvent>(`/events/${id}/duplicate`, {})
export const activatePaidSales = (_user: User, id: string, payoutIban: string) =>
  post<BfEvent>(`/events/${id}/activation`, {
    payoutIban: payoutIban.replace(/\s/g, '').toUpperCase(),
    termsAccepted: true,
  })
export const setSuspended = (_admin: User, id: string, suspended: boolean) =>
  post<BfEvent>(`/events/${id}/suspension`, { suspended })
export const getEventAudit = (_user: User, id: string) => api<AuditEntry[]>(`/events/${id}/audit`)
export async function createSampleEvents(_user: User, _organizerName: string): Promise<void> {
  await post('/events/samples', {})
}
