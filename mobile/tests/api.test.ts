import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createClient, ApiError, type TokenPair } from '../src/api.ts'
const pair = (access: string): TokenPair => ({ access_token: access, refresh_token: 'refresh-' + access, expires_in: 60, token_type: 'bearer' })
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
function memory(initial: TokenPair | null) {
  let value = initial
  return { get: async () => value, set: async (next: TokenPair | null) => { value = next } }
}

test('concurrent expired requests share one refresh and retain the rotated session', async () => {
  const storage = memory(pair('old'))
  let refreshes = 0
  const fetcher: typeof fetch = async (url, init) => {
    if (String(url).endsWith('/auth/refresh')) { refreshes++; await Promise.resolve(); return response(pair('new')) }
    return new Headers(init?.headers).get('Authorization') === 'Bearer new'
      ? response({ ok: true }) : response({ detail: 'expired' }, 401)
  }
  const client = createClient('http://test', storage, fetcher)
  await Promise.all([client.api('/one'), client.api('/two'), client.api('/three')])
  assert.equal(refreshes, 1)
  assert.equal((await storage.get())?.refresh_token, 'refresh-new')
})

test('rejected refresh clears the saved session', async () => {
  const storage = memory(pair('old'))
  const client = createClient('http://test', storage, async () => response({ detail: 'expired' }, 401))
  await assert.rejects(client.api('/users/me'), (error: unknown) => error instanceof ApiError && error.status === 401)
  assert.equal(await storage.get(), null)
})

test('network failures preserve the saved session for a later retry', async () => {
  const storage = memory(pair('old'))
  const client = createClient('http://test', storage, async () => { throw new Error('offline') })
  await assert.rejects(client.restore(), (error: unknown) => error instanceof ApiError && error.status === 0)
  assert.equal((await storage.get())?.access_token, 'old')
})

test('attendee login is rejected and its newly issued session is revoked', async () => {
  const storage = memory(null)
  let loggedOut = false
  const fetcher: typeof fetch = async (url) => {
    if (String(url).endsWith('/auth/login')) return response(pair('new'))
    if (String(url).endsWith('/auth/logout')) { loggedOut = true; return response({ detail: 'signed out' }) }
    return response({ id: 'attendee', role: 'attendee', full_name: 'Attendee' })
  }
  const client = createClient('http://test', storage, fetcher)
  await assert.rejects(client.login('attendee@example.test', 'password'), (error: unknown) => error instanceof ApiError && error.status === 403)
  assert.equal(await storage.get(), null)
  assert.equal(loggedOut, true)
})

test('an Event Admin session can be restored after an app restart', async () => {
  const storage = memory(pair('valid'))
  const client = createClient('http://test', storage, async () => response({ id: 'staff', role: 'event_admin', full_name: 'Staff' }))
  assert.equal((await client.restore())?.id, 'staff')
})
