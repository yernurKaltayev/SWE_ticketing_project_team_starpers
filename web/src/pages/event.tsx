import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  CalendarPlus,
  CheckCircle2,
  Clock,
  CreditCard,
  Lock,
  MapPin,
  Minus,
  Plus,
  Settings2,
  Tag,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { EventPoster, EventThumb } from '@/components/events'
import { MockNotice } from '@/components/layout'
import { Alert, Badge, Button, Card, cx, errorText, Input, LinkButton, Spinner } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { categoryLabels, formatDateTime, formatEventDate, formatKzt, formatPrice, formatTime } from '@/lib/format'
import type { BfEvent, TicketType } from '@/lib/types'
import { placeOrder, quote, validatePromo, type PaymentOutcome, type Selection } from '@/services/checkout'
import { getEvent } from '@/services/events'

// ---- Selection <-> URL ---------------------------------------------------------------

function encodeSelection(selection: Selection): string {
  return Object.entries(selection)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => `${id}:${n}`)
    .join(',')
}

function decodeSelection(value: string | null): Selection {
  const selection: Selection = {}
  for (const part of value?.split(',') ?? []) {
    const [id, n] = part.split(':')
    const quantity = Number.parseInt(n, 10)
    if (id && quantity > 0) selection[id] = quantity
  }
  return selection
}

