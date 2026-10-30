/**
 * Celebrates an achievement the moment you unlock it, wherever you are in the app. After anything you change
 * (a task ticked, a focus stopped…) it asks the server again, a moment later, and compares with what this device
 * has already celebrated. The first time it runs on a device it just remembers what's unlocked, quietly.
 */
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import './i18n'
import { useToast } from '../../components/ui/Toast'
import { confetti } from '../../lib/confetti'
import { play } from '../../lib/sound'
import { ACHIEVEMENTS_KEY, useAchievements } from './api'

const SEEN_KEY = 'lifeos.achievements.seen'
const AFTER_CHANGE_MS = 1500

function readSeen(): string[] | null {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? 'null') as string[] | null
  } catch {
    return null
  }
}

function writeSeen(keys: string[]) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(keys))
  } catch {
    /* storage blocked: it just celebrates again next time */
  }
}

export default function AchievementWatcher() {
  const { t } = useTranslation('achievements')
  const toast = useToast()
  const qc = useQueryClient()
  const data = useAchievements().data

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const stop = qc.getMutationCache().subscribe((e) => {
      if (e.type !== 'updated' || e.mutation.state.status !== 'success') return
      clearTimeout(timer)
      timer = setTimeout(() => void qc.invalidateQueries({ queryKey: ACHIEVEMENTS_KEY }), AFTER_CHANGE_MS)
    })
    return () => {
      stop()
      clearTimeout(timer)
    }
  }, [qc])

  useEffect(() => {
    if (!data) return
    const unlocked = data.items.filter((a) => a.unlocked).map((a) => a.key)
    const seen = readSeen()
    if (seen) {
      const fresh = unlocked.filter((k) => !seen.includes(k))
      if (fresh.length) {
        play('success')
        confetti({ emoji: ['🏆', '⭐', '✨'] })
        for (const key of fresh) toast(t('toast', { name: t(`items.${key}.name`) }))
      }
    }
    // Remember everything unlocked now (and keep anything a later edit of history took away, so it isn't re-celebrated).
    writeSeen([...new Set([...(seen ?? []), ...unlocked])])
  }, [data, t, toast])

  return null
}
