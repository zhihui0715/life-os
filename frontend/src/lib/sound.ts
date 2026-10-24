/**
 * Sound and haptic feedback, synthesized with the Web Audio API: no audio files to download, works
 * offline, and nothing plays until the first tap (browsers block audio before a user gesture).
 * On by default; the setting lives on this device (Settings → Sounds & haptics).
 */

export type SoundName = 'tap' | 'tab' | 'complete' | 'uncheck' | 'open' | 'close' | 'success' | 'error' | 'chime'

const STORAGE_KEY = 'lifeos.sound'
let ctx: AudioContext | null = null
let master: GainNode | null = null
let enabled = readEnabled()
const listeners = new Set<(on: boolean) => void>()

function readEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== '0'
  } catch {
    return true
  }
}

export function soundEnabled() {
  return enabled
}

export function setSoundEnabled(on: boolean) {
  enabled = on
  try {
    localStorage.setItem(STORAGE_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l(on))
  if (on) play('success')
}

export function onSoundChange(listener: (on: boolean) => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function audio() {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!ctx) {
    ctx = new Ctor()
    master = ctx.createGain()
    master.gain.value = 0.32
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

interface Tone {
  freq: number
  to?: number // glide target
  at?: number // start offset (s)
  dur: number
  gain?: number
  type?: OscillatorType
}

function tone(c: AudioContext, { freq, to, at = 0, dur, gain = 0.5, type = 'sine' }: Tone) {
  const t0 = c.currentTime + at
  const osc = c.createOscillator()
  const env = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur)
  env.gain.setValueAtTime(0.0001, t0)
  env.gain.exponentialRampToValueAtTime(gain, t0 + 0.006)
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(env).connect(master!)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

/** A short filtered noise burst: the "tick" of a physical switch. */
function click(c: AudioContext, { at = 0, gain = 0.35, freq = 3200 } = {}) {
  const t0 = c.currentTime + at
  const len = Math.floor(c.sampleRate * 0.02)
  const buffer = c.createBuffer(1, len, c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3
  const src = c.createBufferSource()
  src.buffer = buffer
  const filter = c.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = freq
  filter.Q.value = 1.2
  const env = c.createGain()
  env.gain.value = gain
  src.connect(filter).connect(env).connect(master!)
  src.start(t0)
}

const SOUNDS: Record<SoundName, (c: AudioContext) => void> = {
  tap: (c) => click(c, { gain: 0.25 }),
  tab: (c) => {
    click(c, { gain: 0.22, freq: 2400 })
    tone(c, { freq: 880, dur: 0.05, gain: 0.05 })
  },
  // Rising two-note "ding" with a soft octave shimmer, like ticking off a to-do
  complete: (c) => {
    click(c, { gain: 0.2, freq: 2800 })
    tone(c, { freq: 1046.5, dur: 0.18, gain: 0.22, type: 'triangle' })
    tone(c, { freq: 1568, at: 0.075, dur: 0.32, gain: 0.2, type: 'triangle' })
    tone(c, { freq: 3136, at: 0.075, dur: 0.22, gain: 0.03 })
  },
  uncheck: (c) => {
    click(c, { gain: 0.18, freq: 1800 })
    tone(c, { freq: 660, to: 440, dur: 0.12, gain: 0.1, type: 'triangle' })
  },
  open: (c) => tone(c, { freq: 420, to: 720, dur: 0.14, gain: 0.07 }),
  close: (c) => tone(c, { freq: 620, to: 380, dur: 0.12, gain: 0.06 }),
  success: (c) => {
    tone(c, { freq: 784, dur: 0.14, gain: 0.14, type: 'triangle' })
    tone(c, { freq: 1175, at: 0.06, dur: 0.24, gain: 0.12, type: 'triangle' })
  },
  error: (c) => {
    tone(c, { freq: 220, dur: 0.12, gain: 0.18, type: 'triangle' })
    tone(c, { freq: 196, at: 0.11, dur: 0.18, gain: 0.16, type: 'triangle' })
  },
  // Three-note bell for the end of a focus session
  chime: (c) => {
    ;[1318.5, 1046.5, 1568].forEach((f, i) => {
      tone(c, { freq: f, at: i * 0.22, dur: 1.1, gain: 0.18 })
      tone(c, { freq: f * 2.76, at: i * 0.22, dur: 0.5, gain: 0.025 }) // bell partial
    })
  },
}

const HAPTICS: Partial<Record<SoundName, number | number[]>> = {
  tap: 6,
  tab: 6,
  complete: [10, 30, 14],
  uncheck: 8,
  error: [20, 40, 20],
  chime: [30, 80, 30, 80, 30],
}

let lastPlayed = 0

/** Plays a UI sound (and a matching vibration on phones that support it), if sounds are on. */
export function play(name: SoundName) {
  if (!enabled) return
  const now = performance.now()
  if (now - lastPlayed < 30 && (name === 'tap' || name === 'tab')) return // no machine-gun ticks
  lastPlayed = now
  try {
    const c = audio()
    if (c && master) SOUNDS[name](c)
    const pattern = HAPTICS[name]
    if (pattern && 'vibrate' in navigator) navigator.vibrate(pattern)
  } catch {
    /* audio is a nicety; never let it break an action */
  }
}
