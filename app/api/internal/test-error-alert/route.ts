import { NextResponse } from 'next/server'
import { sendErrorAlert, withErrorAlerts } from '../../../../lib/errorAlerts'
import { adminGate } from '../../../../lib/admin/auth'

// TEMPORARY — one-off check that error alerts reach hello@theqrealtor.com in
// production. Guarded: Bearer CRON_SECRET, or the signed-in admin. Sends one
// clearly-labelled test alert through the real pipeline (same throttle). Meant
// to be deleted right after use.
async function GET__handler(request: Request) {
  const secret = process.env.CRON_SECRET
  const bearer = !!secret && request.headers.get('authorization') === `Bearer ${secret}`
  if (!bearer && (await adminGate()).status !== 'ok') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const result = await sendErrorAlert({ route: '/api/internal/test-error-alert', message: 'TEST ALERT — safe to ignore. Confirms error emails reach this inbox.' })
  return NextResponse.json({ result })
}

export const GET = withErrorAlerts('/api/internal/test-error-alert', GET__handler)
