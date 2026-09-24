import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Button, Card, errorText, Field, Input, PageHeader, Spinner, Textarea } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import type { OrganizerProfile, OrganizerProfileUpsert } from '@/lib/types'
import { saveOrganizerProfile } from '@/services/account'
import { useOrganizerProfile } from './shared'

export function OrganizerProfilePage() {
  const { data: profile, isLoading } = useOrganizerProfile()
  if (isLoading || profile === undefined) return <Spinner />
  return <ProfileForm profile={profile} />
}

function ProfileForm({ profile }: { profile: OrganizerProfile | null }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const welcome = params.has('welcome')
  const queryClient = useQueryClient()
  const [form, setForm] = useState<OrganizerProfileUpsert>({
    display_name: profile?.display_name ?? user?.full_name ?? '',
    contact_email: profile?.contact_email ?? user?.email ?? '',
    contact_phone: profile?.contact_phone ?? '',
    description: profile?.description ?? '',
  })

  const save = useMutation({
    mutationFn: () =>
      saveOrganizerProfile({
        ...form,
        contact_phone: form.contact_phone?.trim() || null,
        description: form.description?.trim() || null,
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(['organizer-profile', user?.id], saved)
      if (welcome) navigate('/organizer')
    },
  })

  const set = (key: keyof OrganizerProfileUpsert) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={welcome ? 'Welcome — tell attendees who you are' : 'Organizer profile'}
        description="Shown on your event pages and used by attendees to contact you."
      />

      <Card className="p-6">
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate()
          }}
        >
          {save.isError && <Alert tone="bad">{errorText(save.error)}</Alert>}
          {save.isSuccess && !welcome && <Alert tone="good">Profile saved.</Alert>}
          <Field label="Organizer name" hint="A company, community or your own name">
            {(id) => <Input id={id} required maxLength={255} value={form.display_name} onChange={set('display_name')} />}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Contact email">
              {(id) => <Input id={id} type="email" required value={form.contact_email} onChange={set('contact_email')} />}
            </Field>
            <Field label="Contact phone" hint="Optional">
              {(id) => (
                <Input id={id} type="tel" maxLength={32} placeholder="+7 7xx xxx xx xx" value={form.contact_phone ?? ''} onChange={set('contact_phone')} />
              )}
            </Field>
          </div>
          <Field label="About" hint="Optional">
            {(id) => <Textarea id={id} value={form.description ?? ''} onChange={set('description')} />}
          </Field>
          <div className="flex gap-2">
            <Button type="submit" loading={save.isPending}>
              {profile ? 'Save profile' : 'Create profile'}
            </Button>
            {welcome && (
              <Button variant="ghost" onClick={() => navigate('/organizer')}>
                Skip for now
              </Button>
            )}
          </div>
        </form>
      </Card>

      {profile && (
        <Card className="mt-6 flex gap-3 p-5">
          {profile.is_identity_verified ? (
            <>
              <BadgeCheck className="size-5 shrink-0 text-emerald-600" />
              <p className="text-sm">Identity verified — you can activate paid ticket sales on your events.</p>
            </>
          ) : (
            <>
              <ShieldAlert className="size-5 shrink-0 text-amber-600" />
              <p className="text-sm text-ink-600">
                Identity not verified yet. Free events work right away; paid ticket sales need the (simulated) Paid
                Sales Activation on each event.
              </p>
            </>
          )}
        </Card>
      )}
    </div>
  )
}
