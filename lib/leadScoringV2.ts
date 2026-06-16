// ── Lead Scoring V2 ──────────────────────────────────────────────────────────
//
// Two-dimensional model:
//   intent_score  — raw points, durable, never decays; stored on the lead row
//   call_priority — intent_score × recency decay; computed at read time only
//
// Rules are pre-revenue / cost-discipline: pure arithmetic, zero API calls.

export type LeadTierV2 = 'cold' | 'warm' | 'hot'

// ── Stored on leads.score_breakdown ─────────────────────────────────────────
export interface ScoreBreakdown {
  first_scan:        number
  return_visits:     { count: number; points: number }
  photos:            { viewed: 'none' | 'some' | 'most'; points: number }
  saved:             number
  requested_info:    number
  requested_showing: number
  time_on_page:      { seconds: number; points: number }
  _legacy?:          true   // set on rows backfilled from V1 motivation field
}

// ── Input from browser engagement payload ────────────────────────────────────
export interface EngagementInputV2 {
  visitCount:    number   // total visits this device has made (1 = first)
  photosViewed:  number   // photos that passed the >=2s dwell gate (client-enforced)
  totalPhotos:   number   // listing's total photo count (0 if unknown)
  timeOnPageSec: number   // this session's duration
  ctaClicked:    'showing' | 'question' | 'disclosures' | null
  hasSaved:      boolean
}

// ── Bot / link-preview UA filter ─────────────────────────────────────────────
const BOT_RE = /bot|spider|crawl|preview|unfurl|slack|discord|telegram|whatsapp|facebookexter|twitterbot|linkedinbot|iframely|bytespider|applebot|bingbot|googlebot/i

export function isLikelyBot(userAgent: string): boolean {
  return BOT_RE.test(userAgent)
}

// ── Return-visit points: +2 first return, +1 each additional, cap +5
function returnPts(visitCount: number): number {
  const returns = visitCount - 1
  if (returns <= 0) return 0
  return Math.min(2 + (returns - 1), 5)   // 1r=2, 2r=3, 3r=4, 4r+=5
}

// ── Time-on-page per session: <15s=0, 15-90s=+1, 90s+=+2
function timePts(seconds: number): number {
  if (seconds < 15) return 0
  if (seconds < 90) return 1
  return 2
}

// ── Score result ─────────────────────────────────────────────────────────────
export interface ScoreResult {
  intent_score:       number
  tier:               LeadTierV2
  score_breakdown:    ScoreBreakdown
  // Updated persistence fields (write these back to the leads row)
  return_visit_count: number
  photo_view_count:   number
  total_time_on_page: number
}

