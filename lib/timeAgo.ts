// ── Relative time ─────────────────────────────────────────────────────────────
//
// Several timestamp columns in this schema are Postgres `timestamp without time
// zone` holding UTC wall-clock — notably leads.created_at and
// scan_events.created_at. (Verified live: a lead row's naive created_at matches
// its own timestamptz last_activity_at to the sub-second.) PostgREST serializes
// those with no offset, e.g. "2026-08-24T16:30:09.885", and `new Date(...)`
// reads an offset-less string as *local* time. In PDT that placed every such
// timestamp 7 hours in the future, so anything under ~7 hours old rendered as
// "just now" and older rows were understated by 7 hours.
//
// parseTimestamp() treats an offset-less string as UTC and leaves genuinely
// zoned values alone (timestamptz columns come back with "+00:00"), so it is
// safe to call on any timestamp column regardless of its type.

export function parseTimestamp(value: string): number {
  const hasOffset = /(?:[Zz]|[+-]\d{2}:?\d{2})$/.test(value)
  return new Date(hasOffset ? value : `${value}Z`).getTime()
}

/**
 * Relative time, e.g. "just now", "12m ago", "5h ago", "3d ago".
 *
 * `absoluteAfterDays` switches to an absolute "Mon D" date once the value is at
 * least that many days old. Omit it to keep counting days indefinitely. The
 * call sites deliberately differ here — the leads inbox switches at 7 days and
 * the seller report at 30 — so the cutoff stays per-caller rather than becoming
 * one global default.
 */
export function timeAgo(value: string, opts?: { absoluteAfterDays?: number }): string {
  const ms   = parseTimestamp(value)
  const mins = Math.floor((Date.now() - ms) / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  const days   = Math.floor(hrs / 24)
  const cutoff = opts?.absoluteAfterDays
  if (cutoff === undefined || days < cutoff) return `${days}d ago`
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
