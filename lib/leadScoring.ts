export type CtaIntent = 'showing' | 'question' | 'disclosures' | null

export interface EngagementData {
  returnVisit:         boolean
  photosViewed:        number
  ctaClicked:          CtaIntent
  timeOnPageSec:       number
}

export type IntentLabel = 'cold' | 'warm' | 'hot'

export function calcIntentScore(e: EngagementData): number {
  let score = 1                                     // +1  first scan baseline
  if (e.returnVisit)                  score += 2   // +2  return visit
  if (e.photosViewed >= 5)            score += 2   // +2  photo engagement
  if (e.ctaClicked === 'disclosures') score += 3   // +3  documents interest
  if (e.ctaClicked === 'question')    score += 5   // +5  asked the agent
  if (e.ctaClicked === 'showing')     score += 10  // +10 wants a tour
  if (e.timeOnPageSec >= 120)         score += 2   // +2  spent 2+ minutes
  return score
}

export function scoreToLabel(score: number): IntentLabel {
  if (score >= 11) return 'hot'
  if (score >= 5)  return 'warm'
  return 'cold'
}

export function computeIntent(e: EngagementData): IntentLabel {
  return scoreToLabel(calcIntentScore(e))
}