// ── Main scoring function ─────────────────────────────────────────────────────
//
// Call once at lead insertion (prev = all zeros).
// Call again on subsequent activity (pass existing lead state as prev) to
// accumulate points — deduplication logic prevents double-crediting.
//
// Anti-gaming enforced here:
//   • return-visit cap (+5 max)
//   • requested_showing/info credited once per lead
//   • showing credit gated on hasValidContact
//   • photo credit never downgrades (takes max of old vs new)
export function computeScoreV2(params: {
  eng:             EngagementInputV2
  hasValidContact: boolean   // phone OR email present
  prev: {
    returnVisitCount:  number
    photoViewCount:    number
    totalTimeSec:      number
    breakdown:         Partial<ScoreBreakdown>
  }
}): ScoreResult {
  const { eng, hasValidContact, prev } = params
  let score = 0

  // first_scan: +1 always (baseline for every real lead)
  score += 1

  // return_visits
  // Take the higher of: what the browser reports now vs what we've credited before,
  // then recompute points with the cap.
  const totalReturns = Math.max(prev.returnVisitCount, eng.visitCount - 1)
  const rPts = Math.min(returnPts(totalReturns + 1), 5)   // +1 to visitCount
  // Never reduce: keep existing if higher (shouldn't happen, but safe)
  const finalReturnPts = Math.max(rPts, prev.breakdown.return_visits?.points ?? 0)
  score += finalReturnPts

  // photos: +1 if 3+ viewed, +2 if >=70% of listing or 7+ photos
  const prevPhotoViewed = prev.breakdown.photos?.viewed ?? 'none'
  const prevPhotoPts    = prev.breakdown.photos?.points ?? 0
  const bestPhotoCount  = Math.max(prev.photoViewCount, eng.photosViewed)
  let photoLabel: 'none' | 'some' | 'most' = prevPhotoViewed
  let pPts = prevPhotoPts
  if (bestPhotoCount >= 3) {
    const isMost = eng.totalPhotos > 0
      ? bestPhotoCount >= Math.ceil(eng.totalPhotos * 0.7)
      : bestPhotoCount >= 7
    const candidateLabel: 'some' | 'most' = isMost ? 'most' : 'some'
    const candidatePts = isMost ? 2 : 1
    if (candidatePts > pPts) { pPts = candidatePts; photoLabel = candidateLabel }
  }
  score += pPts

  // saved: +2 once
  const savedPts = eng.hasSaved ? 2 : (prev.breakdown.saved ?? 0)
  score += savedPts

  // requested_info: +5 once (question CTA)
  const prevInfo      = prev.breakdown.requested_info ?? 0
  const requestedInfo = prevInfo === 0 && eng.ctaClicked === 'question' ? 5 : prevInfo
  score += requestedInfo

  // requested_showing: +15 once, requires valid contact (phone or email)
  const prevShowing      = prev.breakdown.requested_showing ?? 0
  const requestedShowing = prevShowing === 0 && eng.ctaClicked === 'showing' && hasValidContact ? 15 : prevShowing
  score += requestedShowing

  // time_on_page: additive across sessions (decay on call_priority handles staleness)
  const totalTimeSec = prev.totalTimeSec + eng.timeOnPageSec
  const newTimePts   = (prev.breakdown.time_on_page?.points ?? 0) + timePts(eng.timeOnPageSec)
  score += newTimePts

  const tier: LeadTierV2 = score >= 11 ? 'hot' : score >= 5 ? 'warm' : 'cold'

  return {
    intent_score: score,
    tier,
    score_breakdown: {
      first_scan:        1,
      return_visits:     { count: totalReturns, points: finalReturnPts },
      photos:            { viewed: photoLabel,   points: pPts },
      saved:             savedPts,
      requested_info:    requestedInfo,
      requested_showing: requestedShowing,
      time_on_page:      { seconds: totalTimeSec, points: newTimePts },
    },
    return_visit_count: totalReturns,
    photo_view_count:   bestPhotoCount,
    total_time_on_page: totalTimeSec,
  }
}

// ── Call priority — READ TIME ONLY, never stored ──────────────────────────────
// Multiplies intent_score by a recency decay so fresh hot leads sort above
// stale hot leads in the inbox.
export function computeCallPriority(
  intentScore:     number,
  lastActivityAt:  string | null | undefined,
): number {
  if (!lastActivityAt) return Math.round(intentScore * 0.5 * 100) / 100
  const daysSince = (Date.now() - new Date(lastActivityAt).getTime()) / 86_400_000
  const decay = daysSince <= 3  ? 1.0
              : daysSince <= 7  ? 0.8
              : daysSince <= 14 ? 0.5
              : daysSince <= 30 ? 0.3
              : 0.15
  return Math.round(intentScore * decay * 100) / 100
}

// ── Inbox urgency tag ─────────────────────────────────────────────────────────
// Tiers the "Call Today" signal off call_priority so it actually carries meaning
// (previously every hot lead showed the same red tag). Returns null below the
// threshold so low-priority cards stay uncluttered.
export function urgencyLabel(callPriority: number): { label: string; color: string } | null {
  if (callPriority >= 15) return { label: 'Call Today', color: '#EF4444' }  // red
  if (callPriority >= 8)  return { label: 'This Week',  color: '#F59E0B' }  // amber
  return null
}

