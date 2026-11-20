'use client'

import ErrorPage from '../components/ErrorPage'

// Shown when a page throws while rendering. No error details are displayed.
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPage reset={reset} />
}
