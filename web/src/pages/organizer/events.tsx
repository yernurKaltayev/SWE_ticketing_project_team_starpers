import { useQuery } from '@tanstack/react-query'
import { CalendarPlus, CalendarX, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EventStatusBadge, EventThumb } from '@/components/events'
import { Card, cx, EmptyState, LinkButton, PageHeader, Spinner } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { formatDateTime } from '@/lib/format'
import { listOrganizerEvents } from '@/services/events'
import { historyBucket, type HistoryBucket } from './shared'

const TABS: { value: HistoryBucket; label: string }[] = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'active', label: 'Happening now' },
  { value: 'drafts', label: 'Drafts' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

export function OrganizerEventsPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState<HistoryBucket>('upcoming')
  const { data: events, isLoading } = useQuery({
    queryKey: ['organizer-events', user!.id],
    queryFn: () => listOrganizerEvents(user!),
  })

  if (isLoading || !events) return <Spinner />

  const counts = Object.fromEntries(TABS.map((t) => [t.value, 0])) as Record<HistoryBucket, number>
  for (const e of events) counts[historyBucket(e)]++
  const shown = events.filter((e) => historyBucket(e) === tab)

  return (
    <>
      <PageHeader
        title="My events"
        actions={
          <LinkButton to="/organizer/events/new" icon={CalendarPlus} variant="accent">
            New event
          </LinkButton>
        }
      />
      <div className="-mx-4 mb-6 flex gap-1 overflow-x-auto px-4" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
            className={cx(
              'shrink-0 rounded-full px-4 py-2 text-sm font-semibold',
              tab === t.value ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100',
            )}
          >
            {t.label} <span className="opacity-60">{counts[t.value]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={CalendarX} title={`No ${TABS.find((t) => t.value === tab)!.label.toLowerCase()} events`} />
      ) : (
        <Card className="divide-y divide-ink-100">
          {shown.map((event) => {
            const sold = event.ticketTypes.reduce((s, t) => s + t.sold, 0)
            const capacity = event.ticketTypes.reduce((s, t) => s + t.quantity, 0)
            return (
              <Link key={event.id} to={`/organizer/events/${event.id}`} className="flex items-center gap-4 p-4 hover:bg-ink-50">
                <EventThumb event={event} className="size-12" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{event.title}</p>
                  <p className="text-sm text-ink-500">
                    {formatDateTime(event.startsAt)} · {event.city}
                  </p>
                </div>
                <div className="hidden w-40 sm:block">
                  <div className="mb-1 text-right text-xs text-ink-500 tabular-nums">
                    {sold} / {capacity}
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
                    <div className="h-full rounded-full bg-sky-500" style={{ width: `${capacity ? (sold / capacity) * 100 : 0}%` }} />
                  </div>
                </div>
                <EventStatusBadge status={event.status} />
                <ChevronRight className="size-4 text-ink-400" />
              </Link>
            )
          })}
        </Card>
      )}
    </>
  )
}
