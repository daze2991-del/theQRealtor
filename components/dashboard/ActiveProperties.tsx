'use client'

import Link from 'next/link'

interface Property {
  id: string
  address: string
  city?: string | null
  state?: string | null
  active: boolean
  created_at: string
}

const HOUSE_COLORS = ['#ede9fe', '#e0f2fe', '#d1fae5', '#fef3c7']
const HOUSE_TEXT   = ['#5340c8', '#0369a1', '#065f46', '#92400e']

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

interface Props {
  properties: Property[]
  scanCounts: Record<string, number>
  loading?: boolean
  onToggle: (id: string, current: boolean) => void
}

export default function ActiveProperties({ properties, scanCounts, loading, onToggle }: Props) {
  const card: React.CSSProperties = {
    background: '#fff',
    border: '0.5px solid #e5e7eb',
    borderRadius: 12,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>Active properties</span>
        <Link href="/dashboard/properties" style={{ fontSize: 13, color: '#5340c8', fontWeight: 500, textDecoration: 'none' }}>View all</Link>
      </div>

      {loading && [0,1,2].map(i => (
        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: '#f3f4f6' }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: 12, background: '#f3f4f6', borderRadius: 4, width: '60%', marginBottom: 6 }} />
            <div style={{ height: 10, background: '#f3f4f6', borderRadius: 4, width: '40%' }} />
          </div>
        </div>
      ))}

      {!loading && properties.length === 0 && (
        <p style={{ color: '#9ca3af', fontSize: 13 }}>No properties yet.</p>
      )}

      {!loading && properties.map((p, i) => {
        const bg   = HOUSE_COLORS[i % HOUSE_COLORS.length]
        const text = HOUSE_TEXT[i % HOUSE_TEXT.length]
        const loc  = [p.city, p.state].filter(Boolean).join(', ')
        return (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: bg, color: text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
              🏠
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.address}</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>{loc ? `${loc} · ` : ''}{formatDate(p.created_at)}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#5340c8' }}>{scanCounts[p.id] ?? 0} scans</span>
              <button
                onClick={() => onToggle(p.id, p.active)}
                style={{
                  background: p.active ? '#16a34a' : '#d1d5db',
                  border: 'none', borderRadius: 12, cursor: 'pointer',
                  width: 36, height: 20, position: 'relative', transition: 'background 0.2s',
                  flexShrink: 0,
                }}
                title={p.active ? 'Live — click to deactivate' : 'Offline — click to activate'}
              >
                <span style={{
                  position: 'absolute', top: 2, left: p.active ? 18 : 2,
                  width: 16, height: 16, borderRadius: '50%', background: '#fff',
                  transition: 'left 0.2s',
                }} />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
