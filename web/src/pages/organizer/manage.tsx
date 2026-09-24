import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Copy,
  Download,
  ExternalLink,
  Eye,
  History,
  Pencil,
  QrCode,
  Rocket,
  Search,
  Tag,
  Undo2,
  XCircle,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useId, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { EventStatusBadge, TicketStatusBadge } from '@/components/events'
import { MockNotice } from '@/components/layout'
import {
  Alert,
  Badge,
  Button,
  Card,
  cx,
  EmptyState,
  errorText,
  Field,
  Input,
  LinkButton,
  PageHeader,
  Select,
  Spinner,
} from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { formatDateTime, formatKzt, formatPrice } from '@/lib/format'
import type { BfEvent, PromoCode } from '@/lib/types'
import { organizerAnalytics } from '@/services/analytics'
import {
  activatePaidSales,
  changeEventStatus,
  duplicateEvent,
  getEvent,
  getEventAudit,
  type StatusAction,
} from '@/services/events'
import { createPromo, listEventTickets, listPromos, setPromoActive, type PromoInput } from '@/services/tickets'
import { AnalyticsPanel } from './dashboard'
import { useOrganizerProfile } from './shared'

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'attendees', label: 'Attendees' },
  { value: 'promotions', label: 'Promotions' },
  { value: 'paid', label: 'Paid sales' },
  { value: 'activity', label: 'Activity' },
] as const
type Tab = (typeof TABS)[number]['value']

export function ManageEventPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find((t) => t.value === params.get('tab'))?.value ?? 'overview') as Tab
  const [confirmCancel, setConfirmCancel] = useState(false)

  const { data: event, isLoading, error } = useQuery({
    queryKey: ['event', id, user?.id],
    queryFn: () => getEvent(id, user),
  })

  const status = useMutation({
    mutationFn: (action: StatusAction) => changeEventStatus(user!, id, action),
    onSuccess: () => {
      setConfirmCancel(false)
      queryClient.invalidateQueries()
    },
  })
  const duplicate = useMutation({
    mutationFn: () => duplicateEvent(user!, id),
    onSuccess: (copy) => {
      queryClient.invalidateQueries()
      navigate(`/organizer/events/${copy.id}/edit`)
    },
  })

  if (isLoading) return <Spinner />
  if (error || !event) return <Alert tone="bad">{errorText(error)}</Alert>
  if (event.organizerId !== user?.id) return <Alert tone="bad">You don't manage this event.</Alert>

  const locked = event.status === 'cancelled' || event.status === 'suspended'

  return (
    <>
      <Link to="/organizer/events" className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-900">
        <ArrowLeft className="size-4" /> My events
      </Link>
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-2">
            <EventStatusBadge status={event.status} />
            {formatDateTime(event.startsAt)} · {event.venueName}
          </span>
        }
        title={event.title}
        actions={
          <>
            <LinkButton to={`/events/${event.id}`} variant="secondary" icon={Eye}>
              View page
            </LinkButton>
            {!locked && (
              <LinkButton to={`/organizer/events/${event.id}/edit`} variant="secondary" icon={Pencil}>
                Edit
              </LinkButton>
            )}
            <Button variant="secondary" icon={Copy} loading={duplicate.isPending} onClick={() => duplicate.mutate()}>
              Duplicate
            </Button>
            {event.status === 'draft' && (
              <Button variant="accent" icon={Rocket} loading={status.isPending} onClick={() => status.mutate('publish')}>
                Publish
              </Button>
            )}
            {event.status === 'published' && (
              <Button variant="secondary" icon={Undo2} loading={status.isPending} onClick={() => status.mutate('unpublish')}>
                Unpublish
              </Button>
            )}
          </>
        }
      />

      {status.isError && <Alert tone="bad" className="mb-6">{errorText(status.error)}</Alert>}
      {event.status === 'suspended' && (
        <Alert tone="warn" title="Suspended by a platform admin" className="mb-6">
          Sales are stopped. Contact support if you believe this is a mistake.
        </Alert>
      )}

      <div className="-mx-4 mb-8 flex gap-1 overflow-x-auto border-b border-ink-100 px-4" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => setParams({ tab: t.value }, { replace: true })}
            className={cx(
              '-mb-px shrink-0 border-b-2 px-4 py-3 text-sm font-semibold',
              tab === t.value ? 'border-sun-400 text-ink-900' : 'border-transparent text-ink-500 hover:text-ink-900',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab event={event} />}
      {tab === 'attendees' && <AttendeesTab event={event} />}
      {tab === 'promotions' && <PromotionsTab event={event} />}
      {tab === 'paid' && <PaidSalesTab event={event} />}
      {tab === 'activity' && <ActivityTab event={event} />}

      {!locked && (
        <Card className="mt-12 flex flex-col gap-4 border border-red-100 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-red-800">Cancel this event</p>
            <p className="text-sm text-ink-500">
              All paid orders are refunded (simulated) and every ticket stops working. This can't be undone.
            </p>
          </div>
          {confirmCancel ? (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setConfirmCancel(false)}>
                Keep event
              </Button>
              <Button variant="danger" icon={XCircle} loading={status.isPending} onClick={() => status.mutate('cancel')}>
                Yes, cancel event
              </Button>
            </div>
          ) : (
            <Button variant="danger" onClick={() => setConfirmCancel(true)}>
              Cancel event
            </Button>
          )}
        </Card>
      )}
      <div className="mt-8">
        <MockNotice />
      </div>
    </>
  )
}

