import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ChevronRight, MapPin, PartyPopper, Printer, Ticket as TicketIcon } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { EventThumb, TicketStatusBadge } from '@/components/events'
import { MockNotice } from '@/components/layout'
import { Alert, Badge, Button, Card, cx, EmptyState, errorText, LinkButton, PageHeader, Spinner } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { formatDateTime, formatEventDate, formatKzt, formatPrice, formatTime } from '@/lib/format'
import { getMyTicket, listMyOrders, refundOrder, type OrderWithTickets } from '@/services/tickets'

export function MyTicketsPage() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  const newOrderId = params.get('order')
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')

  const { data: orders, isLoading } = useQuery({
    queryKey: ['my-orders', user!.id],
    queryFn: () => listMyOrders(user!),
  })

  if (isLoading || !orders) return <Spinner />

  const now = Date.now()
  const upcoming = orders.filter((o) => new Date(o.event.endsAt).getTime() > now)
  const past = orders.filter((o) => new Date(o.event.endsAt).getTime() <= now).reverse()
  const shown = tab === 'upcoming' ? upcoming : past
  const newOrder = orders.find((o) => o.order.id === newOrderId)

  return (
    <>
      <PageHeader title="My tickets" description="Show the QR code at the entrance, on your phone or printed." />

      {newOrder && (
        <Alert tone="good" title="You're going!" className="mb-6">
          {newOrder.tickets.length} ticket{newOrder.tickets.length > 1 ? 's' : ''} for {newOrder.event.title}{' '}
          {newOrder.tickets.length > 1 ? 'are' : 'is'} ready below. A confirmation email is on its way.
        </Alert>
      )}

      <div className="mb-6 inline-flex rounded-full bg-ink-100 p-1" role="tablist">
        {(
          [
            ['upcoming', `Upcoming (${upcoming.length})`],
            ['past', `Past (${past.length})`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cx(
              'rounded-full px-4 py-1.5 text-sm font-semibold',
              tab === value ? 'bg-white shadow-sm' : 'text-ink-600 hover:text-ink-900',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={TicketIcon}
          title={tab === 'upcoming' ? 'No upcoming tickets' : 'No past events yet'}
          action={tab === 'upcoming' && <LinkButton to="/">Explore events</LinkButton>}
        >
          {tab === 'upcoming' && 'When you register or buy tickets, they show up here.'}
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {shown.map((entry) => (
            <OrderCard key={entry.order.id} entry={entry} highlight={entry.order.id === newOrderId} />
          ))}
        </div>
      )}
      <div className="mt-8">
        <MockNotice />
      </div>
    </>
  )
}

function OrderCard({ entry, highlight }: { entry: OrderWithTickets; highlight: boolean }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { order, event, tickets } = entry
  const [confirming, setConfirming] = useState(false)
  const refund = useMutation({
    mutationFn: () => refundOrder(user!, order.id),
    onSuccess: () => queryClient.invalidateQueries(),
  })

  const refundable =
    order.status === 'paid' && new Date(event.startsAt).getTime() - Date.now() > 86_400_000

  return (
    <Card className={cx('overflow-hidden', highlight && 'ring-2 ring-sun-400')}>
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <EventThumb event={event} />
        <div className="min-w-0 flex-1">
          <Link to={`/events/${event.id}`} className="font-display font-semibold hover:text-sky-600">
            {event.title}
          </Link>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-ink-500">
            <span>{formatDateTime(event.startsAt)}</span>
            <span className="flex items-center gap-1">
              <MapPin className="size-3.5" /> {event.venueName}, {event.city}
            </span>
          </p>
        </div>
        <div className="text-sm sm:text-right">
          <p className="font-semibold">{formatPrice(order.total)}</p>
          <p className="text-ink-500">Order #{order.id.slice(-6).toUpperCase()}</p>
        </div>
      </div>
      {event.status === 'cancelled' && (
        <div className="px-5 pb-4">
          <Badge tone="bad">Event cancelled — refunded (simulated)</Badge>
        </div>
      )}
      <ul className="divide-y divide-ink-100 border-t border-ink-100">
        {tickets.map((ticket, i) => (
          <li key={ticket.id}>
            <Link to={`/tickets/${ticket.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-ink-50">
              <TicketIcon className="size-4 text-ink-400" />
              <span className="flex-1 text-sm">
                <span className="font-semibold">{ticket.ticketTypeName}</span>
                <span className="text-ink-500"> · Ticket {i + 1} of {tickets.length}</span>
              </span>
              <TicketStatusBadge status={ticket.status} />
              <ChevronRight className="size-4 text-ink-400" />
            </Link>
          </li>
        ))}
      </ul>
      {(refundable || refund.isError) && (
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-ink-100 bg-ink-50/60 px-5 py-3">
          {refund.isError && <span className="text-sm text-red-700">{errorText(refund.error)}</span>}
          {confirming ? (
            <>
              <span className="text-sm text-ink-600">
                Refund {formatKzt(order.total)} and cancel all {tickets.length} ticket(s)?
              </span>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                Keep tickets
              </Button>
              <Button size="sm" variant="danger" loading={refund.isPending} onClick={() => refund.mutate()}>
                Yes, refund
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
              {order.total > 0 ? 'Request refund' : 'Cancel registration'}
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}

export function TicketPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const { data, isLoading, error } = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => getMyTicket(user!, id),
  })

  if (isLoading) return <Spinner />
  if (error || !data) return <Alert tone="bad">{errorText(error)}</Alert>

  const { ticket, event } = data
  const usable = ticket.status === 'valid'

  return (
    <div className="mx-auto max-w-md">
      <div className="no-print mb-6 flex items-center justify-between">
        <Link to="/tickets" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-900">
          <ArrowLeft className="size-4" /> My tickets
        </Link>
        <Button variant="secondary" size="sm" icon={Printer} onClick={() => window.print()}>
          Print / PDF
        </Button>
      </div>

      <article className="overflow-hidden rounded-3xl bg-white shadow-xl ring-1 shadow-ink-900/10 ring-ink-100 print:shadow-none">
        <div
          className="p-6 text-white print:text-black"
          style={{
            background: `linear-gradient(135deg, hsl(${event.posterHue} 70% 22%), hsl(${(event.posterHue + 30) % 360} 65% 38%))`,
          }}
        >
          <p className="text-xs font-semibold tracking-widest uppercase opacity-80">BiletFlow · Admission ticket</p>
          <h1 className="mt-3 text-2xl leading-tight font-bold">{event.title}</h1>
          <p className="mt-2 text-sm opacity-90">{ticket.ticketTypeName}</p>
        </div>

        <dl className="grid grid-cols-2 gap-4 p-6 text-sm">
          <div>
            <dt className="text-ink-500">Date</dt>
            <dd className="font-semibold">{formatEventDate(event.startsAt)}</dd>
          </div>
          <div>
            <dt className="text-ink-500">Time</dt>
            <dd className="font-semibold">{formatTime(event.startsAt)} (UTC+5)</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-ink-500">Venue</dt>
            <dd className="font-semibold">
              {event.venueName}, {event.venueAddress}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-ink-500">Attendee</dt>
            <dd className="font-semibold">{ticket.holderName}</dd>
          </div>
        </dl>

        <div className="ticket-notch border-t-2 border-dashed border-ink-200" />

        <div className="flex flex-col items-center p-6">
          {usable ? (
            <div className="rounded-2xl bg-white p-3 ring-1 ring-ink-100">
              {/* Only the opaque admission code is encoded — never price or payment data. */}
              <QRCodeSVG value={ticket.code} size={220} level="M" marginSize={2} />
            </div>
          ) : (
            <div className="grid size-56 place-items-center rounded-2xl bg-ink-50 text-center">
              <div>
                <TicketStatusBadge status={ticket.status} />
                <p className="mt-2 px-6 text-sm text-ink-500">This ticket can no longer be used for entry.</p>
              </div>
            </div>
          )}
          <p className="mt-4 font-mono text-xs tracking-wider text-ink-500">{ticket.code}</p>
          <p className="mt-1 text-xs text-ink-400">Ticket ID {ticket.id}</p>
        </div>
      </article>

      <p className="no-print mt-6 flex items-center justify-center gap-2 text-center text-sm text-ink-500">
        <PartyPopper className="size-4" />
        Digital and printed copies are the same ticket — it can be scanned only once.
      </p>
    </div>
  )
}
