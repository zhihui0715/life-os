/**
 * Background sound for focus sessions and breaks: rain, waves, a fire, brown noise, a clock or soft tones.
 * Like the UI sounds, it is synthesized with the Web Audio API (no files, works offline). Every layer is a
 * looping buffer or an oscillator, so it keeps playing in a background tab without JavaScript timers.
 * The chosen sound and its volume live on this device.
 */
import { useSyncExternalStore } from 'react'

import { audioContext } from './sound'

export const AMBIENCES = ['off', 'piano', 'rain', 'waves', 'fire', 'brown', 'tick', 'tones'] as const
export type Ambience = (typeof AMBIENCES)[number]

export interface AmbiencePrefs {
  kind: Ambience
  volume: number // 0..1
}

const KEY = 'lifeos.ambience'
const DEFAULTS: AmbiencePrefs = { kind: 'off', volume: 0.5 }
const FADE_IN = 1.5
const FADE_OUT = 0.8
const PREVIEW_MS = 5000

function load(): AmbiencePrefs {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (s && AMBIENCES.includes(s.kind)) return { kind: s.kind, volume: clamp01(Number(s.volume ?? DEFAULTS.volume)) }
  } catch {
    /* ignore */
  }
  return DEFAULTS
}

function clamp01(v: number) {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULTS.volume
}

let prefs = load()
const listeners = new Set<() => void>()

export function useAmbiencePrefs(): AmbiencePrefs {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => prefs,
  )
}

export function setAmbiencePrefs(change: Partial<AmbiencePrefs>) {
  prefs = { ...prefs, ...change, volume: clamp01(change.volume ?? prefs.volume) }
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
  applyVolume()
  sync()
}

// ---- playback ---------------------------------------------------------------------------------------------

let bus: GainNode | null = null // volume
let current: { kind: Ambience; layer: GainNode; stop: (at: number) => void } | null = null
let timerActive = false
let previewing = false
let previewTimer: ReturnType<typeof setTimeout> | undefined

/** Volume slider position → gain. Squared so the low end of the slider is usable. */
function gainFor(volume: number) {
  return volume * volume * 0.9
}

function output(c: BaseAudioContext) {
  if (!bus) {
    bus = c.createGain()
    bus.gain.value = gainFor(prefs.volume)
    bus.connect(c.destination)
  }
  return bus
}

function applyVolume() {
  if (!bus) return
  const c = bus.context
  bus.gain.setTargetAtTime(gainFor(prefs.volume), c.currentTime, 0.05)
}

/** Called by the focus timer: true while a session counts down or a break runs. */
export function setAmbienceActive(active: boolean) {
  if (timerActive === active) return
  timerActive = active
  sync()
}

/** Plays the chosen sound for a few seconds so it can be heard before a session starts. */
export function previewAmbience() {
  clearTimeout(previewTimer)
  previewing = true
  sync()
  previewTimer = setTimeout(() => {
    previewing = false
    sync()
  }, PREVIEW_MS)
}

function sync() {
  const want = (timerActive || previewing) && prefs.kind !== 'off' ? prefs.kind : null
  if (current && current.kind === want) return
  if (current) stopCurrent()
  if (want === 'piano' && !pianoData) {
    audioContext() // create/resume it now, inside the tap, so the browser lets it play once the piece is ready
    void preparePiano().then(sync)
    return
  }
  if (want) start(want)
}

function stopCurrent() {
  if (!current) return
  const { layer, stop } = current
  const c = layer.context
  const t = c.currentTime
  layer.gain.cancelScheduledValues(t)
  layer.gain.setValueAtTime(layer.gain.value, t)
  layer.gain.linearRampToValueAtTime(0, t + FADE_OUT)
  stop(t + FADE_OUT + 0.05)
  setTimeout(() => layer.disconnect(), (FADE_OUT + 0.2) * 1000)
  current = null
}

function start(kind: Ambience) {
  try {
    const c = audioContext()
    if (!c) return
    const layer = c.createGain()
    layer.gain.setValueAtTime(0, c.currentTime)
    layer.gain.linearRampToValueAtTime(1, c.currentTime + FADE_IN)
    layer.connect(output(c))
    const sources = BUILDERS[kind as Exclude<Ambience, 'off'>](c, layer)
    current = {
      kind,
      layer,
      stop: (at) => sources.forEach((s) => {
        try {
          s.stop(at)
        } catch {
          /* already stopped */
        }
      }),
    }
  } catch {
    /* sound is a nicety; never let it break the timer */
  }
}

