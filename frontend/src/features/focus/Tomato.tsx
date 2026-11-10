import { useId, type CSSProperties } from 'react'

import { cn } from '../../components/ui/cn'

export type TomatoMood = 'idle' | 'running' | 'paused' | 'resting' | 'done'

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
/** 0 before `from`, 1 after `from + span`, in between linearly. */
const phase = (p: number, from: number, span: number) => clamp01((p - from) / span)

/** Green when unripe, tomato red when ripe. */
function ripeColour(r: number) {
  const hue = 100 - 92 * clamp01(r) // 100° (green) → 8° (tomato)
  return `hsl(${hue} ${62 + 16 * r}% ${46 + 2 * r}%)`
}

// The vine, drawn from the soil up. It is revealed with a dash offset as it grows (pathLength = 1).
const STEM = 'M100 160 C 95 140, 106 122, 100 104 C 95 88, 104 70, 100 50'
const BRANCH = 'M101 95 C 111 88, 120 81, 128 80'
// A leaf drawn from its base at (0, 0), pointing right
const LEAF = 'M0 0 C 6 -9, 20 -12, 30 -4 C 22 4, 9 6, 0 0 Z'
const VEIN = 'M2 -0.5 C 10 -3, 18 -4, 26 -4'
// Where each leaf sits on the vine, its angle, size and how much of the vine must have grown before it unfolds
const LEAVES = [
  { x: 98, y: 141, a: 200, s: 0.9, at: 0.17 },
  { x: 102, y: 127, a: -25, s: 1, at: 0.3 },
  { x: 99, y: 109, a: 195, s: 1.05, at: 0.47 },
  { x: 101, y: 88, a: -35, s: 0.75, at: 0.66 },
  { x: 99, y: 72, a: 205, s: 0.85, at: 0.8 },
  { x: 100, y: 56, a: -30, s: 0.6, at: 0.93 },
  { x: 100, y: 51, a: 215, s: 0.5, at: 0.98 },
]
// The fruit at full size, centred on (0, 0); its stem end is at (0, -34)
const FRUIT = 'M0 -34 C 30 -37 43 -14 41 5 C 39 27 21 37 0 37 C -21 37 -39 27 -41 5 C -43 -14 -30 -37 0 -34 Z'
const FRUIT_AT = { x: 128, y: 80 } // the end of the branch, where the flower opens and the fruit hangs

const ease = 'var(--ease-spring)'
const grow = (x: number, y: number, rotate: number, scale: number, ms = 1400): CSSProperties => ({
  transform: `translate(${x}px, ${y}px) rotate(${rotate}deg) scale(${scale})`,
  transformOrigin: '0 0',
  transition: `transform ${ms}ms ${ease}, opacity ${ms}ms ease`,
})

/**
 * The tomato clock as a little potted plant that grows over the session: a seed, a sprout, leaves unfolding up the
 * vine, a bud, a yellow flower whose petals fall, then a green tomato that swells and ripens to red at 0:00. It sleeps
 * under the moon during a break and beams when it is done. Purely decorative: the time is shown as text.
 */
