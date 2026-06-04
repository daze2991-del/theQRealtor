import { NextResponse } from 'next/server'
import { createAdminSupabase } from '../../../lib/supabase-admin'

// Called via navigator.sendBeacon on page-unload (non-converting visits).
// Must always return 200 — beacon failures are silent and non-retryable.
export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  const { scanEventId, timeOnPageSec, photosViewed, ctaClicked, converted } = body

  if (!scanEventId) return NextResponse.json({ ok: true })

  await createAdminSupabase()
    .from('scan_events')
    .update({
      time_on_page_sec: typeof timeOnPageSec === 'number' ? timeOnPageSec : null,
      photos_viewed:    typeof photosViewed  === 'number' ? photosViewed  : null,
      cta_clicked:      typeof ctaClicked    === 'string' ? ctaClicked    : null,
      converted:        converted === true,
    })
    .eq('id', scanEventId)

  return NextResponse.json({ ok: true })
}
