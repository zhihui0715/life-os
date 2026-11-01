/** The walkthrough: any component can start it with startTour(); the shell's <HelpRoot> listens and shows it. */
let touring = false
const listeners = new Set<() => void>()
const set = (next: boolean) => {
  touring = next
  listeners.forEach((l) => l())
}

export const tourStore = {
  subscribe: (l: () => void) => {
    listeners.add(l)
    return () => void listeners.delete(l)
  },
  get: () => touring,
}

export const startTour = () => set(true)
export const endTour = () => {
  markTourSeen()
  set(false)
}

// Per device: someone who signs in on a new phone gets the short tour there too
const TOUR_KEY = 'lifeos.tourSeen'
export function tourSeen() {
  try {
    return localStorage.getItem(TOUR_KEY) === '1'
  } catch {
    return true // no storage (private mode): don't show the tour on every visit
  }
}
function markTourSeen() {
  try {
    localStorage.setItem(TOUR_KEY, '1')
  } catch {
    /* ignore */
  }
}
