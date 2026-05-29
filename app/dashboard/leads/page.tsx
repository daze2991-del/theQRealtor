'use client'

import { useEffect, useState, useMemo, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserSupabase } from '../../../lib/supabase-browser'
import DashboardLayout from '../../../components/DashboardLayout'

/* ─── tokens ─────────────────────────────────────────────────── */
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
  hot:       { label: '🔥 Hot',       color: '#EF4444', bg: '#3B0D0D', border: '#EF4444' },
  motivated: { label: '⚡ Motivated', color: '#F97316', bg: '#3B1F0D', border: '#F97316' },
  warm:      { label: '👍 Warm',      color: '#60A5FA', bg: '#0F2238', border: '#60A5FA' },
  cold:      { label: '❄ Cold',       color: '#6B7280', bg: '#1F2937', border: '#6B7280' },
} as const

const MOTIVATION_ORDER: Record<string, number> = { hot: 4, motivated: 3, warm: 2, cold: 1 }

/* ─── helpers ────────────────────────────────────────────────── */
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} minute${m !== 1 ? 's' : ''} ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} hour${h !== 1 ? 's' : ''} ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d} day${d !== 1 ? 's' : ''} ago`
  const w = Math.floor(d / 7)
  if (w < 5) return `${w} week${w !== 1 ? 's' : ''} ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const selectStyle: React.CSSProperties = {
  background: C.card, border: `1px solid ${C.border}`,
  borderRadius: 9, color: C.sub, fontSize: 13,
  padding: '8px 12px', outline: 'none', cursor: 'pointer',
  fontFamily: 'sans-serif', appearance: 'auto',
}

/* ─── sub-components ─────────────────────────────────────────── */
function MotivationBadge({ level }: { level: string | null }) {
  if (!level) return <span style={{ color: C.muted }}>—</span>
  const c = MOTIVATION_CFG[level as keyof typeof MOTIVATION_CFG] ?? { label: level, color: '#9CA3AF', bg: '#1F2937', border: '#374151' }
  return (
    <span style={{
      background: c.bg, color: c.color, border: `1px solid ${c.color}50`,
      borderRadius: 6, padding: '3px 9px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
    }}>{c.label}</span>
  )
}

