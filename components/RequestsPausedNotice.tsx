import { REQUESTS_PAUSED_COPY } from '../lib/planLock'

// Replaces the request buttons / form on a buyer-facing page when the listing
// isn't taking requests (lib/planLock.ts). No agent contact details, no
// consent box, no reason: just the one sentence.
export default function RequestsPausedNotice({ border = '#2A2A3A', color = '#9CA3AF' }: { border?: string; color?: string }) {
  return (
    <div
      role="status"
      data-testid="requests-paused"
      style={{
        background: 'rgba(255,255,255,0.03)', border: `1px solid ${border}`,
        borderRadius: 12, padding: 16, textAlign: 'center',
        color, fontSize: 14, lineHeight: 1.6,
      }}
    >
      {REQUESTS_PAUSED_COPY}
    </div>
  )
}
