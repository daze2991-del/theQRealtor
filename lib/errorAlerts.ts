import { createHash } from 'crypto'
import { createAdminSupabase } from './supabase-admin'

// ── Error alerts ─────────────────────────────────────────────────────────────
// Emails the founder (hello@theqrealtor.com) when something breaks in production.
//
// CONTRACT: nothing in this file may ever throw, and nothing may hold a request
// for more than ALERT_TIMEOUT_MS. If Resend or the throttle table is down, the
// alert is dropped and only logged. The email carries exactly four facts: time
// (America/Los_Angeles), route TEMPLATE, scrubbed error message, deployment id.
// No stack, no request body, no headers, no URL query, no user data.
//
// THROTTLE (durable, table error_alert_events, migration 073): at most one email
// per fingerprint (route + scrubbed message) per hour, and at most 20 emails per
// rolling 24h overall. A row is written BEFORE sending, so concurrent errors only
// ever over-throttle. A cheap per-instance memory check sits in front so an error
// storm doesn't hammer the database.

export const ERROR_ALERT_LIMITS = { perFingerprintPerHour: 1, perDay: 20 } as const
export const ERROR_ALERT_TO = 'hello@theqrealtor.com'
export const ALERT_TIMEOUT_MS = 2500
const HOUR_MS = 60 * 60_000
const DAY_MS = 24 * HOUR_MS
const MEMORY_MS = 60_000

type Admin = { from: (table: string) => any }

// ── Scrubbing ────────────────────────────────────────────────────────────────
/** Strip anything that could be personal or secret from free text. */
export function scrub(input: unknown, max = 300): string {
  let s = typeof input === 'string' ? input : input instanceof Error ? input.message : String(input ?? '')
  s = s
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\.?[A-Za-z0-9_-]*/g, '[token]')            // JWTs
    .replace(/\bBearer\s+\S+/gi, 'Bearer [token]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id]')       // UUIDs
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[number]')                                              // phones & long numbers
    .replace(/=\(([^)]*)\)/g, '=([value])')                                                      // postgres: Key (col)=(value)
    .replace(/'[^']*'/g, "'[value]'")                                                            // quoted literals
    .replace(/"([^"]*)"/g, (m, inner) => (/^[a-z_][a-z0-9_.]*$/.test(inner) ? m : '"[value]"'))  // keep "column_names", drop other text
    .replace(/[A-Za-z0-9_-]{24,}/g, '[token]')                                                   // keys, tokens, ids
    .replace(/\s+/g, ' ')
    .trim()
  return s.length > max ? s.slice(0, max) + '…' : s
}

/** Route template only: drops query/hash and any concrete dynamic segment we can't template. */
export function scrubRoute(route: unknown): string {
  const r = String(route ?? 'unknown').split(/[?#]/)[0]
  return r.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id]')
          .replace(/[A-Za-z0-9_-]{24,}/g, '[token]')
          .slice(0, 200) || 'unknown'
}

export function fingerprint(route: string, message: string): string {
  const norm = scrub(message, 500).toLowerCase().replace(/\d+/g, '#')
  return createHash('sha256').update(scrubRoute(route) + '|' + norm).digest('hex').slice(0, 16)
}

export function laTime(d = new Date()): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short',
  }).format(d)
}

export function buildAlert(route: string, message: string, now = new Date()) {
  const r = scrubRoute(route)
  const m = scrub(message)
  const deployment = process.env.VERCEL_DEPLOYMENT_ID || 'unknown (not running on Vercel)'
  const text = [
    `Time (Los Angeles): ${laTime(now)}`,
    `Route: ${r}`,
    `Error: ${m}`,
    `Deployment: ${deployment}`,
  ].join('\n')
  return { subject: `[theQRealtor] Error on ${r}`, text }
}

// ── Throttle ─────────────────────────────────────────────────────────────────
export type AlertDecision = { ok: true } | { ok: false; reason: 'fingerprint' | 'daily_cap' | 'check_failed' }

