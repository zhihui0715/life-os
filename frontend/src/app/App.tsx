import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router'

import { ToastProvider } from '../components/ui/Toast'
import { ErrorState, ListSkeleton } from '../components/ui/states'
import { AuthProvider, ME_KEY, useAuth } from '../features/auth/AuthProvider'
import { LoginPage } from '../features/auth/LoginPage'
import { FocusPage } from '../features/focus/FocusPage'
import { GoalDetailPage } from '../features/goals/GoalDetailPage'
import { GoalsPage } from '../features/goals/GoalsPage'
import { HabitDetailPage } from '../features/habits/HabitDetailPage'
import { HabitsPage } from '../features/habits/HabitsPage'
import { HomePage } from '../features/home/HomePage'
import { JournalPage } from '../features/journal/JournalPage'
import { ComingSoonPage } from '../features/placeholder/ComingSoonPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { TasksPage } from '../features/tasks/TasksPage'
import { ApiError } from '../lib/api'
import { errorMessage } from '../lib/errors'
import { AppShell } from './AppShell'

// The calendar library is large; load it only when the Calendar page is opened.
const CalendarPage = lazy(() => import('../features/calendar/CalendarPage'))

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
      // Don't retry client errors (401/404/422…); do retry brief server/network hiccups.
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
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
          { path: 'insights', element: <ComingSoonPage feature="insights" stage={5} /> },
          { path: 'settings', element: <SettingsPage /> },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
])

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  )
}
