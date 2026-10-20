import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, ApiError, setCsrfToken } from './api'

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue(new Response(body === undefined ? null : JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
  setCsrfToken(null)
})

describe('api client', () => {
  it('sends the CSRF token on writes but not reads', async () => {
    setCsrfToken('tok')
    const fn = mockFetch(200, { ok: true })
    await api('/tasks')
    await api('/tasks', { method: 'POST', body: { title: 'x' } })
    expect(fn.mock.calls[0][1].headers['X-CSRF-Token']).toBeUndefined()
    expect(fn.mock.calls[1][1].headers['X-CSRF-Token']).toBe('tok')
    expect(fn.mock.calls[1][0]).toBe('/api/v1/tasks')
  })

  it('turns error responses into ApiError with code and fields', async () => {
    mockFetch(422, { error: { code: 'validation_error', message: 'bad', fields: { title: [{ type: 'missing', message: 'x' }] } } })
    const err = (await api('/tasks', { method: 'POST', body: {} }).catch((e) => e)) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe('validation_error')
    expect(err.fields?.title[0].type).toBe('missing')
  })

  it('reports network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    const err = (await api('/tasks').catch((e) => e)) as ApiError
    expect(err.code).toBe('network_error')
  })

  it('returns undefined for 204', async () => {
    mockFetch(204, undefined)
    expect(await api('/tasks/1', { method: 'DELETE' })).toBeUndefined()
  })
})
