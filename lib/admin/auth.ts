import 'server-only'
import { createServerSupabase } from '../supabase-server'

// ── Admin (God Mode) authorization gate ─────────────────────────────────────────
// The ONLY thing that grants Beta Overview access: the authenticated session
// user's id equals process.env.ADMIN_USER_ID. Verified server-side, from the
// session cookie (never a client-supplied value), on every call. This helper is
// invoked independently by each layer — the /admin page, the getBetaOverview data
// function, and the GET /api/admin/overview route — so no single point is trusted.
//
// ADMIN_USER_ID is a server-only env var (no NEXT_PUBLIC_ prefix), so it is never
// exposed to the browser bundle.

export type AdminGate =
  | { status: 'ok'; userId: string }
  | { status: 'unauthed' }   // no session → send to login
  | { status: 'forbidden' }  // valid session, but not the admin → 404 (hide existence)

export async function adminGate(): Promise<AdminGate> {
  const adminId = process.env.ADMIN_USER_ID
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { status: 'unauthed' }
  // Fail closed if the env var is unset/misconfigured — never open the surface.
  if (!adminId || user.id !== adminId) return { status: 'forbidden' }
  return { status: 'ok', userId: user.id }
}

// Throwing variant for non-page contexts (data fn / API route) that re-verify
// independently. Distinguishes unauth (401) from forbidden (404).
export class AdminUnauthed extends Error {}
export class AdminForbidden extends Error {}

export async function assertAdmin(): Promise<string> {
  const gate = await adminGate()
  if (gate.status === 'unauthed') throw new AdminUnauthed()
  if (gate.status === 'forbidden') throw new AdminForbidden()
  return gate.userId
}
