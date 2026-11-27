/**
 * Reminders when Life OS is closed (Web Push). This device subscribes with the browser's push service and hands the
 * subscription and its reminder settings to the server, which sends what's due (backend/app/modules/push). The
 * service worker shows them (public/notify-sw.js). Needs the installed or open-in-browser app on https; on an
 * iPhone, the app added to the Home Screen.
 */
import { api } from './api'
import { onPrefsChange, readPrefs, type ReminderPrefs } from './reminders'

export interface PushConfig {
  enabled: boolean
  public_key: string | null
}

export function pushSupported() {
  return typeof window !== 'undefined' && window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window
}

let config: Promise<PushConfig> | null = null
export function pushConfig(): Promise<PushConfig> {
  config ??= api<PushConfig>('/push/config').catch((e) => {
    config = null // try again next time
    throw e
  })
  return config
}

/** The browser's subscription on this device, if any. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4)
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

const serverPrefs = (p: ReminderPrefs) => ({ eventLead: p.eventLead, deadlines: p.deadlines, habitsAt: p.habitsAt, planAt: p.planAt, reviewAt: p.reviewAt })

async function register(sub: PushSubscription, prefs: ReminderPrefs) {
  const json = sub.toJSON()
  await api('/push/subscriptions', { method: 'POST', body: { endpoint: json.endpoint, keys: json.keys, prefs: serverPrefs(prefs) } })
}

/** Starts reminders from the server on this device (notification permission must already be granted). */
export async function enablePush(): Promise<void> {
  const { enabled, public_key } = await pushConfig()
  if (!enabled || !public_key) throw new Error('push_not_configured')
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(public_key) }))
  await register(sub, readPrefs())
}

/** Stops them: the server forgets this device and the browser drops the subscription. */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  await api('/push/subscriptions', { method: 'DELETE', body: { endpoint: sub.endpoint } }).catch(() => undefined)
  await sub.unsubscribe().catch(() => undefined)
}

export async function sendTestPush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) throw new Error('push_off')
  await api('/push/test', { method: 'POST', body: { endpoint: sub.endpoint } })
}

/** Keeps the server's copy of this device's reminder settings up to date as they change. */
export function startPushSync(): () => void {
  if (!pushSupported()) return () => undefined
  return onPrefsChange((prefs) => {
    void currentSubscription().then((sub) => {
      if (!sub) return
      if (!prefs.enabled) return disablePush() // reminders switched off on this device: the server's stop too
      return register(sub, prefs).catch(() => undefined)
    })
  })
}
