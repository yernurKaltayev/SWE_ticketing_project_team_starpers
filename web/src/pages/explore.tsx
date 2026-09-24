import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Search, SearchX } from 'lucide-react'
import { useDeferredValue, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { categoryIcons, EventCard } from '@/components/events'
import { MockNotice } from '@/components/layout'
import { cx, EmptyState, Input, LinkButton, Select, Spinner } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { categoryLabels, cities } from '@/lib/format'
import type { EventCategory } from '@/lib/types'
import { listPublicEvents } from '@/services/events'

const CATEGORIES = Object.keys(categoryLabels) as EventCategory[]

export function ExplorePage() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const city = params.get('city') ?? ''
  const category = (params.get('category') ?? '') as EventCategory | ''
  const deferredQ = useDeferredValue(q)

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const { data: events, isLoading } = useQuery({
    queryKey: ['events', 'public', deferredQ, city, category],
    queryFn: () => listPublicEvents({ q: deferredQ, city, category }),
    placeholderData: (previous) => previous,
  })

  return (
    <>
      <section className="relative mb-12 overflow-hidden rounded-3xl bg-ink-900 px-6 py-12 text-white sm:px-12 sm:py-16">
        <svg viewBox="0 0 200 200" className="absolute -top-24 -right-24 size-96 opacity-25" aria-hidden>
          {Array.from({ length: 32 }, (_, i) => (
            <rect key={i} x="98.5" y="4" width="3" height="56" rx="1.5" fill="#f4b41a" transform={`rotate(${i * 11.25} 100 100)`} />
          ))}
          <circle cx="100" cy="100" r="32" fill="#f4b41a" />
        </svg>
        <div className="relative max-w-2xl">
          <h1 className="text-3xl leading-tight font-bold sm:text-5xl">
            What's on in <span className="text-sun-400">Kazakhstan</span>
          </h1>
          <p className="mt-4 text-lg text-ink-200">
            Concerts, meetups, matches and workshops — with tickets that live on your phone.
          </p>
          <div className="relative mt-8">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-400" />
            <Input
              type="search"
              value={q}
              onChange={(e) => update('q', e.target.value)}
              placeholder="Search events, venues or organizers"
              aria-label="Search events"
              className="h-14 rounded-full pl-12 text-base"
            />
          </div>
        </div>
      </section>

      {user?.role === 'organizer' ? null : (
        <div className="mb-10 flex flex-col items-start justify-between gap-4 rounded-2xl bg-sun-100 p-6 sm:flex-row sm:items-center">
          <div>
            <p className="font-display font-semibold">Hosting something?</p>
            <p className="text-sm text-ink-700">Publish free events in minutes. Paid ticketing unlocks after a one-time activation.</p>
          </div>
          <LinkButton to="/register?role=organizer" icon={ArrowRight} variant="primary">
            Become an organizer
          </LinkButton>
        </div>
      )}

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0" role="group" aria-label="Category">
          <CategoryChip active={!category} onClick={() => update('category', '')}>
            All
          </CategoryChip>
          {CATEGORIES.map((c) => {
            const Icon = categoryIcons[c]
            return (
              <CategoryChip key={c} active={category === c} onClick={() => update('category', category === c ? '' : c)}>
                <Icon className="size-4" />
                {categoryLabels[c]}
              </CategoryChip>
            )
          })}
        </div>
        <Select value={city} onChange={(e) => update('city', e.target.value)} className="lg:w-48" aria-label="City">
          <option value="">All cities</option>
          {cities.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      </div>

      {isLoading ? (
        <Spinner label="Finding events" />
      ) : events && events.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      ) : (
        <EmptyState icon={SearchX} title="No events match">
          Try another city or category, or clear the search.
        </EmptyState>
      )}
      <div className="mt-8 text-center">
        <MockNotice>Sample events — the events API is not built yet</MockNotice>
      </div>
    </>
  )
}

function CategoryChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition',
        active ? 'bg-ink-900 text-white' : 'bg-white text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50',
      )}
    >
      {children}
    </button>
  )
}
