import { Suspense, useEffect, useSyncExternalStore } from 'react'

import { lazyWithReload } from '../../lib/lazyPage'
import { endTour, startTour, tourSeen, tourStore } from './help'

// Loads on first use, keeping it out of the first download
const Tour = lazyWithReload(() => import('./Tour'))

/** Shows the walkthrough when asked (help.ts), and starts it on a first visit. */
export function HelpRoot() {
  const tour = useSyncExternalStore(tourStore.subscribe, tourStore.get)

  useEffect(() => {
    if (tourSeen()) return
    // Give Home a moment to settle before dimming it
    const id = setTimeout(startTour, 900)
    return () => clearTimeout(id)
  }, [])

  return <Suspense fallback={null}>{tour && <Tour onDone={endTour} />}</Suspense>
}
