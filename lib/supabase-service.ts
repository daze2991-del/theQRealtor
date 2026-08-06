import 'server-only'
import { createClient } from '@supabase/supabase-js'

// ── Service-role Supabase client — ADMIN (God Mode) SURFACE ONLY ────────────────
// The `import 'server-only'` guard above makes any client-component import a hard
// build error, so the SUPABASE_SERVICE_ROLE_KEY can never be bundled into client
// code. This client bypasses RLS at the connection level; it is used exclusively
// inside the read-only Beta Overview data path (lib/admin/*) and nowhere else.
//
// Deliberately separate from lib/supabase-admin.ts: that one is imported by many
// mutation API routes; this one stays admin-read-only so its blast radius is tiny.
export function createServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
