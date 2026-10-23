/**
 * Browser (end-to-end) tests — Stage 9. `npm run e2e`
 *
 * They drive the real BUILT app (service worker included) in Chromium against a real backend on its own database
 * (lifeos_e2e), which is wiped and given a fresh test account before every run. Your data is never touched.
 * Needs: the PostgreSQL container running, the backend's virtualenv, and `npx playwright install chromium` once.
 */
import path from 'node:path'

import { defineConfig, devices } from '@playwright/test'

import { E2E_USER } from './e2e/user'

const API_PORT = 5001
const APP_PORT = 4174
const venvPython = path.resolve(import.meta.dirname, '../backend/.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
const python = `"${process.env.E2E_PYTHON ?? venvPython}"`

const backendEnv = {
  APP_ENV: 'development',
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? 'postgresql+psycopg://lifeos:lifeos_dev_only@127.0.0.1:5432/lifeos_e2e',
  // A throwaway key for this test server only (in CI there is no .env file).
  SECRET_KEY: process.env.SECRET_KEY ?? 'e2e-only-secret-key-0123456789abcdef0123456789',
  E2E_EMAIL: E2E_USER.email,
  E2E_PASSWORD: E2E_USER.password,
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // one shared test account: run in order
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    trace: 'retain-on-failure',
    locale: 'en-US',
    timezoneId: 'Asia/Kuala_Lumpur',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/user.json' },
      dependencies: ['setup'],
    },
    {
      name: 'mobile',
      testMatch: /(smoke|a11y)\.spec\.ts/, // phone layout: the main screens work and stay accessible
      use: { ...devices['Pixel 7'], storageState: 'e2e/.auth/user.json' },
      dependencies: ['setup'],
    },
  ],
  webServer: [
    {
      // Wipe lifeos_e2e and create the test account, then start the API.
      command: `${python} -m flask --app wsgi reset-e2e && ${python} -m flask --app wsgi run --port ${API_PORT}`,
      cwd: '../backend',
      url: `http://127.0.0.1:${API_PORT}/api/v1/health`,
      env: backendEnv,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npm run build && npx vite preview --port ${APP_PORT} --strictPort`,
      url: `http://localhost:${APP_PORT}`,
      env: { API_PROXY_TARGET: `http://127.0.0.1:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
})
