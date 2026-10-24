import type { BookAvatarId } from './bookAvatars'

/**
 * Cartoon book characters to use as your avatar (Settings → Appearance), drawn as inline SVG so they work offline,
 * stay crisp at any size and add nothing to download. Each is a little book with a face: colours, accessories and
 * moods differ. Stored on the account as "book-1" … "book-8" (the backend checks the pattern).
 */

interface Look {
  cover: string
  spine: string
  pages: string
  cheek: string
  extra: 'glasses' | 'cap' | 'bookmark' | 'quill' | 'stack' | 'open' | 'star' | 'scarf'
  mood: 'smile' | 'grin' | 'wink' | 'calm' | 'wow' | 'sleepy' | 'proud' | 'happy'
}

const LOOKS: Record<BookAvatarId, Look> = {
  'book-1': { cover: '#7a2a22', spine: '#5a1c16', pages: '#fbf3df', cheek: '#e8877a', extra: 'glasses', mood: 'smile' },
  'book-2': { cover: '#2f4a3a', spine: '#1f3328', pages: '#f6eed8', cheek: '#e59a7c', extra: 'cap', mood: 'proud' },
  'book-3': { cover: '#2c3e63', spine: '#1d2b47', pages: '#f7f0dc', cheek: '#ee9a8a', extra: 'bookmark', mood: 'wink' },
  'book-4': { cover: '#c08a2e', spine: '#94661c', pages: '#fff7e3', cheek: '#ef8f74', extra: 'quill', mood: 'grin' },
  'book-5': { cover: '#5b3a6e', spine: '#412850', pages: '#f8f0e0', cheek: '#ec9aa8', extra: 'star', mood: 'wow' },
  'book-6': { cover: '#3f6f73', spine: '#2a5155', pages: '#f5efdc', cheek: '#e99a86', extra: 'scarf', mood: 'happy' },
  'book-7': { cover: '#8a5a2b', spine: '#64401c', pages: '#fbf4e2', cheek: '#e8957c', extra: 'stack', mood: 'calm' },
  'book-8': { cover: '#a3473a', spine: '#7a3127', pages: '#fff6e6', cheek: '#f0a08f', extra: 'open', mood: 'sleepy' },
}

function Face({ mood, cheek }: { mood: Look['mood']; cheek: string }) {
  const ink = '#2a1f16'
  const eyes =
    mood === 'wink' ? (
      <>
        <circle cx="25" cy="34" r="2.6" fill={ink} />
        <path d="M36.5 34.5 q2.5 -2.5 5 0" stroke={ink} strokeWidth="2" fill="none" strokeLinecap="round" />
      </>
    ) : mood === 'sleepy' || mood === 'calm' ? (
      <>
        <path d="M22.5 34 q2.5 2.4 5 0" stroke={ink} strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M36.5 34 q2.5 2.4 5 0" stroke={ink} strokeWidth="2" fill="none" strokeLinecap="round" />
      </>
    ) : mood === 'wow' ? (
      <>
        <circle cx="25" cy="33.5" r="3.2" fill={ink} />
        <circle cx="39" cy="33.5" r="3.2" fill={ink} />
        <circle cx="26" cy="32.5" r="1" fill="#fff" />
        <circle cx="40" cy="32.5" r="1" fill="#fff" />
      </>
    ) : (
      <>
        <circle cx="25" cy="34" r="2.6" fill={ink} />
        <circle cx="39" cy="34" r="2.6" fill={ink} />
        <circle cx="25.9" cy="33.1" r="0.85" fill="#fff" />
        <circle cx="39.9" cy="33.1" r="0.85" fill="#fff" />
      </>
    )
  const mouth =
    mood === 'wow' ? (
      <ellipse cx="32" cy="42" rx="2.6" ry="3" fill={ink} />
    ) : mood === 'grin' || mood === 'happy' ? (
      <path d="M26.5 40 q5.5 6.5 11 0 z" fill={ink} />
    ) : mood === 'sleepy' ? (
      <path d="M29.5 42 q2.5 -1.6 5 0" stroke={ink} strokeWidth="1.8" fill="none" strokeLinecap="round" />
    ) : (
      <path d="M27.5 40.5 q4.5 4 9 0" stroke={ink} strokeWidth="2" fill="none" strokeLinecap="round" />
    )
  return (
    <>
      <ellipse cx="21" cy="40" rx="3.2" ry="2" fill={cheek} opacity="0.55" />
      <ellipse cx="43" cy="40" rx="3.2" ry="2" fill={cheek} opacity="0.55" />
      {eyes}
      {mouth}
    </>
  )
}

