import { useQuery } from '@tanstack/react-query'
import { ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { BfEvent } from '@/lib/types'
import { getOrganizerProfile } from '@/services/account'

/** The organizer's profile, or null when they haven't created one yet (API returns 404). */
export function useOrganizerProfile() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['organizer-profile', user?.id],
    queryFn: async () => {
      try {
        return await getOrganizerProfile()
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null
        throw error
      }
    },
    enabled: user?.role === 'organizer',
  })
}

export function useOrganizerName(): string {
  const { user } = useAuth()
  const { data: profile } = useOrganizerProfile()
  return profile?.display_name ?? user?.full_name ?? 'Organizer'
}

export type HistoryBucket = 'upcoming' | 'active' | 'drafts' | 'completed' | 'cancelled'

/** Event history classification (SRS: Upcoming / Active / Completed / Cancelled). */
export function historyBucket(event: BfEvent, now = Date.now()): HistoryBucket {
  if (event.status === 'cancelled') return 'cancelled'
  if (event.status === 'draft' || event.status === 'suspended') return 'drafts'
  if (new Date(event.endsAt).getTime() < now) return 'completed'
  if (new Date(event.startsAt).getTime() <= now) return 'active'
  return 'upcoming'
}
