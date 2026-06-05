export type CtaIntent = 'showing' | 'question' | 'disclosures' | null

export interface EngagementData {
  visitCount:          number   // 1 = first visit, 2 = return, 3+ = frequent
  photosViewed:        number
  ctaClicked:          CtaIntent
  timeOnPageSec:       number
}

export type IntentLabel = 'cold' | 'warm' | 'motivated' | 'hot'

export function calcIntentScore(e: EngagementData): number {
  let score = 1                                     // +1   first scan baseline
  if (e.visitCount > 1)               score += 3   // +3   return visit
  if (e.visitCount >= 3)              score += 5   // +5   3+ visits (stacks with above)
  if (e.photosViewed >= 5)            score += 2   // +2   photo engagement
  if (e.timeOnPageSec >= 120)         score += 1   // +1   2+ minutes on page
  if (e.timeOnPageSec >= 300)         score += 2   // +2   5+ minutes (stacks with above)
  if (e.ctaClicked === 'question')    score += 5   // +5   asked the agent
  if (e.ctaClicked === 'disclosures') score += 6   // +6   documents interest
  if (e.ctaClicked === 'showing')     score += 10  // +10  wants a tour
  return score
}

export function scoreToLabel(score: number): IntentLabel {
  if (score >= 18) return 'hot'
  if (score >= 11) return 'motivated'
  if (score >= 5)  return 'warm'
  return 'cold'
}

export function computeIntent(e: EngagementData): IntentLabel {
  return scoreToLabel(calcIntentScore(e))
}
