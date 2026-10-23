/**
 * The only place the frontend talks to the backend. Every request goes to /api/v1 on the same origin,
 * sends the session cookie, and (for writes) the CSRF token. Errors become ApiError with the server's code.
 */

export type FieldErrors = Record<string, { type: string; message: string }[]>

export class ApiError extends Error {
  status: number
  code: string
  fields?: FieldErrors
  details?: Record<string, unknown>

  constructor(status: number, code: string, message: string, fields?: FieldErrors, details?: Record<string, unknown>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields
    this.details = details
  }
}

let csrfToken: string | null = null
let reachabilityListener: ((reachable: boolean) => void) | null = null

/** Told after every request whether the server answered at all (used to detect "offline" — lib/offline.ts). */
export function onServerReachability(listener: ((reachable: boolean) => void) | null) {
  reachabilityListener = listener
}

export function setCsrfToken(token: string | null) {
  csrfToken = token
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export async function api<T>(path: string, options: { method?: Method; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
  const method = options.method ?? 'GET'
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken
  // Lets the server recognise a retried write and answer it without doing the work twice (see lib/offline.ts).
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey

  let res: Response
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
  } catch {
    reachabilityListener?.(false)
    throw new ApiError(0, 'network_error', 'Network request failed')
  }

  if (res.status === 204) {
    reachabilityListener?.(true)
    return undefined as T
  }
  const data = await res.json().catch(() => null)
  // The API always answers errors in its own JSON format. A 5xx without it came from whatever sits in front of
  // the API (a proxy, the hosting provider) because the API itself is down or restarting: as good as no answer.
  const unreachable = res.status >= 500 && !data?.error
  reachabilityListener?.(!unreachable)
  if (unreachable) throw new ApiError(0, 'network_error', 'Server unreachable')
  if (!res.ok) {
    const e = data?.error
    throw new ApiError(res.status, e?.code ?? 'internal_error', e?.message ?? res.statusText, e?.fields, e)
  }
  return data as T
}
