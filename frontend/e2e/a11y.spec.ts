import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { apiCall, MAIN_PAGES, today } from './helpers'

/**
 * Accessibility (axe-core, WCAG 2.1 A/AA rules) on every main screen, in both themes. The Stage 9 bar: no critical or
 * serious issues. Lesser findings are printed so they can be looked at, but don't fail the run.
 */
// Check screens with content in them (lists, meters, charts), not just empty states.
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: 'e2e/.auth/user.json', baseURL: 'http://localhost:4174' })
  const r = context.request
  const d = today()
  const goal = await apiCall<{ id: string }>(r, 'POST', '/goals', { title: 'Learn Spanish', progress_mode: 'manual', manual_progress: 40 })
  await apiCall(r, 'POST', '/tasks', { title: 'Plan the week', status: 'todo', priority: 1, due_date: d, goal_id: goal.id, tags: ['planning'] })
  await apiCall(r, 'POST', '/habits', { name: 'Read', start_date: d })
  await apiCall(r, 'POST', '/calendar/events', { title: 'Team call', starts_at: `${d}T22:00:00+08:00`, ends_at: `${d}T22:30:00+08:00` })
  await apiCall(r, 'POST', '/activity-logs', { title: 'Practice', duration_minutes: 30 })
  await apiCall(r, 'PUT', `/journal/${d}`, { mood: 4, energy: 3, body: 'Fine day' })
  await context.close()
})

for (const theme of ['light', 'dark'] as const) {
  for (const path of MAIN_PAGES) {
    test(`a11y ${theme} ${path}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.goto(path)
      await expect(page.locator('main h1').first()).toBeVisible()
      await expect(page.getByRole('button', { name: 'Sign in' }), 'still signed in').toHaveCount(0)
      await page.waitForLoadState('networkidle')
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      const blocking = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
      const minor = results.violations.filter((v) => !blocking.includes(v))
      if (minor.length) console.log(`${theme} ${path} minor:`, minor.map((v) => `${v.id} (${v.nodes.length})`).join(', '))
      expect(
        blocking.map((v) => ({ rule: v.id, impact: v.impact, help: v.help, where: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) })),
      ).toEqual([])
    })
  }
}