function Extra({ kind, look }: { kind: Look['extra']; look: Look }) {
  const ink = '#2a1f16'
  switch (kind) {
    case 'glasses':
      return (
        <g stroke={ink} strokeWidth="1.6" fill="rgb(255 255 255 / 0.25)">
          <circle cx="25" cy="34" r="5.4" />
          <circle cx="39" cy="34" r="5.4" />
          <path d="M30.4 34 h3.2" fill="none" />
        </g>
      )
    case 'cap':
      return (
        <g>
          <path d="M14 13 L32 6 L50 13 L32 20 Z" fill="#1f1a17" />
          <path d="M22 15.5 v5 q10 4.5 20 0 v-5" fill="#1f1a17" />
          <path d="M50 13 v9" stroke="#d8ad60" strokeWidth="1.5" />
          <circle cx="50" cy="23" r="1.8" fill="#d8ad60" />
        </g>
      )
    case 'bookmark':
      return <path d="M42 8 h6 v16 l-3 -3 l-3 3 z" fill="#c4574a" />
    case 'quill':
      return (
        <g>
          <path d="M47 4 q9 6 2 20 q-3 -9 -2 -20 z" fill="#f4ecdc" stroke="#b9a27a" strokeWidth="1" />
          <path d="M49 22 l-4 8" stroke={ink} strokeWidth="1.4" strokeLinecap="round" />
        </g>
      )
    case 'star':
      return <path d="M48 6 l2.2 4.6 5 .7 -3.6 3.5 .9 5 -4.5 -2.4 -4.5 2.4 .9 -5 -3.6 -3.5 5 -.7 z" fill="#f2c14e" />
    case 'scarf':
      return (
        <g>
          <path d="M14 46 q18 6 36 0 v5 q-18 6 -36 0 z" fill="#d8ad60" />
          <path d="M40 50 l3 9 l4 -1 l-2 -9 z" fill="#c4974b" />
        </g>
      )
    case 'stack':
      return (
        <g>
          <rect x="10" y="54" width="44" height="5" rx="1.5" fill="#3e4a2f" />
          <rect x="12" y="49.5" width="40" height="5" rx="1.5" fill="#2c3e63" />
        </g>
      )
    case 'open':
      return (
        <g>
          <path d="M8 52 q12 -5 24 0 q12 -5 24 0 v6 q-12 -5 -24 0 q-12 -5 -24 0 z" fill={look.pages} stroke="#b9a27a" strokeWidth="1" />
          <path d="M32 52 v6" stroke="#b9a27a" strokeWidth="1" />
          <text x="44" y="16" fontSize="9" fontFamily="Georgia, serif" fill={ink} opacity="0.7">
            z
          </text>
          <text x="49" y="10" fontSize="7" fontFamily="Georgia, serif" fill={ink} opacity="0.5">
            z
          </text>
        </g>
      )
  }
}

/** One book character, filling a square of the given size. */
export function BookAvatar({ id, size = 52 }: { id: BookAvatarId; size?: number }) {
  const look = LOOKS[id]
  const lowered = look.extra === 'stack' || look.extra === 'open'
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
      <g transform={lowered ? 'translate(0 -4)' : undefined}>
        {/* the pages, peeking out on the right and bottom */}
        <rect x="18" y="13" width="34" height="40" rx="4" fill={look.pages} stroke="#d9c9a5" strokeWidth="1" />
        <path d="M22 50 h28 M22 47.5 h28" stroke="#d9c9a5" strokeWidth="0.8" />
        {/* the cover and spine */}
        <rect x="12" y="10" width="38" height="40" rx="5" fill={look.cover} />
        <rect x="12" y="10" width="7" height="40" rx="3" fill={look.spine} />
        <path d="M19 15 h28 M19 45 h28" stroke="#d8ad60" strokeWidth="1.2" opacity="0.8" />
        <rect x="20" y="25" width="25" height="22" rx="7" fill={look.pages} opacity="0.95" />
        <Face mood={look.mood} cheek={look.cheek} />
      </g>
      <Extra kind={look.extra} look={look} />
    </svg>
  )
}
