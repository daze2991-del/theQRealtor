import { createClient } from '@supabase/supabase-js'

// Service-role client for server-side reads/writes. Every call must hit the
// database live.
//
// `cache: 'no-store'` is REQUIRED, not belt-and-braces. Next patches global
// fetch and, by default, stores GET/HEAD responses in its persistent Data
// Cache (.next/cache/fetch-cache) — which survives server restarts and, on
// Vercel, is carried between deployments via the build cache. PostgREST reads
// issued by this client are plain GET/HEAD requests, so they were being cached
// and replayed: the public seller report served a seller scan counts and a
// lead-quality breakdown frozen at whatever the first request ever saw.
//
// `export const dynamic = 'force-dynamic'` on the route was measured and is NOT
// enough on its own — with the cache cleared and force-dynamic in place, the
// report still froze at 6 while the database climbed to 9. Only setting the
// fetch option directly stops it. Writes were never affected (Next does not
// cache non-GET/HEAD), so this changes read freshness only and cannot make any
// existing behaviour less correct.
export function createAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...init, cache: 'no-store' }),
      },
    },
  )
}
