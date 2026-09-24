import {
  Briefcase,
  CalendarDays,
  Dumbbell,
  GraduationCap,
  MapPin,
  Music2,
  Palette,
  Users,
  Cpu,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { categoryLabels, dateParts, formatEventDate, formatPrice, formatTime } from '@/lib/format'
import type { BfEvent, EventCategory, EventStatus, TicketStatus } from '@/lib/types'
import { Badge, cx } from './ui'

export const categoryIcons: Record<EventCategory, LucideIcon> = {
  music: Music2,
  tech: Cpu,
  sports: Dumbbell,
  arts: Palette,
  education: GraduationCap,
  business: Briefcase,
  community: Users,
}

/**
 * Generated poster art: a sun-and-rays motif (a nod to the Kazakh flag) tinted per event,
 * so every event has a distinct cover without needing image uploads.
 */
export function EventPoster({
  event,
  className,
  size = 'md',
}: {
  event: Pick<BfEvent, 'posterHue' | 'startsAt' | 'category' | 'id'>
  className?: string
  size?: 'md' | 'lg'
}) {
  const { day, month } = dateParts(event.startsAt)
  const Icon = categoryIcons[event.category]
  const h = event.posterHue
  const rays = Array.from({ length: 24 }, (_, i) => i * 15)

  return (
    <div
      className={cx('relative overflow-hidden', className)}
      style={{
        background: `linear-gradient(135deg, hsl(${h} 70% 22%) 0%, hsl(${(h + 30) % 360} 65% 38%) 100%)`,
      }}
      aria-hidden
    >
      <svg viewBox="0 0 200 200" className="absolute -right-16 -bottom-16 size-72 opacity-40">
        {rays.map((deg) => (
          <rect
            key={deg}
            x="98"
            y="10"
            width="4"
            height="48"
            rx="2"
            fill={`hsl(${(h + 40) % 360} 90% 70%)`}
            transform={`rotate(${deg} 100 100)`}
          />
        ))}
        <circle cx="100" cy="100" r="34" fill={`hsl(${(h + 40) % 360} 95% 65%)`} />
      </svg>
      <div className="relative flex h-full flex-col justify-between p-5 text-white">
        <Icon className={size === 'lg' ? 'size-7' : 'size-5'} />
        <div className="font-display leading-none [text-shadow:0_2px_12px_rgb(0_0_0/0.45)]">
          <div className={size === 'lg' ? 'text-6xl font-bold' : 'text-4xl font-bold'}>{day}</div>
          <div className="mt-1 text-sm font-medium tracking-widest opacity-80">{month}</div>
        </div>
      </div>
    </div>
  )
}

/** Small square version of the poster for lists and summaries. */
export function EventThumb({ event, className }: { event: Pick<BfEvent, 'posterHue' | 'category'>; className?: string }) {
  const Icon = categoryIcons[event.category]
  const h = event.posterHue
  return (
    <div
      className={cx('grid size-14 shrink-0 place-items-center rounded-xl text-white', className)}
      style={{ background: `linear-gradient(135deg, hsl(${h} 70% 22%), hsl(${(h + 30) % 360} 65% 38%))` }}
      aria-hidden
    >
      <Icon className="size-5" />
    </div>
  )
}

export function lowestPrice(event: BfEvent): number | null {
  const visible = event.ticketTypes.filter((t) => !t.hidden)
  if (visible.length === 0) return null
  return Math.min(...visible.map((t) => t.price))
}

export function remaining(event: BfEvent): number {
  return event.ticketTypes.filter((t) => !t.hidden).reduce((sum, t) => sum + t.quantity - t.sold, 0)
}

export function EventCard({ event }: { event: BfEvent }) {
  const price = lowestPrice(event)
  const left = remaining(event)
  return (
    <Link
      to={`/events/${event.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-ink-100 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-ink-900/10"
    >
      <EventPoster event={event} className="h-40" />
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">
          {categoryLabels[event.category]}
          {left === 0 ? <Badge tone="bad">Sold out</Badge> : left < 50 && <Badge tone="warn">{left} left</Badge>}
        </div>
        <h3 className="font-display text-lg leading-snug font-semibold group-hover:text-sky-600">{event.title}</h3>
        <div className="mt-3 space-y-1 text-sm text-ink-600">
          <p className="flex items-center gap-2">
            <CalendarDays className="size-4 text-ink-400" />
            {formatEventDate(event.startsAt)} · {formatTime(event.startsAt)}
          </p>
          <p className="flex items-center gap-2">
            <MapPin className="size-4 text-ink-400" />
            {event.venueName}, {event.city}
          </p>
        </div>
        <div className="mt-auto flex items-center justify-between pt-4">
          <span className="text-sm text-ink-500">{event.organizerName}</span>
          {price !== null && (
            <span className="font-semibold">
              {price === 0 ? 'Free' : <>from {formatPrice(price)}</>}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

const eventStatus: Record<EventStatus, { label: string; tone: 'neutral' | 'good' | 'bad' | 'warn' }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  published: { label: 'Published', tone: 'good' },
  cancelled: { label: 'Cancelled', tone: 'bad' },
  suspended: { label: 'Suspended', tone: 'warn' },
}

export function EventStatusBadge({ status }: { status: EventStatus }) {
  const { label, tone } = eventStatus[status]
  return <Badge tone={tone}>{label}</Badge>
}

const ticketStatus: Record<TicketStatus, { label: string; tone: 'good' | 'info' | 'bad' | 'neutral' }> = {
  valid: { label: 'Valid', tone: 'good' },
  checked_in: { label: 'Checked in', tone: 'info' },
  cancelled: { label: 'Cancelled', tone: 'bad' },
  refunded: { label: 'Refunded', tone: 'neutral' },
}

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const { label, tone } = ticketStatus[status]
  return <Badge tone={tone}>{label}</Badge>
}
