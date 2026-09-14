// ── Single source of truth for per-plan entitlements ─────────────────────────
//
// Everything the product is allowed to do per plan lives in PLAN_CONFIG below.
// The exported helper functions are thin readers over it — they keep their
// original signatures so existing call sites (signs/create, DashboardLayout,
// onboarding, the properties pages) did not have to change.
//
// ⚠️  NONE of the `features` booleans are enforced anywhere yet. They are
//     declarative today: a record of what each tier is *meant* to include, so
//     the numbers stop living in marketing copy only. Do not assume checking
//     one of them gates anything until an enforcement point actually reads it.
//     The only limits with real enforcement are documented per-field below.

export type PlanId = 'founding' | 'alpha' | 'trial' | 'starter' | 'pro' | 'free'

export interface PlanFeatures {
  leadScoring: boolean
  engagementTrends: boolean
  multiListingComparison: boolean
  advancedBuyerInsights: boolean
}

export interface PlanConfig {
  /** Active (non-archived) signs allowed. null = unlimited.
   *  ENFORCED server-side in app/api/signs/create/route.ts. */
  maxActiveSigns: number | null
  /** Non-deleted properties allowed. null = unlimited.
   *  NOT enforced server-side — advisory only, surfaced in the dashboard UI. */
  maxActiveListings: number | null
  features: PlanFeatures
  /** True for the closed-beta cohorts we are grandfathering. Their limits must
   *  not be changed by paid-tier repricing. */
  grandfathered: boolean
  /** Whether the 45-day trial clock (lib/trial.ts) applies to this plan.
   *  TRUE FOR 'trial' ONLY. Everything else is exempt, for two different
   *  reasons that happen to need the same behaviour:
   *    • founding/alpha — grandfathered cohorts, permanent by definition
   *    • starter/pro — they are paying; expiring a paying customer
   *      because their original signup date is old would be a billing bug
   *    • free — already the most restricted tier, and the fallback that
   *      planConfig() returns for an unknown/typo'd plan string. Exempting it
   *      means a bad plan value costs us revenue rather than locking a real
   *      agent out of their own leads, which is the safer way to be wrong. */
  subjectToTrialExpiry: boolean
}

const ALL_FEATURES: PlanFeatures = {
  leadScoring: true,
  engagementTrends: true,
  multiListingComparison: true,
  advancedBuyerInsights: true,
}

export const PLAN_CONFIG: Record<PlanId, PlanConfig> = {
  // ── Grandfathered beta cohorts ────────────────────────────────────────────
  // Both live agents today are on these. Deliberately left at their original
  // 10-sign / unlimited-listing entitlement and full feature access. Paid-tier
  // changes must never reduce these.
  founding: { maxActiveSigns: 10, maxActiveListings: null, features: ALL_FEATURES, grandfathered: true, subjectToTrialExpiry: false },
  alpha:    { maxActiveSigns: 10, maxActiveListings: null, features: ALL_FEATURES, grandfathered: true, subjectToTrialExpiry: false },

  // ── Active trial ──────────────────────────────────────────────────────────
  // What every NEW signup gets. Sized for EVALUATION, not production use: a
  // trialling agent is testing the product on a single property, so one active
  // listing is enough, and 5 signs on it is enough to experiment with labelling
  // (yard sign vs. open house vs. directional) without handing out a full
  // working allowance.
  //
  // Every feature is on — the trial should show the real product, just at
  // smaller scale. Deliberately BELOW starter (3 listings / 10 signs) on both
  // dimensions, so converting to the entry paid tier is a genuine upgrade
  // either way you look at it and never forces an agent to archive anything.
  //
  // Not grandfathered, and the 45-day clock DOES apply — it counts down and
  // then restricts.
  trial:    { maxActiveSigns: 5, maxActiveListings: 1, features: ALL_FEATURES, grandfathered: false, subjectToTrialExpiry: true },

  // ── Paid tiers (not sold yet — billing is manual and Stripe is inert) ─────
  starter: {
    // 10, matching 'trial' on purpose: converting from a trial to the entry
    // paid tier must never be a downgrade that forces an agent to archive
    // working signs.
    maxActiveSigns: 10,
    maxActiveListings: 3,
    features: {
      leadScoring: true,
      engagementTrends: false,
      multiListingComparison: false,
      advancedBuyerInsights: false,
    },
    grandfathered: false,
    subjectToTrialExpiry: false,
  },
  pro: {
    maxActiveSigns: 25,
    maxActiveListings: null, // practically unrestricted, per the pricing model
    features: ALL_FEATURES,
    grandfathered: false,
    subjectToTrialExpiry: false,
  },
  // ── Fallback ──────────────────────────────────────────────────────────────
  // Also what an unrecognized/typo'd plan string resolves to. Deliberately
  // restrictive rather than permissive, but note the failure mode: a typo in
  // profiles.plan silently lands an agent here with 1 sign and 1 listing.
  free: {
    maxActiveSigns: 1,
    maxActiveListings: 1,
    features: {
      leadScoring: true, // already computed unconditionally in submit-lead
      engagementTrends: false,
      multiListingComparison: false,
      advancedBuyerInsights: false,
    },
    grandfathered: false,
    subjectToTrialExpiry: false,
  },
}

/** Resolve any plan string (including null/unknown) to its config. */
export function planConfig(plan: string | null | undefined): PlanConfig {
  if (plan && plan in PLAN_CONFIG) return PLAN_CONFIG[plan as PlanId]
  return PLAN_CONFIG.free
}

/** Active-sign limit. null = unlimited. Enforced in app/api/signs/create. */
export function signLimitForPlan(plan: string): number | null {
  return planConfig(plan).maxActiveSigns
}

/** Active-property limit. null = unlimited. Advisory (UI-only) today. */
export function propertyLimitForPlan(plan: string): number | null {
  return planConfig(plan).maxActiveListings
}

/** Feature flags for a plan. Declarative — nothing enforces these yet. */
export function featuresForPlan(plan: string | null | undefined): PlanFeatures {
  return planConfig(plan).features
}

/**
 * @deprecated Dead code. The qrcodes table is empty/retired and this had no
 * callers as of migration 036. One sign is one QR code now — use
 * signLimitForPlan. Kept only so nothing that may still import it breaks.
 */
export function qrLimitForPlan(plan: string): number | null {
  return planConfig(plan).maxActiveSigns
}
