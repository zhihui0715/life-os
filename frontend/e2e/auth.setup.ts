import { expect, test as setup } from '@playwright/test'

import { E2E_USER } from './helpers'

// Sign in once through the real login form; every other test reuses this session (and the login rate limit is
// never hit).
setup('sign in', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Email').fill(E2E_USER.email)
  await page.getByLabel('Password').fill(E2E_USER.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible()
  await page.context().storageState({ path: 'e2e/.auth/user.json' })
})

setup('wrong password is refused', async ({ browser }) => {
  const page = await browser.newPage()
  await page.goto('/')
  await page.getByLabel('Email').fill(E2E_USER.email)
  await page.getByLabel('Password').fill('not-the-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Email or password is incorrect.')).toBeVisible()
  await page.close()
})
