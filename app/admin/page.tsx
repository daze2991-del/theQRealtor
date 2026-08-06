import { redirect, notFound } from 'next/navigation'
import { adminGate } from '../../lib/admin/auth'
import { getBetaOverview } from '../../lib/admin/overview'
import AdminOverviewClient from '../../components/admin/AdminOverviewClient'

// God Mode — Beta Overview. Top-level /admin route, fully independent of the
// normal /dashboard data path. This is layer 1 of 3 of the authorization check
// (the getBetaOverview data fn and the /api/admin/overview route each re-verify).
//
// GET-only server component. Renders shaped aggregates through a client component
// that filters in-memory; no buyer contact data is ever sent to the browser.
export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const gate = await adminGate()
  // Logged out → login. Logged in but not the admin → 404 (don't reveal the route).
  if (gate.status === 'unauthed') redirect('/auth')
  if (gate.status === 'forbidden') notFound()

  const overview = await getBetaOverview()

  return (
    <div style={{ minHeight: '100vh', background: '#0F0F13' }}>
      <AdminOverviewClient initial={overview} />
    </div>
  )
}
