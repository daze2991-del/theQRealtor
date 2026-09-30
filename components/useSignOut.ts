'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserSupabase } from '../lib/supabase-browser'

// The one dashboard sign-out implementation. Used by the sidebar button in
// components/DashboardLayout.tsx and the header button on app/dashboard.
// (app/dashboard/settings has its own older copy that redirects to /auth
// instead of / — not consolidated here.)

export const SIGN_OUT_REDIRECT = '/'

/** Sign out of Supabase, then send the browser to SIGN_OUT_REDIRECT. */
export async function signOutAndRedirect(router: { push: (href: string) => void }): Promise<void> {
  await createBrowserSupabase().auth.signOut()
  router.push(SIGN_OUT_REDIRECT)
}

export function useSignOut() {
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)
  const signOut = useCallback(async () => {
    setSigningOut(true)
    await signOutAndRedirect(router)
  }, [router])
  return { signOut, signingOut }
}
