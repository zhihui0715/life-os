/**
 * Offline support (Stage 8). Two small pieces:
 *
 * 1. What you can READ offline: a copy of a few query results — today's and overdue tasks, your habits, today's
 *    calendar, categories and your settings — saved in this browser after each visit (see `keepOffline`). Nothing
 *    else is saved: journal, goals, insights and the assistant always need a connection.
 *
 * 2. What you can DO offline: complete a task, check in (or un-check) a habit, and quick-add a task. These go into an
 *    "outbox" in this browser and are sent, in order, when the server is reachable again. Each carries an
 *    Idempotency-Key, so if a send reached the server but the reply was lost, the retry can't apply it twice.
 *
 * Both are wiped on logout.
 */
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { onlineManager, type Query, type QueryClient } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'

import { api, ApiError, onServerReachability } from './api'

// ---------- 1. readable offline ----------

export const CACHE_KEY = 'lifeos.offline-cache.v1'
export const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000 // older copies are thrown away

const DAY_MS = 26 * 60 * 60 * 1000 // a calendar day, allowing for DST

/** The allowlist: only these query results are ever written to this browser's storage. */
export function keepOffline(query: Query): boolean {
  // Keep the last good copy even if a later refresh failed (that's exactly when it's needed).
  if (query.state.data === undefined) return false
  const [root, kind, arg, extra] = query.queryKey as unknown[]
  if (root === 'me' || root === 'categories') return true
  if (root === 'habits') return kind === 'list' && arg === false // active habits (not the archive, not details)
  if (root === 'tasks' && kind === 'list') {
    const filters = (arg ?? {}) as Record<string, unknown>
    const keys = Object.keys(filters).filter((k) => filters[k])
    return keys.length === 1 && (filters.view === 'today' || filters.view === 'overdue') && typeof extra === 'number'
  }
  if (root === 'calendar' && kind === 'occurrences' && arg && typeof arg === 'object') {
    const { start, end } = arg as { start: string; end: string }
    return Date.parse(end) - Date.parse(start) <= DAY_MS // one day (Home's schedule), not whole months
  }
  return false
}

function storage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined // private mode / blocked storage: the app still works, just not offline
  }
}

export const persister = createSyncStoragePersister({ storage: storage(), key: CACHE_KEY, throttleTime: 1000 })

// ---------- 2. the outbox ----------

export type OutboxKind = 'task_complete' | 'task_create' | 'habit_check_in'

export interface OutboxItem {
  id: string // also the Idempotency-Key
  user_id: string // only ever sent for the account that queued it
  kind: OutboxKind
  method: 'POST' | 'PUT' | 'DELETE'
  path: string
  body?: unknown
  label: string // what the user sees, e.g. the task title
  queued_at: string
  server_errors?: number // repeated 5xx replies; after MAX_SERVER_ERRORS the item is given up on
}

export interface OutboxFailure {
  item: OutboxItem
  code: string
}

const MAX_SERVER_ERRORS = 5
const OUTBOX_KEY = 'lifeos.outbox.v1'
const FAILED_KEY = 'lifeos.outbox-failed.v1'

interface OutboxState {
  items: OutboxItem[]
  failed: OutboxFailure[]
  syncing: boolean
}

function read<T>(key: string): T[] {
  try {
    const raw = storage()?.getItem(key)
    return raw ? (JSON.parse(raw) as T[]) : []
  } catch {
    return []
  }
}

let currentUser: string | null = null
let kickSync: (() => void) | null = null // set by startOutboxSync

/** Called when the signed-in account is known (or changes). Waiting actions of a different account are dropped. */
export function setOfflineUser(userId: string | null) {
  currentUser = userId
  if (userId && state.items.some((i) => i.user_id !== userId)) {
    setState({ items: state.items.filter((i) => i.user_id === userId), failed: state.failed.filter((f) => f.item.user_id === userId) })
  }
  if (userId) kickSync?.() // the app just learned who is signed in: send anything that waited for that
}

let state: OutboxState = { items: read<OutboxItem>(OUTBOX_KEY), failed: read<OutboxFailure>(FAILED_KEY), syncing: false }
const listeners = new Set<() => void>()

