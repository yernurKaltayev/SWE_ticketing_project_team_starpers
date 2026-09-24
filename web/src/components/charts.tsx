import { useState } from 'react'
import { formatKzt } from '@/lib/format'
import type { DayPoint } from '@/services/analytics'
import { cx } from './ui'

const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(iso))

/** Single-series daily bars (tickets sold) with a hover/focus tooltip. */
export function SalesChart({ data }: { data: DayPoint[] }) {
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(1, ...data.map((d) => d.tickets))
  // Round the axis to a friendly ceiling.
  const step = Math.max(1, Math.ceil(max / 4))
  const top = step * 4
  const ticks = [0, 1, 2, 3, 4].map((i) => i * step)
  const point = active === null ? null : data[active]

  return (
    <figure>
      <div className="relative flex h-56 gap-3">
        <div className="flex flex-col-reverse justify-between py-0 text-right text-xs text-ink-400 tabular-nums" aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="-my-2 leading-4">
              {t}
            </span>
          ))}
        </div>
        <div className="relative flex-1">
          {ticks.map((t) => (
            <div
              key={t}
              className={cx('absolute inset-x-0 border-t', t === 0 ? 'border-ink-300' : 'border-ink-100')}
              style={{ bottom: `${(t / top) * 100}%` }}
              aria-hidden
            />
          ))}
          <div className="absolute inset-0 flex items-end gap-[2px]" onMouseLeave={() => setActive(null)}>
            {data.map((d, i) => (
              <button
                key={d.date}
                type="button"
                className="group relative flex h-full flex-1 items-end focus:outline-none"
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                aria-label={`${dayLabel(d.date)}: ${d.tickets} tickets, ${formatKzt(d.revenue)}`}
              >
                <span
                  className={cx(
                    'w-full rounded-t-[4px] transition-colors',
                    active === i ? 'bg-sky-600' : 'bg-sky-500',
                    active !== null && active !== i && 'opacity-60',
                  )}
                  style={{ height: d.tickets === 0 ? 0 : `max(3px, ${(d.tickets / top) * 100}%)` }}
                />
              </button>
            ))}
          </div>
          {point && active !== null && (
            <div
              className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-ink-900 px-3 py-2 text-xs whitespace-nowrap text-white shadow-lg"
              style={{ left: `${((active + 0.5) / data.length) * 100}%` }}
              role="status"
            >
              <p className="font-semibold">{dayLabel(point.date)}</p>
              <p>
                {point.tickets} tickets · {formatKzt(point.revenue)}
              </p>
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 flex justify-between pl-8 text-xs text-ink-400" aria-hidden>
        <span>{dayLabel(data[0].date)}</span>
        <span>{dayLabel(data[data.length - 1].date)}</span>
      </div>
      <figcaption className="sr-only">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Tickets</th>
              <th>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.date}>
                <td>{d.date}</td>
                <td>{d.tickets}</td>
                <td>{d.revenue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  )
}

/** Sold vs capacity per row, as labelled meters. */
export function CapacityBars({ rows }: { rows: { name: string; sold: number; quantity: number; revenue: number }[] }) {
  return (
    <ul className="space-y-4">
      {rows.map((row) => {
        const pct = row.quantity ? Math.round((row.sold / row.quantity) * 100) : 0
        return (
          <li key={row.name}>
            <div className="mb-1.5 flex justify-between gap-4 text-sm">
              <span className="truncate font-medium">{row.name}</span>
              <span className="shrink-0 text-ink-500 tabular-nums">
                {row.sold.toLocaleString()} / {row.quantity.toLocaleString()} · {pct}%
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-ink-100"
              role="meter"
              aria-valuemin={0}
              aria-valuemax={row.quantity}
              aria-valuenow={row.sold}
              aria-label={`${row.name} sold`}
            >
              <div className="h-full rounded-full bg-sky-500" style={{ width: `${pct}%` }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
