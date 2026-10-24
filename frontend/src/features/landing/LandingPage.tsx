import { BarChart3, BookOpen, CalendarDays, Check, CheckSquare, Download, Flame, Network, NotebookPen, Server, Smartphone, Target, Timer, WifiOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import '../../styles/landing.css'
import { LanguageSwitcher } from '../../app/LanguageSwitcher'
import { BookAvatar } from '../../components/ui/BookAvatar'
import type { BookAvatarId } from '../../components/ui/bookAvatars'
import { SCENE_TILES } from '../../lib/academia/tiles'
import i18n from '../../lib/i18n'
import { play } from '../../lib/sound'
import { SCENES } from '../../lib/theme'
import en from '../../locales/en/landing.json'
import zh from '../../locales/zh-CN/landing.json'

// The page's words travel with the page (not in the app's first download)
i18n.addResourceBundle('en', 'landing', en, true, true)
i18n.addResourceBundle('zh-CN', 'landing', zh, true, true)

const FEATURES = [
  { key: 'tasks', icon: CheckSquare },
  { key: 'calendar', icon: CalendarDays },
  { key: 'goals', icon: Target },
  { key: 'habits', icon: Flame },
  { key: 'focus', icon: Timer },
  { key: 'journal', icon: NotebookPen },
  { key: 'reports', icon: BarChart3 },
  { key: 'graph', icon: Network },
] as const
const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']
const DAY = ['morning', 'noon', 'evening', 'week'] as const
const PRIVACY = [
  { key: 'offline', icon: WifiOff },
  { key: 'install', icon: Smartphone },
  { key: 'own', icon: Server },
  { key: 'export', icon: Download },
] as const

/**
 * What visitors see before signing in: what Life OS is, in the light-academia style of a scholar's notebook. Shown at
 * the app's address when nobody is signed in (App.tsx); "Sign in" goes to /login.
 */
export default function LandingPage() {
  const { t } = useTranslation('landing')
  const navigate = useNavigate()
  const signIn = () => {
    play('tap')
    navigate('/login')
  }

  return (
    <div className="landing min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-[#dccbaa]/70 bg-[#f6eedb]/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 md:px-8">
          <a href="#top" className="flex items-center gap-2.5">
            <img src="/icon.svg" alt="" className="h-9 w-9 rounded-[10px] shadow-[0_2px_6px_rgb(0_0_0/0.15)]" />
            <span className="serif text-[21px] font-semibold">Life OS</span>
          </a>
          <nav aria-label={t('nav.features')} className="ml-6 hidden items-center gap-6 text-[14px] font-medium text-[#5a4632] md:flex">
            <a href="#features" className="hover:text-[#2a1f16]">
              {t('nav.features')}
            </a>
            <a href="#day" className="hover:text-[#2a1f16]">
              {t('nav.day')}
            </a>
            <a href="#themes" className="hover:text-[#2a1f16]">
              {t('nav.themes')}
            </a>
            <a href="#privacy" className="hover:text-[#2a1f16]">
              {t('nav.privacy')}
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden sm:block">
              <LanguageSwitcher />
            </div>
            <SealButton onClick={signIn}>{t('nav.signIn')}</SealButton>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero: the promise, and a notebook page showing it */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-12 pb-20 md:grid-cols-[1.1fr_1fr] md:px-8 md:pt-20">
          <div>
            <p className="serif text-[15px] tracking-[0.18em] text-[#7a2a22] uppercase">{t('hero.eyebrow')}</p>
            <h1 className="serif mt-4 text-[42px] leading-[1.05] font-semibold text-balance md:text-[60px]">{t('hero.title')}</h1>
            <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-[#4f3e2e]">{t('hero.body')}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <SealButton onClick={signIn} large>
                <BookOpen size={18} aria-hidden />
                {t('hero.cta')}
              </SealButton>
              <a href="#features" className="rounded-full px-5 py-3 text-[15px] font-semibold text-[#5a4632] ring-1 ring-[#b9a27a] hover:bg-[#efe4cc]">
                {t('hero.more')}
              </a>
            </div>
            <p className="mt-5 text-[13px] text-[#67533e]">{t('hero.note')}</p>
          </div>
          <Notebook />
        </section>

        <Ornament />

        {/* Features: eight rooms, numbered like chapters */}
        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 md:px-8">
          <SectionTitle title={t('features.title')} body={t('features.body')} />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ key, icon: Icon }, i) => (
              <article key={key} className="group rounded-2xl bg-[#fcf8ee] p-5 shadow-[inset_0_1px_0_rgb(255_255_255/0.7),0_0_0_1px_rgb(120_90_50/0.16),0_10px_24px_-16px_rgb(80_50_20/0.5)] transition-transform hover:-translate-y-1">
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#7a2a22] text-[#fff8ec] shadow-[inset_0_0_0_1px_rgb(216_173_96/0.5)]">
                    <Icon size={19} aria-hidden />
                  </span>
                  <span className="serif text-[18px] text-[#7a5719] italic">{NUMERALS[i]}.</span>
                </div>
                <h3 className="serif mt-4 text-[22px] font-semibold">{t(`features.${key}.title`)}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-[#4f3e2e]">{t(`features.${key}.body`)}</p>
              </article>
            ))}
          </div>
        </section>

        {/* A day with it: a timeline down the margin of a page */}
        <section id="day" className="scroll-mt-20 border-y border-[#dccbaa] bg-[#efe4cc]/60 py-20">
          <div className="mx-auto max-w-4xl px-4 md:px-8">
            <SectionTitle title={t('day.title')} />
            <ol className="relative mt-12 border-l-2 border-[#b5413a]/40 pl-8">
              {DAY.map((d, i) => (
                <li key={d} className="relative mb-10 last:mb-0">
                  <span className="absolute top-0.5 -left-[45px] flex h-8 w-8 items-center justify-center rounded-full bg-[#7a2a22] text-[13px] font-bold text-[#fff8ec] ring-4 ring-[#efe4cc]">
                    {i + 1}
                  </span>
                  <p className="serif text-[14px] tracking-[0.16em] text-[#7a5719] uppercase">{t(`day.${d}.time`)}</p>
                  <h3 className="serif mt-1 text-[24px] font-semibold">{t(`day.${d}.title`)}</h3>
                  <p className="mt-1 max-w-xl text-[15px] leading-relaxed text-[#4f3e2e]">{t(`day.${d}.body`)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Themes: the five Academia scenes */}
        <section id="themes" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 md:px-8">
          <SectionTitle title={t('themes.title')} body={t('themes.body')} />
          <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {SCENES.map((s) => (
              <figure key={s} className="overflow-hidden rounded-2xl shadow-[0_0_0_1px_rgb(120_90_50/0.2),0_14px_30px_-18px_rgb(60_35_10/0.6)]">
                <div className="aspect-[4/5]" style={{ background: SCENE_TILES[s] }} />
                <figcaption className="serif bg-[#fcf8ee] px-3 py-2 text-center text-[17px] font-semibold">{t(`themes.${s}`)}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        <Ornament />

        {/* Privacy: four plain promises */}
        <section id="privacy" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 md:px-8">
          <SectionTitle title={t('privacy.title')} />
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PRIVACY.map(({ key, icon: Icon }) => (
              <div key={key} className="text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#fcf8ee] text-[#7a2a22] shadow-[0_0_0_1px_rgb(120_90_50/0.2)]">
                  <Icon size={21} aria-hidden />
                </span>
                <h3 className="serif mt-4 text-[21px] font-semibold">{t(`privacy.${key}.title`)}</h3>
                <p className="mt-1 text-[14px] leading-relaxed text-[#4f3e2e]">{t(`privacy.${key}.body`)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Closing call, with the book friends */}
        <section className="mx-auto max-w-6xl px-4 pb-24 md:px-8">
          <div className="relative overflow-hidden rounded-[28px] bg-[#2a1d14] px-6 py-14 text-center text-[#f2e8d4] shadow-[0_30px_70px_-30px_rgb(40_20_5/0.8)]" style={{ background: SCENE_TILES.library }}>
            <div className="absolute inset-0 bg-[#1a120c]/70" aria-hidden />
            <div className="relative">
              <div className="mb-6 flex justify-center gap-2" aria-hidden>
                {(['book-1', 'book-3', 'book-2', 'book-4', 'book-6'] as BookAvatarId[]).map((b, i) => (
                  <span key={b} className="float" style={{ animationDelay: `${i * 0.4}s`, ['--tilt' as string]: `${(i - 2) * 4}deg` }}>
                    <BookAvatar id={b} size={56} />
                  </span>
                ))}
              </div>
              <h2 className="serif text-[34px] font-semibold md:text-[44px]">{t('footer.title')}</h2>
              <div className="mt-7 flex justify-center">
                <SealButton onClick={signIn} large>
                  {t('footer.cta')}
                </SealButton>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#dccbaa] py-8 text-center">
        <p className="serif text-[15px] text-[#67533e] italic">{t('footer.made')}</p>
        <div className="mt-3 flex justify-center sm:hidden">
          <LanguageSwitcher />
        </div>
      </footer>
    </div>
  )
}

/** An oxblood button with a gilt hairline, like a wax seal */
function SealButton({ onClick, children, large }: { onClick: () => void; children: ReactNode; large?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pressable inline-flex items-center gap-2 rounded-full bg-[#7a2a22] font-semibold text-[#fff8ec] shadow-[inset_0_0_0_1px_rgb(216_173_96/0.55),0_8px_20px_-8px_rgb(90_25_15/0.6)] hover:bg-[#63211b] ${large ? 'px-6 py-3 text-[16px]' : 'px-4 py-2 text-[14px]'}`}
    >
      {children}
    </button>
  )
}

function SectionTitle({ title, body }: { title: string; body?: string }) {
  return (
    <div className="text-center">
      <h2 className="serif text-[34px] leading-tight font-semibold text-balance md:text-[44px]">{title}</h2>
      {body && <p className="mx-auto mt-3 max-w-2xl text-[16px] text-[#4f3e2e]">{body}</p>}
    </div>
  )
}

/** A rule with a fleuron in the middle, between sections */
function Ornament() {
  return (
    <div className="fleuron mx-auto flex max-w-xl items-center gap-4 px-4 text-[#7a5719]" aria-hidden>
      <span className="serif text-[22px]">❦</span>
    </div>
  )
}

/** The hero's picture: a page of the notebook, with the book friends around it */
function Notebook() {
  const { t } = useTranslation('landing')
  const tasks = [
    { text: t('mock.t1'), done: true, colour: '#d70015' },
    { text: t('mock.t2'), done: false, colour: '#ff9f0a' },
    { text: t('mock.t3'), done: false, colour: '#d9a400' },
  ]
  return (
    <div className="relative mx-auto w-full max-w-md" aria-hidden>
      <span className="float absolute -top-8 -left-6 z-10" style={{ ['--tilt' as string]: '-8deg' }}>
        <BookAvatar id="book-1" size={74} />
      </span>
      <span className="float absolute -right-5 -bottom-8 z-10" style={{ animationDelay: '1.2s', ['--tilt' as string]: '7deg' }}>
        <BookAvatar id="book-4" size={70} />
      </span>
      <div className="ruled rotate-[1.5deg] rounded-[22px] p-6 pl-14 shadow-[0_0_0_1px_rgb(120_90_50/0.2),0_30px_60px_-28px_rgb(60_35_10/0.6)]">
        <p className="serif text-[28px] leading-[36px] font-semibold">{t('mock.today')}</p>
        <ul className="mt-[1px]">
          {tasks.map((task) => (
            <li key={task.text} className="flex h-9 items-center gap-3 text-[15px]">
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2"
                style={{ borderColor: task.colour, background: task.done ? '#7a2a22' : 'transparent' }}
              >
                {task.done && <Check size={12} strokeWidth={3} className="text-[#fff8ec]" />}
              </span>
              <span className={task.done ? 'text-[#67533e] line-through' : ''}>{task.text}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2 text-[12.5px] font-semibold">
          <span className="flex items-center gap-1.5 rounded-full bg-[#7a2a22] px-3 py-1 text-[#fff8ec]">
            <span className="serif text-[14px] italic">F</span>
            {t('mock.goal')} · 55%
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-[#efe4cc] px-3 py-1 text-[#5a4632]">
            <Flame size={13} aria-hidden />
            {t('mock.streak')}
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-[#efe4cc] px-3 py-1 text-[#5a4632]">
            <Timer size={13} aria-hidden />
            {t('mock.focus')}
          </span>
        </div>
      </div>
    </div>
  )
}
