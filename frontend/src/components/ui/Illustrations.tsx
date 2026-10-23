/**
 * Small animated illustrations for empty screens, drawn in the accent and system colours so they follow the theme.
 * Decorative only (aria-hidden); every empty state still says in words what's going on.
 */

/** A smiling sun with turning rays: nothing due today. */
export function SunArt({ size = 112 }: { size?: number }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden className="overflow-visible">
      <g className="origin-center animate-[spin_24s_linear_infinite] motion-reduce:animate-none" style={{ transformOrigin: '60px 60px' }}>
        {Array.from({ length: 12 }, (_, i) => (
          <rect key={i} x="57" y="4" width="6" height="16" rx="3" fill="#ffb020" opacity={i % 2 ? 0.55 : 0.9} transform={`rotate(${i * 30} 60 60)`} />
        ))}
      </g>
      <circle cx="60" cy="60" r="30" fill="#ffcc00" />
      <circle cx="60" cy="60" r="30" fill="url(#sun-shine)" />
      <defs>
        <radialGradient id="sun-shine" cx="35%" cy="30%" r="70%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.6" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* sunglasses */}
      <path d="M38 55 h18 a2 2 0 0 1 2 2 v3 a8 8 0 0 1 -8 8 h-4 a8 8 0 0 1 -8 -8 z M62 55 h18 v5 a8 8 0 0 1 -8 8 h-4 a8 8 0 0 1 -8 -8 v-3 a2 2 0 0 1 2 -2 z" fill="#1c1c1e" />
      <rect x="55" y="56" width="10" height="3" rx="1.5" fill="#1c1c1e" />
      <path d="M50 75 q10 8 20 0" stroke="#7a4a00" strokeWidth="3.5" fill="none" strokeLinecap="round" />
    </svg>
  )
}

/** A seedling that grows up out of the soil: no habits yet. */
export function SproutArt({ size = 112 }: { size?: number }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden className="overflow-visible">
      <ellipse cx="60" cy="98" rx="38" ry="9" fill="#a66a3d" opacity="0.85" />
      <g className="animate-[grow_1.4s_var(--ease-spring)_both] motion-reduce:animate-none" style={{ transformOrigin: '60px 96px' }}>
        <path d="M60 96 C60 80 60 66 60 52" stroke="#34a853" strokeWidth="5" strokeLinecap="round" fill="none" />
        <path d="M60 66 C46 66 36 56 34 44 C48 44 58 52 60 66 Z" fill="#4cc764" className="animate-[sway_3s_ease-in-out_infinite] motion-reduce:animate-none" style={{ transformOrigin: '60px 66px' }} />
        <path d="M60 58 C74 58 86 48 88 34 C72 34 62 44 60 58 Z" fill="#34c759" className="animate-[sway_3s_ease-in-out_infinite_reverse] motion-reduce:animate-none" style={{ transformOrigin: '60px 58px' }} />
      </g>
      <circle cx="92" cy="26" r="3" fill="var(--accent)" className="animate-[twinkle_2s_ease-in-out_infinite] motion-reduce:animate-none" />
      <circle cx="26" cy="34" r="2" fill="var(--accent)" className="animate-[twinkle_2s_ease-in-out_0.7s_infinite] motion-reduce:animate-none" />
    </svg>
  )
}

/** A ticked checklist with a little star burst: a list that's all done. */
export function DoneArt({ size = 112 }: { size?: number }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden className="overflow-visible">
      <rect x="26" y="18" width="68" height="86" rx="12" fill="var(--surface)" stroke="var(--border-strong)" strokeWidth="2" />
      {[38, 58, 78].map((y, i) => (
        <g key={y} className="animate-[rise_500ms_var(--ease-out)_both] motion-reduce:animate-none" style={{ animationDelay: `${i * 120}ms` }}>
          <rect x="36" y={y - 7} width="14" height="14" rx="4" fill="var(--accent-fill)" />
          <path d={`M39 ${y} l3 3 l6 -6`} stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="56" y={y - 3} width={i === 1 ? 22 : 28} height="6" rx="3" fill="var(--border-strong)" />
        </g>
      ))}
      {[
        [100, 20],
        [16, 52],
        [104, 88],
      ].map(([x, y], i) => (
        <path
          key={i}
          d={`M${x} ${y - 6} L${x + 1.6} ${y - 1.6} L${x + 6} ${y} L${x + 1.6} ${y + 1.6} L${x} ${y + 6} L${x - 1.6} ${y + 1.6} L${x - 6} ${y} L${x - 1.6} ${y - 1.6} Z`}
          fill="#ffcc00"
          className="animate-[twinkle_1.8s_ease-in-out_infinite] motion-reduce:animate-none"
          style={{ animationDelay: `${i * 0.5}s`, transformOrigin: `${x}px ${y}px` }}
        />
      ))}
    </svg>
  )
}
