import { lazy, Suspense } from 'react'

import { isBookAvatar } from './bookAvatars'

// The book characters are drawings: they load the first time one is shown, not with the app
const BookAvatar = lazy(() => import('./BookAvatar').then((m) => ({ default: m.BookAvatar })))

/** Your chosen book character (Settings → Appearance), or your initial, in a soft circle that pops in. */
export function Avatar({ emoji, name, size = 52 }: { emoji: string | null; name: string; size?: number }) {
  if (isBookAvatar(emoji)) {
    return (
      <span aria-hidden className="bg-accent-soft animate-pop flex shrink-0 items-center justify-center overflow-hidden rounded-full" style={{ width: size, height: size }}>
        <Suspense fallback={null}>
          <BookAvatar id={emoji} size={size * 0.92} />
        </Suspense>
      </span>
    )
  }
  return (
    <span
      aria-hidden
      className="bg-accent-soft text-accent animate-pop flex shrink-0 items-center justify-center rounded-full font-bold"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  )
}
