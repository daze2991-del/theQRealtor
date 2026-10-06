import { PauseCircle } from 'lucide-react'
import { NOT_TAKING_REQUESTS_LABEL, NOT_TAKING_REQUESTS_TOOLTIP } from '../lib/planLock'

// Neutral grey pill for a plan-locked listing or sign (migration 060). Same
// shape and palette as TextsOffBadge, and deliberately not red: nothing is
// wrong or lost, it just isn't one of the items kept active on the plan.
export default function NotTakingRequestsBadge({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const md = size === 'md'
  return (
    <span
      title={NOT_TAKING_REQUESTS_TOOLTIP}
      data-testid="not-taking-requests"
      style={{
        fontSize: md ? 12 : 10, fontWeight: 700,
        background: '#1E293B', border: '1px solid #64748B66', color: '#CBD5E1',
        borderRadius: 6, padding: md ? '3px 10px' : '2px 8px',
        whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4,
      }}
    >
      <PauseCircle size={md ? 12 : 10} aria-hidden="true" />
      {NOT_TAKING_REQUESTS_LABEL}
      <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
        {' — '}{NOT_TAKING_REQUESTS_TOOLTIP}
      </span>
    </span>
  )
}
