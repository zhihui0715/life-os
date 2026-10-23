import { useId } from 'react'

import { cn } from '../../components/ui/cn'

export type TomatoMood = 'idle' | 'running' | 'paused' | 'resting' | 'done'

/** Green when unripe, tomato red when done: the colour follows how far along you are. */
function ripeColour(p: number) {
  const hue = 95 - 87 * Math.min(1, Math.max(0, p)) // 95° (green) → 8° (tomato)
  return `hsl(${hue} 78% ${52 - 4 * p}%)`
}

const BODY = 'M100 46 C152 44 186 80 183 122 C180 163 146 188 100 188 C54 188 20 163 17 122 C14 80 48 44 100 46 Z'

/**
 * The tomato of the tomato clock. It fills from the bottom and ripens as the minutes pass; its leaves sway while it
 * runs, it sleeps during a break, and it beams when a tomato is done. Purely decorative: the time is shown as text.
 */
export function Tomato({ progress, mood, size = 240 }: { progress: number; mood: TomatoMood; size?: number }) {
  const id = useId().replace(/:/g, '')
  const p = Math.min(1, Math.max(0, progress))
  const fillY = 188 - p * 142
  const sleepy = mood === 'resting'
  const happy = mood === 'done'
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      aria-hidden
      className={cn('overflow-visible', mood === 'running' && 'animate-[tomato-breathe_4s_ease-in-out_infinite]', happy && 'animate-pop')}
    >
      <defs>
        <clipPath id={`b${id}`}>
          <path d={BODY} />
        </clipPath>
        <radialGradient id={`s${id}`} cx="35%" cy="30%" r="60%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* shadow on the ground */}
      <ellipse cx="100" cy="194" rx="58" ry="6" fill="currentColor" opacity="0.08" />

      {/* skin: pale and unripe, filling up with ripe colour */}
      <path d={BODY} fill={sleepy ? 'hsl(8 60% 82%)' : 'hsl(90 45% 84%)'} />
      <g clipPath={`url(#b${id})`}>
        <rect x="0" y={sleepy || happy ? 0 : fillY} width="200" height="200" fill={sleepy ? 'hsl(8 70% 62%)' : ripeColour(happy ? 1 : p)}
          className="transition-[y,fill] duration-1000 ease-linear" />
        {/* a gentle wave on the surface of the fill */}
        {!sleepy && !happy && p > 0 && p < 1 && (
          <path d={`M-20 ${fillY} q 25 -6 50 0 t 50 0 t 50 0 t 50 0 t 50 0 v 12 h -250 z`} fill={ripeColour(p)} className="animate-[tomato-wave_3s_linear_infinite]" />
        )}
        <path d={BODY} fill={`url(#s${id})`} />
      </g>
      <path d={BODY} fill="none" stroke="currentColor" strokeOpacity="0.08" strokeWidth="2" />

      {/* face */}
      <g fill="#3a1a12" opacity="0.82">
        {sleepy ? (
          <>
            <path d="M74 118 q8 6 16 0" stroke="#3a1a12" strokeWidth="3.5" fill="none" strokeLinecap="round" />
            <path d="M110 118 q8 6 16 0" stroke="#3a1a12" strokeWidth="3.5" fill="none" strokeLinecap="round" />
          </>
        ) : happy ? (
          <>
            <path d="M74 120 q8 -8 16 0" stroke="#3a1a12" strokeWidth="3.5" fill="none" strokeLinecap="round" />
            <path d="M110 120 q8 -8 16 0" stroke="#3a1a12" strokeWidth="3.5" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle cx="82" cy="117" r="5" className={mood === 'running' ? 'animate-[tomato-blink_5s_infinite]' : undefined} style={{ transformOrigin: '82px 117px' }} />
            <circle cx="118" cy="117" r="5" className={mood === 'running' ? 'animate-[tomato-blink_5s_infinite]' : undefined} style={{ transformOrigin: '118px 117px' }} />
          </>
        )}
        <path d={happy ? 'M86 134 q14 14 28 0' : sleepy ? 'M94 136 q6 3 12 0' : 'M90 134 q10 8 20 0'} stroke="#3a1a12" strokeWidth="3.5" fill={happy ? '#3a1a12' : 'none'} strokeLinecap="round" />
        <ellipse cx="68" cy="132" rx="7" ry="4" fill="#ff8a8a" opacity="0.5" />
        <ellipse cx="132" cy="132" rx="7" ry="4" fill="#ff8a8a" opacity="0.5" />
      </g>
      {sleepy && (
        <text x="150" y="70" fontSize="22" fontWeight="700" fill="currentColor" opacity="0.4" className="animate-[tomato-zzz_2.4s_ease-in-out_infinite]">z</text>
      )}

      {/* calyx: five leaves and a stem, swaying while it runs */}
      <g className={mood === 'running' ? 'animate-[tomato-sway_2.6s_ease-in-out_infinite]' : undefined} style={{ transformOrigin: '100px 50px' }}>
        {[0, 72, 144, 216, 288].map((a) => (
          <path key={a} d="M100 50 C 92 40, 80 38, 70 44 C 82 48, 92 52, 100 50 Z" fill="#3f9b3a" transform={`rotate(${a - 90} 100 50) translate(0 0)`} />
        ))}
        <path d="M100 50 C 100 40, 103 30, 110 24" stroke="#2f7d2b" strokeWidth="6" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  )
}
