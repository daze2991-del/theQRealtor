import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import DashboardLayout from '@/components/DashboardLayout'
import { getBetaStatus } from '@/lib/beta'

const C = {
  bg:      '#0F0F13',
  card:    '#1A1A24',
  card2:   '#13131A',
  border:  '#252533',
  purple:  '#7C3AED',
  purpleL: '#8B5CF6',
  text:    '#FFFFFF',
  sub:     '#C4C4D4',
  muted:   '#6B7280',
  red:     '#EF4444',
  green:   '#22C55E',
  amber:   '#F59E0B',
} as const

function fmt(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function ago(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return fmt(iso)
}

const TH: React.CSSProperties = {
  padding: '10px 16px', textAlign: 'left',
  fontSize: 10.5, fontWeight: 700, color: C.muted,
  textTransform: 'uppercase', letterSpacing: '0.08em',
  borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap',
  background: C.card2,
}
const TD: React.CSSProperties = {
  padding: '12px 16px', borderBottom: `1px solid ${C.border}`,
  fontSize: 13, color: C.sub, verticalAlign: 'middle',
}

export default async function AdminPage() {
  // ── Auth + role check ──────────────────────────────────────────
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const { data: selfProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (selfProfile?.role !== 'admin') redirect('/dashboard')

  // ── Service-role client ────────────────────────────────────────
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ── Platform totals ────────────────────────────────────────────
  const [
    { count: totalAgents },
    { count: totalScans },
    { count: totalLeads },
    { count: totalProperties },
    { count: totalQrCodes },
  ] = await Promise.all([
    admin.from('beta_allowlist').select('*', { count: 'exact', head: true }).not('joined_at', 'is', null),
    admin.from('scan_events').select('*', { count: 'exact', head: true }),
    admin.from('leads').select('*', { count: 'exact', head: true }),
    admin.from('properties').select('*', { count: 'exact', head: true }),
    admin.from('qrcodes').select('*', { count: 'exact', head: true }),
  ])

  // ── Beta agents ────────────────────────────────────────────────
  const { data: betaAgents } = await admin
    .from('beta_allowlist')
    .select('email, joined_at')
    .not('joined_at', 'is', null)
    .order('joined_at', { ascending: true })

  // ── Email → user_id mapping via auth.admin ─────────────────────
  const { data: { users: authUsers } } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const emailToUserId = new Map<string, string>(
    authUsers
      .filter(u => u.email)
      .map(u => [u.email!.toLowerCase(), u.id])
  )

  const userIds = (betaAgents || [])
    .map(a => emailToUserId.get(a.email?.toLowerCase() ?? ''))
    .filter((id): id is string => Boolean(id))

  // ── Profiles ───────────────────────────────────────────────────
  const { data: profileRows } = userIds.length > 0
    ? await admin.from('profiles').select('id, full_name, beta_joined_at').in('id', userIds)
    : { data: [] as any[] }

  const profileMap = new Map((profileRows || []).map((p: any) => [p.id, p]))

  // ── Per-agent aggregated data ──────────────────────────────────
  let properties: any[] = []
  let qrcodes:    any[] = []
  let scans:      any[] = []
  let leadsData:  any[] = []

  if (userIds.length > 0) {
    const { data: propsData } = await admin
      .from('properties').select('id, user_id').in('user_id', userIds)
    properties = propsData || []

    if (properties.length > 0) {
      const propIds = properties.map((p: any) => p.id)
      const [{ data: qrData }, { data: lData }] = await Promise.all([
        admin.from('qrcodes').select('id, property_id').in('property_id', propIds),
        admin.from('leads').select('id, property_id, created_at').in('property_id', propIds),
      ])
      qrcodes   = qrData || []
      leadsData = lData  || []

      if (qrcodes.length > 0) {
        const qrIds = qrcodes.map((q: any) => q.id)
        const { data: scanData } = await admin
          .from('scan_events').select('id, qr_id, created_at').in('qr_id', qrIds)
        scans = scanData || []
      }
    }
  }

  // ── Build lookup maps ──────────────────────────────────────────
  const propToUser  = new Map<string, string>()
  const propsByUser = new Map<string, number>()
  for (const p of properties) {
    propToUser.set(p.id, p.user_id)
    propsByUser.set(p.user_id, (propsByUser.get(p.user_id) ?? 0) + 1)
  }

  const qrToUser  = new Map<string, string>()
  const qrsByUser = new Map<string, number>()
  for (const q of qrcodes) {
    const uid = propToUser.get(q.property_id)
    if (!uid) continue
    qrToUser.set(q.id, uid)
    qrsByUser.set(uid, (qrsByUser.get(uid) ?? 0) + 1)
  }

  const scansByUser = new Map<string, { count: number; last: string | null }>()
  for (const s of scans) {
    const uid = qrToUser.get(s.qr_id)
    if (!uid) continue
    const cur = scansByUser.get(uid) ?? { count: 0, last: null }
    cur.count++
    if (!cur.last || s.created_at > cur.last) cur.last = s.created_at
    scansByUser.set(uid, cur)
  }

  const leadsByUser = new Map<string, { count: number; last: string | null }>()
  for (const l of leadsData) {
    const uid = propToUser.get(l.property_id)
    if (!uid) continue
    const cur = leadsByUser.get(uid) ?? { count: 0, last: null }
    cur.count++
    if (!cur.last || l.created_at > cur.last) cur.last = l.created_at
    leadsByUser.set(uid, cur)
  }

  // ── Build rows ─────────────────────────────────────────────────
  const rows = (betaAgents || []).map(agent => {
    const userId     = emailToUserId.get(agent.email?.toLowerCase() ?? '') ?? ''
    const profile    = profileMap.get(userId)
    const { daysRemaining } = getBetaStatus(profile?.beta_joined_at)
    const scansInfo  = scansByUser.get(userId) ?? { count: 0, last: null }
    const leadsInfo  = leadsByUser.get(userId) ?? { count: 0, last: null }
    const lastActive = scansInfo.last && leadsInfo.last
      ? (scansInfo.last > leadsInfo.last ? scansInfo.last : leadsInfo.last)
      : (scansInfo.last ?? leadsInfo.last)
    return {
      email:           agent.email,
      name:            profile?.full_name || '—',
      betaJoinedAt:    profile?.beta_joined_at ?? null,
      daysRemaining,
      propertiesCount: propsByUser.get(userId) ?? 0,
      qrCodesCount:    qrsByUser.get(userId) ?? 0,
      totalScans:      scansInfo.count,
      totalLeads:      leadsInfo.count,
      lastActive,
    }
  })

  const stats = [
    { label: 'Beta Agents',  value: totalAgents    ?? 0, color: C.purpleL },
    { label: 'Properties',   value: totalProperties ?? 0, color: C.sub },
    { label: 'QR Codes',     value: totalQrCodes   ?? 0, color: C.sub },
    { label: 'Total Scans',  value: totalScans     ?? 0, color: C.amber },
    { label: 'Leads Captured', value: totalLeads   ?? 0, color: C.green },
  ]

  return (
    <DashboardLayout>
      <div style={{ padding: '28px', fontFamily: 'sans-serif', maxWidth: 1200 }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
            Admin
          </h1>
          <p style={{ fontSize: 13.5, color: C.muted, margin: 0 }}>
            Platform overview — read only
          </p>
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 32 }}>
          {stats.map(({ label, value, color }) => (
            <div key={label} style={{
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 12, padding: '18px 20px',
            }}>
              <div style={{ fontSize: 26, fontWeight: 900, color, letterSpacing: '-0.02em', lineHeight: 1 }}>
                {value.toLocaleString()}
              </div>
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* Agent table */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Beta Agents</span>
            <span style={{ fontSize: 12, color: C.muted, marginLeft: 10 }}>{rows.length} enrolled</span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={TH}>Agent</th>
                  <th style={TH}>Email</th>
                  <th style={TH}>Joined</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Days Left</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Props</th>
                  <th style={{ ...TH, textAlign: 'right' }}>QRs</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Scans</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Leads</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Last Active</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ ...TD, textAlign: 'center', color: C.muted, padding: '32px 16px' }}>
                      No enrolled agents yet.
                    </td>
                  </tr>
                )}
                {rows.map(row => (
                  <tr key={row.email} style={{ background: 'transparent' }}>
                    <td style={{ ...TD, color: C.text, fontWeight: 600 }}>
                      {row.name}
                    </td>
                    <td style={{ ...TD, color: C.muted, fontSize: 12 }}>
                      {row.email}
                    </td>
                    <td style={{ ...TD, fontSize: 12 }}>
                      {fmt(row.betaJoinedAt)}
                    </td>
                    <td style={{ ...TD, textAlign: 'right' }}>
                      <span style={{
                        fontSize: 13, fontWeight: 700,
                        color: row.daysRemaining <= 0 ? C.red : row.daysRemaining <= 14 ? C.amber : C.green,
                      }}>
                        {row.daysRemaining <= 0 ? 'Expired' : `${row.daysRemaining}d`}
                      </span>
                    </td>
                    <td style={{ ...TD, textAlign: 'right' }}>{row.propertiesCount}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{row.qrCodesCount}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{row.totalScans.toLocaleString()}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{row.totalLeads.toLocaleString()}</td>
                    <td style={{ ...TD, textAlign: 'right', fontSize: 12 }}>
                      {ago(row.lastActive)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
