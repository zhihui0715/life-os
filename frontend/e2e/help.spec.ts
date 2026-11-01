import { expect, test } from '@playwright/test'

import { failOnPageErrors } from './helpers'

// A first visit on a device starts the walkthrough; finishing it is remembered.
test('walkthrough runs once and can be replayed', async ({ page }) => {
  const check = failOnPageErrors(page)
  await page.goto('/')
  await page.evaluate(() => localStorage.removeItem('lifeos.tourSeen'))
  await page.reload()

  const tour = page.getByRole('dialog', { name: 'Welcome to Life OS' })
  await expect(tour).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('dialog', { name: 'Add anything' })).toBeVisible()
  await page.getByRole('button', { name: 'Skip' }).click()
  await expect(page.getByRole('dialog', { name: 'Add anything' })).toHaveCount(0)

  await page.reload()
  await page.waitForTimeout(1500)
  await expect(page.getByRole('dialog', { name: 'Welcome to Life OS' }), 'not shown again').toHaveCount(0)

  await page.goto('/settings')
  await page.getByRole('button', { name: 'Take the tour' }).click()
  await expect(page.getByRole('dialog', { name: 'Welcome to Life OS' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Welcome to Life OS' })).toHaveCount(0)
  check()
})
