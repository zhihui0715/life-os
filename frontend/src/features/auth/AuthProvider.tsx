import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, type ReactNode } from 'react'

import { api, ApiError, setCsrfToken } from '../../lib/api'
import { clearOfflineData, setOfflineUser } from '../../lib/offline'
import i18n from '../../lib/i18n'
import { setLook, setTheme } from '../../lib/theme'
import type { Me } from '../../lib/types'

interface AuthValue {
  me: Me | null | undefined // undefined = still checking (or the check failed: see meError)
  meError: unknown
  retryMe: () => void
  login: ReturnType<typeof useSignInMutation<LoginBody>>
  signup: ReturnType<typeof useSignInMutation<SignupBody>>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)
export const ME_KEY = ['me']

async function fetchMe(): Promise<Me | null> {
  try {
    return await api<Me>('/auth/me')
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null
    throw e
  }
}

type LoginBody = { email: string; password: string }
type SignupBody = LoginBody & { display_name: string; locale: string; timezone: string }

/** Signing in and signing up both end with a session for the account they return. */
function useSignInMutation<B>(path: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: B) => api<Me>(path, { method: 'POST', body }),
    onSuccess: (me) => {
      // Signing in (maybe as someone else): drop any data cached for the previous session before showing pages.
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] })
      qc.setQueryData(ME_KEY, me)
    },
  })
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  // Restored from this browser when offline; re-checked with the server after a minute.
  const { data: me, error: meError, refetch } = useQuery({ queryKey: ME_KEY, queryFn: fetchMe, staleTime: 60_000, retry: 1 })
  const login = useSignInMutation<LoginBody>('/auth/login')
  const signup = useSignInMutation<SignupBody>('/auth/signup')

  // Apply the account's language, theme and CSRF token whenever they load or change.
  useEffect(() => {
    setCsrfToken(me?.csrf_token ?? null)
    setOfflineUser(me?.user.id ?? null)
    if (me) {
      if (i18n.language !== me.settings.locale) i18n.changeLanguage(me.settings.locale)
      setTheme(me.settings.theme)
      setLook(me.settings.accent ?? 'blue', me.settings.background ?? 'plain')
    }
  }, [me])

  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' })
    } finally {
      // Mark logged-out first (the login screen is watching this entry), then drop every other cached
      // personal record from memory. qc.clear() would also detach the "me" watcher, leaving the page stuck.
      qc.setQueryData(ME_KEY, null)
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] })
      clearOfflineData() // the offline copy and any unsent actions leave this browser too
    }
  }

  return <AuthContext.Provider value={{ me, meError, retryMe: () => void refetch(), login, signup, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}

/** For pages inside the logged-in area, where `me` is guaranteed. */
export function useMe(): Me {
  const { me } = useAuth()
  if (!me) throw new Error('useMe used outside the authenticated area')
  return me
}
