import AxeBuilder from '@axe-core/playwright'
import { expect, test as setup } from '@playwright/test'

import { E2E_USER } from './helpers'

// Sign in once through the real login form; every other test reuses this session (and the login rate limit is
// never hit).
setup('sign in', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(E2E_USER.email)
  await page.getByLabel('Password', { exact: true }).fill(E2E_USER.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible()
  await page.context().storageState({ path: 'e2e/.auth/user.json' })
})

setup('wrong password is refused', async ({ browser }) => {
  const page = await browser.newPage()
  await page.goto('/login')
  await page.getByLabel('Email').fill(E2E_USER.email)
  await page.getByLabel('Password', { exact: true }).fill('not-the-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Email or password is incorrect.')).toBeVisible()
  await page.close()
})

// Signed out, the front door is the landing page; its "Sign in" leads to the form. No serious accessibility issues.
setup('landing page leads to sign in', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('notebook')
  // read it the way a visitor does: scroll through, so every section has risen into view, then check
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 300) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 40))
    }
  })
  await page.waitForTimeout(1000)
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => v.id)).toEqual([])
  await page.getByRole('button', { name: 'Sign in' }).first().click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
})
