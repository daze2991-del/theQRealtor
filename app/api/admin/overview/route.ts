import { NextResponse } from 'next/server'
import { adminGate } from '../../../../lib/admin/auth'
import { getBetaOverview } from '../../../../lib/admin/overview'

// GET /api/admin/overview?from=<iso>&to=<iso>
// Layer 3 of 3: re-verifies admin independently. GET-only — the admin surface has
// no POST/PATCH/DELETE. Returns shaped aggregates only (getBetaOverview never
// returns buyer contact data or raw records). Forbidden users get a 404 so the
// endpoint's existence isn't confirmed.
export async function GET(request: Request) {
  const gate = await adminGate()
  if (gate.status === 'unauthed') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (gate.status === 'forbidden') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const url = new URL(request.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')

  const data = await getBetaOverview({ from, to })
  return NextResponse.json(data)
}
