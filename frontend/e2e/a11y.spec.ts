import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { apiCall, MAIN_PAGES, today } from './helpers'

/**
 * Accessibility (axe-core, WCAG 2.1 A/AA rules) on every main screen, in light, dark and Academia (a dark scene and a
 * light one). The Stage 9 bar: no critical or serious issues. Lesser findings are printed so they can be looked at,
 * but don't fail the run.
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

const ACADEMIA = { academia: 'library', 'academia-light': 'parchment' } as const

for (const theme of ['light', 'dark', 'academia', 'academia-light'] as const) {
  for (const path of MAIN_PAGES) {
    test(`a11y ${theme} ${path}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme === 'light' ? 'light' : 'dark' })
      if (theme in ACADEMIA) {
        // Academia for this page only: the account the page loads says so (the shared test user keeps "system")
        const background = ACADEMIA[theme as keyof typeof ACADEMIA]
        // The signed-in state can carry the offline copy of the account, fresh for a minute after sign-in; drop it so
        // the page always asks the server (and gets the answer below) however soon after sign-in this test runs
        await page.addInitScript(() => {
          const key = 'lifeos.offline-cache.v1'
          const cache = JSON.parse(localStorage.getItem(key) ?? 'null')
          if (!cache?.clientState) return
          cache.clientState.queries = cache.clientState.queries.filter((q: { queryKey: unknown[] }) => q.queryKey[0] !== 'me')
          localStorage.setItem(key, JSON.stringify(cache))
        })
        await page.route('**/api/v1/auth/me', async (route) => {
          const response = await route.fetch()
          const me = await response.json()
          await route.fulfill({ response, json: { ...me, settings: { ...me.settings, theme: 'academia', background } } })
        })
      }
      await page.goto(path)
      await expect(page.locator('main h1').first()).toBeVisible()
      await expect(page.getByRole('button', { name: 'Sign in' }), 'still signed in').toHaveCount(0)
      if (theme in ACADEMIA) await expect(page.locator('html')).toHaveAttribute('data-look', 'academia')
      await page.waitForLoadState('networkidle')
      // Measure contrast at rest: let entrance animations (fades, rises) finish first; looping ones are ignored.
      await page.waitForFunction(() =>
        document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity),
      )
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
