import { useMutation } from '@tanstack/react-query'
import { CalendarCheck, MailCheck, QrCode, Ticket } from 'lucide-react'
import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Button, Card, cx, errorText, Field, Input } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import {
  confirmPasswordReset,
  register,
  requestPasswordReset,
  resendVerification,
  verifyEmail,
} from '@/services/account'

const PERKS = [
  { icon: CalendarCheck, text: 'Discover concerts, meetups and matches across Kazakhstan' },
  { icon: Ticket, text: 'Register for free events or buy tickets in KZT' },
  { icon: QrCode, text: 'Show your QR ticket at the door — or print it' },
]

function AuthShell({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-2">
      <div className="hidden lg:block">
        <p className="font-display text-4xl leading-tight font-bold">
          Your next event, <span className="text-sun-500">one QR code</span> away.
        </p>
        <ul className="mt-8 space-y-4 text-ink-600">
          {PERKS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-full bg-sun-100 text-sun-700">
                <Icon className="size-4" />
              </span>
              {text}
            </li>
          ))}
        </ul>
      </div>
      <Card className="mx-auto w-full max-w-md p-6 sm:p-8">
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-ink-500">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </Card>
    </div>
  )
}

function safeNext(next: string | null): string {
  // Only allow in-app paths, never an absolute URL (open redirect).
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
}

