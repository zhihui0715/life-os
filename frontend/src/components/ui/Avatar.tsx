/** Your chosen emoji (Settings → Appearance), or your initial, in a soft circle that pops in. */
export function Avatar({ emoji, name, size = 52 }: { emoji: string | null; name: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="bg-accent-soft text-accent animate-pop flex shrink-0 items-center justify-center rounded-full font-bold"
      style={{ width: size, height: size, fontSize: emoji ? size * 0.52 : size * 0.42 }}
    >
      {emoji ?? name.trim().charAt(0).toUpperCase()}
    </span>
  )
}
