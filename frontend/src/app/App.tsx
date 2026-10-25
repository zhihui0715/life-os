import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { Suspense, useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from 'react-router'

import { ToastProvider } from '../components/ui/Toast'
import { ErrorState, ListSkeleton } from '../components/ui/states'
import { AuthProvider, ME_KEY, useAuth } from '../features/auth/AuthProvider'
import { HabitsPage } from '../features/habits/HabitsPage'
import { HomePage } from '../features/home/HomePage'
import { TasksPage } from '../features/tasks/TasksPage'
import { ApiError } from '../lib/api'
import { errorMessage } from '../lib/errors'
import { CACHE_MAX_AGE, keepOffline, persister, startOutboxSync } from '../lib/offline'
import { AppShell } from './AppShell'
import { lazyWithReload } from '../lib/lazyPage'

// The calendar library is large; load it only when the Calendar page is opened.
const CalendarPage = lazyWithReload(() => import('../features/calendar/CalendarPage'))
const InsightsPage = lazyWithReload(() => import('../features/insights/InsightsPage').then((m) => ({ default: m.InsightsPage })))
// Pages opened less often load on demand, keeping the first download small (performance budget: scripts/check-bundle.mjs).
// The service worker still pre-caches them, so they open offline too.
const GraphPage = lazyWithReload(() => import('../features/graph/GraphPage').then((m) => ({ default: m.GraphPage })))
const LandingPage = lazyWithReload(() => import('../features/landing/LandingPage'))
const LoginPage = lazyWithReload(() => import('../features/auth/LoginPage').then((m) => ({ default: m.LoginPage })))
const SignupPage = lazyWithReload(() => import('../features/auth/SignupPage').then((m) => ({ default: m.SignupPage })))
const ReportsPage = lazyWithReload(() => import('../features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })))
const PlanPage = lazyWithReload(() => import('../features/planning/PlanPage').then((m) => ({ default: m.PlanPage })))
const FocusPage = lazyWithReload(() => import('../features/focus/FocusPage').then((m) => ({ default: m.FocusPage })))
const GoalDetailPage = lazyWithReload(() => import('../features/goals/GoalDetailPage').then((m) => ({ default: m.GoalDetailPage })))
const GoalsPage = lazyWithReload(() => import('../features/goals/GoalsPage').then((m) => ({ default: m.GoalsPage })))
const HabitDetailPage = lazyWithReload(() => import('../features/habits/HabitDetailPage').then((m) => ({ default: m.HabitDetailPage })))
const JournalPage = lazyWithReload(() => import('../features/journal/JournalPage').then((m) => ({ default: m.JournalPage })))
const SettingsPage = lazyWithReload(() => import('../features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })))

function lazyPage(element: ReactNode) {
  return <Suspense fallback={<ListSkeleton rows={6} />}>{element}</Suspense>
}

// If any request finds the session has expired, go back to the login screen.
function onApiError(error: unknown) {
  if (error instanceof ApiError && error.status === 401) queryClient.setQueryData(ME_KEY, null)
}

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onApiError }),
  mutationCache: new MutationCache({ onError: onApiError }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: CACHE_MAX_AGE, // keep results around long enough to be saved for offline use
      refetchOnReconnect: false, // on reconnect the outbox is sent first, then everything is refreshed (lib/offline.ts)
      // Don't retry client errors (401/404/422…); do retry brief server/network hiccups.
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
    // Writes are attempted even offline: the few that work offline are queued, the rest show "can't reach the server"
    // instead of silently waiting.
    mutations: { networkMode: 'always' },
  },
})

/** Shows the landing or login page, a loading state, or the app — depending on whether you're signed in. */
function AuthGate() {
  const { me, meError, retryMe } = useAuth()
  const { t } = useTranslation()
  const location = useLocation()

  if (me === undefined && meError) {
    return (
      <div className="mx-auto max-w-md pt-24">
        <ErrorState message={errorMessage(t, meError)} onRetry={retryMe} />
      </div>
    )
  }
  if (me === undefined) {
    return (
      <div className="mx-auto max-w-md pt-24">
        <ListSkeleton rows={3} />
        <span className="sr-only">{t('state.loading')}</span>
      </div>
    )
  }
  // Signed out: the landing page at the front door, sign-up at /signup, the sign-in form anywhere else
  // (/login, or a deep link)
  if (me === null) {
    const page = { '/': <LandingPage />, '/signup': <SignupPage /> }[location.pathname] ?? <LoginPage />
    return <Suspense fallback={null}>{page}</Suspense>
  }
  return <AppShell />
}

function Root() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  )
}

// A "data router" (rather than <BrowserRouter>) is needed for features such as warning before leaving
// a page with unsaved writing (useBlocker on the Journal page).
const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      {
        element: <AuthGate />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'tasks', element: <TasksPage /> },
          {
            path: 'calendar',
            element: (
              <Suspense fallback={<ListSkeleton rows={6} />}>
                <CalendarPage />
              </Suspense>
            ),
          },
          { path: 'goals', element: lazyPage(<GoalsPage />) },
          { path: 'goals/:goalId', element: lazyPage(<GoalDetailPage />) },
          { path: 'habits', element: <HabitsPage /> },
          { path: 'habits/:habitId', element: lazyPage(<HabitDetailPage />) },
          { path: 'focus', element: lazyPage(<FocusPage />) },
          { path: 'journal', element: lazyPage(<JournalPage />) },
          {
            path: 'insights',
            element: (
              <Suspense fallback={<ListSkeleton rows={6} />}>
                <InsightsPage />
              </Suspense>
            ),
          },
          { path: 'plan', element: lazyPage(<PlanPage />) },
          { path: 'graph', element: lazyPage(<GraphPage />) },
          { path: 'reports', element: lazyPage(<ReportsPage />) },
          { path: 'assistant', element: <Navigate to="/plan" replace /> }, // old bookmark
          { path: 'settings', element: lazyPage(<SettingsPage />) },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
])

export function App() {
  useEffect(() => startOutboxSync(queryClient), [])
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: CACHE_MAX_AGE, buster: 'v1', dehydrateOptions: { shouldDehydrateQuery: keepOffline } }}
    >
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </PersistQueryClientProvider>
  )
}
