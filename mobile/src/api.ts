export interface TokenPair {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: 'bearer'
}
export interface User { id: string; full_name: string; role: string }
export interface TokenStorage {
  get(): Promise<TokenPair | null>
  set(value: TokenPair | null): Promise<void>
}
export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

/** Transport is independent of React Native so session behavior can be tested in Node. */
export function createClient(baseUrl: string, storage: TokenStorage, fetcher: typeof fetch = fetch) {
  let tokens: TokenPair | null = null
  let loaded = false
  let epoch = 0
  let writes = Promise.resolve()
  let refreshFlight: Promise<TokenPair | null> | null = null

  async function load() {
    if (!loaded) { tokens = await storage.get(); loaded = true }
    return tokens
  }
  async function save(value: TokenPair | null) {
    tokens = value
    loaded = true
    epoch++
    writes = writes.catch(() => undefined).then(() => storage.set(value))
    await writes
  }
  async function raw<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
    const headers = new Headers(init.headers)
    if (init.body) headers.set('Content-Type', 'application/json')
    if (token) headers.set('Authorization', `Bearer ${token}`)
    let response: Response
    try { response = await fetcher(baseUrl.replace(/\/$/, '') + path, { ...init, headers }) }
    catch { throw new ApiError(0, 'Cannot reach BiletFlow. Check your connection and API address.') }
    const body = await response.json().catch(() => ({})) as { detail?: string | { msg: string }[] }
    if (!response.ok) {
      const detail = typeof body.detail === 'string' ? body.detail : body.detail?.[0]?.msg
      throw new ApiError(response.status, detail ?? 'Request failed')
    }
    return body as T
  }
  async function refresh(): Promise<TokenPair | null> {
    refreshFlight ??= (async () => {
      const before = await load()
      if (!before) return null
      const startingEpoch = epoch
      try {
        const next = await raw<TokenPair>('/auth/refresh', {
          method: 'POST', body: JSON.stringify({ refresh_token: before.refresh_token }),
        })
        if (epoch !== startingEpoch) return null
        await save(next)
        return next
      } catch (error) {
        // Preserve the session during a network outage; revoke it only for rejected credentials.
        if (error instanceof ApiError && error.status === 401 && epoch === startingEpoch) await save(null)
        throw error
      }
    })().finally(() => { refreshFlight = null })
    return refreshFlight
  }
  async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const current = await load()
    try { return await raw<T>(path, init, current?.access_token) }
    catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401 || !current) throw error
      const next = await refresh()
      if (!next) throw error
      return raw<T>(path, init, next.access_token)
    }
  }
  async function logout() {
    const current = await load()
    await save(null)
    if (current) await raw('/auth/logout', {
      method: 'POST', body: JSON.stringify({ refresh_token: current.refresh_token }),
    }).catch(() => undefined)
  }
  async function login(email: string, password: string): Promise<User> {
    const pair = await raw<TokenPair>('/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    })
    await save(pair)
    const user = await api<User>('/users/me')
    if (user.role !== 'event_admin') {
      await logout()
      throw new ApiError(403, 'Use an Event Admin account assigned by your organizer.')
    }
    return user
  }
  async function restore(): Promise<User | null> {
    if (!await load()) return null
    try {
      const user = await api<User>('/users/me')
      if (user.role !== 'event_admin') { await logout(); return null }
      return user
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) { await save(null); return null }
      throw error
    }
  }
  return { api, login, logout, restore }
}
