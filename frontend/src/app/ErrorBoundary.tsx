import { Component, type ReactNode } from 'react'

import { ErrorState } from '../components/ui/states'

/**
 * Catches a crash inside one page so the rest of the app (navigation, other pages) keeps working.
 * `resetKey` (the current URL) clears the error when you navigate somewhere else.
 */
export class ErrorBoundary extends Component<{ resetKey: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }

  componentDidCatch(error: Error) {
    console.error('Page crashed:', error)
  }

  render() {
    if (this.state.error) return <ErrorState onRetry={() => this.setState({ error: null })} />
    return this.props.children
  }
}