export function Tomato({ progress, mood, size = 240 }: { progress: number; mood: TomatoMood; size?: number }) {
  const id = useId().replace(/:/g, '')
  const sleepy = mood === 'resting'
  const happy = mood === 'done'
  const running = mood === 'running'
  // The plant is fully grown in a break or when done; before a session it shows a young seedling.
  const p = sleepy || happy ? 1 : mood === 'idle' ? 0.1 : clamp01(progress)

  const stem = phase(p, 0.03, 0.42)
  const cotyledons = phase(p, 0.005, 0.05)
  const branch = phase(p, 0.38, 0.05)
  const bud = phase(p, 0.41, 0.04) * (1 - phase(p, 0.47, 0.03))
  const petals = phase(p, 0.45, 0.06) * (1 - phase(p, 0.58, 0.03))
  const fruitGrow = phase(p, 0.57, 0.43)
  const fruit = p >= 0.57 ? 0.14 + 0.86 * Math.sqrt(fruitGrow) : 0
  const ripe = phase(p, 0.68, 0.32)
  const face = phase(fruit, 0.5, 0.2)
  const petalFalling = running && p >= 0.58 && p < 0.7

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      aria-hidden
      className={cn('overflow-visible', happy && 'animate-pop')}
    >
      <defs>
        <radialGradient id={`s${id}`} cx="32%" cy="28%" r="62%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.6" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`pot${id}`} x1="0" x2="1">
          <stop offset="0" stopColor="#c8673f" />
          <stop offset="0.55" stopColor="#d97c52" />
          <stop offset="1" stopColor="#b85a35" />
        </linearGradient>
      </defs>

      {/* night sky during a break */}
      {sleepy && (
        <g className="animate-[tomato-fade_1.2s_ease-out_both]">
          <path d="M42 22 a14 14 0 1 0 14 20 a11 11 0 1 1 -14 -20 z" fill="#f3d27a" opacity="0.85" />
          {[
            [26, 62, 0],
            [70, 18, 0.8],
            [164, 26, 1.6],
            [178, 64, 2.4],
            [150, 50, 3.2],
          ].map(([x, y, d]) => (
            <path key={`${x}-${y}`} d={`M${x} ${y - 4} L${x + 1.2} ${y - 1.2} L${x + 4} ${y} L${x + 1.2} ${y + 1.2} L${x} ${y + 4} L${x - 1.2} ${y + 1.2} L${x - 4} ${y} L${x - 1.2} ${y - 1.2} Z`}
              fill="#f3d27a" className="animate-[tomato-twinkle_3.2s_ease-in-out_infinite]" style={{ animationDelay: `${d}s`, transformOrigin: `${x}px ${y}px` }} />
          ))}
        </g>
      )}

      {/* shadow and pot */}
      <ellipse cx="100" cy="197" rx="46" ry="4" fill="currentColor" opacity="0.08" />

      {/* the plant sways a little in a breeze while it grows */}
      <g className={running ? 'animate-[tomato-plant_7s_ease-in-out_infinite]' : undefined} style={{ transformOrigin: '100px 160px' }}>
        {/* the seed, before anything sprouts */}
        <ellipse cx="100" cy="157" rx="4" ry="2.6" fill="#e9d6a8" stroke="#b89a62" strokeWidth="0.8"
          style={{ opacity: p < 0.03 ? 1 : 0, transition: 'opacity 1s ease' }} />

        {/* vine */}
        <path d={STEM} pathLength={1} fill="none" stroke="#3f8f37" strokeWidth="4.5" strokeLinecap="round"
          strokeDasharray="1 1" style={{ strokeDashoffset: 1 - stem, transition: 'stroke-dashoffset 1s linear' }} />
        {/* the two seed leaves at the foot of the vine */}
        <path d="M0 0 C 4 -7, 13 -8, 16 -3 C 12 2, 5 2, 0 0 Z" fill="#7cc46b" style={grow(100, 150, 200, cotyledons, 1600)} />
        <path d="M0 0 C 4 -7, 13 -8, 16 -3 C 12 2, 5 2, 0 0 Z" fill="#7cc46b" style={grow(100, 150, -20, cotyledons, 1600)} />
        {/* true leaves, unfolding as the vine passes them */}
        {LEAVES.map((l, i) => {
          const k = phase(stem, l.at, 0.1) * l.s
          return (
            <g key={i} style={grow(l.x, l.y, l.a, k)}>
              <path d={LEAF} fill={i % 2 ? '#4fa544' : '#5cb34f'} />
              <path d={VEIN} fill="none" stroke="#2f7d2b" strokeWidth="1" strokeLinecap="round" opacity="0.55" />
            </g>
          )
        })}

        {/* side branch carrying the flower, then the fruit */}
        <path d={BRANCH} pathLength={1} fill="none" stroke="#3f8f37" strokeWidth="3" strokeLinecap="round"
          strokeDasharray="1 1" style={{ strokeDashoffset: 1 - branch, transition: 'stroke-dashoffset 1s linear' }} />
        {/* bud */}
        <path d="M0 0 C 5 2, 5 9, 0 13 C -5 9, -5 2, 0 0 Z" fill="#6fb85f" style={grow(FRUIT_AT.x, FRUIT_AT.y, 0, bud, 1000)} />
        {/* flower: five yellow petals around a golden centre */}
        <g style={grow(FRUIT_AT.x, FRUIT_AT.y + 4, 0, petals, 1200)}>
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx="0" cy="8" rx="3.6" ry="8" fill="#f6c945" transform={`rotate(${a + 36})`} />
          ))}
          <circle r="3.4" fill="#e39a1b" />
        </g>
        {/* a petal drifting down after the flower fades */}
        {petalFalling && (
          <ellipse cx={FRUIT_AT.x + 6} cy={FRUIT_AT.y + 10} rx="3" ry="6" fill="#f6c945" className="animate-[tomato-petal_5s_ease-in_both]"
            style={{ transformOrigin: `${FRUIT_AT.x + 6}px ${FRUIT_AT.y + 10}px` }} />
        )}

        {/* the tomato: swells and ripens; a face once it is big enough */}
        <g style={{
          transform: `translate(${FRUIT_AT.x}px, ${FRUIT_AT.y + 34 * fruit}px) scale(${fruit})`,
          transformOrigin: '0 0',
          transition: 'transform 1s linear',
        }}>
          <g className={running && fruit > 0.5 ? 'animate-[tomato-breathe_4s_ease-in-out_infinite]' : undefined} style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
            <path d={FRUIT} fill={sleepy ? 'hsl(8 68% 58%)' : ripeColour(happy ? 1 : ripe)} style={{ transition: 'fill 1s linear' }} />
            <path d={FRUIT} fill={`url(#s${id})`} />
            <path d={FRUIT} fill="none" stroke="#000" strokeOpacity="0.07" strokeWidth="1.5" />
            {/* calyx */}
            {[0, 72, 144, 216, 288].map((a) => (
              <path key={a} d="M0 0 C 3 -4, 10 -5, 15 -1 C 10 2, 4 2, 0 0 Z" fill="#3f9b3a" transform={`translate(0 -33) rotate(${a + 54})`} />
            ))}
            <g style={{ opacity: face, transition: 'opacity 1.2s ease' }} fill="#3a1a12">
              {sleepy ? (
                <>
                  <path d="M-19 4 q5 4 10 0" stroke="#3a1a12" strokeWidth="2.6" fill="none" strokeLinecap="round" />
                  <path d="M9 4 q5 4 10 0" stroke="#3a1a12" strokeWidth="2.6" fill="none" strokeLinecap="round" />
                </>
              ) : happy ? (
                <>
                  <path d="M-19 6 q5 -6 10 0" stroke="#3a1a12" strokeWidth="2.6" fill="none" strokeLinecap="round" />
                  <path d="M9 6 q5 -6 10 0" stroke="#3a1a12" strokeWidth="2.6" fill="none" strokeLinecap="round" />
                </>
              ) : (
                <>
                  <circle cx="-14" cy="4" r="3.6" className={running ? 'animate-[tomato-blink_5s_infinite]' : undefined} style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
                  <circle cx="14" cy="4" r="3.6" className={running ? 'animate-[tomato-blink_5s_infinite]' : undefined} style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
                </>
              )}
              <path d={happy ? 'M-9 14 q9 10 18 0' : sleepy ? 'M-4 16 q4 2 8 0' : 'M-6 14 q6 5 12 0'} stroke="#3a1a12" strokeWidth="2.6" fill={happy ? '#3a1a12' : 'none'} strokeLinecap="round" />
              <ellipse cx="-24" cy="13" rx="5" ry="3" fill="#ff8a8a" opacity="0.55" />
              <ellipse cx="24" cy="13" rx="5" ry="3" fill="#ff8a8a" opacity="0.55" />
            </g>
          </g>
        </g>
      </g>

      {/* pot in front of the vine's foot */}
      <path d="M64 168 L136 168 L128 195 Q127 197 125 197 L75 197 Q73 197 72 195 Z" fill={`url(#pot${id})`} />
      <rect x="58" y="158" width="84" height="12" rx="3.5" fill="#d77a50" />
      <rect x="58" y="158" width="84" height="3" rx="1.5" fill="#fff" opacity="0.18" />
      <ellipse cx="100" cy="159.5" rx="37" ry="2.4" fill="#5b3b2c" />

      {sleepy && (
        <text x={FRUIT_AT.x + 30} y={FRUIT_AT.y + 8} fontSize="18" fontWeight="700" fill="currentColor" opacity="0.4" className="animate-[tomato-zzz_2.4s_ease-in-out_infinite]">z</text>
      )}
      {happy && [[70, 92, 0], [176, 96, 0.5], [150, 58, 1]].map(([x, y, d]) => (
        <path key={x} d={`M${x} ${y - 6} L${x + 1.6} ${y - 1.6} L${x + 6} ${y} L${x + 1.6} ${y + 1.6} L${x} ${y + 6} L${x - 1.6} ${y + 1.6} L${x - 6} ${y} L${x - 1.6} ${y - 1.6} Z`}
          fill="#f6c945" className="animate-[tomato-twinkle_1.8s_ease-in-out_infinite]" style={{ animationDelay: `${d}s`, transformOrigin: `${x}px ${y}px` }} />
      ))}
    </svg>
  )
}
