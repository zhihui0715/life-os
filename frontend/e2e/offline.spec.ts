import { expect, test } from '@playwright/test'

import { apiCall, apiGet, today, waitForServiceWorker } from './helpers'

interface Task {
  id: string
  title: string
  status: string
}

/**
 * The airplane-mode test from the Stage 8 plan, with the browser's network really switched off: the app opens from
 * the service worker, shows today's saved data, accepts the three offline actions, and sends each exactly once when
 * the connection returns.
 */
test('offline: open, read today, act, reconnect, sync once', async ({ page, context, request }) => {
  const task = await apiCall<Task>(request, 'POST', '/tasks', { title: 'Pay rent', status: 'todo', due_date: today() })
  await apiCall(request, 'POST', '/habits', { name: 'Walk', start_date: today() })

  // Online visit: installs the service worker and saves today's data on the device.
  await page.goto('/')
  await expect(page.getByText('Pay rent')).toBeVisible()
  await expect(page.getByText('Walk')).toBeVisible()
  await waitForServiceWorker(page)
  await page.waitForTimeout(1500) // the offline copy is written at most once a second

  // Airplane mode, then reopen the app.
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByText("You're offline")).toBeVisible()
  await expect(page.getByText('Pay rent')).toBeVisible()
  await expect(page.getByText('Not available offline.').first()).toBeVisible() // e.g. goals: honest, not "empty"

  await page.getByRole('checkbox', { name: 'Mark “Pay rent” complete' }).click()
  await page.getByRole('checkbox', { name: 'Mark “Walk” done today' }).click()
  const quick = page.getByLabel('New task title').first()
  await quick.fill('Call the bank')
  await quick.press('Enter')
  await expect(page.getByText('3 changes waiting to sync')).toBeVisible()

  // Still offline after closing and reopening the app: the changes are kept.
  await page.reload()
  await expect(page.getByText('3 changes waiting to sync')).toBeVisible()

  // Back online: everything is sent, once.
  await context.setOffline(false)
  await expect(page.getByText(/changes? waiting to sync|Syncing/)).toHaveCount(0, { timeout: 30_000 })
  await expect(page.getByText("You're offline")).toHaveCount(0)

  const done = await apiGet<{ items: Task[] }>(request, '/tasks?view=completed&limit=100')
  expect(done.items.find((t) => t.id === task.id)?.status).toBe('done')
  const all = await apiGet<{ items: Task[] }>(request, '/tasks?view=all&limit=100')
  expect(all.items.filter((t) => t.title === 'Call the bank')).toHaveLength(1)
  const habits = await apiGet<{ items: { name: string; today: { state: string } | null }[] }>(request, '/habits')
  expect(habits.items.find((h) => h.name === 'Walk')?.today?.state).toBe('done')
})

test('offline: the journal is never stored on the device', async ({ page }) => {
  await page.goto('/journal')
  await page.getByLabel('Notes').fill('Private words')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Journal saved')).toBeVisible()
  await page.goto('/')
  await page.waitForTimeout(1500)
  const stored = await page.evaluate(() => Object.keys(localStorage).map((k) => localStorage.getItem(k)).join('\n'))
  expect(stored).not.toContain('Private words')
})

test('logout removes the offline copy', async ({ browser }) => {
  // Own, signed-out browser (not the shared test session), so logging out doesn't sign the other tests out.
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await context.newPage()
  const { E2E_USER } = await import('./helpers')
  await page.goto('/')
  await page.getByLabel('Email').fill(E2E_USER.email)
  await page.getByLabel('Password').fill(E2E_USER.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible()
  await page.waitForTimeout(1500)
  expect(await page.evaluate(() => localStorage.getItem('lifeos.offline-cache.v1'))).not.toBeNull()
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  await page.waitForTimeout(1500)
  const cache = await page.evaluate(() => localStorage.getItem('lifeos.offline-cache.v1') ?? '')
  expect(cache).not.toContain(E2E_USER.email)
  await context.close()
})
