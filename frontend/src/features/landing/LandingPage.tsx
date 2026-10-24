import { BookOpen, Check, Flame, Mail, Timer } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import '../../styles/landing.css'
import { LanguageSwitcher } from '../../app/LanguageSwitcher'
import { createScene } from '../../lib/academia/scene'
import i18n from '../../lib/i18n'
import { play } from '../../lib/sound'
import { DARK_SCENES, SCENES, type Scene } from '../../lib/theme'
import en from '../../locales/en/landing.json'
import zh from '../../locales/zh-CN/landing.json'

// The page's words travel with the page (not in the app's first download)
i18n.addResourceBundle('en', 'landing', en, true, true)
i18n.addResourceBundle('zh-CN', 'landing', zh, true, true)

type Span = 'day' | 'week' | 'month'
const ROOMS = ['tasks', 'calendar', 'goals', 'habits', 'focus', 'journal', 'insights', 'graph'] as const
// label-strip colour pairs, rotating so neighbours never match
const STRIPS: [string, string][] = [
  ['var(--library)', 'var(--paper)'],
  ['var(--brass)', 'var(--ink)'],
  ['var(--chalk)', 'var(--paper)'],
  ['var(--oxblood)', 'var(--paper)'],
]
const PLATES: Record<Scene, { src: string; w: number; h: number; title: string; by: string }> = {
  library: { src: '/landing/library.jpg', w: 1000, h: 631, title: 'Interior of a Library', by: 'Daniel Marot the Elder, 1703' },
  chalkboard: { src: '/landing/geometry.jpg', w: 576, h: 1000, title: 'Geometry, plate 24 from Arts and Sciences', by: 'Master of the E-Series Tarocchi, c. 1465' },
  observatory: { src: '/landing/astrolabe.jpg', w: 730, h: 1000, title: 'Astrolabe', by: 'Iran, Qajar dynasty, late 18th century' },
  parchment: { src: '/landing/manuscript.jpg', w: 646, h: 1000, title: 'Illuminated Manuscript Leaf', by: 'Italy, c. 1450' },
  botanical: { src: '/landing/fern.jpg', w: 720, h: 1000, title: 'Botanical Specimen: Fern', by: 'Photograph, 1855–60' },
}
const CREDITS = [
  ['Rembrandt van Rijn, A Scholar in His Study (Faust), c. 1652', 'Art Institute of Chicago', 'https://www.artic.edu/artworks/107865'],
  ['Daniel Marot the Elder, Interior of a Library, 1703', 'The Metropolitan Museum of Art', 'https://www.metmuseum.org/art/collection/search/426446'],
  ['Master of the E-Series Tarocchi, Geometry, c. 1465', 'Art Institute of Chicago', 'https://www.artic.edu/artworks/11462'],
  ['Astrolabe, Qajar dynasty, late 18th century', 'Art Institute of Chicago', 'https://www.artic.edu/artworks/90589'],
  ['Illuminated Manuscript Leaf, Italy, c. 1450', 'Art Institute of Chicago', 'https://www.artic.edu/artworks/72884'],
  ['Botanical Specimen: Fern, 1855–60', 'The Metropolitan Museum of Art', 'https://www.metmuseum.org/art/collection/search/285149'],
] as const
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
const BLOCKS = [
  { ch: 'L', name: 'seal', bg: 'var(--oxblood)', fg: 'var(--paper)', h: 100 },
  { ch: 'I', name: 'brass', bg: 'var(--brass)', fg: 'var(--library)', h: 74 },
  { ch: 'F', name: 'botanical', bg: 'var(--sage)', fg: 'var(--library)', h: 88 },
  { ch: 'E', name: 'parchment', bg: 'var(--paper)', fg: 'var(--library)', h: 66 },
  null,
  { ch: 'O', name: 'observatory', bg: 'var(--navy)', fg: 'var(--paper)', h: 94 },
  { ch: 'S', name: 'chalkboard', bg: 'var(--chalk)', fg: 'var(--paper)', h: 80 },
]
const PIC_FIELDS = ['var(--oxblood)', 'var(--sage)', 'var(--navy)', 'var(--brass)', 'var(--chalk)', 'var(--library)', 'var(--sage)', 'var(--navy)']

/**
 * What visitors see before signing in. The five rooms of the Academia study become the page's colour chapters: each
 * section is one flat field, butted edge to edge. The pictures are fragments of the app itself; the live parts are
 * real (tick a task, write tonight's page and read tomorrow's report, shape a report, switch the study). Shown at the
 * app's address when nobody is signed in (App.tsx); "Sign in" goes to /login.
 */
