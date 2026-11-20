// Next.js instrumentation hook.
//
// onRequestError is called by Next 15+ for every uncaught server error (route
// handlers, server components, server actions). The app is on Next 14.2, which
// does not call it yet — until the upgrade, API-route errors reach the same
// alerting through withErrorAlerts() (lib/errorAlerts.ts), wrapped around every
// route handler. Keeping this file means the alerts also cover server-component
// and server-action errors the moment Next is upgraded, with no further change.
//
// Only the route TEMPLATE (context.routePath, e.g. /api/report/[token]) and the
// scrubbed message are used. request.path / headers are deliberately ignored:
// the real path can contain a report token and headers can contain cookies.

export async function onRequestError(
  err: unknown,
  request: { path?: string; method?: string; headers?: unknown },
  context: { routePath?: string; routeType?: string; routerKind?: string },
) {
  try {
    if (process.env.NEXT_RUNTIME !== 'nodejs') return        // edge can't use the Node email/db clients
    const { reportError } = await import('./lib/errorAlerts')
    await reportError(context?.routePath || 'unknown route', err)
  } catch {
    /* alerting must never throw */
  }
}
