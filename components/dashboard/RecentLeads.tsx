'use client'

import Link from 'next/link'

interface Lead {
  id: string
  name: string
  address: string
  motivation: string | null
  created_at: string
}

const MOTIVATION: Record<string, { label: string; bg: string; color: string }> = {
  hot:       { label: 'Hot',       bg: '#fee2e2', color: '#991b1b' },
  motivated: { label: 'Motivated', bg: '#fef3c7', color: '#854f0b' },
  warm:      { label: 'Warm',      bg: '#d1faf0', color: '#065f46' },
  cold:      { label: 'Cold',      bg: '#dbeafe', color: '#1e40af' },
}

const AVATAR_COLORS = ['#5340c8', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444']

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

interface Props {
  leads: Lead[]
  loading?: boolean
}

export default function RecentLeads({ leads, loading }: Props) {
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
        <span style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>Recent leads</span>
        <Link href="/dashboard/leads" style={{ fontSize: 13, color: '#5340c8', fontWeight: 500, textDecoration: 'none' }}>View all</Link>
      </div>

      {loading && [0,1,2].map(i => (
        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#f3f4f6' }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: 12, background: '#f3f4f6', borderRadius: 4, width: '50%', marginBottom: 6 }} />
            <div style={{ height: 10, background: '#f3f4f6', borderRadius: 4, width: '70%' }} />
          </div>
        </div>
      ))}

      {!loading && leads.length === 0 && (
        <p style={{ color: '#9ca3af', fontSize: 13 }}>No leads yet.</p>
      )}

      {!loading && leads.map((lead, i) => {
        const m = MOTIVATION[lead.motivation ?? '']
        return (
          <div key={lead.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: AVATAR_COLORS[i % AVATAR_COLORS.length],
              color: '#fff', fontSize: 12, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              {initials(lead.name)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{lead.name}</span>
                {m && (
                  <span style={{ background: m.bg, color: m.color, fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4 }}>
                    {m.label}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {lead.address}
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>{timeAgo(lead.created_at)}</div>
          </div>
        )
      })}
    </div>
  )
}
