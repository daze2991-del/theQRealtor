'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserSupabase } from '../../../lib/supabase-browser'
import DashboardLayout from '../../../components/DashboardLayout'
import Link from 'next/link'

const C = {
  bg:      '#0F0F13',
  card:    '#1A1A24',
  border:  '#252533',
  purple:  '#7C3AED',
  purpleL: '#8B5CF6',
  text:    '#FFFFFF',
  sub:     '#C4C4D4',
  muted:   '#6B7280',
} as const

const MOTIVATION_CFG = {
  hot:       { label: '🔥 Hot',       color: '#EF4444', bg: '#3B0D0D', border: '#EF4444', action: 'Call Today', actionIcon: '📞' },
  motivated: { label: '⚡ Motivated', color: '#F97316', bg: '#3B1F0D', border: '#F97316', action: 'Text Now',   actionIcon: '💬' },
  warm:      { label: '👍 Warm',      color: '#60A5FA', bg: '#0F2238', border: '#60A5FA', action: 'Follow Up This Week', actionIcon: '📅' },
  cold:      { label: '❄ Cold',       color: '#6B7280', bg: '#1F2937', border: '#6B7280', action: 'Add to Drip', actionIcon: '📧' },
} as const

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function MotivationBadge({ level }: { level: string | null }) {
  if (!level) return null
  const c = MOTIVATION_CFG[level as keyof typeof MOTIVATION_CFG]
  if (!c) return null
  return (
    <span style={{
      background: c.bg, color: c.color, border: `1px solid ${c.color}50`,
      borderRadius: 6, padding: '3px 9px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
    }}>{c.label}</span>
  )
}

