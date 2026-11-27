/**
 * The landing page brings its own stylesheet (styles/landing.css) with its own copy of Tailwind utilities. Once
 * loaded, a stylesheet stays on the page: if you then sign in without a page load, its plain `flex`, `hidden` and
 * `sr-only` rules come after the app's `md:` / `lg:` ones and win, so the phone tab bar shows on a computer and the
 * sidebar loses its labels. Signing in after the landing page has been shown therefore reloads the page once.
 */
let loaded = false

export function markLandingStylesLoaded() {
  loaded = true
}

export function landingStylesLoaded() {
  return loaded
}