export async function reserveErrorAlert(admin: Admin, route: string, fp: string): Promise<AlertDecision> {
  let id: string | undefined
  try {
    const ins = await admin.from('error_alert_events').insert({ fingerprint: fp, route: scrubRoute(route), allowed: true }).select('id').single()
    if (ins.error || !ins.data?.id) {
      console.error('[errorAlerts] throttle insert failed:', ins.error?.message)
      return { ok: false, reason: 'check_failed' }
    }
    id = ins.data.id as string
    const refuse = async (reason: 'fingerprint' | 'daily_cap'): Promise<AlertDecision> => {
      try { await admin.from('error_alert_events').update({ allowed: false }).eq('id', id) } catch { /* best effort */ }
      return { ok: false, reason }
    }

    const hour = await admin.from('error_alert_events').select('*', { count: 'exact', head: true })
      .eq('fingerprint', fp).eq('allowed', true).gte('created_at', new Date(Date.now() - HOUR_MS).toISOString())
    if (hour.error || typeof hour.count !== 'number') throw new Error(hour.error?.message ?? 'no count')
    if (hour.count > ERROR_ALERT_LIMITS.perFingerprintPerHour) return refuse('fingerprint')

    const day = await admin.from('error_alert_events').select('*', { count: 'exact', head: true })
      .eq('allowed', true).gte('created_at', new Date(Date.now() - DAY_MS).toISOString())
    if (day.error || typeof day.count !== 'number') throw new Error(day.error?.message ?? 'no count')
    if (day.count > ERROR_ALERT_LIMITS.perDay) return refuse('daily_cap')
    return { ok: true }
  } catch (err: any) {
    console.error('[errorAlerts] throttle check failed:', err?.message ?? err)
    if (id) { try { await admin.from('error_alert_events').update({ allowed: false }).eq('id', id) } catch { /* ignore */ } }
    return { ok: false, reason: 'check_failed' }
  }
}

// ── Send ─────────────────────────────────────────────────────────────────────
const recent = new Map<string, number>()
/** Test hook: forget the per-instance memory throttle. */
export function __resetErrorAlertMemory() { recent.clear() }

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | 'timeout'> {
  let t: ReturnType<typeof setTimeout>
  return Promise.race([p, new Promise<'timeout'>(res => { t = setTimeout(() => res('timeout'), ms) })]).finally(() => clearTimeout(t))
}

export type SendAlertResult = 'sent' | 'throttled' | 'failed' | 'timeout'

/** Best-effort. Never throws. Resolves within ALERT_TIMEOUT_MS. */
export async function sendErrorAlert(a: { route: string; message: string }): Promise<SendAlertResult> {
  try {
    const run = async (): Promise<SendAlertResult> => {
      const route = scrubRoute(a.route)
      const fp = fingerprint(route, a.message)
      const last = recent.get(fp)
      if (last && Date.now() - last < MEMORY_MS) return 'throttled'
      recent.set(fp, Date.now())
      if (recent.size > 500) recent.clear()

      const decision = await reserveErrorAlert(createAdminSupabase(), route, fp)
      if (!decision.ok) {
        console.warn('[errorAlerts] alert not sent — reason:', decision.reason)
        return decision.reason === 'check_failed' ? 'failed' : 'throttled'
      }
      const { sendFounderAlertEmail } = await import('./email')
      const { subject, text } = buildAlert(route, a.message)
      const r = await sendFounderAlertEmail({ subject, text })
      return r.sent ? 'sent' : 'failed'
    }
    const out = await withTimeout(run().catch((err: any) => {
      console.error('[errorAlerts] failed:', err?.message ?? err)
      return 'failed' as SendAlertResult
    }), ALERT_TIMEOUT_MS)
    if (out === 'timeout') console.error('[errorAlerts] timed out — alert dropped')
    return out
  } catch (err: any) {
    console.error('[errorAlerts] unexpected:', err?.message ?? err)
    return 'failed'
  }
}

/** Alert about a thrown value. Next's own control-flow errors (redirect/notFound) are not errors. */
export async function reportError(route: string, err: unknown): Promise<void> {
  try {
    const digest = (err as any)?.digest
    if (typeof digest === 'string' && /^(NEXT_|DYNAMIC_SERVER_USAGE)/.test(digest)) return
    await sendErrorAlert({ route, message: err instanceof Error ? err.message : String(err) })
  } catch { /* never throws */ }
}

// ── Route wrapper ────────────────────────────────────────────────────────────
// Next 14.2 has no onRequestError hook (added in Next 15), so every API route
// handler is wrapped instead. A thrown error is alerted and RE-THROWN — Next
// still answers 500 exactly as before. `alertOn` additionally alerts on chosen
// response statuses (Stripe webhook: any non-2xx; cron: 5xx).
async function responseError(res: Response): Promise<string> {
  try {
    const j = await res.clone().json()
    if (typeof j?.error === 'string') return j.error
  } catch { /* not json */ }
  return 'no detail'
}

export function withErrorAlerts<A extends unknown[]>(
  route: string,
  handler: (...args: A) => Promise<Response> | Response,
  opts: { alertOn?: (status: number) => boolean } = {},
) {
  return async (...args: A): Promise<Response> => {
    let res: Response
    try {
      res = await handler(...args)
    } catch (err) {
      await reportError(route, err)
      throw err
    }
    try {
      if (opts.alertOn?.(res.status)) {
        await sendErrorAlert({ route, message: `Responded ${res.status}: ${await responseError(res)}` })
      }
    } catch { /* never affects the response */ }
    return res
  }
}
