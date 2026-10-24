/**
 * Milestone celebrations. Only real achievements get confetti: clearing today's list right after ticking something
 * off (not after deleting or moving tasks), streaks reaching a round number, a set of tomatoes, a finished review.
 */
import { useEffect, useRef } from 'react'

import { confetti } from './confetti'
import { play } from './sound'

export const STREAK_MILESTONES = [3, 7, 14, 21, 30, 50, 100, 200, 365]

let lastCompletion = 0

/** Called when you tick a task off. */
export function noteCompletion() {
  lastCompletion = Date.now()
}

/** Celebrates when `remaining` drops to 0 within a few seconds of a completion. */
export function useAllDone(remaining: number | undefined, onCelebrate: () => void) {
  const prev = useRef(remaining)
  const cb = useRef(onCelebrate)
  cb.current = onCelebrate
  useEffect(() => {
    const before = prev.current
    prev.current = remaining
    if (before && before > 0 && remaining === 0 && Date.now() - lastCompletion < 8000) {
      lastCompletion = 0
      setTimeout(() => {
        play('success')
        confetti()
        cb.current()
      }, 450) // after the row's own tick animation
    }
  }, [remaining])
}

/** True when a check-in brings a streak to a milestone worth a burst of flames. */
export function isStreakMilestone(streak: number) {
  return STREAK_MILESTONES.includes(streak)
}
