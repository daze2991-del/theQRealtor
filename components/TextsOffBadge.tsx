import { MessageSquareOff } from 'lucide-react'
import { TEXTS_OFF_LABEL, TEXTS_OFF_TOOLTIP } from '../lib/textsOff'

// Small "Texts off" pill for a lead whose buyer replied STOP. Neutral slate,
// deliberately unlike the red "Do Not Contact" badge — the two are unrelated.
// The explanation is both the hover tooltip and screen-reader text.
export default function TextsOffBadge({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const md = size === 'md'
  return (
    <span
      title={TEXTS_OFF_TOOLTIP}
      style={{
        fontSize: md ? 12 : 10, fontWeight: 700,
        background: '#1E293B', border: '1px solid #64748B66', color: '#CBD5E1',
        borderRadius: 6, padding: md ? '3px 10px' : '2px 8px',
        whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4,
      }}
    >
      <MessageSquareOff size={md ? 12 : 10} aria-hidden="true" />
      {TEXTS_OFF_LABEL}
      <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
        {' — '}{TEXTS_OFF_TOOLTIP}
      </span>
    </span>
  )
}