// Browsers suspend audio until a gesture; if a session was already running when the app opened, the first tap resumes it.
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', () => {
    if (current) void audioContext()?.resume()
  }, { passive: true })
}

// ---- the sounds -------------------------------------------------------------------------------------------

type Source = AudioScheduledSourceNode
const cache = new Map<string, AudioBuffer>()

function buffer(c: BaseAudioContext, key: string, seconds: number, fill: (data: Float32Array, rate: number) => void) {
  const hit = cache.get(key)
  if (hit && hit.sampleRate === c.sampleRate) return hit
  const b = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate)
  fill(b.getChannelData(0), c.sampleRate)
  cache.set(key, b)
  return b
}

function loop(c: BaseAudioContext, b: AudioBuffer, to: AudioNode) {
  const src = c.createBufferSource()
  src.buffer = b
  src.loop = true
  src.connect(to)
  src.start()
  return src
}

function brown(data: Float32Array) {
  let last = 0
  for (let i = 0; i < data.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
    data[i] = last * 3.5
  }
}

function pink(data: Float32Array) {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
  for (let i = 0; i < data.length; i++) {
    const w = Math.random() * 2 - 1
    b0 = 0.99886 * b0 + w * 0.0555179
    b1 = 0.99332 * b1 + w * 0.0750759
    b2 = 0.969 * b2 + w * 0.153852
    b3 = 0.8665 * b3 + w * 0.3104856
    b4 = 0.55 * b4 + w * 0.5329522
    b5 = -0.7616 * b5 - w * 0.016898
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
    b6 = w * 0.115926
  }
}

/** Short decaying noise bursts at random moments (raindrops on a window, crackles in a fire). */
function bursts(perSecond: number, minMs: number, maxMs: number, minGain: number) {
  return (data: Float32Array, rate: number) => {
    const count = Math.floor((data.length / rate) * perSecond)
    for (let n = 0; n < count; n++) {
      const at = Math.floor(Math.random() * data.length)
      const len = Math.floor(((minMs + Math.random() * (maxMs - minMs)) / 1000) * rate)
      const amp = minGain + Math.random() * (1 - minGain)
      for (let i = 0; i < len && at + i < data.length; i++) data[at + i] += (Math.random() * 2 - 1) * amp * (1 - i / len) ** 4
    }
  }
}

function filter(c: BaseAudioContext, type: BiquadFilterType, freq: number, q = 0.7) {
  const f = c.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  return f
}

function gain(c: BaseAudioContext, value: number) {
  const g = c.createGain()
  g.gain.value = value
  return g
}

/** A slow sine that moves an AudioParam up and down by `depth` around its value. */
function lfo(c: BaseAudioContext, param: AudioParam, hz: number, depth: number): Source {
  const osc = c.createOscillator()
  osc.frequency.value = hz
  const amt = gain(c, depth)
  osc.connect(amt).connect(param)
  osc.start()
  return osc
}

// ---- piano ------------------------------------------------------------------------------------------------

/** Deterministic random numbers, so the piece is the same every time. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12)

/**
 * A slow piano piece, written straight into a buffer: Am – F – C – G, twice (48 s), a broken chord in the left hand
 * and a sparse melody over it. Each note is a few slightly stretched harmonics (like a real string) that fade at
 * their own rates, higher ones faster. Note tails run past the end wrap round to the start, so the loop is seamless.
 */
const PIANO_RATE = 44100
const PIANO_SECONDS = 48