function OverviewTab({ event }: { event: BfEvent }) {
  const { user } = useAuth()
  const { data } = useQuery({
    queryKey: ['analytics', user!.id, event.id],
    queryFn: () => organizerAnalytics(user!, event.id),
  })
  if (!data) return <Spinner />
  return <AnalyticsPanel analytics={data} />
}

function AttendeesTab({ event }: { event: BfEvent }) {
  const [search, setSearch] = useState('')
  const { data: tickets } = useQuery({
    queryKey: ['event-tickets', event.id],
    queryFn: () => listEventTickets(event.id),
  })
  if (!tickets) return <Spinner />

  const q = search.trim().toLowerCase()
  const shown = tickets.filter(
    (t) => !q || [t.holderName, t.holderEmail, t.id].some((f) => f.toLowerCase().includes(q)),
  )

  const exportCsv = () => {
    const quote = (s: string) => `"${s.replace(/"/g, '""')}"`
    const rows = [
      ['Ticket ID', 'Name', 'Email', 'Ticket type', 'Status', 'Issued at'],
      ...tickets.map((t) => [t.id, t.holderName, t.holderEmail, t.ticketTypeName, t.status, t.issuedAt]),
    ]
    const csv = rows.map((r) => r.map(quote).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `attendees-${event.id}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (tickets.length === 0) {
    return <EmptyState icon={Search} title="No attendees yet">Tickets appear here as soon as they're issued.</EmptyState>
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-ink-100 p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" />
          <Input
            type="search"
            placeholder="Search name, email or ticket ID"
            aria-label="Search attendees"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button variant="secondary" icon={Download} onClick={exportCsv}>
          Export CSV
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-ink-50 text-left text-ink-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Attendee</th>
              <th className="px-4 py-2.5 font-medium">Ticket</th>
              <th className="px-4 py-2.5 font-medium">Issued</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {shown.slice(0, 200).map((t) => (
              <tr key={t.id}>
                <td className="px-4 py-3">
                  <p className="font-semibold">{t.holderName}</p>
                  <p className="text-ink-500">{t.holderEmail}</p>
                </td>
                <td className="px-4 py-3">
                  <p>{t.ticketTypeName}</p>
                  <p className="font-mono text-xs text-ink-400">{t.id}</p>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-ink-600">{formatDateTime(t.issuedAt)}</td>
                <td className="px-4 py-3">
                  <TicketStatusBadge status={t.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-ink-100 px-4 py-3 text-xs text-ink-500">
        {shown.length} of {tickets.length} tickets
      </p>
    </Card>
  )
}

function PromotionsTab({ event }: { event: BfEvent }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { data: promos } = useQuery({ queryKey: ['promos', event.id], queryFn: () => listPromos(event.id) })
  const [form, setForm] = useState<PromoInput>({ code: '', kind: 'percent', value: 10, maxRedemptions: 100, campaignName: '' })
  const [qrFor, setQrFor] = useState<PromoCode | null>(null)

  const create = useMutation({
    mutationFn: () => createPromo(user!, event.id, form),
    onSuccess: () => {
      setForm((f) => ({ ...f, code: '', campaignName: '' }))
      queryClient.invalidateQueries({ queryKey: ['promos', event.id] })
    },
  })
  const toggle = useMutation({
    mutationFn: (p: PromoCode) => setPromoActive(user!, p.id, !p.active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['promos', event.id] }),
  })

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        {!promos ? (
          <Spinner />
        ) : promos.length === 0 ? (
          <EmptyState icon={Tag} title="No promo codes yet">
            Create a code for a campaign, then share it as text or as a campaign QR code on posters.
          </EmptyState>
        ) : (
          promos.map((p) => (
            <Card key={p.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-lg font-bold">{p.code}</span>
                  {p.active ? <Badge tone="good">Active</Badge> : <Badge>Disabled</Badge>}
                </div>
                <p className="text-sm text-ink-500">
                  {p.kind === 'percent' ? `${p.value}% off` : `${formatKzt(p.value)} off`}
                  {p.campaignName && ` · ${p.campaignName}`} · {p.redemptions} / {p.maxRedemptions} used
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" icon={QrCode} onClick={() => setQrFor(p)}>
                  Campaign QR
                </Button>
                <Button size="sm" variant="ghost" loading={toggle.isPending && toggle.variables?.id === p.id} onClick={() => toggle.mutate(p)}>
                  {p.active ? 'Disable' : 'Enable'}
                </Button>
              </div>
            </Card>
          ))
        )}
        {qrFor && <CampaignQr event={event} promo={qrFor} onClose={() => setQrFor(null)} />}
      </div>

      <Card className="h-fit p-6">
        <h2 className="font-display font-semibold">New promo code</h2>
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate()
          }}
        >
          {create.isError && <Alert tone="bad">{errorText(create.error)}</Alert>}
          <Field label="Code">
            {(id) => (
              <Input
                id={id}
                required
                placeholder="STUDENT20"
                className="font-mono uppercase"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              {(id) => (
                <Select id={id} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as PromoCode['kind'] })}>
                  <option value="percent">% off</option>
                  <option value="fixed">₸ off</option>
                </Select>
              )}
            </Field>
            <Field label="Amount">
              {(id) => (
                <Input id={id} type="number" min={1} required value={form.value} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} />
              )}
            </Field>
          </div>
          <Field label="Redemption limit">
            {(id) => (
              <Input
                id={id}
                type="number"
                min={1}
                required
                value={form.maxRedemptions}
                onChange={(e) => setForm({ ...form, maxRedemptions: Number(e.target.value) })}
              />
            )}
          </Field>
          <Field label="Campaign name" hint="For your reports, e.g. “Campus posters”">
            {(id) => <Input id={id} value={form.campaignName} onChange={(e) => setForm({ ...form, campaignName: e.target.value })} />}
          </Field>
          <Button type="submit" className="w-full" loading={create.isPending}>
            Create code
          </Button>
        </form>
      </Card>
    </div>
  )
}

/**
 * Campaign QR codes link to the event page with the promo pre-filled. They are styled
 * differently from admission tickets and say so, and the check-in scanner rejects them.
 */
function CampaignQr({ event, promo, onClose }: { event: BfEvent; promo: PromoCode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const url = `${window.location.origin}/events/${event.id}?promo=${encodeURIComponent(promo.code)}`

  const download = () => {
    const svg = ref.current?.querySelector('svg')
    if (!svg) return
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' })
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = `campaign-${promo.code}.svg`
    a.click()
    URL.revokeObjectURL(href)
  }

  return (
    <Card className="p-6" >
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start" role="region" aria-labelledby={titleId}>
        <div ref={ref} className="rounded-2xl border-4 border-dashed border-sun-400 bg-sun-50 p-4 text-center">
          <QRCodeSVG value={url} size={168} fgColor="#93560b" bgColor="#fef9e8" level="M" marginSize={1} />
          <p className="mt-2 text-xs font-bold tracking-widest text-sun-700 uppercase">Promo · not a ticket</p>
        </div>
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="font-display font-semibold">
            Campaign QR for {promo.code}
          </h3>
          <p className="mt-1 text-sm text-ink-500">
            Scanning opens the event page with the code pre-filled. The discount is still checked at checkout, and
            this QR is never accepted for entry.
          </p>
          <p className="mt-3 truncate rounded-lg bg-ink-50 px-3 py-2 font-mono text-xs text-ink-600">{url}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" icon={Download} onClick={download}>
              Download SVG
            </Button>
            <Button size="sm" variant="secondary" icon={Copy} onClick={() => navigator.clipboard.writeText(url)}>
              Copy link
            </Button>
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 px-3 text-sm font-semibold text-sky-600">
              <ExternalLink className="size-4" /> Test
            </a>
            <Button size="sm" variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}

function PaidSalesTab({ event }: { event: BfEvent }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { data: profile } = useOrganizerProfile()
  const [iban, setIban] = useState('')
  const [terms, setTerms] = useState(false)
  const activate = useMutation({
    mutationFn: () => activatePaidSales(user!, event.id, iban),
    onSuccess: () => queryClient.invalidateQueries(),
  })

  const hasPaidType = event.ticketTypes.some((t) => t.price > 0)
  const steps = [
    { done: hasPaidType, label: 'At least one paid ticket type', hint: 'Add one in Edit event' },
    { done: !!profile, label: 'Organizer profile created', hint: <Link to="/organizer/profile" className="text-sky-600 underline">Create profile</Link> },
    { done: iban.length > 0 || event.paidSalesActive, label: 'Payout account connected (simulated)' },
    { done: terms || event.paidSalesActive, label: 'Paid-event terms accepted' },
  ]

  if (event.paidSalesActive) {
    return (
      <Alert tone="good" title="Paid sales are active">
        Paid ticket types on this event can be purchased. Payments run in sandbox mode — no real money moves.
      </Alert>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-6">
        <h2 className="font-display font-semibold">Paid Sales Activation</h2>
        <p className="mt-1 text-sm text-ink-500">
          Free tickets work without this. To sell paid tickets, complete the checklist and pay the one-time activation fee.
        </p>
        <ul className="mt-6 space-y-3">
          {steps.map((step) => (
            <li key={step.label} className="flex gap-3 text-sm">
              {step.done ? <CheckCircle2 className="size-5 shrink-0 text-emerald-600" /> : <Circle className="size-5 shrink-0 text-ink-300" />}
              <span>
                <span className={cx('font-medium', step.done && 'text-ink-500')}>{step.label}</span>
                {!step.done && step.hint && <span className="block text-ink-500">{step.hint}</span>}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-6">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            activate.mutate()
          }}
        >
          <Alert tone="warn" title="Sandbox">
            Verification, payout account and the activation fee are simulated for this academic demo.
          </Alert>
          {activate.isError && <Alert tone="bad">{errorText(activate.error)}</Alert>}
          <Field label="Payout IBAN" hint="Any KZ + 18 characters, e.g. KZ86125KZT5004100100">
            {(id) => (
              <Input id={id} required className="font-mono uppercase" value={iban} onChange={(e) => setIban(e.target.value.toUpperCase())} />
            )}
          </Field>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" required checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 accent-ink-900" />
            I accept the paid-event terms and the one-time activation fee of {formatPrice(15000)} (simulated).
          </label>
          <Button type="submit" className="w-full" variant="accent" loading={activate.isPending} disabled={!hasPaidType || !profile}>
            Pay fee & activate
          </Button>
        </form>
      </Card>
    </div>
  )
}

function ActivityTab({ event }: { event: BfEvent }) {
  const { user } = useAuth()
  const { data: entries } = useQuery({
    queryKey: ['audit', event.id],
    queryFn: () => getEventAudit(user!, event.id),
  })
  if (!entries) return <Spinner />
  if (entries.length === 0) return <EmptyState icon={History} title="No activity yet" />

  return (
    <Card className="p-6">
      <ol className="relative space-y-6 border-l-2 border-ink-100 pl-6">
        {entries.map((entry) => (
          <li key={entry.id} className="relative">
            <span className="absolute top-1.5 -left-[31px] size-3 rounded-full bg-sun-400 ring-4 ring-white" />
            <p className="text-sm font-semibold">{entry.action}</p>
            <p className="text-xs text-ink-500">
              {entry.actor} · {formatDateTime(entry.at)}
            </p>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-xs text-ink-400">The activity log is append-only and cannot be edited.</p>
    </Card>
  )
}