export default function LandingPage() {
  const { t } = useTranslation('landing')
  const navigate = useNavigate()
  const root = useRise()
  const [study, setStudy] = useState<Scene>('library')
  const signIn = () => {
    play('tap')
    navigate('/login')
  }
  const goStudy = (s: Scene) => {
    play('tap')
    setStudy(s)
    document.getElementById('studies')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div ref={root} className="landing">
      <div className="l-ribbon" aria-hidden />
      {/* Hero: what this is, and its Today page on an oxblood stage */}
      <header className="l-hero">
        <nav className="l-nav" aria-label={t('nav.label')}>
          <span className="mark">
            <img src="/icon.svg" alt="" width={36} height={36} className="rounded-[9px]" />
            Life OS
          </span>
          <div className="links">
            <a href="#day">{t('nav.day')}</a>
            <a href="#reports">{t('nav.reports')}</a>
            <a href="#studies">{t('nav.studies')}</a>
            <a href="#rooms">{t('nav.rooms')}</a>
          </div>
          <button type="button" className="l-btn small" onClick={signIn}>
            {t('nav.signIn')}
          </button>
        </nav>
        <div className="copy">
          <h1>
            <span className="mask">
              <span>{t('hero.title')}</span>
            </span>
          </h1>
          <p className="lead">{t('hero.body')}</p>
          <div className="actions">
            <button type="button" className="l-btn" onClick={signIn}>
              <BookOpen size={18} aria-hidden />
              {t('hero.cta')}
            </button>
          </div>
        </div>
        <Stage>
          <TodayPage />
        </Stage>
      </header>

      <main>
        <JournalToReport />
        <Reports />
        <ADay />

        <section id="studies" className={`l-studies l-open ${DARK_SCENES.has(study) ? '' : 'light'}`} aria-labelledby="studies-title">
          <SceneCanvas key={study} scene={study} />
          <div className="s-text">
            <h2 id="studies-title" className="s-title" data-rise>
              {t('studies.title')}
            </h2>
            <p className="name" aria-live="polite" data-rise style={{ '--i': 1 } as CSSProperties}>
              <span key={study} className="l-swap inline-block">
                {t(`studies.${study}.name`)}
              </span>
            </p>
            <p className="about" data-rise style={{ '--i': 2 } as CSSProperties}>
              <span key={study} className="l-swap block" style={{ animationDelay: '80ms' }}>
                {t(`studies.${study}.body`)}
              </span>
            </p>
            <div className="choices" role="group" aria-label={t('studies.label')}>
              {SCENES.map((s) => (
                <button key={s} type="button" aria-pressed={study === s} onClick={() => goStudy(s)}>
                  <img src={PLATES[s].src} width={PLATES[s].w} height={PLATES[s].h} alt="" loading="lazy" decoding="async" />
                  <span>{t(`studies.${s}.name`)}</span>
                </button>
              ))}
            </div>
          </div>
          <figure className="s-plate">
            <div className="frame l-drift">
              <img key={study} className="l-shutter-img" src={PLATES[study].src} width={PLATES[study].w} height={PLATES[study].h} alt={t(`studies.${study}.alt`)} loading="lazy" decoding="async" />
            </div>
            <figcaption>
              {PLATES[study].title} · {PLATES[study].by}
            </figcaption>
          </figure>
        </section>

        <Rooms />

        <section aria-labelledby="band-title">
          <h2 id="band-title" className="sr-only">
            {t('rooms.title')}
          </h2>
          <div className="l-band l-open" aria-hidden>
            {[0, 1].map((copy) => (
              <div key={copy} className="track">
                {(t('band.names', { returnObjects: true }) as string[]).map((n) => (
                  <span key={n}>{n}</span>
                ))}
              </div>
            ))}
          </div>
          <p className="l-band-note" data-rise>
            {t('band.note')}
          </p>
        </section>

        {/* The close: one action tile, cropped from a longer row */}
        <section className="l-cta" aria-labelledby="cta-title" data-play>
          <div className="flank-l">
            <img className="l-drift" src="/landing/scholar.jpg" width={785} height={1000} alt={t('cta.scholar')} loading="lazy" decoding="async" />
          </div>
          <div className="tile">
            <h2 id="cta-title" data-rise>
              {t('cta.title')}
            </h2>
            <p data-rise style={{ '--i': 1 } as CSSProperties}>
              {t('cta.body')}
            </p>
            <div data-rise style={{ '--i': 2 } as CSSProperties}>
              <button type="button" className="l-btn on-dark" onClick={signIn}>
                <BookOpen size={18} aria-hidden />
                {t('cta.button')}
              </button>
            </div>
          </div>
          <div className="flank-r" aria-hidden />
        </section>
      </main>

      <footer className="l-footer">
        {/* The name, built from blocks in the study's colours, each labelled with what it is */}
        <div className="l-blocks" data-play>
          {BLOCKS.map((b, i) =>
            b ? (
              <span key={i} style={{ background: b.bg, color: b.fg, height: `${b.h}%`, '--k': i } as CSSProperties}>
                <small>{t(`footer.swatches.${b.name}`)}</small>
                {b.ch}
              </span>
            ) : (
              <i key={i} className="w-[2%]" />
            ),
          )}
        </div>
        <div className="cols">
          <div>
            <h2>{t('footer.rooms')}</h2>
            <ul>
              {ROOMS.slice(0, 4).map((r) => (
                <li key={r}>
                  <a href="#rooms">{t(`rooms.${r}.name`)}</a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2>{t('footer.studies')}</h2>
            <ul>
              {SCENES.map((s) => (
                <li key={s}>
                  <button type="button" onClick={() => goStudy(s)}>
                    {t(`studies.${s}.name`)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2>{t('footer.yours')}</h2>
            <ul>
              <li>{t('footer.private')}</li>
              <li>{t('footer.offline')}</li>
              <li>{t('footer.export')}</li>
            </ul>
          </div>
          <div>
            <h2>{t('footer.language')}</h2>
            <div className="l-lang">
              <LanguageSwitcher />
            </div>
          </div>
        </div>
        <p className="credits">
          {t('footer.pictures')}{' '}
          {CREDITS.map(([work, via, url], i) => (
            <span key={url}>
              <a href={url} target="_blank" rel="noreferrer">
                {work}
              </a>{' '}
              ({via}){i < CREDITS.length - 1 ? '; ' : '.'}
            </span>
          ))}
        </p>
        <div className="last">
          <span>{t('footer.made')}</span>
          <button type="button" className="l-btn small on-dark" onClick={signIn}>
            {t('footer.signIn')}
          </button>
        </div>
      </footer>
    </div>
  )
}

/** Adds the entrance: each marked part rises in, once, as it scrolls into view. Without script everything shows. */
function useRise() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !('IntersectionObserver' in window)) return
    el.classList.add('anim')
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          e.target.classList.add('in')
          io.unobserve(e.target)
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    )
    el.querySelectorAll('[data-rise], [data-play]').forEach((n) => io.observe(n))
    return () => io.disconnect()
  }, [])
  return ref
}

/** The hero's oxblood stage; its page leans a little towards the pointer, like a sheet picked up from a desk */
function Stage({ children }: { children: ReactNode }) {
  const tilt = useRef<HTMLDivElement>(null)
  const move = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || reduceMotion() || !tilt.current) return
    const r = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5
    const y = (e.clientY - r.top) / r.height - 0.5
    tilt.current.style.transform = `perspective(1400px) rotateY(${x * 6}deg) rotateX(${-y * 5}deg) translateY(-4px)`
  }
  const leave = () => {
    if (tilt.current) tilt.current.style.transform = ''
  }
  return (
    <div className="l-stage l-shutter" onPointerMove={move} onPointerLeave={leave}>
      <div className="frag">
        <div ref={tilt} className="tilt">
          {children}
        </div>
      </div>
    </div>
  )
}