export function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const mutation = useMutation({
    mutationFn: () => login(email, password),
    onSuccess: (me) => {
      const home = me.role === 'organizer' ? '/organizer' : me.role === 'platform_admin' ? '/admin' : '/'
      navigate(next === '/' ? home : next, { replace: true })
    },
  })

  if (user && !mutation.isSuccess) return <Navigate to={next} replace />

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    mutation.mutate()
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle={
        <>
          New to BiletFlow?{' '}
          <Link to={`/register${params.size ? `?${params}` : ''}`} className="font-semibold text-sky-600 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {mutation.isError && <Alert tone="bad">{errorText(mutation.error)}</Alert>}
        <Field label="Email">
          {(id) => (
            <Input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          )}
        </Field>
        <Field label="Password">
          {(id) => (
            <Input
              id={id}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>
        <div className="text-right text-sm">
          <Link to="/forgot-password" className="font-semibold text-sky-600 hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={mutation.isPending}>
          Sign in
        </Button>
      </form>
    </AuthShell>
  )
}

export function RegisterPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [params] = useSearchParams()
  const [role, setRole] = useState<'attendee' | 'organizer'>(
    params.get('role') === 'organizer' ? 'organizer' : 'attendee',
  )
  const [form, setForm] = useState({ full_name: '', email: '', password: '' })

  const mutation = useMutation({
    mutationFn: async () => {
      await register({ ...form, role })
      return login(form.email, form.password)
    },
    onSuccess: () => navigate(role === 'organizer' ? '/organizer/profile?welcome=1' : safeNext(params.get('next')), { replace: true }),
  })

  const set = (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const passwordTooShort = form.password.length > 0 && form.password.length < 8

  return (
    <AuthShell
      title="Create your account"
      subtitle={
        <>
          Already have one?{' '}
          <Link to="/login" className="font-semibold text-sky-600 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
        className="space-y-4"
      >
        {mutation.isError && <Alert tone="bad">{errorText(mutation.error)}</Alert>}
        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold text-ink-800">I want to</legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['attendee', 'Attend events', 'Find events and get tickets'],
                ['organizer', 'Host events', 'Publish events and sell tickets'],
              ] as const
            ).map(([value, label, hint]) => (
              <label
                key={value}
                className={cx(
                  'cursor-pointer rounded-xl p-3 ring-1 ring-inset transition',
                  role === value ? 'bg-sun-50 ring-2 ring-sun-400' : 'ring-ink-200 hover:bg-ink-50',
                )}
              >
                <input
                  type="radio"
                  name="role"
                  value={value}
                  checked={role === value}
                  onChange={() => setRole(value)}
                  className="sr-only"
                />
                <span className="block text-sm font-semibold">{label}</span>
                <span className="block text-xs text-ink-500">{hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field label={role === 'organizer' ? 'Your name' : 'Full name'}>
          {(id) => <Input id={id} autoComplete="name" required maxLength={255} value={form.full_name} onChange={set('full_name')} />}
        </Field>
        <Field label="Email">
          {(id) => <Input id={id} type="email" autoComplete="email" required value={form.email} onChange={set('email')} />}
        </Field>
        <Field label="Password" hint="At least 8 characters" error={passwordTooShort ? 'At least 8 characters' : undefined}>
          {(id) => (
            <Input
              id={id}
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={72}
              value={form.password}
              onChange={set('password')}
            />
          )}
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={mutation.isPending}>
          Create account
        </Button>
        <p className="text-center text-xs text-ink-500">
          We'll email you a link to verify your address.
        </p>
      </form>
    </AuthShell>
  )
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const mutation = useMutation({ mutationFn: () => requestPasswordReset(email) })

  return (
    <AuthShell title="Reset your password" subtitle="Enter your email and we'll send you a reset link.">
      {mutation.isSuccess ? (
        <div className="space-y-4">
          <Alert tone="good" title="Check your inbox">
            If an account exists for {email}, a reset link is on its way.
          </Alert>
          <DevTokenHint />
          <Link to="/reset-password" className="block text-center text-sm font-semibold text-sky-600 hover:underline">
            I have a reset token
          </Link>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            mutation.mutate()
          }}
          className="space-y-4"
        >
          {mutation.isError && <Alert tone="bad">{errorText(mutation.error)}</Alert>}
          <Field label="Email">
            {(id) => <Input id={id} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={mutation.isPending}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  )
}

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const [token, setToken] = useState(params.get('token') ?? '')
  const [password, setPassword] = useState('')
  const mutation = useMutation({ mutationFn: () => confirmPasswordReset(token.trim(), password) })

  return (
    <AuthShell title="Choose a new password">
      {mutation.isSuccess ? (
        <div className="space-y-4">
          <Alert tone="good" title="Password updated">
            You've been signed out everywhere. Sign in with your new password.
          </Alert>
          <Link to="/login" className="block text-center text-sm font-semibold text-sky-600 hover:underline">
            Go to sign in
          </Link>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            mutation.mutate()
          }}
          className="space-y-4"
        >
          {mutation.isError && <Alert tone="bad">{errorText(mutation.error)}</Alert>}
          {!params.get('token') && (
            <Field label="Reset token" hint="From the link in your email">
              {(id) => <Input id={id} required value={token} onChange={(e) => setToken(e.target.value)} />}
            </Field>
          )}
          <Field label="New password" hint="At least 8 characters">
            {(id) => (
              <Input
                id={id}
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={72}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={mutation.isPending}>
            Update password
          </Button>
        </form>
      )}
    </AuthShell>
  )
}

export function VerifyEmailPage() {
  const [params] = useSearchParams()
  const { refreshUser } = useAuth()
  const urlToken = params.get('token')
  const [token, setToken] = useState(urlToken ?? '')
  const mutation = useMutation({
    mutationFn: (value: string) => verifyEmail(value.trim()),
    onSuccess: () => refreshUser(),
  })

  // Links from the email carry the token: verify straight away.
  const { mutate } = mutation
  useEffect(() => {
    if (urlToken) mutate(urlToken)
  }, [urlToken, mutate])

  return (
    <AuthShell title="Verify your email">
      {mutation.isSuccess ? (
        <div className="space-y-4">
          <Alert tone="good" title="Email verified">
            {mutation.data.email} is confirmed. You're all set.
          </Alert>
          <Link to="/" className="block text-center text-sm font-semibold text-sky-600 hover:underline">
            Explore events
          </Link>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            mutation.mutate(token)
          }}
          className="space-y-4"
        >
          {mutation.isError && <Alert tone="bad">{errorText(mutation.error)}</Alert>}
          <Field label="Verification token" hint="From the link in your email">
            {(id) => <Input id={id} required value={token} onChange={(e) => setToken(e.target.value)} />}
          </Field>
          <DevTokenHint />
          <Button type="submit" size="lg" className="w-full" loading={mutation.isPending}>
            Verify
          </Button>
        </form>
      )}
    </AuthShell>
  )
}

/** Until an email provider is connected, the backend logs tokens instead of sending them. */
function DevTokenHint() {
  if (!import.meta.env.DEV) return null
  return (
    <Alert tone="info" title="Local development">
      Emails aren't sent yet — the token is printed in the backend (uvicorn) log.
    </Alert>
  )
}

export function ResendVerificationButton({ email }: { email: string }) {
  const mutation = useMutation({ mutationFn: () => resendVerification(email) })
  if (mutation.isSuccess) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700">
        <MailCheck className="size-4" /> Sent — check your inbox
      </span>
    )
  }
  return (
    <Button size="sm" variant="secondary" loading={mutation.isPending} onClick={() => mutation.mutate()}>
      Resend verification email
    </Button>
  )
}
