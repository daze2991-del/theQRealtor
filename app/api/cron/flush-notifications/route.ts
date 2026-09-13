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
// SCHEDULE — "0 17 * * *" (17:00 UTC). Cron schedules are UTC, but
// quiet_hours_end defaults to 08:00 AGENT-LOCAL (America/Los_Angeles), which is
// 15:00 UTC in PDT and 16:00 UTC in PST. This previously ran at 08:00 UTC —
// 01:00 Pacific, hours BEFORE anything became due — so the tick that looked
// like it was meant to catch the overnight backlog always missed it, and the
// backlog waited for the following day's tick instead: ~16–17h late.
//
// 17:00 UTC clears the later (PST) due time by an hour and the PDT one by two,
// so it lands after quiet hours end in both halves of the year. 16:00 UTC ties
// the PST due time exactly and 15:00 UTC misses PST by 23h, so neither is safe.
// An agent who sets quiet_hours_end later than ~09:00 local can still miss this
// tick and wait for the next one — inherent to a once-daily cron, and the
// opportunistic flushes above are what actually cover that case.
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
  const { processed, sent, failed, abandoned, error } = await flushDueNotifications(admin)
  if (error) {
    return NextResponse.json({ error }, { status: 500 })
  }

  // failed > 0 means those rows are still queued and will be retried on the
  // next tick; abandoned > 0 means we gave up on them permanently.
  console.log('[cron/flush] processed', processed, '| sent', sent, '| failed', failed, '| abandoned', abandoned)
  return NextResponse.json({ processed, sent, failed, abandoned })
}

// Vercel Cron issues GET; allow POST for manual triggering too.
export async function GET(request: Request)  { return flush(request) }
export async function POST(request: Request) { return flush(request) }