/** A number that rolls to its new value (and from zero the first time it's seen); the final value is what's read out */
function Count({ value, render = (n: number) => String(Math.round(n)) }: { value: number; render?: (n: number) => string }) {
  const [shown, setShown] = useState(0)
  const from = useRef(0)
  const ref = useRef<HTMLSpanElement>(null)
  const seen = useRef(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let frame = 0
    const run = () => {
      if (reduceMotion()) {
        setShown(value)
        from.current = value
        return
      }
      const start = performance.now()
      const a = from.current
      const tick = (now: number) => {
        const k = Math.min(1, (now - start) / 700)
        const eased = 1 - Math.pow(1 - k, 3)
        setShown(a + (value - a) * eased)
        if (k < 1) frame = requestAnimationFrame(tick)
        else from.current = value
      }
      frame = requestAnimationFrame(tick)
    }
    if (seen.current) {
      run()
      return () => cancelAnimationFrame(frame)
    }
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      seen.current = true
      io.disconnect()
      run()
    })
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [value])
  return (
    <span ref={ref}>
      <span aria-hidden>{render(shown)}</span>
      <span className="sr-only">{render(value)}</span>
    </span>
  )
}

/** One of the Academia scenes, painted live (or once, when `still`) to fill its parent. */
function SceneCanvas({ scene, still }: { scene: Scene; still?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const painter = useRef<ReturnType<typeof createScene> | null>(null)
  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    const sky = createScene(scene)
    painter.current = sky
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let visible = true
    let frame = 0
    let last = 0
    const size = () => {
      const r = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(r.width * dpr)
      canvas.height = Math.round(r.height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      sky.resize(r.width, r.height)
      sky.draw(ctx, 0, 0, 0, true)
    }
    const loop = (time: number) => {
      frame = requestAnimationFrame(loop)
      if (!visible || time - last < 33) return
      last = time
      sky.draw(ctx, time, 0, 0, false)
    }
    size()
    const ro = new ResizeObserver(size)
    ro.observe(canvas)
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting))
    io.observe(canvas)
    if (!still && !reduce) frame = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      io.disconnect()
    }
    // the scene changes through `set` below, without rebuilding the canvas
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still])
  useEffect(() => {
    painter.current?.set(scene)
    const canvas = ref.current
    if (canvas && painter.current) painter.current.draw(canvas.getContext('2d')!, performance.now(), 0, 0, true)
  }, [scene])
  return <canvas ref={ref} aria-hidden />
}

