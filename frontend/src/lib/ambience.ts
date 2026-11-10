/**
 * Background sound for focus sessions and breaks: rain, waves, a fire, brown noise, a clock or soft tones.
 * Like the UI sounds, it is synthesized with the Web Audio API (no files, works offline). Every layer is a
 * looping buffer or an oscillator, so it keeps playing in a background tab without JavaScript timers.
 * The chosen sound and its volume live on this device.
 */
import { useSyncExternalStore } from 'react'

import { audioContext } from './sound'

export const AMBIENCES = ['off', 'rain', 'waves', 'fire', 'brown', 'tick', 'tones'] as const
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

function output(c: AudioContext) {
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

function buffer(c: AudioContext, key: string, seconds: number, fill: (data: Float32Array, rate: number) => void) {
  const hit = cache.get(key)
  if (hit && hit.sampleRate === c.sampleRate) return hit
  const b = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate)
  fill(b.getChannelData(0), c.sampleRate)
  cache.set(key, b)
  return b
}

function loop(c: AudioContext, b: AudioBuffer, to: AudioNode) {
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

function filter(c: AudioContext, type: BiquadFilterType, freq: number, q = 0.7) {
  const f = c.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  return f
}

function gain(c: AudioContext, value: number) {
  const g = c.createGain()
  g.gain.value = value
  return g
}

/** A slow sine that moves an AudioParam up and down by `depth` around its value. */
function lfo(c: AudioContext, param: AudioParam, hz: number, depth: number): Source {
  const osc = c.createOscillator()
  osc.frequency.value = hz
  const amt = gain(c, depth)
  osc.connect(amt).connect(param)
  osc.start()
  return osc
}

const BUILDERS: Record<Exclude<Ambience, 'off'>, (c: AudioContext, out: AudioNode) => Source[]> = {
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
