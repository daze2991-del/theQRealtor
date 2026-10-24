import Link from 'next/link'

// One calm line replacing a scoring/attention section on a Free agent's
// dashboard — never shown per-lead-row, never shown on the seller report
// (that page just omits the section entirely). Same wherever it appears, so
// the agent sees one consistent prompt rather than reworded hints per page.
export default function UpgradeHint({ text = 'Upgrade to see which buyers are most interested.' }: { text?: string }) {
  return (
    <div
      role="note"
      style={{
        padding: '14px 16px', borderRadius: 10,
        background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.25)',
        fontSize: 13, color: '#C4C4D4', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      }}
    >
      <span>{text}</span>
      <Link href="/dashboard/billing" style={{ fontSize: 12.5, fontWeight: 700, color: '#8B5CF6', textDecoration: 'none', whiteSpace: 'nowrap' }}>
        Upgrade →
      </Link>
    </div>
  )
}
