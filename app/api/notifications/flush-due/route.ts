// ── Opportunistic per-agent notification flush ────────────────────────────────
//
// Called from the dashboard's own load (components/DashboardLayout.tsx) so an
// agent who opens the app after their quiet hours end gets any held messages
// right away, instead of waiting for the once-daily cron backstop
// (app/api/cron/flush-notifications). See lib/twilio.ts flushDueNotifications
// for the shared send/stamp logic and app/api/submit-lead/route.ts for the
// other opportunistic call site (a new lead coming in for this agent).
//
// Best-effort by design: never throws past this handler, and the caller
// treats a failure here as a no-op, not an error — a dashboard load must never
// be blocked by notification plumbing.

import { NextResponse } from 'next/server'
import { createServerSupabase } from '../../../../lib/supabase-server'
import { createAdminSupabase } from '../../../../lib/supabase-admin'
import { flushDueNotifications } from '../../../../lib/twilio'

export async function POST() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminSupabase()
  const { processed, sent } = await flushDueNotifications(admin, { agentId: user.id, limit: 20 })
  return NextResponse.json({ processed, sent })
}
