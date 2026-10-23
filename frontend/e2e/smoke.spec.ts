import { expect, test } from '@playwright/test'

import { failOnPageErrors, MAIN_PAGES } from './helpers'

// Every main screen loads and shows its heading, on desktop and on a phone, without crashing.
for (const path of MAIN_PAGES) {
  test(`page ${path} loads`, async ({ page }) => {
    const check = failOnPageErrors(page)
    await page.goto(path)
    await expect(page.locator('main h1').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in' }), 'still signed in').toHaveCount(0)
    await expect(page.getByText('Something went wrong')).toHaveCount(0)
    check()
  })
}

test('switching to Chinese changes the interface', async ({ page }) => {
  await page.goto('/settings')
  await page.getByLabel('Language').selectOption('zh-CN')
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible()
  await page.getByLabel('语言').selectOption('en')
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
})
