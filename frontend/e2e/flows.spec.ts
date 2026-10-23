import { expect, test } from '@playwright/test'

import { apiCall, apiGet, today } from './helpers'

test('capture a task, complete it, find it in Completed', async ({ page }) => {
  await page.goto('/tasks')
  const input = page.getByLabel('New task title').first()
  await input.fill('Buy stamps')
  await input.press('Enter')
  await expect(page.getByText('Task added')).toBeVisible()

  await page.getByRole('checkbox', { name: 'Mark “Buy stamps” complete' }).click()
  await expect(page.getByText('Task completed')).toBeVisible()

  await page.goto('/tasks?view=completed')
  await expect(page.getByText('Buy stamps')).toBeVisible()
})

test('check in a habit from Home and see the streak', async ({ page, request }) => {
  await apiCall(request, 'POST', '/habits', { name: 'Stretch', start_date: today() })
  await page.goto('/')
  await page.getByRole('checkbox', { name: 'Mark “Stretch” done today' }).click()
  await expect(page.getByText('Checked in')).toBeVisible()
  await expect(page.getByRole('checkbox', { name: "Undo today's check-in for “Stretch”" })).toHaveAttribute('aria-checked', 'true')
})

test('write a journal entry that survives a reload', async ({ page }) => {
  await page.goto('/journal')
  await page.getByLabel('Notes').fill('A calm day. Finished the report.')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Journal saved')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Notes')).toHaveValue('A calm day. Finished the report.')
})

test('schedule an event and see it on the calendar', async ({ page, request }) => {
  const d = today()
  await apiCall(request, 'POST', '/calendar/events', { title: 'Dentist', starts_at: `${d}T23:00:00+08:00`, ends_at: `${d}T23:30:00+08:00` })
  await page.goto('/')
  await expect(page.getByText('Dentist')).toBeVisible()
})

test('download a backup, then check it restores (preview only)', async ({ page }) => {
  await page.goto('/settings')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download backup' }).click()])
  expect(download.suggestedFilename()).toMatch(/^life-os-backup-\d{4}-\d{2}-\d{2}\.json$/)
  const file = await download.path()

  await page.locator('input[type=file]').setInputFiles(file)
  const dialog = page.getByRole('dialog', { name: 'Check before restoring' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('The file is complete and undamaged')).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
})

test('AI is hidden and explained when no key is configured', async ({ page, request }) => {
  const status = await apiGet<{ configured: boolean }>(request, '/ai/status')
  test.skip(status.configured, 'this server has an AI key')
  await page.goto('/assistant')
  await expect(page.getByText("AI isn't set up")).toBeVisible()
})
