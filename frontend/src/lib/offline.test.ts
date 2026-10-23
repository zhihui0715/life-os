import { onlineManager, QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearOfflineData, isQueued, keepOffline, sendOrQueue, setOfflineUser, startOutboxSync, syncOutbox } from './offline'

type Reply = number | 'network' | 'proxy-down'

/** fetch that answers each call with the next status in `replies` ('network' = no connection). */
function mockFetch(replies: Reply[]) {
  const fn = vi.fn().mockImplementation(async () => {
    const next = replies.shift() ?? 200
    if (next === 'network') throw new TypeError('Failed to fetch')
    if (next === 'proxy-down') return new Response('Bad Gateway', { status: 502 }) // not the API's JSON error format
    const body = next >= 400 ? { error: { code: next === 404 ? 'not_found' : 'internal_error', message: 'x' } } : { ok: true }
    return new Response(JSON.stringify(body), { status: next })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

const complete = (label = 'Essay') => ({ kind: 'task_complete' as const, method: 'POST' as const, path: '/tasks/t1/complete', label })
const outbox = () => JSON.parse(localStorage.getItem('lifeos.outbox.v1') ?? '[]')
const failed = () => JSON.parse(localStorage.getItem('lifeos.outbox-failed.v1') ?? '[]')

beforeEach(() => {
  clearOfflineData()
  setOfflineUser('user-1')
  onlineManager.setOnline(true)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('keepOffline: only the allowlisted data is saved on the device', () => {
  const qc = new QueryClient()
  const query = (key: unknown[]) => {
    qc.setQueryData(key, { x: 1 })
    return qc.getQueryCache().find({ queryKey: key, exact: true })!
  }
  it('keeps today/overdue tasks, habits, one day of calendar, categories and me', () => {
    expect(keepOffline(query(['me']))).toBe(true)
    expect(keepOffline(query(['tasks', 'list', { view: 'today' }, 10]))).toBe(true)
    expect(keepOffline(query(['tasks', 'list', { view: 'overdue' }, 5]))).toBe(true)
    expect(keepOffline(query(['habits', 'list', false]))).toBe(true)
    expect(keepOffline(query(['calendar', 'occurrences', { start: '2026-10-23T00:00:00+08:00', end: '2026-10-24T00:00:00+08:00' }]))).toBe(true)
    expect(keepOffline(query(['categories']))).toBe(true)
  })
  it('keeps the last good copy when a later refresh failed', async () => {
    const q = query(['habits', 'list', false])
    await qc.fetchQuery({ queryKey: ['habits', 'list', false], queryFn: () => Promise.reject(new Error('offline')), staleTime: 0 }).catch(() => {})
    expect(q.state.status).toBe('error')
    expect(keepOffline(q)).toBe(true)
  })

  it('never keeps the journal, insights, AI, searches or wide ranges', () => {
    expect(keepOffline(query(['journal', 'entry', '2026-10-23']))).toBe(false)
    expect(keepOffline(query(['insights', 'overview', 'week', 0]))).toBe(false)
    expect(keepOffline(query(['ai', 'status']))).toBe(false)
    expect(keepOffline(query(['tasks', 'list', { view: 'all' }, 50]))).toBe(false)
    expect(keepOffline(query(['tasks', 'list', { view: 'today', q: 'secret' }, 10]))).toBe(false)
    expect(keepOffline(query(['habits', 'detail', 'h1']))).toBe(false)
    expect(keepOffline(query(['calendar', 'occurrences', { start: '2026-10-01T00:00:00Z', end: '2026-11-01T00:00:00Z' }]))).toBe(false)
  })
})

describe('sendOrQueue', () => {
  it('sends straight away when online, with an Idempotency-Key', async () => {
    const fn = mockFetch([200])
    const result = await sendOrQueue(complete())
    expect(isQueued(result)).toBe(false)
    expect(fn.mock.calls[0][1].headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
    expect(outbox()).toEqual([])
  })

  it('queues when the connection fails, and when the browser says it is offline', async () => {
    mockFetch(['network'])
    expect(isQueued(await sendOrQueue(complete('A')))).toBe(true)
    onlineManager.setOnline(false)
    const fn = mockFetch([])
    expect(isQueued(await sendOrQueue(complete('B')))).toBe(true)
    expect(fn).not.toHaveBeenCalled()
    expect(outbox().map((i: { label: string }) => i.label)).toEqual(['A', 'B'])
  })

  it('does not jump the queue: a new action waits behind older unsent ones', async () => {
    mockFetch(['network'])
    await sendOrQueue(complete('A'))
    const fn = mockFetch([200])
    expect(isQueued(await sendOrQueue(complete('B')))).toBe(true)
    expect(fn).not.toHaveBeenCalled()
  })

  it('passes real refusals straight back to the caller', async () => {
    mockFetch([404])
    await expect(sendOrQueue(complete())).rejects.toMatchObject({ code: 'not_found' })
    expect(outbox()).toEqual([])
  })
})

describe('syncOutbox', () => {
  async function queue(...labels: string[]) {
    onlineManager.setOnline(false)
    for (const l of labels) await sendOrQueue(complete(l))
    onlineManager.setOnline(true)
  }

  it('replays in order, re-using each action’s Idempotency-Key', async () => {
    await queue('A', 'B')
    const keys = outbox().map((i: { id: string }) => i.id)
    const fn = mockFetch([200, 200])
    expect(await syncOutbox()).toBe(2)
    expect(fn.mock.calls.map((c) => c[1].headers['Idempotency-Key'])).toEqual(keys)
    expect(outbox()).toEqual([])
  })

  it('stops at a lost connection and keeps the rest for later', async () => {
    await queue('A', 'B', 'C')
    mockFetch([200, 'network'])
    expect(await syncOutbox()).toBe(1)
    expect(outbox().map((i: { label: string }) => i.label)).toEqual(['B', 'C'])
  })

  it('moves a refused action to "failed" and carries on', async () => {
    await queue('Deleted task', 'B')
    mockFetch([404, 200])
    expect(await syncOutbox()).toBe(1)
    expect(outbox()).toEqual([])
    expect(failed()).toMatchObject([{ code: 'not_found', item: { label: 'Deleted task' } }])
  })

  it('keeps waiting (never gives up) while a proxy says the API is down', async () => {
    await queue('A')
    for (let i = 0; i < 8; i++) {
      mockFetch(['proxy-down'])
      await syncOutbox()
    }
    expect(outbox()).toHaveLength(1)
    expect(failed()).toEqual([])
  })

  it('retries server errors a few times before giving up', async () => {
    await queue('A')
    for (let i = 0; i < 4; i++) {
      mockFetch([500])
      await syncOutbox()
      expect(outbox()).toHaveLength(1)
    }
    mockFetch([500])
    await syncOutbox()
    expect(outbox()).toEqual([])
    expect(failed()).toHaveLength(1)
  })

  it('never sends one account’s actions as another account', async () => {
    await queue('A')
    setOfflineUser('user-2')
    const fn = mockFetch([200])
    await syncOutbox()
    expect(fn).not.toHaveBeenCalled()
    expect(outbox()).toEqual([])
  })

  it('logout clears the offline copy and the outbox', async () => {
    await queue('A')
    localStorage.setItem('lifeos.offline-cache.v1', '{"personal":"data"}')
    clearOfflineData()
    expect(outbox()).toEqual([])
    expect(localStorage.getItem('lifeos.offline-cache.v1')).toBeNull()
  })

  it('sends waiting actions as soon as the app learns who is signed in', async () => {
    await queue('A')
    setOfflineUser(null) // app start: the account isn't known yet
    const stop = startOutboxSync(new QueryClient())
    const fn = mockFetch([200])
    await Promise.resolve()
    expect(fn).not.toHaveBeenCalled()
    setOfflineUser('user-1')
    await vi.waitFor(() => expect(outbox()).toEqual([]))
    expect(fn).toHaveBeenCalledTimes(1)
    stop()
  })
})
