import { featuresForPlan } from './plans'

// Single call-site wrapper for "can this agent see lead scoring" — every
// dashboard page that gates a scoring section reads this instead of reaching
// into featuresForPlan() directly, so the one decision is named consistently
// wherever it's checked. The actual data (tier, intent_score, score_breakdown
// beyond the two request counts, return_visit) is ALSO nulled at the source
// by leads_scoped / scan_events_scoped (migration 066) — this flag controls
// what the PAGE renders with whatever it gets back, not what's sent over the
// wire. Both layers matter: the view is wire-safety even if a page forgets to
// check this; this flag is what makes the page show the real feature instead
// of a meaningless "everything is cold" default when the view nulls tier.
export function canSeeScoring(plan: string | null | undefined): boolean {
  return featuresForPlan(plan).leadScoring
}
