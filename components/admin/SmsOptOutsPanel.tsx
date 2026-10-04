import type { SmsOptOutOverview } from '../../lib/admin/smsOptOuts'

// God Mode, read-only: SMS opt-out oversight. Server-rendered — receives
// numbers already masked to the last 4 digits by lib/admin/smsOptOuts.ts.
// No actions, no edits.

const C = {
  card: '#1A1A24', border: '#252533', text: '#FFFFFF', sub: '#C4C4D4', muted: '#6B7280',
  red: '#EF4444', green: '#22C55E',
} as const

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  }) + ' PT'
}

export default function SmsOptOutsPanel({ data }: { data: SmsOptOutOverview }) {
  return (
    <section style={{ padding: '0 28px 28px', fontFamily: 'sans-serif', maxWidth: 1320, margin: '0 auto' }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: C.text, margin: 0 }}>SMS opt-outs</h2>
          <span style={{ fontSize: 13, color: C.sub }}>
            Numbers currently opted out: <strong style={{ color: C.text }}>{data.optedOutCount}</strong>
          </span>
        </div>
        <p style={{ fontSize: 12, color: C.muted, margin: '0 0 14px' }}>
          Opt-out and opt-in texts that couldn&apos;t be matched to exactly one agent. Newest first. Read-only.
        </p>

        {data.unmatchedEvents.length === 0 ? (
          <div style={{ fontSize: 13, color: C.muted, padding: '10px 0' }}>No unmatched events.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: C.muted, textAlign: 'left' }}>
                  <th style={{ padding: '6px 10px 6px 0', fontWeight: 600 }}>Phone</th>
                  <th style={{ padding: '6px 10px', fontWeight: 600 }}>Event</th>
                  <th style={{ padding: '6px 0 6px 10px', fontWeight: 600 }}>Received</th>
                </tr>
              </thead>
              <tbody>
                {data.unmatchedEvents.map(e => (
                  <tr key={e.id} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ padding: '8px 10px 8px 0', color: C.sub, fontVariantNumeric: 'tabular-nums' }}>***-***-{e.phoneLast4}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 700, color: e.eventType === 'opt_out' ? C.red : C.green }}>
                      {e.eventType === 'opt_out' ? 'Opted out' : 'Opted in'}
                    </td>
                    <td style={{ padding: '8px 0 8px 10px', color: C.sub, whiteSpace: 'nowrap' }}>{fmt(e.receivedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
