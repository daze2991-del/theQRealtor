import { NextResponse } from 'next/server'
import { adminGate } from '../../../../lib/admin/auth'

// GET /api/admin/whoami — returns only whether the current session is the admin.
// Used by the dashboard shell to decide whether to render the founder-only
// "Beta Overview" nav link. The authority lives server-side: adminGate() compares
// the session user id to the server-only ADMIN_USER_ID, which is never sent to the
// browser — the client learns a single boolean, not the id. Even if a client forces
// isAdmin=true, the /admin page and /api/admin/overview each re-gate independently,
// so a non-admin who reveals the link only reaches a 404. GET-only.
export async function GET() {
  const gate = await adminGate()
  return NextResponse.json({ isAdmin: gate.status === 'ok' })
}
