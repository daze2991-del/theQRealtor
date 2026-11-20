'use client'

import ErrorPage from '../components/ErrorPage'

// Last resort: the root layout itself failed, so this must render its own
// <html>/<body>. No error details are displayed.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <ErrorPage reset={reset} />
      </body>
    </html>
  )
}
