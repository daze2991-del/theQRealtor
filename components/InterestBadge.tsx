import { calcPropertyInterest } from '../lib/propertyInterest'
import { canSeeScoring } from '../lib/scoringAccess'

const BADGE_STYLE = {
  high:     { color: '#16A34A', background: '#F0FDF4', border: '1px solid #86EFAC' },
  moderate: { color: '#CA8A04', background: '#FEFCE8', border: '1px solid #FDE047' },
  low:      { color: '#DC2626', background: '#FEF2F2', border: '1px solid #FCA5A5' },
} as const

// The rating is a scoring feature: Free agents see nothing here, no placeholder.
export default function InterestBadge({ scans, leads, hot, plan }: { scans: number; leads: number; hot: number; plan: string | null }) {
  if (!canSeeScoring(plan)) return null
  const h = calcPropertyInterest({ totalLeads: leads, totalScans: scans, showingRequests: hot })
  return (
    <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap', ...BADGE_STYLE[h.level] }}>
      {h.badgeLabel}
    </span>
  )
}
