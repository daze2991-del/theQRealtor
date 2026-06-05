import { createAdminSupabase } from '../../../lib/supabase-admin'
import { notFound } from 'next/navigation'

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

// ── Palette (premium light theme) ────────────────────────────────────────────
const R = {
  bg:       '#F8FAFC',
  card:     '#FFFFFF',
  border:   '#E2E8F0',
  text:     '#0F172A',
  sub:      '#334155',
  muted:    '#64748B',
  purple:   '#7C3AED',
  purpleL:  '#8B5CF6',
  purpleBg: '#F5F3FF',
  hot:      '#DC2626',
  hotBg:    '#FEF2F2',
  motiv:    '#EA580C',
  motivBg:  '#FFF7ED',
  warm:     '#2563EB',
  warmBg:   '#EFF6FF',
  cold:     '#94A3B8',
  coldBg:   '#F8FAFC',
  green:    '#16A34A',
  greenBg:  '#F0FDF4',
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default async function SellerReportPage({
  params,
}: {
  params: { propertyId: string }
}) {
  const supabase = createAdminSupabase()
  const { propertyId } = params

  const [{ data: property }, { data: photos }, { data: qrcodes }, { data: leads }] =
    await Promise.all([
      supabase.from('properties').select('*').eq('id', propertyId).single(),
      supabase.from('property_photos').select('url').eq('property_id', propertyId).order('sort_order', { ascending: true }).limit(1),
      supabase.from('qrcodes').select('id, label, scan_count, placement').eq('property_id', propertyId).order('scan_count', { ascending: false }),
      supabase.from('leads').select('motivation, created_at').eq('property_id', propertyId).order('created_at', { ascending: false }),
    ])

  if (!property) notFound()

  const qrIds = (qrcodes || []).map((q: any) => q.id)
  const { data: rawScans } = qrIds.length > 0
    ? await supabase.from('scan_events')
        .select('created_at, cta_clicked, converted, return_visit, photos_viewed')
        .in('qr_id', qrIds)
        .order('created_at', { ascending: false })
        .limit(300)
    : { data: [] }

  const sl = leads    || []
  const ss = rawScans || []
  const sq = qrcodes  || []

  // ── Derived stats ─────────────────────────────────────────────────────────
  const totalScans  = sq.reduce((n: number, q: any) => n + (q.scan_count || 0), 0)
  const totalLeads  = sl.length
  const hotLeads    = sl.filter((l: any) => l.motivation === 'hot').length
  const showingReqs = ss.filter((e: any) => e.cta_clicked === 'showing').length

  const intent = {
    hot:       sl.filter((l: any) => l.motivation === 'hot').length,
    motivated: sl.filter((l: any) => l.motivation === 'motivated').length,
    warm:      sl.filter((l: any) => l.motivation === 'warm').length,
    cold:      sl.filter((l: any) => l.motivation === 'cold').length,
  }

  // ── 30-day chart ──────────────────────────────────────────────────────────
  const chartDays: { label: string; count: number }[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    chartDays.push({ label: d.toISOString().slice(0, 10), count: 0 })
  }
  ss.forEach((e: any) => {
    const entry = chartDays.find(c => c.label === e.created_at.slice(0, 10))
    if (entry) entry.count++
  })
  const maxBar = Math.max(...chartDays.map(d => d.count), 1)

  // ── Top signs ─────────────────────────────────────────────────────────────
  const topSigns    = sq.filter((q: any) => (q.scan_count || 0) > 0).slice(0, 6)
  const maxSignScan = Math.max(...topSigns.map((q: any) => q.scan_count || 0), 1)

  // ── Recent activity feed (leads + scan events merged) ─────────────────────
  type ActivityKind = 'lead_showing' | 'lead_question' | 'return_visit' | 'photos_viewed' | 'new_scan'
  type ActivityEvent = { created_at: string; kind: ActivityKind }

  const activityEvents: ActivityEvent[] = [
    ...(sl as any[]).map((l: any) => ({
      created_at: l.created_at,
      kind: (l.motivation === 'hot' || l.motivation === 'motivated')
        ? 'lead_showing' as const
        : 'lead_question' as const,
    })),
    ...(ss as any[]).map((e: any) => {
      const kind: ActivityKind = e.return_visit
        ? 'return_visit'
        : (e.photos_viewed || 0) >= 5
          ? 'photos_viewed'
          : 'new_scan'
      return { created_at: e.created_at, kind }
    }),
  ]
  activityEvents.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  const recentActivity = activityEvents.slice(0, 10)

  const activityConfig: Record<ActivityKind, { label: string; dot: string }> = {
    lead_showing:  { label: '🔥 Buyer requested a showing',            dot: R.hot },
    lead_question: { label: '💬 Buyer sent a question',                 dot: R.warm },
    return_visit:  { label: '↩️ Buyer returned to view this listing',  dot: R.purple },
    photos_viewed: { label: '📸 Buyer viewed all photos',              dot: R.motiv },
    new_scan:      { label: '📱 New buyer discovered this listing',    dot: R.muted },
  }

  // ── Property display ──────────────────────────────────────────────────────
  const heroPhoto   = (photos || [])[0]?.url ?? null
  const price       = property.price  ? `$${Number(property.price).toLocaleString()}` : null
  const beds        = property.beds   ? `${property.beds} bd`   : null
  const baths       = property.baths  ? `${property.baths} ba`  : null
  const location    = [property.city, property.state].filter(Boolean).join(', ')
  const generated   = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const periodStart = new Date(Date.now() - 29 * 86_400_000)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  // ── Card helper ───────────────────────────────────────────────────────────
  const sectionCard = (children: React.ReactNode, mb = 20) => (
    <div style={{ background: R.card, borderRadius: 16, border: `1px solid ${R.border}`, padding: '22px 24px', marginBottom: mb }}>
      {children}
    </div>
  )

  const sectionHead = (title: string, sub?: string) => (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: R.text, letterSpacing: '-0.01em' }}>{title}</div>
      {sub && <div style={{ fontSize: 11, color: R.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  )

  return (
    <main style={{ background: R.bg, minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: R.text }}>
      <style>{`
        @media (max-width: 640px) {
          .rpt-stats  { grid-template-columns: 1fr 1fr !important; }
          .rpt-two    { grid-template-columns: 1fr !important; }
          .rpt-wrap   { padding: 16px 14px 48px !important; }
          .rpt-hero   { height: 220px !important; }
          .rpt-nav    { padding: 12px 16px !important; }
          .rpt-nav-ctr { display: none !important; }
        }
      `}</style>

      {/* ── Nav ── */}
      <nav className="rpt-nav" style={{
        background: '#fff', borderBottom: `1px solid ${R.border}`,
        padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>🏠</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: R.purple, letterSpacing: '-0.02em' }}>theQRealtor</span>
        </div>
        <div className="rpt-nav-ctr" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: R.text }}>Seller Performance Report</div>
          <div style={{ fontSize: 11, color: R.muted }}>Generated {generated}</div>
        </div>
        <div style={{ fontSize: 11, color: R.muted, textAlign: 'right', lineHeight: 1.5 }}>
          <div>Confidential</div>
          <div style={{ color: R.purple, fontWeight: 600 }}>For seller's eyes only</div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <div className="rpt-hero" style={{ position: 'relative', height: 280, overflow: 'hidden', flexShrink: 0 }}>
        {heroPhoto
          ? <img src={heroPhoto} alt={property.address} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #7C3AED 0%, #4338CA 100%)' }} />
        }
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.15) 55%, transparent 100%)' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '22px 28px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>
            Seller Performance Report · {generated}
          </div>
          {price && <div style={{ fontSize: 30, fontWeight: 900, color: '#fff', lineHeight: 1, marginBottom: 6, letterSpacing: '-0.02em' }}>{price}</div>}
          <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 4, lineHeight: 1.2 }}>{property.address}</div>
          {location && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginBottom: 4 }}>{location}</div>}
          {(beds || baths) && (
            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              {[beds, baths].filter(Boolean).map(s => (
                <span key={s} style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)', background: 'rgba(255,255,255,0.15)', borderRadius: 5, padding: '3px 9px', backdropFilter: 'blur(4px)' }}>{s}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="rpt-wrap" style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px 60px' }}>

        {/* ── 4 Stat Cards ── */}
        <div className="rpt-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          {([
            { icon: '📊', value: fmt(totalScans),  label: 'QR Scans',      bg: R.purpleBg, color: R.purple,  border: R.purpleL },
            { icon: '🎯', value: fmt(totalLeads),  label: 'Buyer Leads',   bg: '#FFFBEB',  color: '#D97706', border: '#F59E0B' },
            { icon: '🔥', value: fmt(hotLeads),    label: 'Hot Buyers',    bg: R.hotBg,    color: R.hot,     border: '#F87171' },
            { icon: '📅', value: fmt(showingReqs), label: 'Showing Reqs',  bg: R.greenBg,  color: R.green,   border: '#4ADE80' },
          ] as const).map(({ icon, value, label, bg, color, border }) => (
            <div key={label} style={{ background: bg, borderRadius: 16, padding: '20px 16px', textAlign: 'center', border: `1px solid ${border}30`, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>{icon}</div>
              <div style={{ fontSize: 36, fontWeight: 900, color, lineHeight: 1, marginBottom: 4, letterSpacing: '-0.02em' }}>{value}</div>
              <div style={{ fontSize: 10, color: R.muted, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* ── Intent + Signs ── */}
        <div className="rpt-two" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>

          {/* Intent Breakdown */}
          {sectionCard(
            <>
              {sectionHead('Buyer Intent Breakdown', `${totalLeads} total lead${totalLeads !== 1 ? 's' : ''} captured`)}

              {/* Segmented bar */}
              <div style={{ display: 'flex', height: 12, borderRadius: 8, overflow: 'hidden', marginBottom: 20, background: R.border }}>
                {totalLeads > 0 ? (
                  <>
                    <div style={{ width: `${(intent.hot / totalLeads) * 100}%`, background: R.hot }} />
                    <div style={{ width: `${(intent.motivated / totalLeads) * 100}%`, background: R.motiv }} />
                    <div style={{ width: `${(intent.warm / totalLeads) * 100}%`, background: R.warm }} />
                    <div style={{ width: `${(intent.cold / totalLeads) * 100}%`, background: R.cold }} />
                  </>
                ) : (
                  <div style={{ width: '100%', background: R.border }} />
                )}
              </div>

              {/* Legend */}
              {([
                { label: '🔥 Hot',        color: R.hot,   count: intent.hot },
                { label: '⚡ Motivated',   color: R.motiv, count: intent.motivated },
                { label: '👍 Warm',        color: R.warm,  count: intent.warm },
                { label: '❄️ Cold',        color: R.cold,  count: intent.cold },
              ] as const).map(({ label, color, count }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: R.sub }}>{label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: R.text }}>{count}</span>
                    <span style={{ fontSize: 11, color: R.muted }}>
                      {totalLeads > 0 ? `${Math.round((count / totalLeads) * 100)}%` : '—'}
                    </span>
                  </div>
                </div>
              ))}

              {totalLeads === 0 && (
                <div style={{ textAlign: 'center', paddingTop: 8, color: R.muted, fontSize: 13 }}>No leads captured yet</div>
              )}
            </>
          )}

          {/* Top Performing Signs */}
          {sectionCard(
            <>
              {sectionHead('Top Performing Signs', 'Ranked by total scans')}
              {topSigns.length === 0
                ? <div style={{ textAlign: 'center', paddingTop: 24, color: R.muted, fontSize: 13 }}>No QR codes placed yet</div>
                : topSigns.map((qr: any, i: number) => (
                  <div key={qr.id} style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: i === 0 ? R.purple : R.muted, minWidth: 16 }}>#{i + 1}</span>
                        <span style={{ fontSize: 13, color: R.sub, fontWeight: 500 }}>{qr.label || 'Unlabeled sign'}</span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 800, color: R.purple }}>{qr.scan_count || 0}</span>
                    </div>
                    <div style={{ height: 6, background: R.border, borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${((qr.scan_count || 0) / maxSignScan) * 100}%`, background: i === 0 ? `linear-gradient(90deg, ${R.purple}, ${R.purpleL})` : R.purpleL, borderRadius: 4, opacity: i === 0 ? 1 : 0.5 + (0.5 * (1 - i / topSigns.length)) }} />
                    </div>
                  </div>
                ))
              }
            </>
          )}
        </div>

        {/* ── 30-Day Chart ── */}
        {sectionCard(
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              {sectionHead('30-Day Scan Activity', `${periodStart} – Today`)}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: R.purple, lineHeight: 1, letterSpacing: '-0.02em' }}>
                  {chartDays.reduce((n, d) => n + d.count, 0)}
                </div>
                <div style={{ fontSize: 10, color: R.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 3 }}>Total Scans</div>
              </div>
            </div>

            {/* Bars */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 90 }}>
              {chartDays.map(day => {
                const pct = (day.count / maxBar) * 100
                return (
                  <div
                    key={day.label}
                    title={`${new Date(day.label + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${day.count} scan${day.count !== 1 ? 's' : ''}`}
                    style={{
                      flex: 1,
                      height: `${Math.max(pct, day.count > 0 ? 8 : 0)}%`,
                      minHeight: day.count > 0 ? 5 : 2,
                      background: day.count > 0
                        ? `linear-gradient(180deg, ${R.purpleL} 0%, ${R.purple} 100%)`
                        : R.border,
                      borderRadius: '3px 3px 0 0',
                    }}
                  />
                )
              })}
            </div>

            {/* Baseline */}
            <div style={{ borderTop: `1px solid ${R.border}` }} />

            {/* Axis labels */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              <span style={{ fontSize: 10, color: R.muted }}>{periodStart}</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: R.purple }}>Today</span>
            </div>
          </>
        )}

        {/* ── Recent Activity ── */}
        {sectionCard(
          <>
            {sectionHead('Recent Activity', 'Last 10 buyer interactions')}
            {recentActivity.length === 0
              ? <div style={{ textAlign: 'center', padding: '20px 0', color: R.muted, fontSize: 13 }}>No scan activity yet — place your QR signs to start capturing data.</div>
              : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {recentActivity.map((ev, i) => {
                    const isLast = i === recentActivity.length - 1
                    const { label, dot } = activityConfig[ev.kind]
                    return (
                      <div key={i} style={{ display: 'flex', gap: 14 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: dot, marginTop: 4, flexShrink: 0, boxShadow: `0 0 0 2px ${dot}30` }} />
                          {!isLast && <div style={{ width: 1, flex: 1, background: R.border, marginTop: 3, marginBottom: 3 }} />}
                        </div>
                        <div style={{ paddingBottom: isLast ? 0 : 14, flex: 1 }}>
                          <div style={{ fontSize: 13, color: R.sub }}>{label}</div>
                          <div style={{ fontSize: 11, color: R.muted, marginTop: 2 }}>{timeAgo(ev.created_at)}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            }
          </>,
          0
        )}

        {/* ── Footer ── */}
        <div style={{ textAlign: 'center', padding: '32px 0 8px', borderTop: `1px solid ${R.border}`, marginTop: 24 }}>
          <div style={{ fontSize: 22, marginBottom: 10 }}>🏠</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: R.purple, marginBottom: 6, letterSpacing: '-0.01em' }}>theQRealtor</div>
          <div style={{ fontSize: 12, color: R.muted, maxWidth: 380, margin: '0 auto', lineHeight: 1.65 }}>
            Real-time buyer analytics for real estate agents.<br />
            This report was prepared exclusively for the listing at <strong style={{ color: R.sub }}>{property.address}</strong>.
          </div>
        </div>

      </div>
    </main>
  )
}
