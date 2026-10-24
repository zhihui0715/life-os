import { lazy, type ComponentType } from 'react'

const KEY = 'lifeos.chunkReload'
const WINDOW_MS = 10_000

/**
 * React.lazy that recovers from a stale page file. When the app has been open across a new build (or the dev server
 * rebuilt its library cache), the page's code file it asks for no longer exists and the import fails; the page then
 * showed "Something went wrong". Now the app reloads once to fetch the current files. If the import fails again
 * within ten seconds (really offline, say), the error is shown as before instead of reloading in a loop.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithReload<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() =>
    load()
      .then((m) => {
        try {
          sessionStorage.removeItem(KEY)
        } catch {
          /* ignore */
        }
        return m
      })
      .catch((error: unknown) => {
        let last = 0
        try {
          last = Number(sessionStorage.getItem(KEY) ?? 0)
        } catch {
          /* ignore */
        }
        if (Date.now() - last > WINDOW_MS) {
          try {
            sessionStorage.setItem(KEY, String(Date.now()))
          } catch {
            /* ignore */
          }
          window.location.reload()
          return new Promise<never>(() => {}) // the page is reloading
        }
        throw error
      }),
  )
}
