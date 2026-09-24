import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, CalendarPlus, ChevronRight, Sparkles, UserRoundPen } from 'lucide-react'
import { Link } from 'react-router-dom'
import { CapacityBars, SalesChart } from '@/components/charts'
import { EventStatusBadge, EventThumb } from '@/components/events'
import { MockNotice } from '@/components/layout'
import { Button, Card, EmptyState, LinkButton, PageHeader, Spinner, StatTile } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { formatDateTime, formatKzt } from '@/lib/format'
import { organizerAnalytics, type Analytics } from '@/services/analytics'
import { createSampleEvents, listOrganizerEvents } from '@/services/events'
import { useOrganizerName, useOrganizerProfile } from './shared'

export function OrganizerDashboard() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const organizerName = useOrganizerName()
  const { data: profile, isLoading: profileLoading } = useOrganizerProfile()
  const { data: events, isLoading } = useQuery({
    queryKey: ['organizer-events', user!.id],
    queryFn: () => listOrganizerEvents(user!),
  })
  const { data: analytics } = useQuery({
    queryKey: ['analytics', user!.id],
    queryFn: () => organizerAnalytics(user!),
    enabled: !!events?.length,
  })
  const samples = useMutation({
    mutationFn: () => createSampleEvents(user!, organizerName),
    onSuccess: () => queryClient.invalidateQueries(),
  })

  if (isLoading || profileLoading) return <Spinner />

  const upcoming = (events ?? [])
    .filter((e) => new Date(e.endsAt).getTime() > Date.now() && e.status !== 'cancelled')
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, 5)

  return (
    <>
      <PageHeader
        eyebrow={organizerName}
        title="Dashboard"
        actions={
          <LinkButton to="/organizer/events/new" icon={CalendarPlus} variant="accent">
            New event
          </LinkButton>
        }
      />

      {profile === null && (
        <Card className="mb-8 flex flex-col gap-4 border-l-4 border-sun-400 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <UserRoundPen className="mt-0.5 size-5 shrink-0 text-sun-600" />
            <div>
              <p className="font-semibold">Set up your organizer profile</p>
              <p className="text-sm text-ink-500">Attendees see your organizer name and contact details on event pages.</p>
            </div>
          </div>
          <LinkButton to="/organizer/profile" variant="secondary" icon={ArrowRight}>
            Set up profile
          </LinkButton>
        </Card>
      )}

      {!events?.length ? (
        <EmptyState
          icon={CalendarPlus}
          title="Create your first event"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <LinkButton to="/organizer/events/new" variant="primary">
                Create event
              </LinkButton>
              <Button variant="secondary" icon={Sparkles} loading={samples.isPending} onClick={() => samples.mutate()}>
                Add sample events with sales
              </Button>
            </div>
          }
        >
          Free events are free to publish. Your sales, revenue and campaign results show up here. Sample events fill the dashboard with made-up demo sales.
        </EmptyState>
      ) : (
        <>
          {analytics ? <AnalyticsPanel analytics={analytics} /> : <Spinner />}

          <section className="mt-10">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Coming up</h2>
              <Link to="/organizer/events" className="text-sm font-semibold text-sky-600 hover:underline">
                All events
              </Link>
            </div>
            <Card className="divide-y divide-ink-100">
              {upcoming.length === 0 && <p className="p-5 text-sm text-ink-500">No upcoming events.</p>}
              {upcoming.map((event) => {
                const sold = event.ticketTypes.reduce((s, t) => s + t.sold, 0)
                const capacity = event.ticketTypes.reduce((s, t) => s + t.quantity, 0)
                return (
                  <Link key={event.id} to={`/organizer/events/${event.id}`} className="flex items-center gap-4 p-4 hover:bg-ink-50">
                    <EventThumb event={event} className="size-11" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{event.title}</p>
                      <p className="text-sm text-ink-500">{formatDateTime(event.startsAt)}</p>
                    </div>
                    <span className="hidden text-sm text-ink-500 tabular-nums sm:block">
                      {sold} / {capacity} sold
                    </span>
                    <EventStatusBadge status={event.status} />
                    <ChevronRight className="size-4 text-ink-400" />
                  </Link>
                )
              })}
            </Card>
          </section>
        </>
      )}
      <div className="mt-8">
        <MockNotice>Events and analytics use preview data until those APIs ship</MockNotice>
      </div>
    </>
  )
}

export function AnalyticsPanel({ analytics }: { analytics: Analytics }) {
  const remaining = analytics.capacity - analytics.sold
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Tickets sold"
          value={analytics.sold.toLocaleString()}
          sub={`${remaining.toLocaleString()} of ${analytics.capacity.toLocaleString()} remaining`}
        />
        <StatTile label="Net revenue" value={formatKzt(analytics.net)} sub={`Gross ${formatKzt(analytics.gross)}`} />
        <StatTile
          label="Discounts & refunds"
          value={formatKzt(analytics.discounts + analytics.refunded)}
          sub={`${formatKzt(analytics.discounts)} promo · ${formatKzt(analytics.refunded)} refunded`}
        />
        <StatTile
          label="Checked in"
          value={analytics.sold ? `${Math.round((analytics.checkedIn / analytics.sold) * 100)}%` : '—'}
          sub={`${analytics.checkedIn} attendees scanned`}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="p-6 lg:col-span-3">
          <h2 className="font-display font-semibold">Tickets sold per day</h2>
          <p className="mb-6 text-sm text-ink-500">Last 21 days · {analytics.orders} paid orders</p>
          <SalesChart data={analytics.byDay} />
        </Card>
        <Card className="p-6 lg:col-span-2">
          <h2 className="mb-6 font-display font-semibold">Sales by ticket type</h2>
          <CapacityBars rows={analytics.byTicketType} />
        </Card>
      </div>

      {analytics.campaigns.length > 0 && (
        <Card className="mt-6 overflow-x-auto">
          <h2 className="p-6 pb-3 font-display font-semibold">Campaigns</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-ink-500">
              <tr className="border-b border-ink-100">
                <th className="px-6 py-2 font-medium">Code</th>
                <th className="px-6 py-2 font-medium">Campaign</th>
                <th className="px-6 py-2 text-right font-medium">Orders</th>
                <th className="px-6 py-2 text-right font-medium">Discount given</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {analytics.campaigns.map((c) => (
                <tr key={c.id}>
                  <td className="px-6 py-3 font-mono font-semibold">{c.code}</td>
                  <td className="px-6 py-3">
                    {c.campaignName || '—'}
                    <span className="block text-xs text-ink-500">{c.eventTitle}</span>
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums">{c.redemptions}</td>
                  <td className="px-6 py-3 text-right tabular-nums">{formatKzt(c.discount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  )
}