/** The hero's picture: the real Today page, where tasks can be ticked */
function TodayPage() {
  const { t } = useTranslation('landing')
  const tasks = [
    { key: 't1', colour: '#d70015', urgent: true },
    { key: 't2', colour: '#ff9f0a' },
    { key: 't3', colour: '#ff9f0a' },
    { key: 't4', colour: '#d9a400' },
  ]
  const [done, setDone] = useState<Set<string>>(new Set())
  const toggle = (k: string) => {
    play(done.has(k) ? 'uncheck' : 'complete')
    const next = new Set(done)
    if (next.has(k)) next.delete(k)
    else next.add(k)
    setDone(next)
  }
  return (
    <div data-ui className="p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="ui-title">{t('hero.today')}</p>
        <p className="ui-sub">{t('hero.date')}</p>
      </div>
      <ul className="mt-3">
        {tasks.map(({ key, colour }, i) => {
          const on = done.has(key)
          return (
            <li key={key} className="l-today-row flex items-center gap-3 py-2" style={{ '--i': i } as CSSProperties}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                aria-label={t('hero.tick', { title: t(`hero.${key}`) })}
                onClick={() => toggle(key)}
                className="l-check flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 active:scale-90"
                style={{ borderColor: on ? '#7a2a22' : colour, background: on ? '#7a2a22' : 'transparent' }}
              >
                {on && <Check size={13} strokeWidth={3} className="text-[#fff]" aria-hidden />}
              </button>
              <span className="min-w-0 flex-1">
                <span className={`block text-[15px] font-medium transition-colors ${on ? 'text-[#7a6b58]' : ''}`}>
                  <span className={`l-strike ${on ? 'done' : ''}`}>{t(`hero.${key}`)}</span>
                </span>
                <span className="ui-sub block text-[13px]">{t(`hero.${key}meta`)}</span>
              </span>
            </li>
          )
        })}
      </ul>
      <div className="l-today-row mt-3 flex flex-wrap gap-2 rounded-[10px] bg-[#f5eddb] p-2.5" style={{ '--i': tasks.length } as CSSProperties}>
        <span className="ui-chip bg-[#7a2a22]! text-[#fff]!">
          <Seal size={14} /> {t('hero.goal')} · 55%
        </span>
        <span className="ui-chip">
          <Flame size={13} aria-hidden /> {t('hero.habit')} · {t('hero.streak')}
        </span>
        <span className="ui-chip">
          <Timer size={13} aria-hidden /> {t('hero.focus')} · {t('hero.focusOn')}
        </span>
      </div>
    </div>
  )
}

function Seal({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
      <path d="M10 1.5l2 1.6 2.5-.4 1 2.4 2.3 1.1-.4 2.5 1.6 2-1.6 2 .4 2.5-2.3 1.1-1 2.4-2.5-.4-2 1.6-2-1.6-2.5.4-1-2.4-2.3-1.1.4-2.5L1.5 10l1.6-2-.4-2.5L5 4.4l1-2.4 2.5.4z" fill="#c4574a" />
      <circle cx="10" cy="10" r="4.6" fill="none" stroke="rgb(255 230 210 / 0.7)" strokeWidth="1.2" />
    </svg>
  )
}

