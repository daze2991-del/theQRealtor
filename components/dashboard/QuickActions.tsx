'use client'

import Link from 'next/link'

interface Props {
  liveCount: number
  onDownloadCSV: () => void
}

const ACTIONS = [
  {
    bg: '#ede9fe', color: '#5340c8',
    label: 'Add new property', sub: 'Create a listing',
    href: '/dashboard/properties/new',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/>
        <path d="M9 21V12h6v9"/>
        <line x1="12" y1="7" x2="12" y2="11"/><line x1="10" y1="9" x2="14" y2="9"/>
      </svg>
    ),
  },
  {
    bg: '#ccfbf1', color: '#0f766e',
    label: 'Generate QR code', sub: 'New code for a property',
    href: '/dashboard/qr-codes',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
        <rect x="3" y="14" width="7" height="7"/>
        <rect x="5" y="5" width="3" height="3"/><rect x="16" y="5" width="3" height="3"/>
        <rect x="5" y="16" width="3" height="3"/>
        <path d="M14 14h3v3h-3z"/><path d="M17 17h4v4h-4z"/>
      </svg>
    ),
  },
  {
    bg: '#dbeafe', color: '#1d4ed8',
    label: 'View all leads', sub: 'See every lead',
    href: '/dashboard/leads',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
  },
] as const

export default function QuickActions({ liveCount, onDownloadCSV }: Props) {
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
      <span style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>Quick actions</span>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ACTIONS.map((a) => (
          <Link key={a.label} href={a.href} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', padding: '6px 0' }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: a.bg, color: a.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {a.icon}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{a.label}</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>{a.sub}</div>
            </div>
          </Link>
        ))}

        <button
          onClick={onDownloadCSV}
          style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0', textAlign: 'left', width: '100%' }}
        >
          <div style={{ width: 34, height: 34, borderRadius: 8, background: '#fef3c7', color: '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>Download CSV</div>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>Export all leads</div>
          </div>
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#dcfce7', borderRadius: 20, padding: '6px 12px', marginTop: 4 }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', background: '#16a34a',
          boxShadow: '0 0 0 3px rgba(22,163,74,0.3)',
          animation: 'pulse 2s infinite',
          flexShrink: 0,
        }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: '#166534' }}>
          {liveCount} open house{liveCount !== 1 ? 's' : ''} live right now
        </span>
      </div>
    </div>
  )
}
