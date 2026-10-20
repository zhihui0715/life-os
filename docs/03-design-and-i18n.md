# Design System & Internationalisation (EN / 简体中文)

Status: **Draft for Stage 1**

## 1. Languages

| Decision | Detail |
|---|---|
| Languages | English (`en`) and Simplified Chinese (`zh-CN`) — Simplified is the standard script in Malaysia |
| Library | `react-i18next` + `i18next` (free, MIT). Translation files: `frontend/src/locales/en/*.json`, `zh-CN/*.json`, one file per module (`common`, `tasks`, `calendar`, …) |
| Choosing a language | First visit: browser language (`zh*` → `zh-CN`, else `en`). After login: `user_settings.locale`. Switch any time in Settings and on the login page. |
| Dates & numbers | Always via the browser's built-in `Intl` API with the active locale + user timezone — e.g. "Tue, 20 Oct" vs "10月20日 周二". Never hand-built date strings. |
| Calendar | FullCalendar ships `zh-cn` locale; loaded only when needed. Week starts Monday in both languages. |
| Charts | Axis labels/tooltips use the same `Intl` formatters. |
| Server | Does **not** translate. Errors return stable `code`s; the UI maps them to text (see API conventions §4). Seeded default categories are created in the user's language once, then they are user data. |
| User content | Task titles, journal entries, etc. are stored exactly as typed — any mix of English/中文 works; database is UTF-8. |
| Missing translations | A CI test fails if a key exists in `en` but not `zh-CN` (or vice versa). |
| Fonts | System font stack with CJK fallbacks: `Inter, system-ui, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif`. No web font download needed for Chinese (CJK web fonts are several MB). |
| Layout | Chinese strings are usually shorter but taller; components must not assume fixed text width. Buttons use `min-width`, not fixed widths. |

**Beginner note:** "i18n" = internationalisation (18 letters between i and n). The rule is simple: *no user-visible text is ever typed directly into a component* — it's always `t('tasks.empty.title')`. Doing this from the first component costs minutes; retrofitting it later costs days.

## 2. Design tokens

Defined once as CSS variables in `src/styles/tokens.css`, exposed to Tailwind via its config, and redefined for dark mode.

| Group | Tokens |
|---|---|
| Color — surfaces | `--bg`, `--surface`, `--surface-raised`, `--border`, `--border-strong` |
| Color — text | `--text`, `--text-muted`, `--text-subtle`, `--text-on-accent` |
| Color — accent | `--accent` (indigo), `--accent-hover`, `--accent-soft` |
| Color — status | `--success`, `--warning`, `--danger`, `--info` (+ `-soft` variants for backgrounds) |
| Color — priority | `--p1` red · `--p2` orange · `--p3` blue · `--p4` grey |
| Spacing | 4-px scale: 1=4px, 2=8, 3=12, 4=16, 6=24, 8=32, 12=48 |
| Radius | `--radius-sm` 6px (inputs), `--radius-md` 10px (cards), `--radius-full` (pills) |
| Type | 12 / 14 (body) / 16 / 20 / 24 / 30 px; weights 400/500/600; line-height 1.5 body, 1.25 headings |
| Shadow | `--shadow-sm` (cards), `--shadow-lg` (dialogs/popovers) — subtle, no glow |
| Motion | `--duration-fast` 120ms, `--duration-base` 200ms; all set to 0 under `prefers-reduced-motion` |
| Z-index | dropdown 10 · sticky 20 · drawer 30 · dialog 40 · toast 50 |

All text/background pairs must meet WCAG AA contrast (4.5:1 body, 3:1 large text/icons) in both themes — checked with axe in Stage 9 and by eye at each stage.

## 3. Breakpoints & layout

| Name | Width | Layout |
|---|---|---|
| mobile | < 768px | Bottom nav (Home · Tasks · Calendar · Habits · More), floating + button, full-screen sheets |
| tablet | 768–1023px | Collapsed icon sidebar, drawers |
| desktop | ≥ 1024px | Full sidebar, list + detail drawer, Ctrl+K command palette |

Touch targets ≥ 44×44px on mobile. Test widths: 375, 768, 1024, 1440.

## 4. Core components (built in Stage 1, reused everywhere)

Button · IconButton · Input · Textarea · Select · Checkbox · DatePicker (native `<input type=date>` first) · Dialog / ConfirmDialog · Drawer / Sheet · Toast · Badge (status, priority) · EmptyState · ErrorState · Skeleton · PageHeader · AppShell (sidebar + bottom nav) · LanguageSwitcher · ThemeSwitcher.

Accessibility built in: visible focus rings, labelled form fields, dialogs trap focus and close on Esc, icons-only buttons have `aria-label` (translated).
