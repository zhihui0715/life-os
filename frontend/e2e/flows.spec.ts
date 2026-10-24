import { expect, test } from '@playwright/test'

import { apiCall, today } from './helpers'

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

const ALL_DAY = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['00:00', '23:59']]]))

test('plan tomorrow: pick a task, fit it into the day, add it to the calendar', async ({ page, request }) => {
  await apiCall(request, 'PATCH', '/settings', { working_hours: ALL_DAY })
  const title = `Plan me ${Date.now()}`
  await apiCall(request, 'POST', '/tasks', { title, priority: 1, estimate_minutes: 30 })
  await page.goto('/plan')
  await page.getByRole('button', { name: 'Tomorrow' }).click()
  const pick = page.getByRole('checkbox', { name: new RegExp(title) })
  await expect(pick).toBeVisible()
  if ((await pick.getAttribute('aria-checked')) !== 'true') await pick.click()
  await page.getByRole('button', { name: 'Fit into my day' }).click()
  await expect(page.getByRole('heading', { name: 'Your day' })).toBeVisible()
  await page.getByRole('button', { name: /Add \d+ blocks? to calendar/ }).click()
  await expect(page.getByRole('heading', { name: 'Your day is planned' })).toBeVisible()
})

test('weekly review: step through and set the top 3 for next week', async ({ page }) => {
  await page.goto('/plan?tab=week')
  const edit = page.getByRole('button', { name: 'Edit review' })
  const next = page.getByRole('button', { name: 'Next', exact: true })
  await expect(edit.or(next)).toBeVisible()
  if (await edit.isVisible()) await edit.click() // the other browser project already reviewed this week
  for (let i = 0; i < 3; i++) await next.click()
  await page.getByLabel('Priority 1').fill('Ship the release')
  await page.getByRole('button', { name: 'Finish review' }).click()
  await expect(page.getByRole('heading', { name: 'Week reviewed' })).toBeVisible()
  await expect(page.getByText('Ship the release')).toBeVisible()
})

test('the + button creates a task with a date, priority and tag', async ({ page, request }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Quick add' }).filter({ visible: true }).first().click()
  const task = page.getByRole('menuitem', { name: 'Task' })
  if (await task.isVisible()) await task.click() // phones: the + opens a menu first
  const sheet = page.getByRole('dialog', { name: 'New task' })
  const title = `Sheet task ${Date.now()}`
  await sheet.getByPlaceholder('What needs doing?').fill(`${title} #errands`)
  await sheet.getByRole('button', { name: 'Tomorrow' }).click()
  await sheet.getByRole('button', { name: 'High' }).click()
  await sheet.getByRole('button', { name: 'Add task' }).click()
  await expect(page.getByText('Task added')).toBeVisible()
  const found = await (await request.get(`/api/v1/tasks?view=all&q=${encodeURIComponent(title)}`)).json()
  expect(found.items[0]).toMatchObject({ title, priority: 2, tags: ['errands'], status: 'todo' })
})