/** The score: [midi note, start (s), velocity]. */
function pianoScore() {
  const rand = seeded(7)
  const CHORD_SECONDS = 6
  const chords = [
    { hand: [45, 52, 57, 60], tune: [69, 72, 76, 74, 67] }, // Am
    { hand: [41, 48, 53, 57], tune: [69, 72, 77, 74, 65] }, // F
    { hand: [48, 55, 60, 64], tune: [67, 72, 76, 74, 79] }, // C
    { hand: [43, 50, 55, 59], tune: [67, 71, 74, 79, 62] }, // G
  ]
  const notes: [number, number, number][] = []
  for (let bar = 0; bar < PIANO_SECONDS / CHORD_SECONDS; bar++) {
    const { hand, tune } = chords[bar % 4]
    const t0 = bar * CHORD_SECONDS
    ;[0, 1, 2, 3, 2, 1].forEach((k, i) => notes.push([hand[k], t0 + i + (rand() - 0.5) * 0.03, i === 0 ? 0.32 : 0.2 + rand() * 0.05]))
    const slots = [0, 1.5, 3, 4.5].filter(() => rand() < 0.65)
    let last = -1
    for (const s of slots) {
      let m = tune[Math.floor(rand() * tune.length)]
      if (m === last) m = tune[(tune.indexOf(m) + 1) % tune.length]
      last = m
      notes.push([m, t0 + s + 0.02 + rand() * 0.04, 0.3 + rand() * 0.12])
    }
  }
  return notes
}

let pianoData: Float32Array | null = null
let pianoJob: Promise<Float32Array> | null = null

/**
 * Composes the piece once, a few notes at a time with pauses in between, so the page never freezes while it is
 * written (it takes about half a second in all).
 */
export function preparePiano(): Promise<Float32Array> {
  pianoJob ??= (async () => {
    const data = new Float32Array(PIANO_RATE * PIANO_SECONDS)
    const notes = pianoScore()
    for (let i = 0; i < notes.length; i++) {
      pianoNote(data, PIANO_RATE, ...notes[i])
      await new Promise((r) => setTimeout(r, 0))
    }
    let peak = 0
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]))
    if (peak > 0) for (let i = 0; i < data.length; i++) data[i] *= 0.8 / peak
    pianoData = data
    return data
  })()
  return pianoJob
}

function pianoNote(data: Float32Array, rate: number, midi: number, at: number, velocity: number) {
  const len = data.length
  {
    const f = midiHz(midi)
    const start = Math.floor(at * rate)
    const n = Math.floor(Math.min(5, 2.5 + 220 / f) * rate)
    const attack = Math.floor(0.004 * rate)
    const base = 0.35 + f / 650
    for (let h = 1; h <= 5; h++) {
      const fh = f * h * Math.sqrt(1 + 0.0004 * h * h)
      if (fh > rate / 2.2) break
      const w = (2 * Math.PI * fh) / rate
      const cw = Math.cos(w)
      const sw = Math.sin(w)
      const decay = Math.exp(-(base * (1 + 0.7 * (h - 1))) / rate)
      let x = 1, y = 0, amp = velocity / h ** 1.4
      for (let i = 0; i < n; i++) {
        const env = i < attack ? i / attack : 1
        data[(start + i) % len] += y * amp * env
        const nx = x * cw - y * sw
        y = x * sw + y * cw
        x = nx
        amp *= decay
      }
    }
  }
}

/** A soft room: two channels of decaying noise, for a ConvolverNode. */
function room(c: BaseAudioContext) {
  const key = 'room'
  const hit = cache.get(key)
  if (hit && hit.sampleRate === c.sampleRate) return hit
  const b = c.createBuffer(2, Math.floor(c.sampleRate * 2.8), c.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch)
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3
  }
  cache.set(key, b)
  return b
}

