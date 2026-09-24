import { useMutation } from '@tanstack/react-query'
import { BadgeCheck, MailWarning } from 'lucide-react'
import { useState } from 'react'
import { Alert, Button, Card, errorText, Field, Input, PageHeader } from '@/components/ui'
import { roleLabels, useAuth } from '@/lib/auth'
import { formatEventDate } from '@/lib/format'
import { updateMe } from '@/services/account'
import { ResendVerificationButton } from './auth'

export function AccountPage() {
  const { user, refreshUser } = useAuth()
  const [name, setName] = useState(user!.full_name)
  const save = useMutation({ mutationFn: () => updateMe(name), onSuccess: () => refreshUser() })

  if (!user) return null

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Account" description={`${roleLabels[user.role]} · member since ${formatEventDate(user.created_at)}`} />

      {user.is_email_verified ? (
        <Alert tone="good" className="mb-6">
          <span className="inline-flex items-center gap-1.5">
            <BadgeCheck className="size-4" /> {user.email} is verified
          </span>
        </Alert>
      ) : (
        <Card className="mb-6 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <MailWarning className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold">Verify your email</p>
              <p className="text-sm text-ink-500">We sent a link to {user.email}.</p>
            </div>
          </div>
          <ResendVerificationButton email={user.email} />
        </Card>
      )}

      <Card className="p-6">
        <h2 className="text-lg font-semibold">Profile</h2>
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate()
          }}
        >
          {save.isError && <Alert tone="bad">{errorText(save.error)}</Alert>}
          {save.isSuccess && <Alert tone="good">Saved.</Alert>}
          <Field label="Full name" hint="Printed on your tickets">
            {(id) => <Input id={id} required maxLength={255} value={name} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <Field label="Email">{(id) => <Input id={id} value={user.email} disabled />}</Field>
          <Button type="submit" loading={save.isPending} disabled={name.trim() === user.full_name}>
            Save changes
          </Button>
        </form>
      </Card>
    </div>
  )
}