function downloadIcs(event: BfEvent) {
  const stamp = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const escape = (s: string) => s.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n')
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BiletFlow//EN',
    'BEGIN:VEVENT',
    `UID:${event.id}@biletflow`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(event.startsAt)}`,
    `DTEND:${stamp(event.endsAt)}`,
    `SUMMARY:${escape(event.title)}`,
    `LOCATION:${escape(`${event.venueName}, ${event.venueAddress}`)}`,
    `DESCRIPTION:${escape(event.summary)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${event.title.replace(/[^\w]+/g, '-').toLowerCase()}.ics`
  a.click()
  URL.revokeObjectURL(url)
}

// ---- Event page ----------------------------------------------------------------------

export function EventPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const [params] = useSearchParams()
  const { data: event, isLoading, error } = useQuery({
    queryKey: ['event', id, user?.id],
    queryFn: () => getEvent(id, user),
  })

  if (isLoading) return <Spinner />
  if (error || !event) {
    return (
      <Alert tone="bad" title="Event not found">
        It may have been removed, or it isn't public.{' '}
        <Link to="/" className="font-semibold underline">
          Back to events
        </Link>
      </Alert>
    )
  }

  const isOwner = user?.id === event.organizerId

  return (
    <>
      <Link to="/" className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-900">
        <ArrowLeft className="size-4" /> All events
      </Link>

      {event.status === 'cancelled' && (
        <Alert tone="bad" title="This event has been cancelled" className="mb-6">
          All orders were refunded (simulated). Check My tickets for details.
        </Alert>
      )}
      {event.status === 'draft' && (
        <Alert tone="info" title="Preview — this event is a draft" className="mb-6">
          Only you can see it. Publish it from the organizer dashboard to put it on sale.
        </Alert>
      )}
      {event.status === 'suspended' && (
        <Alert tone="warn" title="Suspended by a platform admin" className="mb-6">
          Sales are stopped while the event is under review.
        </Alert>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <div className="flex flex-col gap-6 sm:flex-row">
            <EventPoster event={event} size="lg" className="h-48 shrink-0 rounded-2xl sm:h-56 sm:w-56" />
            <div className="min-w-0">
              <p className="text-sm font-semibold tracking-wide text-ink-500 uppercase">
                {categoryLabels[event.category]} · {event.city}
              </p>
              <h1 className="mt-2 text-3xl leading-tight font-bold sm:text-4xl">{event.title}</h1>
              <p className="mt-3 text-lg text-ink-600">{event.summary}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" icon={CalendarPlus} onClick={() => downloadIcs(event)}>
                  Add to calendar
                </Button>
                {isOwner && (
                  <LinkButton to={`/organizer/events/${event.id}`} size="sm" variant="secondary" icon={Settings2}>
                    Manage event
                  </LinkButton>
                )}
              </div>
            </div>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <Card className="flex gap-4 p-5">
              <Clock className="size-5 shrink-0 text-sun-600" />
              <div>
                <p className="font-semibold">{formatEventDate(event.startsAt)}</p>
                <p className="text-sm text-ink-500">
                  {formatTime(event.startsAt)} – {formatTime(event.endsAt)} (Almaty time)
                </p>
              </div>
            </Card>
            <Card className="flex gap-4 p-5">
              <MapPin className="size-5 shrink-0 text-sun-600" />
              <div>
                <p className="font-semibold">{event.venueName}</p>
                <p className="text-sm text-ink-500">{event.venueAddress}</p>
              </div>
            </Card>
          </div>

          <section className="mt-10">
            <h2 className="text-xl font-semibold">About this event</h2>
            <div className="mt-4 space-y-4 leading-relaxed text-ink-700">
              {event.description.split(/\n{2,}/).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </section>

          <section className="mt-10 flex items-center gap-4 rounded-2xl bg-ink-50 p-5">
            <span className="grid size-12 place-items-center rounded-full bg-ink-900 font-display text-lg font-bold text-sun-400">
              {event.organizerName.charAt(0)}
            </span>
            <div>
              <p className="text-sm text-ink-500">Organized by</p>
              <p className="font-semibold">{event.organizerName}</p>
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <TicketSelector event={event} initialPromo={params.get('promo')} />
        </aside>
      </div>
    </>
  )
}

function TicketSelector({ event, initialPromo }: { event: BfEvent; initialPromo: string | null }) {
  const navigate = useNavigate()
  const [selection, setSelection] = useState<Selection>({})
  const [promoInput, setPromoInput] = useState(initialPromo ?? '')
  const [promoCode, setPromoCode] = useState<string | null>(null)

  const promoMutation = useMutation({
    mutationFn: (code: string) => validatePromo(event.id, code),
    onSuccess: (promo) => setPromoCode(promo.code),
    onError: () => setPromoCode(null),
  })

  // Campaign QR links land here with ?promo=CODE. The code is validated server-side before
  // it is applied; the link itself never carries a trusted discount.
  const { mutate: applyPromo } = promoMutation
  useEffect(() => {
    if (initialPromo) applyPromo(initialPromo)
  }, [initialPromo, applyPromo])

  const count = Object.values(selection).reduce((a, b) => a + b, 0)
  const { data: pricing } = useQuery({
    queryKey: ['quote', event.id, selection, promoCode],
    queryFn: () => quote(event.id, selection, promoCode),
    enabled: count > 0,
    placeholderData: (prev) => prev,
  })

  const onSale = event.status === 'published' && new Date(event.startsAt).getTime() > Date.now()
  const visibleTypes = event.ticketTypes.filter((t) => !t.hidden)

  const setQuantity = (type: TicketType, quantity: number) =>
    setSelection((s) => ({ ...s, [type.id]: Math.max(0, quantity) }))

  const checkout = () => {
    const query = new URLSearchParams({ items: encodeSelection(selection) })
    if (promoCode) query.set('promo', promoCode)
    navigate(`/checkout/${event.id}?${query}`)
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-ink-100 p-5">
        <h2 className="text-lg font-semibold">Tickets</h2>
      </div>
      <ul className="divide-y divide-ink-100">
        {visibleTypes.map((type) => {
          const left = type.quantity - type.sold
          const locked = type.price > 0 && !event.paidSalesActive
          const max = Math.min(left, type.perOrderLimit)
          const quantity = selection[type.id] ?? 0
          return (
            <li key={type.id} className="flex items-start gap-3 p-5">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{type.name}</p>
                <p className="text-sm font-semibold text-ink-700">{formatPrice(type.price)}</p>
                {type.description && <p className="mt-1 text-sm text-ink-500">{type.description}</p>}
                {left === 0 ? (
                  <Badge tone="bad" className="mt-2">Sold out</Badge>
                ) : locked ? (
                  <Badge tone="neutral" className="mt-2">
                    <Lock className="size-3" /> Sales not open yet
                  </Badge>
                ) : (
                  left < 30 && <Badge tone="warn" className="mt-2">Only {left} left</Badge>
                )}
              </div>
              {onSale && left > 0 && !locked && (
                <div className="flex items-center gap-1 rounded-full ring-1 ring-ink-200">
                  <button
                    type="button"
                    className="grid size-8 place-items-center rounded-full hover:bg-ink-100 disabled:opacity-30"
                    onClick={() => setQuantity(type, quantity - 1)}
                    disabled={quantity === 0}
                    aria-label={`Remove one ${type.name}`}
                  >
                    <Minus className="size-4" />
                  </button>
                  <span className="w-6 text-center text-sm font-semibold tabular-nums" aria-live="polite">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    className="grid size-8 place-items-center rounded-full hover:bg-ink-100 disabled:opacity-30"
                    onClick={() => setQuantity(type, quantity + 1)}
                    disabled={quantity >= max}
                    aria-label={`Add one ${type.name}`}
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {onSale ? (
        <div className="space-y-4 border-t border-ink-100 bg-ink-50/60 p-5">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (promoInput.trim()) promoMutation.mutate(promoInput)
            }}
          >
            <Input
              value={promoInput}
              onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
              placeholder="Promo code"
              aria-label="Promo code"
              className="uppercase"
            />
            <Button type="submit" variant="secondary" loading={promoMutation.isPending}>
              Apply
            </Button>
          </form>
          {promoMutation.isError && (
            <p className="flex items-center gap-1.5 text-sm text-red-700">
              <XCircle className="size-4" /> {errorText(promoMutation.error)}
            </p>
          )}
          {promoCode && promoMutation.data && (
            <p className="flex items-center gap-1.5 text-sm text-emerald-700">
              <Tag className="size-4" /> {promoCode} applied —{' '}
              {promoMutation.data.kind === 'percent' ? `${promoMutation.data.value}% off` : `${formatKzt(promoMutation.data.value)} off`}
            </p>
          )}

          {count > 0 && pricing && (
            <dl className="space-y-1 text-sm">
              {pricing.discount > 0 && (
                <>
                  <div className="flex justify-between text-ink-600">
                    <dt>Subtotal</dt>
                    <dd className="tabular-nums">{formatKzt(pricing.subtotal)}</dd>
                  </div>
                  <div className="flex justify-between text-emerald-700">
                    <dt>Discount</dt>
                    <dd className="tabular-nums">−{formatKzt(pricing.discount)}</dd>
                  </div>
                </>
              )}
              <div className="flex justify-between text-base font-bold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatPrice(pricing.total)}</dd>
              </div>
            </dl>
          )}
          <Button size="lg" variant="accent" className="w-full" disabled={count === 0} onClick={checkout}>
            {count === 0 ? 'Select tickets' : `Continue with ${count} ticket${count > 1 ? 's' : ''}`}
          </Button>
        </div>
      ) : (
        <p className="border-t border-ink-100 p-5 text-sm text-ink-500">Tickets are not on sale for this event.</p>
      )}
    </Card>
  )
}

// ---- Checkout ------------------------------------------------------------------------

export function CheckoutPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const selection = useMemo(() => decodeSelection(params.get('items')), [params])
  const promoCode = params.get('promo')
  const [outcome, setOutcome] = useState<PaymentOutcome>('approve')

  const { data: event } = useQuery({ queryKey: ['event', id, user?.id], queryFn: () => getEvent(id, user) })
  const { data: pricing, error: quoteError } = useQuery({
    queryKey: ['quote', id, selection, promoCode],
    queryFn: () => quote(id, selection, promoCode),
  })

  const order = useMutation({
    mutationFn: () => placeOrder(user!, id, selection, promoCode, outcome),
    onSuccess: (result) => {
      queryClient.invalidateQueries()
      if (result.order.status === 'paid') navigate(`/tickets?order=${result.order.id}`, { replace: true })
    },
  })

  if (!event || !pricing) {
    return quoteError ? <Alert tone="bad">{errorText(quoteError)}</Alert> : <Spinner />
  }

  const isFree = pricing.total === 0
  const declined = order.data?.order.status === 'failed'
  const lines = event.ticketTypes.filter((t) => selection[t.id])

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        to={`/events/${event.id}`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-900"
      >
        <ArrowLeft className="size-4" /> Back to event
      </Link>
      <h1 className="text-3xl font-bold">{isFree ? 'Confirm registration' : 'Checkout'}</h1>

      <div className="mt-8 grid gap-6 md:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-lg font-semibold">Ticket holder</h2>
            <p className="mt-1 text-sm text-ink-500">Tickets are issued to your account and emailed to you.</p>
            <div className="mt-4 rounded-xl bg-ink-50 p-4 text-sm">
              <p className="font-semibold">{user?.full_name}</p>
              <p className="text-ink-600">{user?.email}</p>
            </div>
          </Card>

          {!isFree && (
            <Card className="p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <CreditCard className="size-5" /> Payment
              </h2>
              <Alert tone="warn" className="mt-4" title="Simulated payment">
                This is a sandbox. No card is charged and no money moves. Pick the result you want to test.
              </Alert>
              <fieldset className="mt-4 space-y-2">
                <legend className="sr-only">Simulated payment result</legend>
                {(
                  [
                    ['approve', 'Test card •••• 4242', 'Payment is approved and tickets are issued'],
                    ['decline', 'Test card •••• 0002', 'Payment is declined — no tickets are issued'],
                  ] as const
                ).map(([value, label, hint]) => (
                  <label
                    key={value}
                    className={cx(
                      'flex cursor-pointer items-start gap-3 rounded-xl p-4 ring-1 ring-inset',
                      outcome === value ? 'bg-sun-50 ring-2 ring-sun-400' : 'ring-ink-200 hover:bg-ink-50',
                    )}
                  >
                    <input
                      type="radio"
                      name="outcome"
                      value={value}
                      checked={outcome === value}
                      onChange={() => setOutcome(value)}
                      className="mt-1 accent-ink-900"
                    />
                    <span>
                      <span className="block font-semibold">{label}</span>
                      <span className="block text-sm text-ink-500">{hint}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            </Card>
          )}
        </div>

        <div>
          <Card className="overflow-hidden md:sticky md:top-24">
            <div className="flex gap-4 border-b border-ink-100 p-5">
              <EventThumb event={event} />
              <div className="min-w-0">
                <p className="leading-snug font-semibold">{event.title}</p>
                <p className="mt-1 text-sm text-ink-500">{formatDateTime(event.startsAt)}</p>
              </div>
            </div>
            <dl className="space-y-2 p-5 text-sm">
              {lines.map((t) => (
                <div key={t.id} className="flex justify-between gap-2">
                  <dt className="text-ink-600">
                    {selection[t.id]} × {t.name}
                  </dt>
                  <dd className="tabular-nums">{formatPrice(t.price * selection[t.id])}</dd>
                </div>
              ))}
              {pricing.discount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <dt>Promo {pricing.promo?.code}</dt>
                  <dd className="tabular-nums">−{formatKzt(pricing.discount)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-ink-100 pt-3 text-base font-bold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatPrice(pricing.total)}</dd>
              </div>
            </dl>
            <div className="space-y-3 border-t border-ink-100 p-5">
              {declined && (
                <Alert tone="bad" title="Payment declined">
                  No tickets were issued and nothing was charged. Try again.
                </Alert>
              )}
              {order.isError && <Alert tone="bad">{errorText(order.error)}</Alert>}
              <Button size="lg" variant="accent" className="w-full" loading={order.isPending} onClick={() => order.mutate()}>
                {order.isPending ? 'Processing…' : isFree ? 'Get free tickets' : `Pay ${formatKzt(pricing.total)}`}
              </Button>
              <p className="flex items-center justify-center gap-1.5 text-xs text-ink-500">
                <CheckCircle2 className="size-3.5" /> Tickets are issued only after payment is confirmed
              </p>
            </div>
          </Card>
          <div className="mt-4 text-center">
            <MockNotice>Checkout runs on the preview data layer</MockNotice>
          </div>
        </div>
      </div>
    </div>
  )
}
