import { redirect } from 'next/navigation'

// The admin surface moved to the top-level /admin route (God Mode / Beta
// Overview), gated on ADMIN_USER_ID. This old location is kept only as a
// permanent redirect so any stale bookmark or link lands on the canonical URL.
// The real authorization check happens at /admin.
export const dynamic = 'force-dynamic'

export default function LegacyAdminRedirect() {
  redirect('/admin')
}
