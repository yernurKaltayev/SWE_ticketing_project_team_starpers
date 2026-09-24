import type { EventCategory } from './types'

/** Every event is shown in Kazakhstan time, regardless of the viewer's own timezone. */
export const EVENT_TIMEZONE = 'Asia/Almaty'

const kzt = new Intl.NumberFormat('ru-KZ', {
  style: 'currency',
  currency: 'KZT',
  maximumFractionDigits: 0,
})

export function formatKzt(amount: number): string {
  return kzt.format(amount)
}

export function formatPrice(amount: number): string {
  return amount === 0 ? 'Free' : formatKzt(amount)
}

export function formatEventDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: EVENT_TIMEZONE,
  }).format(new Date(iso))
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: EVENT_TIMEZONE,
  }).format(new Date(iso))
}

export function formatDateTime(iso: string): string {
  return `${formatEventDate(iso)}, ${formatTime(iso)}`
}

export function dateParts(iso: string): { day: string; month: string } {
  const date = new Date(iso)
  return {
    day: new Intl.DateTimeFormat('en-GB', { day: '2-digit', timeZone: EVENT_TIMEZONE }).format(date),
    month: new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: EVENT_TIMEZONE })
      .format(date)
      .toUpperCase(),
  }
}

/** ISO string → value for <input type="datetime-local">, expressed in Almaty time. */
export function toLocalInput(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: EVENT_TIMEZONE,
  }).formatToParts(new Date(iso))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

/** <input type="datetime-local"> value in Almaty time (UTC+5, no DST) → ISO string. */
export function fromLocalInput(value: string): string {
  return new Date(`${value}:00+05:00`).toISOString()
}

export const categoryLabels: Record<EventCategory, string> = {
  music: 'Music',
  tech: 'Tech',
  sports: 'Sports',
  arts: 'Arts & Culture',
  education: 'Education',
  business: 'Business',
  community: 'Community',
}

export const cities = ['Almaty', 'Astana', 'Shymkent', 'Karaganda', 'Aktobe', 'Atyrau'] as const
