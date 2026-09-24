import type { TokenPair } from './types'

const API_URL = import.meta.env.VITE_API_URL ?? '/api/v1'
const TOKENS_KEY = 'bf.tokens'

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export const tokenStore = {
  get(): TokenPair | null {
    try {
      const raw = localStorage.getItem(TOKENS_KEY)
      return raw ? (JSON.parse(raw) as TokenPair) : null
    } catch {
      return null
    }
  },
  set(tokens: TokenPair | null) {
    if (tokens) localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens))
    else localStorage.removeItem(TOKENS_KEY)
  },
}

/** FastAPI errors carry `detail` as a string, or as a list of validation errors. */
function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { loc?: unknown[]; msg?: string }
      const field = first.loc?.at(-1)
      return field ? `${String(field)}: ${first.msg}` : (first.msg ?? fallback)
    }
  }
  return fallback
}

async function rawRequest<T>(path: string, init: RequestInit, token?: string): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers })
  } catch {
    throw new ApiError(0, 'Cannot reach the BiletFlow API. Is the backend running?')
  }

  const body: unknown = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    throw new ApiError(response.status, errorMessage(body, response.statusText))
  }
  return body as T
}

// Refresh tokens are single-use (rotated on every call), so concurrent 401s must share one
// refresh request instead of racing each other.
let refreshInFlight: Promise<TokenPair | null> | null = null

function refreshTokens(): Promise<TokenPair | null> {
  refreshInFlight ??= (async () => {
    const current = tokenStore.get()
    if (!current) return null
    try {
      const next = await rawRequest<TokenPair>('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: current.refresh_token }),
      })
      tokenStore.set(next)
      return next
    } catch {
      tokenStore.set(null)
      return null
    }
  })().finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const tokens = tokenStore.get()
  try {
    return await rawRequest<T>(path, init, tokens?.access_token)
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401 || !tokens) throw error
    const refreshed = await refreshTokens()
    if (!refreshed) throw error
    return rawRequest<T>(path, init, refreshed.access_token)
  }
}

export const post = <T>(path: string, body: unknown) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(body) })
export const put = <T>(path: string, body: unknown) =>
  api<T>(path, { method: 'PUT', body: JSON.stringify(body) })
export const patch = <T>(path: string, body: unknown) =>
  api<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
