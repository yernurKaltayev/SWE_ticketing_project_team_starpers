import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, EyeOff, Lock, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EventPoster } from '@/components/events'
import { Alert, Button, Card, cx, errorText, Field, Input, PageHeader, Select, Spinner, Textarea } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { categoryLabels, cities, fromLocalInput, toLocalInput } from '@/lib/format'
import type { BfEvent, EventCategory, EventInput, TicketType, Visibility } from '@/lib/types'
import { createEvent, getEvent, updateEvent } from '@/services/events'
import { useOrganizerName } from './shared'

type TicketDraft = Omit<TicketType, 'sold'> & { sold: number }

function blankTicket(): TicketDraft {
  return { id: '', name: 'General Admission', description: '', price: 0, quantity: 100, sold: 0, perOrderLimit: 6, hidden: false }
}

function defaultStart(): string {
  const date = new Date(Date.now() + 14 * 86_400_000)
  date.setUTCHours(14, 0, 0, 0) // 19:00 Almaty
  return date.toISOString()
}

function initialForm(event?: BfEvent): EventInput {
  if (event) {
    const { id: _id, organizerId: _o, organizerName: _n, status: _s, paidSalesActive: _p, createdAt: _c, updatedAt: _u, ...input } = event
    return input
  }
  const startsAt = defaultStart()
  return {
    title: '',
    summary: '',
    description: '',
    category: 'music',
    city: 'Almaty',
    venueName: '',
    venueAddress: '',
    startsAt,
    endsAt: new Date(new Date(startsAt).getTime() + 3 * 3_600_000).toISOString(),
    visibility: 'public',
    posterHue: Math.floor(Math.random() * 360),
    ticketTypes: [blankTicket()],
  }
}

export function EventEditorPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const { data: event, isLoading } = useQuery({
    queryKey: ['event', id, user?.id],
    queryFn: () => getEvent(id!, user),
    enabled: !!id,
  })

  if (id && (isLoading || !event)) return <Spinner />
  return <EventForm key={event?.id ?? 'new'} event={event} />
}