function Avatar({ name, motivation }: { name: string; motivation?: string | null }) {
  const initials = (name || '??').slice(0, 2).toUpperCase()
  const borderColor = motivation
    ? (MOTIVATION_CFG[motivation as keyof typeof MOTIVATION_CFG]?.border ?? '#374151')
    : '#374151'
  return (
    <div style={{
      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
      background: `${C.purple}28`, border: `2px solid ${borderColor}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, fontWeight: 700, color: C.purpleL,
    }}>{initials}</div>
  )
}

/* ─── page ───────────────────────────────────────────────────── */
export default function LeadsPage() {
  const router = useRouter()
  const [loading, setLoading]           = useState(true)
  const [allLeads, setAllLeads]         = useState<any[]>([])
  const [properties, setProperties]     = useState<any[]>([])
  const [expandedId, setExpandedId]     = useState<string | null>(null)
  const [exportingCSV, setExportingCSV] = useState(false)

  const [filterProperty, setFilterProperty]     = useState('')
  const [filterMotivation, setFilterMotivation] = useState('')
  const [filterDays, setFilterDays]             = useState('all')

  useEffect(() => {
    const load = async () => {
      const supabase = createBrowserSupabase()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth'); setLoading(false); return }

      const { data: props, error: propErr } = await supabase
        .from('properties')
        .select('id, address')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })

      if (propErr) { setLoading(false); return }
      setProperties(props || [])
      if (!props || props.length === 0) { setLoading(false); return }

      const { data: leads, error: leadErr } = await supabase
        .from('leads')
        .select('*')
        .in('property_id', props.map((p: any) => p.id))
        .order('created_at', { ascending: false })

      if (leadErr) console.error('[Leads] leads error', leadErr)
      setAllLeads(leads || [])
      setLoading(false)
    }
    load().catch(() => setLoading(false))
  }, [])

  const propMap = useMemo(() => {
    const m: Record<string, string> = {}
    properties.forEach((p: any) => { m[p.id] = p.address })
    return m
  }, [properties])

  const leads = useMemo(() => {
    let r = allLeads
    if (filterProperty)   r = r.filter(l => l.property_id === filterProperty)
    if (filterMotivation) r = r.filter(l => l.motivation  === filterMotivation)
    if (filterDays !== 'all') {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - parseInt(filterDays))
      r = r.filter(l => new Date(l.created_at) >= cutoff)
    }
    return [...r].sort((a, b) => (MOTIVATION_ORDER[b.motivation] || 0) - (MOTIVATION_ORDER[a.motivation] || 0))
  }, [allLeads, filterProperty, filterMotivation, filterDays])

  const isFiltered = !!(filterProperty || filterMotivation || filterDays !== 'all')

  const scoreCounts = useMemo(() => ({
    hot:       allLeads.filter(l => l.motivation === 'hot').length,
    motivated: allLeads.filter(l => l.motivation === 'motivated').length,
    warm:      allLeads.filter(l => l.motivation === 'warm').length,
    cold:      allLeads.filter(l => l.motivation === 'cold').length,
  }), [allLeads])

  const downloadCSV = async () => {
    if (leads.length === 0) { alert('No leads to export.'); return }
    setExportingCSV(true)

    const supabase = createBrowserSupabase()
    const qrIds = [...new Set(leads.map(l => l.qr_id).filter(Boolean))] as string[]
    const qrMap: Record<string, { label: string; scan_count: number }> = {}
    const lastScanMap: Record<string, string> = {}

    if (qrIds.length > 0) {
      const [{ data: qrcodes }, { data: scans }] = await Promise.all([
        supabase.from('qrcodes').select('id, label, scan_count').in('id', qrIds),
        supabase.from('scan_events').select('qr_id, created_at').in('qr_id', qrIds).order('created_at', { ascending: false }),
      ])
      ;(qrcodes || []).forEach((q: any) => { qrMap[q.id] = { label: q.label || '', scan_count: q.scan_count || 0 } })
      ;(scans || []).forEach((s: any) => { if (s.qr_id && !lastScanMap[s.qr_id]) lastScanMap[s.qr_id] = s.created_at })
    }

    const leadStatus:  Record<string, string> = { hot: 'Hot', motivated: 'Motivated', warm: 'Warm', cold: 'Cold' }
    const motivLabels: Record<string, string> = { hot: 'Ready now', motivated: 'Looking in 1–6 months', warm: 'Looking in 6–12 months', cold: 'Just browsing' }
    const recAction:   Record<string, string> = { hot: 'Call today', motivated: 'Follow up this week', warm: 'Nurture - follow up in 2 weeks', cold: 'Add to drip campaign' }

    const rows = [
      ['Name', 'Phone', 'Email', 'Lead Status', 'Motivation', 'Main Property', 'QR Code Label', 'Total Scans', 'Last Scan Date', 'Created At', 'Recommended Action'],
      ...leads.map(l => [
        l.name || '',
        l.phone || '',
        l.email || '',
        leadStatus[l.motivation]  || l.motivation || '',
        motivLabels[l.motivation] || l.motivation || '',
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

  const thStyle: React.CSSProperties = {
    padding: '11px 20px', textAlign: 'left',
    fontSize: 10.5, fontWeight: 700, color: C.muted,
    textTransform: 'uppercase', letterSpacing: '0.08em',
    borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap',
  }

  return (
    <DashboardLayout>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .lead-row { cursor: pointer; }
        .lead-row:hover td { background: #1E1E2A !important; }
        .lead-exp { animation: fadeIn 0.15s ease; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 36, height: 36, border: `2px solid ${C.purple}`,
              borderTopColor: 'transparent', borderRadius: '50%',
              margin: '0 auto 14px', animation: 'spin 0.7s linear infinite',
            }} />
            <div style={{ color: C.muted, fontSize: 14, fontFamily: 'sans-serif' }}>Loading leads…</div>
          </div>
        </div>
      ) : (
        <>
          {/* ── Top bar ── */}
          <div className="db-page-topbar" style={{
            position: 'sticky', top: 0, zIndex: 10,
            background: C.bg, borderBottom: `1px solid ${C.border}`,
            padding: '16px 28px', fontFamily: 'sans-serif',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>Leads</h1>
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
              {exportingCSV ? 'Exporting…' : '⬇ Download CSV'}
            </button>
          </div>

          {/* ── Score summary ── */}
          {allLeads.length > 0 && (
            <div style={{
              padding: '12px 28px', borderBottom: `1px solid ${C.border}`,
              display: 'flex', gap: 20, flexWrap: 'wrap', fontFamily: 'sans-serif',
            }}>
              {[
                { key: 'hot',       icon: '🔥', label: 'Hot',       color: '#EF4444' },
                { key: 'motivated', icon: '⚡', label: 'Motivated', color: '#F97316' },
                { key: 'warm',      icon: '👍', label: 'Warm',      color: '#60A5FA' },
                { key: 'cold',      icon: '❄️', label: 'Cold',      color: '#6B7280' },
              ].map(({ key, icon, label, color }) => (
                <span key={key} style={{ fontSize: 13, fontWeight: 700, color }}>
                  {icon} {label}: {scoreCounts[key as keyof typeof scoreCounts]}
                </span>
              ))}
            </div>
          )}

          {/* ── Filter bar ── */}
          <div style={{
            padding: '12px 28px', borderBottom: `1px solid ${C.border}`,
            display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
            fontFamily: 'sans-serif',
          }}>
            <select value={filterProperty} onChange={e => setFilterProperty(e.target.value)} style={selectStyle}>
              <option value="">All Properties</option>
              {properties.map((p: any) => (
                <option key={p.id} value={p.id}>{p.address}</option>
              ))}
            </select>
            <select value={filterMotivation} onChange={e => setFilterMotivation(e.target.value)} style={selectStyle}>
              <option value="">All Intent</option>
              <option value="hot">🔥 Hot</option>
              <option value="motivated">⚡ Motivated</option>
              <option value="warm">👍 Warm</option>
              <option value="cold">❄ Cold</option>
            </select>
            <select value={filterDays} onChange={e => setFilterDays(e.target.value)} style={selectStyle}>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="all">All time</option>
            </select>
            {isFiltered && (
              <>
                <button
                  onClick={() => { setFilterProperty(''); setFilterMotivation(''); setFilterDays('all') }}
                  style={{
                    background: 'transparent', border: `1px solid ${C.border}`,
                    borderRadius: 9, color: C.muted, fontSize: 13, fontWeight: 500,
                    padding: '8px 14px', cursor: 'pointer', fontFamily: 'sans-serif',
                  }}
                >Clear</button>
                <span style={{ fontSize: 13, color: C.muted }}>{leads.length} of {allLeads.length}</span>
              </>
            )}
          </div>

          {/* ── Table or empty state ── */}
          <div style={{ flex: 1, padding: '24px 28px 40px', fontFamily: 'sans-serif' }}>
            {leads.length === 0 ? (
              <div style={{
                background: C.card, border: `1px solid ${C.border}`,
                borderRadius: 16, padding: '72px 24px', textAlign: 'center',
              }}>
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
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
                    <thead>
                      <tr style={{ background: '#15151E' }}>
                        <th style={thStyle}>Lead</th>
                        <th style={thStyle}>Phone</th>
                        <th style={thStyle}>Email</th>
                        <th style={thStyle}>Intent</th>
                        <th style={thStyle}>Property</th>
                        <th style={thStyle}>Date</th>
                        <th style={thStyle}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leads.map((lead: any) => {
                        const expanded = expandedId === lead.id
                        const border = `1px solid ${C.border}`
                        const noBorder = expanded ? 'none' : border
                        return (
                          <Fragment key={lead.id}>
                            <tr className="lead-row" onClick={() => setExpandedId(expanded ? null : lead.id)}>
                              <td style={{ padding: '13px 20px', borderBottom: noBorder }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <Avatar name={lead.name || ''} motivation={lead.motivation} />
                                  <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                                    {lead.name || 'Unknown'}
                                  </span>
                                </div>
                              </td>
                              <td style={{ padding: '13px 20px', borderBottom: noBorder, fontSize: 13, color: C.sub }}>
                                {lead.phone || <span style={{ color: C.muted }}>—</span>}
                              </td>
                              <td style={{ padding: '13px 20px', borderBottom: noBorder, fontSize: 13, color: C.sub, maxWidth: 180 }}>
                                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {lead.email || <span style={{ color: C.muted }}>—</span>}
                                </div>
                              </td>
                              <td style={{ padding: '13px 20px', borderBottom: noBorder }}>
                                <MotivationBadge level={lead.motivation} />
                              </td>
                              <td style={{ padding: '13px 20px', borderBottom: noBorder, fontSize: 13, color: C.sub, maxWidth: 200 }}>
                                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {propMap[lead.property_id] || '—'}
                                </div>
                              </td>
                              <td style={{ padding: '13px 20px', borderBottom: noBorder, fontSize: 12, color: C.muted, whiteSpace: 'nowrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span title={fmtDateTime(lead.created_at)} style={{ cursor: 'default' }}>
                                    {timeAgo(lead.created_at)}
                                  </span>
                                  <span style={{
                                    fontSize: 10, color: C.muted, transition: 'transform 0.15s',
                                    transform: expanded ? 'rotate(180deg)' : 'none', display: 'inline-block',
                                  }}>▾</span>
                                </div>
                              </td>
                              <td style={{ padding: '13px 20px', borderBottom: noBorder }} onClick={e => e.stopPropagation()}>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                  {lead.phone && (
                                    <a href={`tel:${lead.phone}`} title={`Call ${lead.name}`} style={{
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      width: 30, height: 30, borderRadius: 8, fontSize: 14,
                                      background: '#062014', border: '1px solid #166534',
                                      textDecoration: 'none', flexShrink: 0,
                                    }}>📞</a>
                                  )}
                                  {lead.phone && (
                                    <a href={`sms:${lead.phone}`} title={`Text ${lead.name}`} style={{
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      width: 30, height: 30, borderRadius: 8, fontSize: 14,
                                      background: `${C.purple}18`, border: `1px solid ${C.purple}40`,
                                      textDecoration: 'none', flexShrink: 0,
                                    }}>💬</a>
                                  )}
                                  {lead.email && (
                                    <a href={`mailto:${lead.email}`} title={`Email ${lead.name}`} style={{
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      width: 30, height: 30, borderRadius: 8, fontSize: 14,
                                      background: '#0B1E3A', border: '1px solid #1D4ED860',
                                      textDecoration: 'none', flexShrink: 0,
                                    }}>✉️</a>
                                  )}
                                  {!lead.phone && !lead.email && (
                                    <span style={{ fontSize: 12, color: C.muted }}>—</span>
                                  )}
                                </div>
                              </td>
                            </tr>

                            {expanded && (
                              <tr className="lead-exp">
                                <td colSpan={7} style={{ padding: '0 16px 16px 16px', borderBottom: border, background: '#15151E' }}>
                                  <div style={{
                                    background: C.bg, border: `1px solid ${C.border}`,
                                    borderRadius: 12, padding: '18px 20px',
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                                    gap: '16px 24px',
                                  }}>
                                    {[
                                      { label: 'Full Name',  value: lead.name  || '—' },
                                      { label: 'Phone',      value: lead.phone || '—' },
                                      { label: 'Email',      value: lead.email || '—' },
                                      { label: 'Intent',     value: null, badge: lead.motivation },
                                      { label: 'Property',   value: propMap[lead.property_id] || '—' },
                                      { label: 'QR Code',    value: lead.qr_id ? lead.qr_id.slice(0, 8) + '…' : '—' },
                                      { label: 'Submitted',  value: fmtDateTime(lead.created_at) },
                                    ].map(({ label, value, badge }) => (
                                      <div key={label}>
                                        <div style={{
                                          fontSize: 10, fontWeight: 700, color: C.muted,
                                          textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5,
                                        }}>{label}</div>
                                        {badge !== undefined
                                          ? <MotivationBadge level={badge} />
                                          : <div style={{ fontSize: 13, color: C.sub, wordBreak: 'break-all' }}>{value}</div>
                                        }
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </DashboardLayout>
  )
}