/** Input half, output half: write tonight's page, and see tomorrow's daily report take it in */
function JournalToReport() {
  const { t } = useTranslation('landing')
  const [text, setText] = useState(() => (reduceMotion() ? t('journal.sample') : ''))
  const [mood, setMood] = useState(4)
  const moods = t('journal.moods', { returnObjects: true }) as string[]
  const area = useRef<HTMLTextAreaElement>(null)
  const typing = useRef<number | null>(null)
  const stopTyping = () => {
    if (typing.current != null) window.clearInterval(typing.current)
    typing.current = null
  }
  useEffect(() => {
    const sample = t('journal.sample')
    const el = area.current
    if (!el || reduceMotion()) {
      setText(sample)
      return
    }
    setText('')
    // type it out once the page is in view, a few letters at a time
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      let n = 0
      typing.current = window.setInterval(() => {
        n = Math.min(sample.length, n + 2)
        setText(sample.slice(0, n))
        if (n >= sample.length) stopTyping()
      }, 28)
    }, { threshold: 0.4 })
    io.observe(el)
    return () => {
      io.disconnect()
      stopTyping()
    }
  }, [t])
  return (
    <section id="day-page" className="l-split l-open" aria-labelledby="journal-title">
      <h2 id="journal-title" className="sr-only">
        {t('journal.left')} {t('journal.right')}
      </h2>
      <div className="dark">
        <div className="input" data-rise>
          <label htmlFor="landing-journal" className="sr-only">
            {t('journal.label')}
          </label>
          <textarea
            ref={area}
            id="landing-journal"
            value={text}
            onFocus={() => {
              if (typing.current != null) {
                stopTyping()
                setText(t('journal.sample'))
              }
            }}
            onChange={(e) => setText(e.target.value)}
            maxLength={400}
            spellCheck={false}
          />
          <div className="l-moods" role="group" aria-label={t('journal.moodLabel')}>
            {moods.map((m, i) => (
              <button
                key={m}
                type="button"
                aria-pressed={mood === i + 1}
                onClick={() => {
                  play('tap')
                  setMood(i + 1)
                }}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <p className="half-title" aria-hidden>
          {t('journal.left')}
        </p>
      </div>
      <div className="light">
        <div className="output" data-rise style={{ '--i': 1 } as CSSProperties}>
          <div data-ui className="p-5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="ui-title">{t('journal.report')}</p>
              <p className="ui-sub">{t('journal.reportDate')}</p>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3">
              {[
                [t('journal.done'), t('journal.doneValue')],
                [t('journal.focus'), t('journal.focusValue')],
                [t('journal.habits'), t('journal.habitsValue')],
                [t('journal.mood'), `${mood}/5 · ${moods[mood - 1]}`],
              ].map(([k, v], i) => (
                <div key={k} className="rounded-[10px] bg-[#f5eddb] p-3">
                  <dt className="ui-sub text-[13px]">{k}</dt>
                  <dd key={i === 3 ? mood : undefined} className={`tab-nums mt-0.5 text-[16px] font-semibold ${i === 3 ? 'l-swap' : ''}`}>
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="ui-sub mt-4 text-[13px]">{t('journal.page')}</p>
            <blockquote className="mt-1 border-l-2 border-[#7a2a22] pl-3 text-[15px] leading-relaxed whitespace-pre-line">{text.trim() ? text.trim().slice(0, 220) : '…'}</blockquote>
          </div>
        </div>
        <p className="half-title" aria-hidden>
          {t('journal.right')}
        </p>
      </div>
    </section>
  )
}

const FIGURES: Record<Span, { done: [number, number]; focus: [number, number]; habits: [number, number]; mood: [number, number]; time: [number, number, number] }> = {
  day: { done: [4, 3], focus: [100, 75], habits: [100, 50], mood: [4, 3], time: [55, 30, 15] },
  week: { done: [23, 18], focus: [640, 520], habits: [86, 79], mood: [3.9, 3.6], time: [290, 210, 140] },
  month: { done: [88, 74], focus: [2460, 2110], habits: [81, 77], mood: [3.8, 3.7], time: [1120, 860, 480] },
}

/** Fixed output, live controls: the report on the left changes with every control on the right */
function Reports() {
  const { t } = useTranslation('landing')
  const [span, setSpan] = useState<Span>('week')
  const [email, setEmail] = useState(false)
  const [time, setTime] = useState(true)
  const [compare, setCompare] = useState(true)
  const f = FIGURES[span]
  const hm = (m: number) => t('reports.minutes', { h: Math.floor(m / 60), m: m % 60 })
  const rows: [string, number, (n: number) => string, string][] = [
    [t('reports.done'), f.done[0], (n) => String(Math.round(n)), String(f.done[1])],
    [t('reports.focus'), f.focus[0], (n) => hm(Math.round(n)), hm(f.focus[1])],
    [t('reports.habits'), f.habits[0], (n) => `${Math.round(n)}%`, `${f.habits[1]}%`],
    [t('reports.mood'), f.mood[0], (n) => `${n.toFixed(1)}/5`, `${f.mood[1]}/5`],
  ]
  const most = Math.max(...f.time)
  return (
    <section id="reports" className="l-pinned" aria-labelledby="reports-title">
      <h2 id="reports-title" className="p-title" data-rise>
        {t('reports.title')}
      </h2>
      <div className="fixed l-open">
        <div data-ui className="p-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="ui-title">{t(`reports.kinds.${span}`)}</p>
            <p className="ui-sub">{t(`reports.ranges.${span}`)}</p>
          </div>
          {email && (
            <p className="ui-chip mt-3 bg-[#7a2a22]! text-[#fff]!">
              <Mail size={13} aria-hidden /> {t('reports.sent')}
            </p>
          )}
          <dl className="mt-4 grid grid-cols-2 gap-3">
            {rows.map(([k, v, render, before]) => (
              <div key={k} className="rounded-[10px] bg-[#f5eddb] p-3">
                <dt className="ui-sub text-[13px]">{k}</dt>
                <dd className="tab-nums mt-0.5 text-[18px] font-semibold">
                  <Count value={v} render={render} />
                </dd>
                {compare && <dd className="ui-sub tab-nums text-[13px]">{t('reports.before', { n: before })}</dd>}
              </div>
            ))}
          </dl>
          {time && (
            <ul className="mt-4 flex flex-col gap-2">
              {(['writing', 'reading', 'exercise'] as const).map((c, i) => (
                <li key={c} className="text-[13px]">
                  <div className="flex justify-between">
                    <span>{t(`reports.categories.${c}`)}</span>
                    <span className="ui-sub tab-nums">{hm(f.time[i])}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-[#efe5d0]">
                    <div className="l-bar h-2 rounded-full bg-[#7a2a22]" style={{ transform: `scaleX(${f.time[i] / most})` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="reading">
        <Block title={t('reports.spanTitle')} body={t('reports.spanBody')}>
          <div className="l-seg" role="radiogroup" aria-label={t('reports.spanTitle')}>
            {(['day', 'week', 'month'] as Span[]).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={span === s}
                onClick={() => {
                  play('tap')
                  setSpan(s)
                }}
              >
                {t(`reports.spans.${s}`)}
              </button>
            ))}
          </div>
        </Block>
        <Block title={t('reports.emailTitle')} body={t('reports.emailBody')}>
          <Toggle on={email} onChange={setEmail} label={t('reports.emailToggle')} />
        </Block>
        <Block title={t('reports.timeTitle')} body={t('reports.timeBody')}>
          <Toggle on={time} onChange={setTime} label={t('reports.timeToggle')} />
        </Block>
        <Block title={t('reports.compareTitle')} body={t('reports.compareBody')}>
          <Toggle on={compare} onChange={setCompare} label={t('reports.compareToggle')} />
        </Block>
      </div>
    </section>
  )
}

function Block({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  return (
    <div className="l-block">
      <h3 data-rise>{title}</h3>
      <p data-rise style={{ '--i': 1 } as CSSProperties}>
        {body}
      </p>
      <div className="control" data-rise style={{ '--i': 2 } as CSSProperties}>
        {children}
      </div>
    </div>
  )
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className="l-toggle"
      onClick={() => {
        play('tap')
        onChange(!on)
      }}
    >
      <span className="track" aria-hidden />
      {label}
    </button>
  )
}

/** One card, four fields: the same task, further along each time */
function ADay() {
  const { t } = useTranslation('landing')
  const fields: { bg: string; fg: string; clause: string }[] = [
    { bg: 'var(--library)', fg: 'var(--paper)', clause: t('day.s1') },
    { bg: 'var(--brass)', fg: 'var(--ink)', clause: t('day.s2') },
    { bg: 'var(--oxblood)', fg: 'var(--paper)', clause: t('day.s3') },
    { bg: 'var(--sage)', fg: 'var(--ink)', clause: t('day.s4') },
  ]
  return (
    <section id="day" className="l-strip" aria-labelledby="day-title" data-play>
      {fields.map((f, i) => (
        <div key={i} style={{ background: f.bg, color: f.fg, '--f': i } as CSSProperties}>
          {i === 0 && <h2 id="day-title">{t('day.title')}</h2>}
          {/* the field's wipe is its entrance; inside it only the card's chips arrive, one by one */}
          <div className="card-slot">
            <DayCard stage={i} />
          </div>
          <p className="clause">{f.clause}</p>
        </div>
      ))}
    </section>
  )
}

function DayCard({ stage }: { stage: number }) {
  const { t } = useTranslation('landing')
  const done = stage === 3
  return (
    <div data-ui className="p-4">
      <p className={`text-[15px] font-semibold ${done ? 'text-[#7a6b58] line-through' : ''}`}>{t('day.card')}</p>
      <div className="mt-2.5 flex flex-wrap gap-1.5 text-[13px]">
        {[
          stage === 0 && <span className="ui-chip">{t('day.inbox')}</span>,
          stage >= 1 && <span className="ui-chip">{t('day.slot')}</span>,
          stage >= 1 && <span className="ui-chip bg-[#7a2a22]! text-[#fff]!">{t('day.goal')}</span>,
          stage >= 2 && <span className="ui-chip">{t('day.tomatoes')}</span>,
          done && (
            <span className="ui-chip">
              {t('day.doneLabel')} · {t('day.review')}
            </span>
          ),
        ]
          .filter(Boolean)
          .map((chip, c) => (
            <span key={c} className="contents" style={{ '--c': c } as CSSProperties}>
              {chip}
            </span>
          ))}
      </div>
    </div>
  )
}

/** Interface tiles with label strips: every room of the notebook */
function Rooms() {
  const { t } = useTranslation('landing')
  return (
    <section id="rooms" className="l-rooms" aria-labelledby="rooms-title">
      <h2 id="rooms-title" data-rise>
        {t('rooms.title')}
      </h2>
      <div className="tiles">
        {ROOMS.map((r, i) => {
          const [bg, fg] = STRIPS[i % STRIPS.length]
          const values = t(`rooms.${r}.values`, { returnObjects: true }) as string[]
          return (
            <figure key={r} className="l-tile" data-play style={{ '--i': i % 4 } as CSSProperties}>
              <div className="pic" style={{ background: PIC_FIELDS[i] }}>
                <RoomPicture room={r} />
              </div>
              <figcaption className="strip" style={{ background: bg, color: fg }}>
                <span className="row values">
                  {values.map((v) => (
                    <span key={v}>{v}</span>
                  ))}
                </span>
                <span className="row place">
                  <span>{t(`rooms.${r}.left`)}</span>
                  <span>{t(`rooms.${r}.right`)}</span>
                </span>
                <span className="name">{t(`rooms.${r}.name`)}</span>
              </figcaption>
            </figure>
          )
        })}
      </div>
    </section>
  )
}

/** A small, true piece of each room's screen */
function RoomPicture({ room }: { room: (typeof ROOMS)[number] }) {
  const box = 'w-full p-3'
  switch (room) {
    case 'tasks':
      return (
        <div data-ui className={box} aria-hidden>
          {['Draft chapter 3', 'Meet supervisor', 'Cite sources', 'Return books'].map((x, i) => (
            <div key={x} className="flex items-center gap-2 py-1.5">
              <span className="pop h-3.5 w-3.5 rounded-full border-2" style={{ borderColor: ['#d70015', '#ff9f0a', '#ff9f0a', '#d9a400'][i], '--k': i } as CSSProperties} />
              <span className="truncate text-[12px] font-medium">{x}</span>
            </div>
          ))}
        </div>
      )
    case 'calendar':
      return (
        <div data-ui className={box} aria-hidden>
          <div className="grid grid-cols-5 gap-1 text-center text-[10px] text-[#5f513f]">
            {['M', 'T', 'W', 'T', 'F'].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <div className="relative mt-1 grid h-28 grid-cols-5 gap-1">
            {[0, 1, 2, 3, 4].map((c) => (
              <div key={c} className="rounded bg-[#f5eddb]" />
            ))}
            <div className="grow absolute top-2 left-[1%] h-9 w-[18%] rounded bg-[#7a2a22]" style={{ '--k': 0, transformOrigin: '50% 0' } as CSSProperties} />
            <div className="grow absolute top-12 left-[21%] h-6 w-[18%] rounded bg-[#c9a25a]" style={{ '--k': 1, transformOrigin: '50% 0' } as CSSProperties} />
            <div className="grow absolute top-4 left-[61%] h-12 w-[18%] rounded bg-[#1d2c24]" style={{ '--k': 2, transformOrigin: '50% 0' } as CSSProperties} />
          </div>
        </div>
      )
    case 'goals':
      return (
        <div data-ui className={box} aria-hidden>
          <div className="flex items-center gap-2">
            <Seal size={26} />
            <span className="text-[12px] font-semibold">Finish my thesis</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-[#efe5d0]">
            <div className="widen h-2 w-[55%] rounded-full bg-[#7a2a22]" />
          </div>
          {['Ethics approval', 'Chapter 3', 'Viva'].map((m, i) => (
            <div key={m} className="mt-1.5 flex items-center gap-1.5 text-[11px]">
              <span className={`pop h-2.5 w-2.5 ${i === 0 ? 'bg-[#c9a25a]' : 'border border-[#c9a25a]'}`} style={{ '--k': i, rotate: '45deg' } as CSSProperties} />
              {m}
            </div>
          ))}
        </div>
      )
    case 'habits':
      return (
        <div data-ui className={box} aria-hidden>
          <div className="text-[12px] font-semibold">Read 30 pages</div>
          <div className="mt-2 flex gap-1">
            {[1, 1, 1, 0, 1, 1, 1].map((d, i) => (
              <span key={i} className="pop h-5 flex-1 rounded" style={{ background: d ? '#ff7a3d' : '#efe5d0', '--k': i } as CSSProperties} />
            ))}
          </div>
          <div className="mt-2 flex items-center gap-1 text-[11px] text-[#5f513f]">
            <Flame size={11} /> 12-day streak
          </div>
        </div>
      )
    case 'focus':
      return (
        <div data-ui className={`${box} flex flex-col items-center`} aria-hidden>
          <svg viewBox="0 0 64 64" width="72" height="72">
            <circle cx="32" cy="32" r="27" fill="none" stroke="#efe5d0" strokeWidth="5" />
            <circle className="wind" cx="32" cy="32" r="27" fill="none" stroke="#d6452f" strokeWidth="5" strokeDasharray="170" strokeDashoffset="60" strokeLinecap="round" transform="rotate(-90 32 32)" />
            <text x="32" y="37" textAnchor="middle" fontSize="13" fontWeight="700" fill="#1c1c1e">
              16:20
            </text>
          </svg>
          <div className="mt-1 text-[11px] text-[#5f513f]">Draft chapter 3</div>
        </div>
      )
    case 'journal':
      return (
        <div data-ui className={box} aria-hidden>
          <div className="flex justify-between">
            {[1, 2, 3, 4, 5].map((m) => (
              <span key={m} className="pop h-5 w-5 rounded-full" style={{ background: m === 4 ? '#7a2a22' : '#efe5d0', '--k': m } as CSSProperties} />
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-snug text-[#3a2c1c]">Long day in the library. Chapter 3 is finally taking shape.</p>
        </div>
      )
    case 'insights':
      return (
        <div data-ui className={box} aria-hidden>
          <div className="text-[11px] text-[#5f513f]">Life balance</div>
          <div className="text-[24px] font-bold">72</div>
          <div className="mt-1 flex h-14 items-end gap-1.5">
            {[60, 82, 48, 74].map((h, i) => (
              <span key={i} className="grow flex-1 rounded-t bg-[#1d2c24]" style={{ height: `${h}%`, '--k': i } as CSSProperties} />
            ))}
          </div>
        </div>
      )
    case 'graph':
      return (
        <div data-ui className={box} aria-hidden>
          <svg viewBox="0 0 120 100" className="w-full">
            <g stroke="#3b2b1d" strokeOpacity="0.4" strokeWidth="1">
              <line className="draw" x1="40" y1="45" x2="85" y2="25" />
              <line className="draw" x1="40" y1="45" x2="70" y2="75" />
              <line className="draw" x1="40" y1="45" x2="15" y2="80" />
              <line x1="85" y1="25" x2="105" y2="60" strokeDasharray="2 3" />
            </g>
            <circle cx="85" cy="25" r="5" fill="#d70015" stroke="#3b2b1d" />
            <circle cx="70" cy="75" r="5" fill="#ff9f0a" stroke="#3b2b1d" />
            <circle cx="15" cy="80" r="4" fill="#d9a400" stroke="#3b2b1d" />
            <circle cx="105" cy="60" r="9" fill="#f5eddb" stroke="#9a6f2a" strokeWidth="2" />
            <circle cx="105" cy="60" r="3" fill="#d70015" />
            <g transform="translate(28 33) scale(1.2)">
              <path d="M10 1.5l2 1.6 2.5-.4 1 2.4 2.3 1.1-.4 2.5 1.6 2-1.6 2 .4 2.5-2.3 1.1-1 2.4-2.5-.4-2 1.6-2-1.6-2.5.4-1-2.4-2.3-1.1.4-2.5L1.5 10l1.6-2-.4-2.5L5 4.4l1-2.4 2.5.4z" fill="#7a2a22" />
            </g>
          </svg>
        </div>
      )
  }
}