function EventForm({ event }: { event?: BfEvent }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const organizerName = useOrganizerName()
  const [form, setForm] = useState<EventInput>(() => initialForm(event))

  const save = useMutation({
    mutationFn: () => (event ? updateEvent(user!, event.id, form) : createEvent(user!, organizerName, form)),
    onSuccess: (saved) => {
      queryClient.invalidateQueries()
      navigate(`/organizer/events/${saved.id}`)
    },
  })

  const set = <K extends keyof EventInput>(key: K, value: EventInput[K]) => setForm((f) => ({ ...f, [key]: value }))
  const setTicket = (index: number, patch: Partial<TicketDraft>) =>
    set(
      'ticketTypes',
      form.ticketTypes.map((t, i) => (i === index ? { ...t, ...patch } : t)),
    )

  const hasPaid = form.ticketTypes.some((t) => t.price > 0)

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        to={event ? `/organizer/events/${event.id}` : '/organizer/events'}
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-900"
      >
        <ArrowLeft className="size-4" /> {event ? 'Back to event' : 'My events'}
      </Link>
      <PageHeader
        title={event ? 'Edit event' : 'Create an event'}
        description={event ? undefined : 'New events are saved as drafts. Publish when you are ready.'}
      />

      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <Card className="space-y-5 p-6">
          <h2 className="text-lg font-semibold">Basics</h2>
          <Field label="Event title">
            {(id) => <Input id={id} required maxLength={120} value={form.title} onChange={(e) => set('title', e.target.value)} />}
          </Field>
          <Field label="Short summary" hint="One line shown on event cards">
            {(id) => <Input id={id} required maxLength={160} value={form.summary} onChange={(e) => set('summary', e.target.value)} />}
          </Field>
          <Field label="Description" hint="Leave a blank line between paragraphs">
            {(id) => <Textarea id={id} rows={6} value={form.description} onChange={(e) => set('description', e.target.value)} />}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Category">
              {(id) => (
                <Select id={id} value={form.category} onChange={(e) => set('category', e.target.value as EventCategory)}>
                  {Object.entries(categoryLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Visibility">
              {(id) => (
                <Select id={id} value={form.visibility} onChange={(e) => set('visibility', e.target.value as Visibility)}>
                  <option value="public">Public — listed on Explore</option>
                  <option value="unlisted">Unlisted — anyone with the link</option>
                  <option value="private">Private — only you</option>
                </Select>
              )}
            </Field>
          </div>
          <div>
            <p className="mb-1.5 text-sm font-semibold text-ink-800">Poster colour</p>
            <div className="flex items-center gap-4">
              <EventPoster event={{ ...form, id: 'preview' }} className="h-32 w-32 shrink-0 rounded-xl" />
              <input
                type="range"
                min={0}
                max={359}
                value={form.posterHue}
                onChange={(e) => set('posterHue', Number(e.target.value))}
                className="w-full accent-ink-900"
                aria-label="Poster colour"
              />
            </div>
          </div>
        </Card>

        <Card className="space-y-5 p-6">
          <h2 className="text-lg font-semibold">When & where</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Starts" hint="Almaty time (UTC+5)">
              {(id) => (
                <Input
                  id={id}
                  type="datetime-local"
                  required
                  value={toLocalInput(form.startsAt)}
                  onChange={(e) => e.target.value && set('startsAt', fromLocalInput(e.target.value))}
                />
              )}
            </Field>
            <Field label="Ends" hint="Almaty time (UTC+5)">
              {(id) => (
                <Input
                  id={id}
                  type="datetime-local"
                  required
                  value={toLocalInput(form.endsAt)}
                  onChange={(e) => e.target.value && set('endsAt', fromLocalInput(e.target.value))}
                />
              )}
            </Field>
          </div>
          <div className="grid gap-5 sm:grid-cols-[1fr_2fr]">
            <Field label="City">
              {(id) => (
                <Select id={id} value={form.city} onChange={(e) => set('city', e.target.value)}>
                  {cities.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Venue name">
              {(id) => <Input id={id} required value={form.venueName} onChange={(e) => set('venueName', e.target.value)} />}
            </Field>
          </div>
          <Field label="Address">
            {(id) => <Input id={id} required value={form.venueAddress} onChange={(e) => set('venueAddress', e.target.value)} />}
          </Field>
        </Card>

        <Card className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Tickets</h2>
            <Button size="sm" variant="secondary" icon={Plus} onClick={() => set('ticketTypes', [...form.ticketTypes, { ...blankTicket(), name: '' }])}>
              Add ticket type
            </Button>
          </div>
          {hasPaid && !event?.paidSalesActive && (
            <Alert tone="info" className="mb-5" title="Paid tickets need activation">
              <span className="inline-flex items-center gap-1">
                <Lock className="size-3.5" /> Paid ticket types stay locked until you complete Paid Sales Activation on the event page. Free types sell right away.
              </span>
            </Alert>
          )}
          <div className="space-y-4">
            {form.ticketTypes.map((ticket, index) => (
              <div key={ticket.id || index} className={cx('rounded-xl p-4 ring-1 ring-ink-200', ticket.hidden && 'bg-ink-50')}>
                <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
                  <Field label="Name">
                    {(id) => <Input id={id} required value={ticket.name} onChange={(e) => setTicket(index, { name: e.target.value })} />}
                  </Field>
                  <Field label="Price (KZT)" hint={ticket.price === 0 ? 'Free' : undefined}>
                    {(id) => (
                      <Input
                        id={id}
                        type="number"
                        min={0}
                        step={100}
                        required
                        value={ticket.price}
                        onChange={(e) => setTicket(index, { price: Math.max(0, Number(e.target.value)) })}
                      />
                    )}
                  </Field>
                  <Field label="Quantity" hint={ticket.sold ? `${ticket.sold} sold` : undefined}>
                    {(id) => (
                      <Input
                        id={id}
                        type="number"
                        min={Math.max(1, ticket.sold)}
                        required
                        value={ticket.quantity}
                        onChange={(e) => setTicket(index, { quantity: Number(e.target.value) })}
                      />
                    )}
                  </Field>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-[2fr_1fr]">
                  <Field label="Description" hint="Optional">
                    {(id) => <Input id={id} value={ticket.description} onChange={(e) => setTicket(index, { description: e.target.value })} />}
                  </Field>
                  <Field label="Max per order">
                    {(id) => (
                      <Input
                        id={id}
                        type="number"
                        min={1}
                        max={20}
                        value={ticket.perOrderLimit}
                        onChange={(e) => setTicket(index, { perOrderLimit: Number(e.target.value) })}
                      />
                    )}
                  </Field>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <Button size="sm" variant="ghost" icon={EyeOff} onClick={() => setTicket(index, { hidden: !ticket.hidden })}>
                    {ticket.hidden ? 'Show on event page' : 'Hide from sale'}
                  </Button>
                  {ticket.sold === 0 && form.ticketTypes.length > 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={Trash2}
                      onClick={() => set('ticketTypes', form.ticketTypes.filter((_, i) => i !== index))}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {save.isError && <Alert tone="bad">{errorText(save.error)}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit" size="lg" loading={save.isPending}>
            {event ? 'Save changes' : 'Save draft'}
          </Button>
        </div>
      </form>
    </div>
  )
}
