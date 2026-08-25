// ── Listing status → seller-report lifecycle ─────────────────────────────────
// Single source of truth for how properties.deactivated_at is maintained and
// how it gates the public seller report.
//
// This exists as a shared helper specifically because THREE separate UI
// surfaces can flip properties.active, and the stamping rule (below) is subtle
// enough that duplicating it three times would drift:
//   1. app/dashboard/properties/page.tsx            — Go Live / Take Offline toggle
//   2. app/dashboard/properties/page.tsx            — per-card edit modal save
//   3. app/dashboard/properties/[propertyId]/page.tsx — detail-page edit save
// (A fourth site, app/api/properties/route.ts, only ever creates rows with
// active: true, where the column default of null is already correct.)

/** Days a seller report stays reachable after its listing goes inactive. */
export const REPORT_EXPIRY_DAYS = 90

const DAY_MS = 86_400_000

/**
 * The `deactivated_at` field to merge into a properties UPDATE, derived from
 * the active-state transition.
 *
 * Returns an EMPTY object when the column must not be touched — merging that
 * into an update payload is a no-op, which is exactly the intent. This is the
 * case that makes a shared helper worth having: re-saving an ALREADY-inactive
 * listing (e.g. the agent edits its description while it's offline) must not
 * re-stamp the timestamp, or every incidental edit would silently restart the
 * 90-day expiry clock and the report would never actually expire.
 */
export function deactivationPatch(
  wasActive: boolean,
  willBeActive: boolean,
  now: Date = new Date(),
): { deactivated_at?: string | null } {
  // Going (or staying) live clears the stamp — idempotent, safe to repeat.
  if (willBeActive) return { deactivated_at: null }
  // true -> false: this is the transition the expiry clock measures from.
  if (wasActive) return { deactivated_at: now.toISOString() }
  // Already inactive and staying inactive — preserve the original timestamp.
  return {}
}

/**
 * Whether a seller report should be treated as expired (404).
 *
 * Expiry requires BOTH an inactive listing AND a known deactivation instant.
 * A null `deactivated_at` never expires — it means active, never deactivated,
 * or deactivated before the column existed (migration 042 deliberately does
 * not backfill), and none of those should retroactively kill a live link.
 */
export function isReportExpired(
  active: boolean | null | undefined,
  deactivatedAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (active) return false
  if (!deactivatedAt) return false
  const deactivatedMs = new Date(deactivatedAt).getTime()
  if (Number.isNaN(deactivatedMs)) return false // unparseable → fail open, stay reachable
  return now.getTime() - deactivatedMs > REPORT_EXPIRY_DAYS * DAY_MS
}
