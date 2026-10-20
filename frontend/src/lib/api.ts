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

export function setCsrfToken(token: string | null) {
  csrfToken = token
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export async function api<T>(path: string, options: { method?: Method; body?: unknown } = {}): Promise<T> {
  const method = options.method ?? 'GET'
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken

  let res: Response
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'network_error', 'Network request failed')
  }

  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const e = data?.error
    throw new ApiError(res.status, e?.code ?? 'internal_error', e?.message ?? res.statusText, e?.fields, e)
  }
  return data as T
}
