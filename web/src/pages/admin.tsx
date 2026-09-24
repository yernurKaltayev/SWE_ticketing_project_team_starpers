import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, RotateCcw, Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EventStatusBadge } from '@/components/events'
import { MockNotice } from '@/components/layout'
import { Alert, Badge, Button, Card, cx, errorText, Input, PageHeader, Spinner } from '@/components/ui'
import { roleLabels, useAuth } from '@/lib/auth'
import { formatDateTime, formatEventDate } from '@/lib/format'
import { listUsers } from '@/services/account'
import { listAllEvents, setSuspended } from '@/services/events'

export function AdminPage() {
  const [tab, setTab] = useState<'events' | 'users'>('events')
  return (
    <>
      <PageHeader title="Platform admin" description="Moderate events and review accounts across the marketplace." />
      <div className="mb-6 inline-flex rounded-full bg-ink-100 p-1" role="tablist">
        {(['events', 'users'] as const).map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cx(
              'rounded-full px-4 py-1.5 text-sm font-semibold capitalize',
              tab === value ? 'bg-white shadow-sm' : 'text-ink-600 hover:text-ink-900',
            )}
          >
            {value}
          </button>
        ))}
      </div>
      {tab === 'events' ? <EventsModeration /> : <UsersTable />}
    </>
  )
}

function EventsModeration() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [q, setQ] = useState('')
  const { data: events } = useQuery({ queryKey: ['admin-events'], queryFn: listAllEvents })
  const suspend = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) => setSuspended(user!, id, value),
    onSuccess: () => queryClient.invalidateQueries(),
  })

  if (!events) return <Spinner />
  const needle = q.trim().toLowerCase()
  const shown = events.filter((e) => !needle || `${e.title} ${e.organizerName} ${e.city}`.toLowerCase().includes(needle))

  return (
    <>
      {suspend.isError && <Alert tone="bad" className="mb-4">{errorText(suspend.error)}</Alert>}
      <Card className="overflow-hidden">
        <div className="relative border-b border-ink-100 p-4">
          <Search className="pointer-events-none absolute top-1/2 left-7 size-4 -translate-y-1/2 text-ink-400" />
          <Input type="search" placeholder="Search events or organizers" aria-label="Search events" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-left text-ink-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Event</th>
                <th className="px-4 py-2.5 font-medium">Organizer</th>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {shown.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-3">
                    <Link to={`/events/${e.id}`} className="font-semibold hover:text-sky-600">
                      {e.title}
                    </Link>
                    <p className="text-ink-500">
                      {e.city} · {e.paidSalesActive ? 'Paid sales active' : 'Free / not activated'}
                    </p>
                  </td>
                  <td className="px-4 py-3">{e.organizerName}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(e.startsAt)}</td>
                  <td className="px-4 py-3">
                    <EventStatusBadge status={e.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {e.status === 'suspended' ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={RotateCcw}
                        loading={suspend.isPending && suspend.variables?.id === e.id}
                        onClick={() => suspend.mutate({ id: e.id, value: false })}
                      >
                        Lift
                      </Button>
                    ) : (
                      e.status !== 'cancelled' && (
                        <Button
                          size="sm"
                          variant="danger"
                          icon={Ban}
                          loading={suspend.isPending && suspend.variables?.id === e.id}
                          onClick={() => suspend.mutate({ id: e.id, value: true })}
                        >
                          Suspend
                        </Button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="mt-6">
        <MockNotice />
      </div>
    </>
  )
}

function UsersTable() {
  const { data: users, error, isLoading } = useQuery({ queryKey: ['admin-users'], queryFn: () => listUsers() })
  if (isLoading) return <Spinner />
  if (error || !users) return <Alert tone="bad">{errorText(error)}</Alert>

  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-ink-50 text-left text-ink-500">
          <tr>
            <th className="px-4 py-2.5 font-medium">Name</th>
            <th className="px-4 py-2.5 font-medium">Role</th>
            <th className="px-4 py-2.5 font-medium">Email</th>
            <th className="px-4 py-2.5 font-medium">Joined</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {users.map((u) => (
            <tr key={u.id}>
              <td className="px-4 py-3 font-semibold">
                {u.full_name} {!u.is_active && <Badge tone="bad">Disabled</Badge>}
              </td>
              <td className="px-4 py-3">{roleLabels[u.role]}</td>
              <td className="px-4 py-3">
                {u.email} {u.is_email_verified ? <Badge tone="good">Verified</Badge> : <Badge>Unverified</Badge>}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">{formatEventDate(u.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
