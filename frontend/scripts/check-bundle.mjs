/**
 * Performance budget (Stage 9) — run after `npm run build`: `npm run check:bundle`. Fails if downloads grow past
 * the limits below. Sizes are gzip-compressed (what actually travels over the network).
 *
 * Why these numbers: the first screen on a mid-range phone over 4G should be usable in about 2 seconds, which
 * leaves roughly 250 kB of compressed JavaScript for the first load. The current build sits around 210 kB.
 * Raise a limit only on purpose, never to make a red build green.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const BUDGET = {
  initialJs: 240 * 1024, // everything the first page needs before it can render
  initialCss: 15 * 1024,
  lazyChunk: 130 * 1024, // any single page loaded on demand (calendar, charts…)
  precacheTotal: 1.2 * 1024 * 1024, // everything the service worker stores for offline use (compressed)
}

const dist = new URL('../dist/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
const gz = (file) => gzipSync(readFileSync(join(dist, file))).length
const kb = (n) => `${(n / 1024).toFixed(1)} kB`

const html = readFileSync(join(dist, 'index.html'), 'utf8')
const initialFiles = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1])
const initialJs = initialFiles.filter((f) => f.endsWith('.js')).reduce((s, f) => s + gz(f), 0)
const initialCss = initialFiles.filter((f) => f.endsWith('.css')).reduce((s, f) => s + gz(f), 0)

const assets = readdirSync(join(dist, 'assets')).map((f) => `assets/${f}`)
const lazy = assets.filter((f) => f.endsWith('.js') && !initialFiles.includes(f)).map((f) => [f, gz(f)])
const biggestLazy = lazy.sort((a, b) => b[1] - a[1])[0] ?? ['-', 0]
const precacheTotal = readdirSync(dist, { recursive: true })
  .filter((f) => /\.(js|css|html|svg|png|woff2)$/.test(f) && statSync(join(dist, f)).isFile())
  .reduce((s, f) => s + gz(f), 0)

const rows = [
  ['First-load JavaScript', initialJs, BUDGET.initialJs],
  ['First-load CSS', initialCss, BUDGET.initialCss],
  [`Largest on-demand chunk (${biggestLazy[0]})`, biggestLazy[1], BUDGET.lazyChunk],
  ['Offline pre-cache, all files', precacheTotal, BUDGET.precacheTotal],
]
let failed = false
for (const [name, size, limit] of rows) {
  const ok = size <= limit
  failed ||= !ok
  console.log(`${ok ? 'ok  ' : 'OVER'}  ${name}: ${kb(size)} (budget ${kb(limit)})`)
}
if (failed) {
  console.error('\nPerformance budget exceeded. Split the code (lazy-load a page) or remove a dependency.')
  process.exit(1)
}
