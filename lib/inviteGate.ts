import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { openSignupEnabled } from './signup'

/**
 * Server-side invite check shared by the signup route and the
 * phone-verification send route, so a non-invited email can never trigger a
 * verification SMS (and never gets as far as an account).
 *
 * - OPEN_SIGNUP_ENABLED === 'true' skips the list (same switch as before).
 * - Otherwise the email must have an approved row in beta_allowlist.
 * - Fails CLOSED: a malformed email or a lookup error counts as not invited.
 * Reveals nothing but yes/no; callers return the same generic message.
 */
export async function isInvitedEmail(email: unknown): Promise<boolean> {
  if (openSignupEnabled()) return true
  if (typeof email !== 'string') return false
  const e = email.trim().toLowerCase()
  if (!e || !e.includes('@')) return false

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data, error } = await supabase
    .from('beta_allowlist')
    .select('approved')
    .eq('email', e)
    .single()
  if (error || !data) return false
  return data.approved === true
}
