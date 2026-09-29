// One-off backfill: leads.phone_e164 for rows that predate migration 055.
//
// Uses lib/phone.ts normalizePhone() itself — not a SQL approximation — so a
// backfilled value is exactly what app/api/submit-lead and
// app/api/open-house-checkin write for the same raw input going forward.
//
// Run from the repo root, with the service-role env loaded:
//   node --env-file=.env.local scripts/backfill-leads-phone-e164.ts --dry-run
//   node --env-file=.env.local scripts/backfill-leads-phone-e164.ts
//
// Idempotent: only touches rows whose phone_e164 is still NULL, and the UPDATE
// re-checks that, so re-running it is harmless. leads.phone is never modified.
// Phone numbers are masked to the last 4 digits in all output.

import { createClient } from '@supabase/supabase-js'

// Loaded by URL rather than a static import: Node runs this file as native
// ESM (package.json "type": "module"), which can't resolve the extensionless
// '../lib/phone', and a literal '../lib/phone.ts' specifier fails the repo's
// typecheck. This keeps the real normalizePhone() without either problem.
const { normalizePhone }: { normalizePhone: (raw: string) => string | null } =
  await import(new URL('../lib/phone.ts', import.meta.url).href)

const dryRun = process.argv.includes('--dry-run')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — run with --env-file=.env.local')
  process.exit(1)
}

const mask = (raw: string) => '***-***-' + (raw.replace(/\D/g, '').slice(-4) || '****')

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

console.log(`[backfill] project: ${new URL(url).host}${dryRun ? ' (DRY RUN — no writes)' : ''}`)

const PAGE = 500
let scanned = 0
let set = 0
let leftEmpty = 0
let leftUnparseable = 0
let failed = 0

for (let from = 0; ; from += PAGE) {
  // Paged by id over the still-NULL set. Pages are read before any writes in
  // that page, and written rows drop out of the filter, so the offset is
  // advanced only past rows this run leaves NULL (see below).
  const { data: rows, error } = await supabase
    .from('leads')
    .select('id, phone')
    .is('phone_e164', null)
    .order('id', { ascending: true })
    .range(from, from + PAGE - 1)

  if (error) {
    console.error('[backfill] read failed:', error.message)
    process.exit(1)
  }
  if (!rows || rows.length === 0) break

  let writtenThisPage = 0
  for (const row of rows as { id: string; phone: string | null }[]) {
    scanned++
    const raw = (row.phone ?? '').trim()

    if (!raw) {
      leftEmpty++
      console.log(`[backfill] ${row.id} | phone empty/NULL → phone_e164 stays NULL`)
      continue
    }

    const e164 = normalizePhone(raw)
    if (!e164) {
      leftUnparseable++
      console.log(`[backfill] ${row.id} | ${mask(raw)} unparseable → phone_e164 stays NULL`)
      continue
    }

    if (dryRun) {
      set++
      console.log(`[backfill] ${row.id} | ${mask(raw)} → would set ${mask(e164)}`)
      continue
    }

    const { error: updError, count } = await supabase
      .from('leads')
      .update({ phone_e164: e164 }, { count: 'exact' })
      .eq('id', row.id)
      .is('phone_e164', null)

    if (updError || count !== 1) {
      failed++
      console.error(`[backfill] ${row.id} | ${mask(raw)} update failed:`, updError?.message ?? `matched ${count} rows`)
      continue
    }
    set++
    writtenThisPage++
    console.log(`[backfill] ${row.id} | ${mask(raw)} → set ${mask(e164)}`)
  }

  // Rows written this page no longer match `phone_e164 IS NULL`, so the next
  // page's offset must not count them.
  from -= writtenThisPage
  if (rows.length < PAGE) break
}

console.log('[backfill] ─────────────────────────────')
const line = (label: string, n: number) => console.log(`[backfill] ${(label + ':').padEnd(30)}${n}`)
line('rows scanned', scanned)
line(dryRun ? 'rows that would be set' : 'rows set', set)
line('left NULL — empty/NULL', leftEmpty)
line('left NULL — unparseable', leftUnparseable)
line('update failures', failed)
if (failed > 0) process.exit(1)
