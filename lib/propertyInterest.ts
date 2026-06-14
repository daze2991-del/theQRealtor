export type InterestLevel = 'high' | 'moderate' | 'low'

export interface PropertyInterestCfg {
  level:      InterestLevel
  label:      string   // "High Interest"  — use for headings
  badgeLabel: string   // "🟢 High Interest" — use for pill badges
  score:      number   // 92 | 68 | 34  — for the X/100 circular display
  color:      string   // dark-mode accent color
  bg:         string   // dark-mode tinted background (rgba)
  text:       string   // one-line description for agents
}

/**
 * Single source of truth for property interest level.
 *
 * Formula:
 *   High     — 5+ leads OR any showing request (high-value intent signal)
 *   Moderate — 1+ leads OR 5+ scans (some engagement, no conversion yet)
 *   Low      — everything else
 */
export function calcPropertyInterest(params: {
  totalLeads:      number
  totalScans:      number
  showingRequests: number
}): PropertyInterestCfg {
  const { totalLeads, totalScans, showingRequests } = params

  if (totalLeads >= 5 || showingRequests >= 1) return {
    level: 'high', label: 'High Interest', badgeLabel: '🟢 High Interest',
    score: 92, color: '#10B981', bg: 'rgba(16,185,129,0.1)',
    text: 'This listing is performing above average in your market.',
  }

  if (totalLeads >= 1 || totalScans >= 5) return {
    level: 'moderate', label: 'Moderate Interest', badgeLabel: '🟡 Moderate Interest',
    score: 68, color: '#F59E0B', bg: 'rgba(245,158,11,0.1)',
    text: 'This listing is attracting steady buyer interest.',
  }

  return {
    level: 'low', label: 'Low Interest', badgeLabel: '🔴 Low Interest',
    score: 34, color: '#EF4444', bg: 'rgba(239,68,68,0.1)',
    text: 'This listing needs more visibility. Consider repositioning your QR signs.',
  }
}
