// ── Flush queued agent notifications ──────────────────────────────────────────
//
// Sends pending_notifications whose scheduled_for has passed (i.e. agent alerts
// that were held during quiet hours). Driven by Vercel Cron (see vercel.json),
// which hits this every 15 minutes. Idempotent: only unsent, due rows are sent,
// and each is stamped sent_at immediately after.
//
// If CRON_SECRET is set, the request must present it (Vercel Cron sends it as a
// Bearer token automatically); otherwise the endpoint is open (best-effort).

import { NextResponse } from 'next/server'
import { createAdminSupabase } from '../../../../lib/supabase-admin'
import { sendSms, resolveAgentPhone } from '../../../../lib/twilio'

async function flush(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('authorization') || ''
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const admin = createAdminSupabase()
  const nowIso = new Date().toISOString()

  const { data: due, error } = await admin
    .from('pending_notifications')
    .select('id, agent_id, message')
    .is('sent_at', null)
    .lte('scheduled_for', nowIso)
    .order('scheduled_for', { ascending: true })
    .limit(100)

  if (error) {
    console.error('[cron/flush] query error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let sent = 0
  for (const n of due ?? []) {
    const phone = await resolveAgentPhone(admin, n.agent_id)
    if (phone) { await sendSms(phone, n.message); sent++ }
    // Stamp sent regardless so a missing phone doesn't wedge the queue forever.
    await admin.from('pending_notifications').update({ sent_at: new Date().toISOString() }).eq('id', n.id)
  }

  console.log('[cron/flush] processed', due?.length ?? 0, '| sent', sent)
  return NextResponse.json({ processed: due?.length ?? 0, sent })
}

// Vercel Cron issues GET; allow POST for manual triggering too.
export async function GET(request: Request)  { return flush(request) }
export async function POST(request: Request) { return flush(request) }