function setState(next: Partial<OutboxState>) {
  state = { ...state, ...next }
  try {
    storage()?.setItem(OUTBOX_KEY, JSON.stringify(state.items))
    storage()?.setItem(FAILED_KEY, JSON.stringify(state.failed))
  } catch {
    /* storage full or blocked: the queue still works for this page session */
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useOutbox(): OutboxState {
  return useSyncExternalStore(subscribe, () => state)
}

export function dismissFailures() {
  setState({ failed: [] })
}

/** Marker returned instead of the server's reply when an action was saved for later. */
export const QUEUED = { queued: true } as const
export type Queued = typeof QUEUED
export const isQueued = (v: unknown): v is Queued => v === QUEUED

function isUnreachable(e: unknown) {
  return e instanceof ApiError && (e.status === 0 || e.status >= 500)
}

/**
 * Send one of the offline-capable actions now; if the server can't be reached, keep it in the outbox instead.
 * Online or not, the request carries an Idempotency-Key, so an automatic retry can never apply it twice.
 */
export async function sendOrQueue<T>(action: Omit<OutboxItem, 'id' | 'queued_at' | 'user_id'>): Promise<T | Queued> {
  const item: OutboxItem = { ...action, id: crypto.randomUUID(), user_id: currentUser ?? '', queued_at: new Date().toISOString() }
  // Keep things in order: if older actions are still waiting, this one waits behind them.
  if (onlineManager.isOnline() && state.items.length === 0) {
    try {
      return await send<T>(item)
    } catch (e) {
      if (!isUnreachable(e)) throw e
    }
  }
  setState({ items: [...state.items, item] })
  return QUEUED
}

function send<T>(item: OutboxItem) {
  return api<T>(item.path, { method: item.method, body: item.body, idempotencyKey: item.id })
}

/**
 * Send waiting actions, oldest first. Stops at the first one that can't reach the server (it will be tried again
 * later). A definite refusal (e.g. the task was deleted meanwhile) is moved to `failed` and shown to the user.
 * Returns how many were sent.
 */
export async function syncOutbox(): Promise<number> {
  if (state.syncing || state.items.length === 0 || !currentUser) return 0
  setState({ syncing: true })
  let sent = 0
  try {
    while (state.items.length) {
      const item = state.items[0]
      try {
        await send(item)
        sent++
        setState({ items: state.items.slice(1) })
      } catch (e) {
        const status = e instanceof ApiError ? e.status : 0
        if (status === 0) break // no connection, or the API is down: keep waiting
        if (status >= 500 && (item.server_errors ?? 0) + 1 < MAX_SERVER_ERRORS) {
          setState({ items: [{ ...item, server_errors: (item.server_errors ?? 0) + 1 }, ...state.items.slice(1)] })
          break // the server is having trouble: try again later
        }
        if (status === 401 || status === 403 || status === 429) break // signed out / busy: try later
        const code = e instanceof ApiError ? e.code : 'unknown'
        setState({ items: state.items.slice(1), failed: [...state.failed, { item, code }] })
      }
    }
  } finally {
    setState({ syncing: false })
  }
  return sent
}

const PROBE_MS = 15_000

/**
 * Run the outbox when the connection comes back, when the app is reopened, and every 30 s while items wait.
 *
 * "Offline" here means "the server can't be reached", not just the browser's airplane-mode flag: on bad Wi-Fi or
 * while the server is down the browser still says it's online. When a request gets no answer at all, the app
 * switches to offline mode (queries pause and keep showing saved data instead of errors) and checks the server
 * every 15 s until it answers again.
 */
export function startOutboxSync(qc: QueryClient) {
  let probe: number | undefined
  const stopProbe = () => {
    window.clearInterval(probe)
    probe = undefined
  }
  onServerReachability((reachable) => {
    if (reachable) {
      if (probe !== undefined) {
        stopProbe() // something got through: we're back
        onlineManager.setOnline(true)
      }
      return
    }
    if (probe !== undefined) return
    onlineManager.setOnline(false)
    probe = window.setInterval(async () => {
      const ok = await fetch('/api/v1/health', { cache: 'no-store' }).then((r) => r.ok, () => false)
      if (ok) {
        stopProbe()
        onlineManager.setOnline(true)
      }
    }, PROBE_MS)
  })
  const run = async () => {
    if (!onlineManager.isOnline()) return
    const sent = await syncOutbox()
    if (sent) await qc.invalidateQueries() // show the server's version of everything that changed
  }
  kickSync = () => void run()
  const onVisible = () => document.visibilityState === 'visible' && void run()
  const unsubscribeOnline = onlineManager.subscribe((online) => {
    if (online) void run().then(() => qc.invalidateQueries())
  })
  document.addEventListener('visibilitychange', onVisible)
  const timer = window.setInterval(() => state.items.length && void run(), 30_000)
  void run()
  return () => {
    kickSync = null
    onServerReachability(null)
    stopProbe()
    unsubscribeOnline()
    document.removeEventListener('visibilitychange', onVisible)
    window.clearInterval(timer)
  }
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
  )
}

/** Logout: remove every copy of personal data and every waiting action from this browser. */
export function clearOfflineData() {
  try {
    storage()?.removeItem(CACHE_KEY)
  } catch {
    /* nothing stored */
  }
  setState({ items: [], failed: [] })
}
