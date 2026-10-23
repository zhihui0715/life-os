import { expect, test } from '@playwright/test'

import { waitForServiceWorker } from './helpers'

/**
 * What browsers require before they offer "Install": a valid manifest with 192 px and 512 px icons (and a maskable one
 * for Android), a registered service worker that handles the page, and the iOS home-screen tags. Actually tapping
 * Install on a phone has to be checked by hand once the app is on HTTPS (docs/04-deployment.md).
 */
test('installable: manifest, icons, service worker, iOS tags', async ({ page, request }) => {
  await page.goto('/')
  const href = await page.locator('link[rel=manifest]').getAttribute('href')
  const manifest = await (await request.get(href!)).json()
  expect(manifest).toMatchObject({ name: 'Life OS', display: 'standalone', start_url: '/' })
  const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes)
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']))
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true)
  for (const icon of manifest.icons) {
    const res = await request.get(`/${icon.src}`)
    expect(res.headers()['content-type']).toBe('image/png')
  }

  await waitForServiceWorker(page)
  await page.reload()
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)

  await expect(page.locator('link[rel=apple-touch-icon]')).toHaveAttribute('href', '/apple-touch-icon.png')
  await expect(page.locator('meta[name=apple-mobile-web-app-capable]')).toHaveAttribute('content', 'yes')
  expect((await request.get('/apple-touch-icon.png')).ok()).toBe(true)
})
