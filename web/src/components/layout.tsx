import { LogOut, Menu, Ticket, UserRound, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { roleLabels, useAuth } from '@/lib/auth'
import type { UserRole } from '@/lib/types'
import { Alert, cx, LinkButton, Spinner } from './ui'

export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={cx('flex items-center gap-2', className)}>
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#14213d" />
        <path d="M9 8h8.5a5 5 0 0 1 2.9 9.1A5 5 0 0 1 18 26H9z" fill="#f4b41a" />
        <circle cx="9" cy="17" r="2.5" fill="#14213d" />
      </svg>
      <span className="font-display text-lg font-bold tracking-tight">BiletFlow</span>
    </Link>
  )
}

interface NavItem {
  to: string
  label: string
  roles?: UserRole[]
  auth?: boolean
}

const NAV: NavItem[] = [
  { to: '/', label: 'Explore' },
  { to: '/tickets', label: 'My tickets', auth: true },
  { to: '/organizer', label: 'Dashboard', roles: ['organizer'] },
  { to: '/organizer/events', label: 'My events', roles: ['organizer'] },
  { to: '/admin', label: 'Admin', roles: ['platform_admin'] },
]

function navClass({ isActive }: { isActive: boolean }) {
  return cx(
    'rounded-full px-3.5 py-2 text-sm font-semibold transition-colors',
    isActive ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
  )
}

export function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // The mobile menu remembers the path it was opened on, so navigating closes it.
  const [menuOpenedOn, setMenuOpenedOn] = useState<string | null>(null)
  const menuOpen = menuOpenedOn === location.pathname

  const items = NAV.filter(
    (item) => (!item.auth || user) && (!item.roles || (user && item.roles.includes(user.role))),
  )

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="no-print bg-ink-950 px-4 py-1.5 text-center text-xs text-ink-200">
        Academic demo (CSCI 361) — all payments are <strong className="text-sun-300">simulated</strong>. No real money moves.
      </div>
      <header className="no-print sticky top-0 z-30 border-b border-ink-100 bg-paper/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
          <Logo />
          <nav className="hidden flex-1 items-center gap-1 md:flex">
            {items.map((item) => (
              <NavLink key={item.to} to={item.to} end className={navClass}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto hidden items-center gap-2 md:flex">
            {user ? (
              <>
                <Link
                  to="/account"
                  className="flex items-center gap-2 rounded-full py-1 pr-3 pl-1 hover:bg-ink-100"
                >
                  <span className="grid size-8 place-items-center rounded-full bg-sun-200 text-sm font-bold text-ink-900">
                    {user.full_name.charAt(0).toUpperCase()}
                  </span>
                  <span className="text-left leading-tight">
                    <span className="block max-w-36 truncate text-sm font-semibold">{user.full_name}</span>
                    <span className="block text-xs text-ink-500">{roleLabels[user.role]}</span>
                  </span>
                </Link>
                <button
                  onClick={handleLogout}
                  className="grid size-9 place-items-center rounded-full text-ink-500 hover:bg-ink-100 hover:text-ink-900"
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <LogOut className="size-4" />
                </button>
              </>
            ) : (
              <>
                <LinkButton to="/login" variant="ghost">
                  Sign in
                </LinkButton>
                <LinkButton to="/register" variant="primary">
                  Create account
                </LinkButton>
              </>
            )}
          </div>
          <button
            className="ml-auto grid size-10 place-items-center rounded-full hover:bg-ink-100 md:hidden"
            onClick={() => setMenuOpenedOn(menuOpen ? null : location.pathname)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
        {menuOpen && (
          <nav className="flex flex-col gap-1 border-t border-ink-100 px-4 py-3 md:hidden">
            {items.map((item) => (
              <NavLink key={item.to} to={item.to} end className={navClass}>
                {item.label}
              </NavLink>
            ))}
            <div className="my-2 border-t border-ink-100" />
            {user ? (
              <>
                <NavLink to="/account" className={navClass}>
                  <UserRound className="mr-2 inline size-4" />
                  {user.full_name}
                </NavLink>
                <button onClick={handleLogout} className={navClass({ isActive: false }) + ' text-left'}>
                  <LogOut className="mr-2 inline size-4" />
                  Sign out
                </button>
              </>
            ) : (
              <>
                <NavLink to="/login" className={navClass}>
                  Sign in
                </NavLink>
                <NavLink to="/register" className={navClass}>
                  Create account
                </NavLink>
              </>
            )}
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:py-12">
        <Outlet />
      </main>

      <footer className="no-print border-t border-ink-100">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-ink-500 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2">
            <Ticket className="size-4" /> BiletFlow — event ticketing for Kazakhstan
          </p>
          <p>Times shown in Almaty time (UTC+5) · Prices in KZT</p>
        </div>
      </footer>
    </div>
  )
}

/** Wraps routes that need a signed-in user, optionally restricted to certain roles. */
export function RequireAuth({ roles, children }: { roles?: UserRole[]; children: ReactNode }) {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <Spinner />
  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  }
  if (roles && !roles.includes(user.role)) {
    return (
      <Alert tone="warn" title="You don't have access to this page">
        This area is for {roles.map((r) => roleLabels[r]).join(' / ')} accounts. You are signed in as{' '}
        {roleLabels[user.role]}.
      </Alert>
    )
  }
  return <>{children}</>
}

export function MockNotice({ children }: { children?: ReactNode }) {
  return (
    <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-3 py-1 text-xs text-ink-600">
      <span className="size-1.5 rounded-full bg-sun-500" />
      {children ?? 'Preview data — this backend module is not built yet'}
    </p>
  )
}
