import { requestsPausedCopy } from '../lib/planLock'

// Replaces the request buttons / form on a buyer-facing page when the listing
// isn't taking requests (lib/planLock.ts). No phone, no consent box, no
// reason: just the one sentence, with the agent's name when we have it.
export default function RequestsPausedNotice({ border = '#2A2A3A', color = '#9CA3AF', agentName }: { border?: string; color?: string; agentName?: string | null }) {
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
      {requestsPausedCopy(agentName)}
    </div>
  )
}