function Avatar({ name, motivation, size = 40 }: { name: string; motivation?: string | null; size?: number }) {
  const initials = (name || '??').slice(0, 2).toUpperCase()
  const borderColor = motivation
    ? (MOTIVATION_CFG[motivation as keyof typeof MOTIVATION_CFG]?.border ?? '#374151')
    : '#374151'
  return (
    <div style={{
      width: size, height: size, borderRadius: Math.round(size * 0.28), flexShrink: 0,
      background: `${C.purple}28`, border: `2px solid ${borderColor}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.32), fontWeight: 700, color: C.purpleL,
    }}>{initials}</div>
  )
}

function ActionBtn({ href, title, emoji, bg, border }: { href: string; title: string; emoji: string; bg: string; border: string }) {
  return (
    <a
      href={href}
      title={title}
      onClick={e => e.stopPropagation()}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 32, height: 32, borderRadius: 8, fontSize: 15,
        background: bg, border: `1px solid ${border}`,
        textDecoration: 'none', flexShrink: 0,
      }}
    >{emoji}</a>
  )
}

export default function LeadsPage() {
  const router = useRouter()
  const [loading,        setLoading]        = useState(true)
  const [allLeads,       setAllLeads]       = useState<any[]>([])
  const [properties,     setProperties]     = useState<any[]>([])
  const [qrMap,          setQrMap]          = useState<Record<string, { label: string; scan_count: number }>>({})
  const [exportingCSV,   setExportingCSV]   = useState(false)
  const [tabMotivation,  setTabMotivation]  = useState('')   // '' = All
  const [filterProperty, setFilterProperty] = useState('')
  const [filterDays,     setFilterDays]     = useState('all')

  useEffect(() => {
    const load = async () => {
      const supabase = createBrowserSupabase()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth'); return }

      const { data: props } = await supabase
        .from('properties').select('id, address')
        .eq('user_id', session.user.id).order('created_at', { ascending: false })
      setProperties(props || [])
      if (!props || props.length === 0) { setLoading(false); return }

      const { data: leads } = await supabase
        .from('leads').select('*')
        .in('property_id', props.map((p: any) => p.id))
        .order('created_at', { ascending: false })
      setAllLeads(leads || [])

      // Fetch QR code info for scan counts + labels
      const qrIds = [...new Set((leads || []).map((l: any) => l.qr_id).filter(Boolean))] as string[]
      if (qrIds.length > 0) {
        const { data: qrcodes } = await supabase
          .from('qrcodes').select('id, label, scan_count').in('id', qrIds)
        const map: Record<string, { label: string; scan_count: number }> = {}
        ;(qrcodes || []).forEach((q: any) => { map[q.id] = { label: q.label || '', scan_count: q.scan_count || 0 } })
        setQrMap(map)
      }
      setLoading(false)
    }
    load().catch(() => setLoading(false))
  }, [])

  const propMap = useMemo(() => {
    const m: Record<string, string> = {}
    properties.forEach((p: any) => { m[p.id] = p.address })
    return m
  }, [properties])

  const counts = useMemo(() => ({
    all:       allLeads.length,
    hot:       allLeads.filter(l => l.motivation === 'hot').length,
    motivated: allLeads.filter(l => l.motivation === 'motivated').length,
    warm:      allLeads.filter(l => l.motivation === 'warm').length,
    cold:      allLeads.filter(l => l.motivation === 'cold').length,
  }), [allLeads])

  const leads = useMemo(() => {
    let r = allLeads
    if (tabMotivation)   r = r.filter(l => l.motivation  === tabMotivation)
    if (filterProperty)  r = r.filter(l => l.property_id === filterProperty)
    if (filterDays !== 'all') {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - parseInt(filterDays))
      r = r.filter(l => new Date(l.created_at) >= cutoff)
    }
    // Sort: hot first, then recency
    const order: Record<string, number> = { hot: 4, motivated: 3, warm: 2, cold: 1 }
    return [...r].sort((a, b) =>
      (order[b.motivation] || 0) !== (order[a.motivation] || 0)
        ? (order[b.motivation] || 0) - (order[a.motivation] || 0)
        : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }, [allLeads, tabMotivation, filterProperty, filterDays])

  const downloadCSV = async () => {
    if (leads.length === 0) return
    setExportingCSV(true)
    const supabase = createBrowserSupabase()
    const qrIds = [...new Set(leads.map(l => l.qr_id).filter(Boolean))] as string[]
    const lastScanMap: Record<string, string> = {}
    if (qrIds.length > 0) {
      const { data: scans } = await supabase
        .from('scan_events').select('qr_id, created_at')
        .in('qr_id', qrIds).order('created_at', { ascending: false })
      ;(scans || []).forEach((s: any) => { if (s.qr_id && !lastScanMap[s.qr_id]) lastScanMap[s.qr_id] = s.created_at })
    }
    const motivLabels: Record<string, string> = { hot: 'Ready now', motivated: '1–6 months', warm: '6–12 months', cold: 'Just browsing' }
    const recAction:   Record<string, string> = { hot: 'Call today', motivated: 'Text this week', warm: 'Follow up in 2 weeks', cold: 'Add to drip' }
    const rows = [
      ['Name', 'Phone', 'Email', 'Intent', 'Motivation', 'Property', 'QR Label', 'Scans', 'Last Scan', 'Submitted', 'Action'],
      ...leads.map(l => [
        l.name || '', l.phone || '', l.email || '',
        MOTIVATION_CFG[l.motivation as keyof typeof MOTIVATION_CFG]?.label || l.motivation || '',
        motivLabels[l.motivation] || '',
        propMap[l.property_id] || '',
        l.qr_id ? (qrMap[l.qr_id]?.label || '') : '',
        l.qr_id ? String(qrMap[l.qr_id]?.scan_count ?? '') : '',
        l.qr_id && lastScanMap[l.qr_id] ? new Date(lastScanMap[l.qr_id]).toLocaleString() : '',
        new Date(l.created_at).toLocaleString(),
        recAction[l.motivation] || '',
      ]),
    ]
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    setExportingCSV(false)
  }

  const tabs = [
    { key: '',          label: 'All',       count: counts.all },
    { key: 'hot',       label: '🔥 Hot',    count: counts.hot },
    { key: 'motivated', label: '⚡ Motivated', count: counts.motivated },
    { key: 'warm',      label: '👍 Warm',   count: counts.warm },
    { key: 'cold',      label: '❄ Cold',    count: counts.cold },
  ]

  const isFiltered = !!(filterProperty || filterDays !== 'all')

  return (
    <DashboardLayout>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .lead-card { cursor: pointer; transition: border-color 0.12s, box-shadow 0.12s; }
        .lead-card:hover { border-color: #7C3AED55 !important; box-shadow: 0 4px 20px rgba(0,0,0,0.25); }
        .tab-btn { border: none; background: none; cursor: pointer; font-family: sans-serif; transition: color 0.12s; white-space: nowrap; }
        .tab-btn:hover { color: #8B5CF6 !important; }
        @media (max-width: 640px) {
          .leads-grid { padding: 14px !important; }
          .lead-card-inner { flex-direction: column !important; }
        }
      `}</style>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 36, height: 36, border: `2px solid ${C.purple}`, borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto 14px', animation: 'spin 0.7s linear infinite' }} />
            <div style={{ color: C.muted, fontSize: 14, fontFamily: 'sans-serif' }}>Loading leads…</div>
          </div>
        </div>
      ) : (
        <>
          {/* Top bar */}
          <div className="db-page-topbar" style={{
            position: 'sticky', top: 0, zIndex: 10,
            background: C.bg, borderBottom: `1px solid ${C.border}`,
            padding: '15px 28px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', gap: 12, fontFamily: 'sans-serif',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>Lead Inbox</h1>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.purpleL, background: `${C.purple}22`, borderRadius: 20, padding: '3px 10px' }}>
                {allLeads.length}
              </span>
            </div>
            <button
              onClick={downloadCSV}
              disabled={exportingCSV || leads.length === 0}
              style={{
                background: 'transparent', color: C.purpleL,
                border: `1px solid ${C.purple}55`, borderRadius: 9,
                padding: '8px 16px', fontSize: 13, fontWeight: 600,
                cursor: (exportingCSV || leads.length === 0) ? 'not-allowed' : 'pointer',
                opacity: (exportingCSV || leads.length === 0) ? 0.5 : 1,
                fontFamily: 'sans-serif',
              }}
            >
              {exportingCSV ? 'Exporting…' : '⬇ Export CSV'}
            </button>
          </div>

          {/* Tab strip */}
          <div style={{
            borderBottom: `1px solid ${C.border}`, background: C.bg,
            padding: '0 28px', display: 'flex', gap: 0, overflowX: 'auto',
            fontFamily: 'sans-serif',
          }}>
            {tabs.map(tab => {
              const active = tabMotivation === tab.key
              return (
                <button
                  key={tab.key}
                  className="tab-btn"
                  onClick={() => setTabMotivation(tab.key)}
                  style={{
                    padding: '12px 16px', fontSize: 13, fontWeight: 600,
                    color: active ? C.purpleL : C.muted,
                    borderBottom: active ? `2px solid ${C.purple}` : '2px solid transparent',
                    marginBottom: -1,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      background: active ? `${C.purple}33` : '#252533',
                      color: active ? C.purpleL : C.muted,
                      borderRadius: 20, padding: '1px 6px',
                    }}>{tab.count}</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Filter bar */}
          <div style={{
            padding: '10px 28px', borderBottom: `1px solid ${C.border}`,
            display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
            fontFamily: 'sans-serif',
          }}>
            <select
              value={filterProperty}
              onChange={e => setFilterProperty(e.target.value)}
              style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: filterProperty ? C.text : C.muted, fontSize: 13, padding: '7px 11px', outline: 'none', cursor: 'pointer' }}
            >
              <option value="">All Properties</option>
              {properties.map((p: any) => <option key={p.id} value={p.id}>{p.address}</option>)}
            </select>
            <select
              value={filterDays}
              onChange={e => setFilterDays(e.target.value)}
              style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: filterDays !== 'all' ? C.text : C.muted, fontSize: 13, padding: '7px 11px', outline: 'none', cursor: 'pointer' }}
            >
              <option value="all">All time</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
            {isFiltered && (
              <>
                <button
                  onClick={() => { setFilterProperty(''); setFilterDays('all') }}
                  style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, fontSize: 13, padding: '7px 13px', cursor: 'pointer', fontFamily: 'sans-serif' }}
                >Clear</button>
                <span style={{ fontSize: 13, color: C.muted }}>{leads.length} of {allLeads.length}</span>
              </>
            )}
          </div>

          {/* Lead cards */}
          <div className="leads-grid" style={{ flex: 1, padding: '20px 28px 40px', fontFamily: 'sans-serif' }}>
            {leads.length === 0 ? (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '72px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 42, marginBottom: 14 }}>📭</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.sub, marginBottom: 8 }}>
                  {allLeads.length === 0 ? 'No leads yet' : 'No leads match your filters'}
                </div>
                <div style={{ fontSize: 14, color: C.muted }}>
                  {allLeads.length === 0
                    ? 'Place your QR signs to start capturing buyer leads.'
                    : 'Try adjusting or clearing your filters.'}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {leads.map((lead: any, i: number) => {
                  const cfg = MOTIVATION_CFG[lead.motivation as keyof typeof MOTIVATION_CFG]
                  const qr  = lead.qr_id ? qrMap[lead.qr_id] : null
                  const address = propMap[lead.property_id]
                  return (
                    <div
                      key={lead.id}
                      className="lead-card"
                      onClick={() => router.push(`/dashboard/leads/${lead.id}`)}
                      style={{
                        background: C.card, border: `1px solid ${C.border}`,
                        borderRadius: 14, padding: '18px 20px',
                        animation: `fadeUp 0.2s ease ${Math.min(i * 0.03, 0.2)}s both`,
                        borderLeft: cfg ? `3px solid ${cfg.border}` : undefined,
                      }}
                    >
                      {/* Row 1: avatar + name + badge + time */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <Avatar name={lead.name || ''} motivation={lead.motivation} size={42} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                            <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{lead.name || 'Unknown'}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <MotivationBadge level={lead.motivation} />
                              <span style={{ fontSize: 11, color: C.muted, whiteSpace: 'nowrap' }}>{timeAgo(lead.created_at)}</span>
                            </div>
                          </div>
                          <div style={{ fontSize: 13, color: C.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {[lead.phone, lead.email].filter(Boolean).join('  ·  ') || <span style={{ color: C.muted }}>No contact info</span>}
                          </div>
                        </div>
                      </div>

                      {/* Row 2: property + QR */}
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
                          {address && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.muted }}>
                              <span>📍</span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{address}</span>
                            </div>
                          )}
                          {qr && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.muted }}>
                              <span>🏷️</span>
                              <span>{qr.label}</span>
                              <span style={{ color: C.border }}>·</span>
                              <span style={{ color: C.purpleL, fontWeight: 600 }}>{qr.scan_count} scan{qr.scan_count !== 1 ? 's' : ''}</span>
                            </div>
                          )}
                        </div>

                        {/* Suggested action + action buttons */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                          {cfg && (
                            <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color }}>
                              {cfg.actionIcon} {cfg.action}
                            </span>
                          )}
                          <div style={{ display: 'flex', gap: 5 }}>
                            {lead.phone && <ActionBtn href={`tel:${lead.phone}`}   title={`Call ${lead.name}`}  emoji="📞" bg="#062014"         border="#166534" />}
                            {lead.phone && <ActionBtn href={`sms:${lead.phone}`}   title={`Text ${lead.name}`}  emoji="💬" bg={`${C.purple}18`}  border={`${C.purple}40`} />}
                            {lead.email && <ActionBtn href={`mailto:${lead.email}`} title={`Email ${lead.name}`} emoji="✉️" bg="#0B1E3A"         border="#1D4ED860" />}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </DashboardLayout>
  )
}
