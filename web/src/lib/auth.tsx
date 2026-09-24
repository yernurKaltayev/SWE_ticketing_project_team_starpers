import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { api, ApiError, post, tokenStore } from './api'
import type { TokenPair, User, UserRole } from './types'

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<User>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)
const ME_KEY = ['me'] as const

async function fetchMe(): Promise<User | null> {
  if (!tokenStore.get()) return null
  try {
    return await api<User>('/users/me')
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      tokenStore.set(null)
      return null
    }
    throw error
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const { data: user, isLoading } = useQuery({
    queryKey: ME_KEY,
    queryFn: fetchMe,
    staleTime: 5 * 60_000,
    retry: false,
  })

  const login = useCallback(
    async (email: string, password: string) => {
      const tokens = await post<TokenPair>('/auth/login', { email, password })
      tokenStore.set(tokens)
      const me = await api<User>('/users/me')
      queryClient.setQueryData(ME_KEY, me)
      return me
    },
    [queryClient],
  )

  const logout = useCallback(async () => {
    const tokens = tokenStore.get()
    tokenStore.set(null)
    queryClient.setQueryData(ME_KEY, null)
    if (tokens) {
      await post('/auth/logout', { refresh_token: tokens.refresh_token }).catch(() => undefined)
    }
  }, [queryClient])

  const refreshUser = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ME_KEY })
  }, [queryClient])

  const value = useMemo(
    () => ({ user: user ?? null, isLoading, login, logout, refreshUser }),
    [user, isLoading, login, logout, refreshUser],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}

export const roleLabels: Record<UserRole, string> = {
  attendee: 'Attendee',
  organizer: 'Organizer',
  event_admin: 'Event Admin',
  platform_admin: 'Platform Admin',
}