// ── Inbox "why" reason ────────────────────────────────────────────────────────
// Single strongest signal from the stored breakdown, in priority order.
// _legacy rows (and rows missing a breakdown) fall back to the tier label.
export function topSignalLabel(
  bd:   Partial<ScoreBreakdown> | null | undefined,
  tier: LeadTierV2,
): string {
  if (bd && !bd._legacy) {
    if ((bd.requested_showing ?? 0) > 0)      return 'Requested showing'
    if ((bd.requested_info ?? 0) > 0)         return 'Asked a question'
    if ((bd.saved ?? 0) > 0)                  return 'Saved property'
    if ((bd.return_visits?.points ?? 0) > 0)  return 'Return visitor'
    if ((bd.photos?.points ?? 0) > 0)         return 'Viewed photos'
    if ((bd.first_scan ?? 0) > 0)             return 'New scan'
  }
  return tier === 'hot' ? 'Hot lead' : tier === 'warm' ? 'Warm lead' : 'Cold lead'
}

// ── Tier derivation (fallback for V1 rows without tier field) ────────────────
export function motivationToTierV2(motivation: string | null | undefined): LeadTierV2 {
  if (motivation === 'hot' || motivation === 'motivated') return 'hot'
  if (motivation === 'warm') return 'warm'
  return 'cold'
}

// ── UI config ─────────────────────────────────────────────────────────────────
export const TIER_V2_CFG = {
  hot:  { label: '🔥 Hot',  color: '#EF4444', bg: '#3B0D0D', border: '#EF4444',
          action: 'Call Today',            actionIcon: '📞',
          summary: 'This buyer is highly engaged and showing strong purchase intent.',
          advice:  'Call within 30 minutes. Strike while intent is highest.' },
  warm: { label: '👍 Warm', color: '#60A5FA', bg: '#0F2238', border: '#60A5FA',
          action: 'Follow Up This Week',   actionIcon: '📅',
          summary: 'This buyer is considering this property and may need a nudge.',
          advice:  'Send a friendly follow-up text or email within 24 hours.' },
  cold: { label: '❄️ Cold', color: '#6B7280', bg: '#1F2937', border: '#6B7280',
          action: 'Add to Drip',           actionIcon: '📧',
          summary: 'This buyer is early in their search. Stay on their radar.',
          advice:  'Add to your follow-up list. Check in every 2–3 weeks.' },
} as const

// ── Score guide for the breakdown legend ─────────────────────────────────────
export const SCORE_GUIDE_V2 = [
  { label: '🔥 Hot',  range: '11+',  color: '#EF4444' },
  { label: '👍 Warm', range: '5–10', color: '#60A5FA' },
  { label: '❄️ Cold', range: '0–4',  color: '#6B7280' },
] as const

// ── Human-readable breakdown lines ────────────────────────────────────────────
export function breakdownLines(bd: ScoreBreakdown): Array<{ label: string; pts: number; color: string; detail?: string }> {
  const lines: Array<{ label: string; pts: number; color: string; detail?: string }> = []

  lines.push({ label: 'First Scan', pts: bd.first_scan, color: '#F97316' })

  if (bd.return_visits.points > 0)
    lines.push({ label: 'Return Visits', pts: bd.return_visits.points, color: '#7C3AED',
      detail: bd.return_visits.count === 1 ? '1 return' : `${bd.return_visits.count} returns` })

  if (bd.photos.points > 0)
    lines.push({ label: 'Photo Engagement', pts: bd.photos.points, color: '#14B8A6',
      detail: bd.photos.viewed === 'most' ? 'Viewed most photos' : '3+ photos viewed' })

  if (bd.saved > 0)
    lines.push({ label: 'Saved Listing', pts: bd.saved, color: '#A78BFA' })

  if (bd.requested_info > 0)
    lines.push({ label: 'Asked a Question', pts: bd.requested_info, color: '#10B981' })

  if (bd.requested_showing > 0)
    lines.push({ label: 'Requested Showing', pts: bd.requested_showing, color: '#EF4444' })

  if (bd.time_on_page.points > 0) {
    const m = Math.floor(bd.time_on_page.seconds / 60)
    const s = bd.time_on_page.seconds % 60
    lines.push({ label: 'Time on Page', pts: bd.time_on_page.points, color: '#60A5FA',
      detail: m > 0 ? `${m}m ${s}s total` : `${s}s total` })
  }

  return lines
}
