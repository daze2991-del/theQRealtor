import { PauseCircle } from 'lucide-react'
import { NOT_TAKING_REQUESTS_LABEL, NOT_TAKING_REQUESTS_TOOLTIPS, type PausedReason } from '../lib/planLock'

// Neutral grey pill for a listing or sign buyers can't send requests through
// (lib/planLock.ts requestsPausedReason). Replaces the green Active/Assigned
// pill and is never shown alongside it. Same shape and palette as
// TextsOffBadge, and deliberately not red: nothing is wrong or lost.
export default function NotTakingRequestsBadge({ size = 'sm', reason = 'locked' }: { size?: 'sm' | 'md'; reason?: PausedReason }) {
  const md = size === 'md'
  const tooltip = NOT_TAKING_REQUESTS_TOOLTIPS[reason]
  return (
    <span
      title={tooltip}
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
        {' — '}{tooltip}
      </span>
    </span>
  )
}
