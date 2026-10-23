import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { lazy, Suspense, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router'

import { ToastProvider } from '../components/ui/Toast'
import { ErrorState, ListSkeleton } from '../components/ui/states'
import { AuthProvider, ME_KEY, useAuth } from '../features/auth/AuthProvider'
import { AssistantPage } from '../features/ai/AssistantPage'
import { LoginPage } from '../features/auth/LoginPage'
import { FocusPage } from '../features/focus/FocusPage'
import { GoalDetailPage } from '../features/goals/GoalDetailPage'
import { GoalsPage } from '../features/goals/GoalsPage'
import { HabitDetailPage } from '../features/habits/HabitDetailPage'
import { HabitsPage } from '../features/habits/HabitsPage'
import { HomePage } from '../features/home/HomePage'
import { JournalPage } from '../features/journal/JournalPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { TasksPage } from '../features/tasks/TasksPage'
import { ApiError } from '../lib/api'
import { errorMessage } from '../lib/errors'
import { CACHE_MAX_AGE, keepOffline, persister, startOutboxSync } from '../lib/offline'
import { AppShell } from './AppShell'

// The calendar library is large; load it only when the Calendar page is opened.
const CalendarPage = lazy(() => import('../features/calendar/CalendarPage'))
const InsightsPage = lazy(() => import('../features/insights/InsightsPage').then((m) => ({ default: m.InsightsPage })))

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

/** Shows the login page, a loading state, or the app — depending on whether you're signed in. */
function AuthGate() {
  const { me, meError, retryMe } = useAuth()
  const { t } = useTranslation()

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
  if (me === null) return <LoginPage />
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
          { path: 'goals', element: <GoalsPage /> },
          { path: 'goals/:goalId', element: <GoalDetailPage /> },
          { path: 'habits', element: <HabitsPage /> },
          { path: 'habits/:habitId', element: <HabitDetailPage /> },
          { path: 'focus', element: <FocusPage /> },
          { path: 'journal', element: <JournalPage /> },
          {
            path: 'insights',
            element: (
              <Suspense fallback={<ListSkeleton rows={6} />}>
                <InsightsPage />
              </Suspense>
            ),
          },
          { path: 'assistant', element: <AssistantPage /> },
          { path: 'settings', element: <SettingsPage /> },
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