const BUILDERS: Record<Exclude<Ambience, 'off'>, (c: BaseAudioContext, out: AudioNode) => Source[]> = {
  // A slow, quiet piano piece in a small room
  piano: (c, out) => {
    const soft = filter(c, 'lowpass', 4200)
    soft.connect(out)
    const dry = gain(c, 0.75)
    dry.connect(soft)
    const verb = c.createConvolver()
    verb.buffer = room(c)
    const wet = gain(c, 0.35)
    verb.connect(wet).connect(soft)
    const piece = c.createBuffer(1, pianoData!.length, PIANO_RATE)
    piece.copyToChannel(pianoData!, 0)
    const src = loop(c, piece, dry)
    src.connect(verb)
    return [src]
  },
  // Steady hiss of rain plus scattered drops
  rain: (c, out) => {
    const hiss = gain(c, 0.55)
    hiss.connect(filter(c, 'highpass', 400)).connect(filter(c, 'lowpass', 7000)).connect(out)
    const drops = gain(c, 0.12)
    drops.connect(filter(c, 'bandpass', 2600, 0.9)).connect(out)
    const body = gain(c, 0.25)
    body.connect(filter(c, 'lowpass', 600)).connect(out)
    return [
      loop(c, buffer(c, 'pink', 6, pink), hiss),
      loop(c, buffer(c, 'drops', 9, bursts(28, 3, 14, 0.15)), drops),
      loop(c, buffer(c, 'brown', 6, brown), body),
      lfo(c, hiss.gain, 0.07, 0.08),
    ]
  },
  // Deep noise that swells and recedes every ~11 s
  waves: (c, out) => {
    const swell = gain(c, 0.45)
    const tone = filter(c, 'lowpass', 700)
    swell.connect(tone).connect(out)
    const foam = gain(c, 0.08)
    foam.connect(filter(c, 'highpass', 1800)).connect(out)
    return [
      loop(c, buffer(c, 'brown', 6, brown), swell),
      loop(c, buffer(c, 'pink', 6, pink), foam),
      lfo(c, swell.gain, 0.09, 0.38),
      lfo(c, foam.gain, 0.09, 0.07),
      lfo(c, tone.frequency, 0.09, 350),
    ]
  },
  // Low rumble and crackles
  fire: (c, out) => {
    const rumble = gain(c, 0.5)
    rumble.connect(filter(c, 'lowpass', 300)).connect(out)
    const crackle = gain(c, 0.35)
    crackle.connect(filter(c, 'highpass', 1200)).connect(out)
    return [
      loop(c, buffer(c, 'brown', 6, brown), rumble),
      loop(c, buffer(c, 'crackle', 11, bursts(5, 2, 9, 0.2)), crackle),
      lfo(c, rumble.gain, 0.23, 0.12),
    ]
  },
  // Plain brown noise: soft and even, good for blocking out a room
  brown: (c, out) => {
    const g = gain(c, 0.6)
    g.connect(filter(c, 'lowpass', 900)).connect(out)
    return [loop(c, buffer(c, 'brown', 6, brown), g)]
  },
  // A wall clock: tick, tock
  tick: (c, out) => {
    const tick = buffer(c, 'tick', 2, (data, rate) => {
      ;[0, 1].forEach((sec) => {
        const at = sec * rate
        const len = Math.floor(0.012 * rate)
        const f = sec ? 2100 : 2700
        for (let i = 0; i < len; i++) {
          const env = (1 - i / len) ** 3
          data[at + i] = (Math.sin((2 * Math.PI * f * i) / rate) * 0.6 + (Math.random() * 2 - 1) * 0.4) * env
        }
      })
    })
    const g = gain(c, 0.35)
    g.connect(filter(c, 'bandpass', 2400, 1.4)).connect(out)
    return [loop(c, tick, g)]
  },
  // A slow, soft chord (A, E, A, B, C#) whose notes breathe in and out
  tones: (c, out) => {
    const warm = filter(c, 'lowpass', 1100)
    const master = gain(c, 0.22)
    warm.connect(master).connect(out)
    const sources: Source[] = []
    ;[110, 164.81, 220, 246.94, 277.18].forEach((f, i) => {
      const g = gain(c, 0.18)
      g.connect(warm)
      ;[-3, 3].forEach((cents) => {
        const osc = c.createOscillator()
        osc.type = i === 0 ? 'sine' : 'triangle'
        osc.frequency.value = f
        osc.detune.value = cents
        osc.connect(g)
        osc.start()
        sources.push(osc)
      })
      sources.push(lfo(c, g.gain, 0.05 + i * 0.023, 0.13))
    })
    return sources
  },
}

/** Renders `seconds` of a sound offline (no speakers needed): for tests and for listening to a sound as a file. */
export async function renderAmbience(kind: Exclude<Ambience, 'off'>, seconds: number, sampleRate = 44100) {
  if (kind === 'piano') await preparePiano()
  const c = new OfflineAudioContext(2, Math.floor(seconds * sampleRate), sampleRate)
  BUILDERS[kind](c, c.destination)
  return c.startRendering()
}
