import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'

import { ToastProvider } from '../components/ui/Toast'
import { ErrorState, ListSkeleton } from '../components/ui/states'
import { AuthProvider, ME_KEY, useAuth } from '../features/auth/AuthProvider'
import { LoginPage } from '../features/auth/LoginPage'
import { GoalDetailPage } from '../features/goals/GoalDetailPage'
import { GoalsPage } from '../features/goals/GoalsPage'
import { HomePage } from '../features/home/HomePage'
import { ComingSoonPage } from '../features/placeholder/ComingSoonPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { TasksPage } from '../features/tasks/TasksPage'
import { ApiError } from '../lib/api'
import { errorMessage } from '../lib/errors'
import { AppShell } from './AppShell'

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

function Routed() {
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

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="calendar" element={<ComingSoonPage feature="calendar" stage={3} />} />
        <Route path="goals" element={<GoalsPage />} />
        <Route path="goals/:goalId" element={<GoalDetailPage />} />
        <Route path="habits" element={<ComingSoonPage feature="habits" stage={4} />} />
        <Route path="insights" element={<ComingSoonPage feature="insights" stage={5} />} />
        <Route path="journal" element={<ComingSoonPage feature="journal" stage={4} />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <Routed />
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}
