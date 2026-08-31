import type { LeadTierV2 } from './leadScoringV2'

// ── Canonical eligible-lead rules ─────────────────────────────────────────────
//
// Single shared definition of "does this lead count" for any surface that
// aggregates leads needing an agent's attention (dashboard KPIs, Needs Your
// Attention, sidebar badge, analytics). Previously each surface reinvented
// this independently, and several of them scoped by property_id through a
// properties query that excludes soft-deleted rows — silently dropping a
// lead the moment its property was archived, even though the lead itself
// (and its agent_id, the durable owner stamp) was completely unaffected.
//
// isEligibleLead() intentionally has no property reference of any kind — the
// caller's own query scopes ownership via `.eq('agent_id', ...)`, not a join
// through properties, so a lead's eligibility can never depend on whether its
// property still exists, is active, or has been soft- or hard-deleted.

export interface LeadEligibilityInput {
  status:         string | null | undefined
  do_not_contact: boolean | null | undefined
  spam:           boolean | null | undefined
}

// Status alone — has this lead been contacted at all? Distinct from
// isEligibleLead(): a do_not_contact/spam lead with status 'new' has never
// been contacted, but isn't eligible for follow-up either. Surfaces that mean
// "was this lead worked" (e.g. a contacted-vs-total funnel stage) should use
// this, not isEligibleLead(), which would misclassify that lead as contacted.
export function isUncontacted(l: { status: LeadEligibilityInput['status'] }): boolean {
  return !l.status || l.status === 'new'
}

// Base rule: agent ownership is enforced by the caller's query, not here.
export function isEligibleLead(l: LeadEligibilityInput): boolean {
  return isUncontacted(l) && l.do_not_contact !== true && l.spam !== true
}

// "Needs Follow-Up" KPI — the urgent subset: base rule + hot tier only.
export function needsFollowUp(l: LeadEligibilityInput & { tier: LeadTierV2 | null | undefined }): boolean {
  return isEligibleLead(l) && l.tier === 'hot'
}

// "Needs Your Attention" widget — base rule + hot or warm tier.
export function needsAttention(l: LeadEligibilityInput & { tier: LeadTierV2 | null | undefined }): boolean {
  return isEligibleLead(l) && (l.tier === 'hot' || l.tier === 'warm')
}
