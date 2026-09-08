// ── Flush queued agent notifications ──────────────────────────────────────────
//
// Global backstop: sends any pending_notifications whose scheduled_for has
// passed, across all agents. Driven by Vercel Cron (see vercel.json).
//
// This is now a backstop, not the only delivery path — flushDueNotifications()
// (lib/twilio.ts) is also called opportunistically, scoped to one agent, from
// app/api/submit-lead/route.ts (when a new lead comes in for them) and
// app/api/notifications/flush-due/route.ts (their own dashboard load). Those
// two catch an active agent close to their own quiet-hours end; this route
// exists for an agent who triggers neither — it is what guarantees a deferred
// message is never held longer than until the next cron tick.
//
// On the current Vercel plan this tick is once daily (see vercel.json's
// schedule), which is why the opportunistic paths above carry most of the
// real-world latency improvement — this route is the worst-case bound, not
// the common case.
//
// If CRON_SECRET is set, the request must present it (Vercel Cron sends it as a
// Bearer token automatically); otherwise the endpoint is open (best-effort).

import { NextResponse } from 'next/server'
import { createAdminSupabase } from '../../../../lib/supabase-admin'
import { flushDueNotifications } from '../../../../lib/twilio'

async function flush(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('authorization') || ''
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const admin = createAdminSupabase()
  const { processed, sent, error } = await flushDueNotifications(admin)
  if (error) {
    return NextResponse.json({ error }, { status: 500 })
  }

  console.log('[cron/flush] processed', processed, '| sent', sent)
  return NextResponse.json({ processed, sent })
}

// Vercel Cron issues GET; allow POST for manual triggering too.
export async function GET(request: Request)  { return flush(request) }
export async function POST(request: Request) { return flush(request) }
