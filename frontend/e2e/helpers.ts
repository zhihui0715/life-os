import { expect, type APIRequestContext, type Page } from '@playwright/test'

export { E2E_USER } from './user'

export const MAIN_PAGES = ['/', '/tasks', '/calendar', '/goals', '/habits', '/focus', '/insights', '/journal', '/assistant', '/settings']

/** Today in the test account's timezone (Asia/Kuala_Lumpur, the default). */
export function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date())
}

/** Set up data through the API (faster and steadier than clicking), as the signed-in test user. */
export async function apiCall<T = unknown>(request: APIRequestContext, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, data?: unknown) {
  const me = await (await request.get('/api/v1/auth/me')).json()
  const res = await request.fetch(`/api/v1${path}`, { method, data, headers: { 'X-CSRF-Token': me.csrf_token } })
  expect(res.ok(), `${method} ${path} → ${res.status()} ${await res.text()}`).toBeTruthy()
  return (res.status() === 204 ? undefined : await res.json()) as T
}

export async function apiGet<T = unknown>(request: APIRequestContext, path: string) {
  const res = await request.get(`/api/v1${path}`)
  expect(res.ok()).toBeTruthy()
  return (await res.json()) as T
}

/** Wait until the service worker is fully activated (not just installed), so the next load is served by it. */
export async function waitForServiceWorker(page: Page) {
  await page.waitForFunction(async () => (await navigator.serviceWorker.ready).active?.state === 'activated')
}

/** Fail the test on any uncaught page error (a crashed component, a broken import…). */
export function failOnPageErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  return () => expect(errors, 'uncaught errors in the page').toEqual([])
}
