import { AlertCircle, CheckCircle2, Info, Loader2, type LucideIcon } from 'lucide-react'
import {
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { Link, type LinkProps } from 'react-router-dom'

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Something went wrong'
  return message.charAt(0).toUpperCase() + message.slice(1)
}

// ---- Buttons -------------------------------------------------------------------------

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-ink-900 text-white hover:bg-ink-800 disabled:bg-ink-300',
  accent: 'bg-sun-400 text-ink-950 hover:bg-sun-300 disabled:bg-sun-100 disabled:text-ink-400',
  secondary:
    'bg-white text-ink-900 ring-1 ring-inset ring-ink-200 hover:bg-ink-50 disabled:text-ink-300',
  ghost: 'text-ink-700 hover:bg-ink-100 disabled:text-ink-300',
  danger: 'bg-white text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-50',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
}

function buttonClass(variant: Variant, size: Size, className?: string) {
  return cx(
    'inline-flex shrink-0 items-center justify-center rounded-full font-semibold transition-colors disabled:cursor-not-allowed',
    variants[variant],
    sizes[size],
    className,
  )
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: LucideIcon
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon: Icon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : Icon && <Icon className="size-4" />}
      {children}
    </button>
  )
}

interface LinkButtonProps extends LinkProps {
  variant?: Variant
  size?: Size
  icon?: LucideIcon
}

export function LinkButton({ variant = 'primary', size = 'md', icon: Icon, className, children, ...rest }: LinkButtonProps) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {Icon && <Icon className="size-4" />}
      {children}
    </Link>
  )
}

// ---- Form controls -------------------------------------------------------------------

const control =
  'block w-full rounded-xl border-0 bg-white px-3.5 py-2.5 text-sm text-ink-900 ring-1 ring-inset ring-ink-200 placeholder:text-ink-400 focus:ring-2 focus:ring-sky-500 focus:outline-none disabled:bg-ink-50 disabled:text-ink-400'

interface FieldProps {
  label: string
  hint?: ReactNode
  error?: string
  children: (id: string) => ReactNode
  className?: string
}

export function Field({ label, hint, error, children, className }: FieldProps) {
  const id = useId()
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink-800">
        {label}
      </label>
      {children(id)}
      {error ? (
        <p className="mt-1.5 text-sm text-red-700">{error}</p>
      ) : (
        hint && <p className="mt-1.5 text-sm text-ink-500">{hint}</p>
      )}
    </div>
  )
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(control, className)} {...rest} />
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(control, 'min-h-28', className)} {...rest} />
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(control, 'pr-8', className)} {...rest} />
}

// ---- Display -------------------------------------------------------------------------

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx('rounded-2xl bg-white ring-1 ring-ink-100 shadow-sm shadow-ink-900/5', className)}>
      {children}
    </div>
  )
}

type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info' | 'accent'

const tones: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-700',
  good: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  warn: 'bg-amber-50 text-amber-800 ring-amber-200',
  bad: 'bg-red-50 text-red-800 ring-red-200',
  info: 'bg-sky-50 text-sky-800 ring-sky-200',
  accent: 'bg-sun-100 text-sun-700 ring-sun-200',
}

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ring-transparent',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

const alertStyles = {
  info: { icon: Info, cls: 'bg-sky-50 text-sky-900 ring-sky-200' },
  good: { icon: CheckCircle2, cls: 'bg-emerald-50 text-emerald-900 ring-emerald-200' },
  bad: { icon: AlertCircle, cls: 'bg-red-50 text-red-900 ring-red-200' },
  warn: { icon: AlertCircle, cls: 'bg-amber-50 text-amber-900 ring-amber-200' },
}

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: keyof typeof alertStyles
  title?: string
  children?: ReactNode
  className?: string
}) {
  const { icon: Icon, cls } = alertStyles[tone]
  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={cx('flex gap-3 rounded-xl p-4 text-sm ring-1 ring-inset', cls, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div>
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cx(title && 'mt-1', 'opacity-90')}>{children}</div>}
      </div>
    </div>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-500" role="status">
      <Loader2 className="size-5 animate-spin" />
      {label}…
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-ink-200 px-6 py-14 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-full bg-sun-100 text-sun-700">
        <Icon className="size-6" />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      {children && <p className="mt-1 max-w-md text-sm text-ink-500">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
  eyebrow?: ReactNode
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2 text-sm font-semibold text-ink-500">{eyebrow}</div>}
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {description && <p className="mt-2 text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function StatTile({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-ink-500">{label}</p>
      <p className="mt-2 font-display text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-500">{sub}</p>}
    </Card>
  )
}
