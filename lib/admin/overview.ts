import 'server-only'
import { createServiceSupabase } from '../supabase-service'
import { getBetaStatus } from '../beta'
import { assertAdmin } from './auth'

// ── Beta Overview data path (READ-ONLY, aggregates only) ────────────────────────
// This is the second, independent data path (the first being each agent's normal
// RLS-scoped dashboard). It re-verifies admin itself, reads through the
// service-role client, and returns ONLY shaped per-agent aggregates + portfolio
// totals. It never returns a buyer's name/phone/email, a raw lead row, or a raw
// scan event.

export type HealthLabel =
  | 'Healthy'
  | 'Needs onboarding'
  | 'Trial conversion opportunity'
  | 'At risk'

export interface AgentSummary {
  id:             string
  name:           string
  betaJoinedAt:   string | null
  accountAgeDays: number
  daysRemaining:  number
  expired:        boolean
  lastActive:     string | null   // ISO, all-time (not range-bound) so "inactive" is meaningful
  activeListings: number
  totalScans:     number
  leadsCaptured:  number
  conversionRate: number          // leadsCaptured / totalScans, 0 when no scans
  hot:            number
  warm:           number
  cold:           number
  latestRating:   number | null
  health:         { label: HealthLabel; reason: string }
}

export interface PortfolioTotals {
  totalBetaAgents:   number
  activeAgents:      number   // any scan/lead activity in the last 14 days
  totalScans:        number
  leadsCaptured:     number
  hot:               number
  warm:              number
  cold:              number
  trialsExpiringSoon: number  // daysRemaining in (0, 14]
}

export interface BetaOverview {
  totals:      PortfolioTotals
  agents:      AgentSummary[]
  range:       { from: string | null; to: string | null }
  generatedAt: string
}

export interface OverviewRange { from?: string | null; to?: string | null }

const DAY_MS = 86_400_000
const ACTIVE_WINDOW_DAYS = 14
const INACTIVE_THRESHOLD_DAYS = 21
const TRIAL_SOON_DAYS = 14

function daysSince(iso: string | null, now: number): number {
  if (!iso) return Infinity
  return Math.floor((now - new Date(iso).getTime()) / DAY_MS)
}

function computeHealth(a: {
  activeListings: number
  totalScans: number
  leadsCaptured: number
  hot: number
  expired: boolean
  daysRemaining: number
  lastActive: string | null
}, now: number): { label: HealthLabel; reason: string } {
  if (a.activeListings === 0) {
    return { label: 'Needs onboarding', reason: 'No active listings yet' }
  }
  if (a.totalScans === 0) {
    return { label: 'Needs onboarding', reason: 'Listing live but no scans yet' }
  }
  if (!a.expired && a.daysRemaining > 0 && a.daysRemaining <= TRIAL_SOON_DAYS) {
    if (a.leadsCaptured > 0 || a.hot > 0) {
      return { label: 'Trial conversion opportunity', reason: `Engaged — trial ends in ${a.daysRemaining}d` }
    }
    return { label: 'At risk', reason: `Trial ends in ${a.daysRemaining}d, low activity` }
  }
  const inactiveDays = daysSince(a.lastActive, now)
  if (inactiveDays > INACTIVE_THRESHOLD_DAYS) {
    const shown = inactiveDays === Infinity ? 'ever' : `${inactiveDays}d`
    return { label: 'At risk', reason: inactiveDays === Infinity ? 'No activity ever' : `No activity in ${shown}` }
  }
  return { label: 'Healthy', reason: 'Active and engaged' }
}

export async function getBetaOverview(range: OverviewRange = {}): Promise<BetaOverview> {
  // Layer 2 of 3: this data function verifies admin itself, independent of the
  // page and the API route.
  await assertAdmin()

  const svc = createServiceSupabase()
  const now = Date.now()
  const from = range.from ?? null
  const to = range.to ?? null

  // ── Roster: beta agents = profiles.beta_joined_at IS NOT NULL ──────────────
  const { data: profileRows } = await svc
    .from('profiles')
    .select('id, name, beta_joined_at')
    .not('beta_joined_at', 'is', null)

  const profiles = profileRows ?? []
  const userIds = profiles.map((p: any) => p.id)

  // Empty roster → return zeroed totals early.
  if (userIds.length === 0) {
    return {
      totals: { totalBetaAgents: 0, activeAgents: 0, totalScans: 0, leadsCaptured: 0, hot: 0, warm: 0, cold: 0, trialsExpiringSoon: 0 },
      agents: [], range: { from, to }, generatedAt: new Date().toISOString(),
    }
  }

  // ── Properties → active-listing counts + property→user + property id set ────
  const { data: propRows } = await svc
    .from('properties')
    .select('id, user_id, active, deleted_at')
    .in('user_id', userIds)

  const properties = propRows ?? []
  const propToUser = new Map<string, string>()
  const activeListings = new Map<string, number>()
  for (const p of properties) {
    propToUser.set(p.id, p.user_id)
    if (p.active === true && p.deleted_at == null) {
      activeListings.set(p.user_id, (activeListings.get(p.user_id) ?? 0) + 1)
    }
  }
  const propIds = properties.map((p: any) => p.id)

  // ── QR codes → qr→user map (scans attribute through qr → property → user) ───
  const qrToUser = new Map<string, string>()
  if (propIds.length > 0) {
    const { data: qrRows } = await svc
      .from('qrcodes')
      .select('id, property_id')
      .in('property_id', propIds)
    for (const q of qrRows ?? []) {
      const uid = propToUser.get(q.property_id)
      if (uid) qrToUser.set(q.id, uid)
    }
  }

  // ── Scan events (optionally date-bounded) → count + last per user ───────────
  const scansByUser = new Map<string, { count: number; last: string | null }>()
  const qrIds = [...qrToUser.keys()]
  if (qrIds.length > 0) {
    let q = svc.from('scan_events').select('qr_id, created_at').in('qr_id', qrIds)
    if (from) q = q.gte('created_at', from)
    if (to)   q = q.lte('created_at', to)
    const { data: scanRows } = await q
    for (const s of scanRows ?? []) {
      const uid = qrToUser.get(s.qr_id)
      if (!uid) continue
      const cur = scansByUser.get(uid) ?? { count: 0, last: null }
      cur.count++
      if (!cur.last || s.created_at > cur.last) cur.last = s.created_at
      scansByUser.set(uid, cur)
    }
  }

  // ── Leads (optionally date-bounded) → count + last + tier breakdown per user ─
  // Attribute by durable agent_id when present, else property→user (legacy rows).
  const leadsByUser = new Map<string, { count: number; last: string | null; hot: number; warm: number; cold: number }>()
  if (propIds.length > 0) {
    let q = svc.from('leads').select('property_id, agent_id, tier, created_at').in('property_id', propIds)
    if (from) q = q.gte('created_at', from)
    if (to)   q = q.lte('created_at', to)
    const { data: leadRows } = await q
    for (const l of leadRows ?? []) {
      const uid = (l.agent_id && propToUser.has(l.property_id) ? l.agent_id : null)
        ?? propToUser.get(l.property_id)
      if (!uid) continue
      const cur = leadsByUser.get(uid) ?? { count: 0, last: null, hot: 0, warm: 0, cold: 0 }
      cur.count++
      if (!cur.last || l.created_at > cur.last) cur.last = l.created_at
      if (l.tier === 'hot') cur.hot++
      else if (l.tier === 'warm') cur.warm++
      else cur.cold++
      leadsByUser.set(uid, cur)
    }
  }

  // ── Latest feedback rating per agent ────────────────────────────────────────
  const latestRating = new Map<string, number>()
  {
    const { data: fbRows } = await svc
      .from('feedback_responses')
      .select('agent_id, rating, created_at')
      .in('agent_id', userIds)
      .order('created_at', { ascending: false })
    for (const f of fbRows ?? []) {
      if (!latestRating.has(f.agent_id)) latestRating.set(f.agent_id, f.rating)
    }
  }

  // ── Shape per-agent rows ────────────────────────────────────────────────────
  const agents: AgentSummary[] = profiles.map((p: any) => {
    const { daysRemaining, expired } = getBetaStatus(p.beta_joined_at)
    const scans = scansByUser.get(p.id) ?? { count: 0, last: null }
    const leads = leadsByUser.get(p.id) ?? { count: 0, last: null, hot: 0, warm: 0, cold: 0 }
    const lastActive = scans.last && leads.last
      ? (scans.last > leads.last ? scans.last : leads.last)
      : (scans.last ?? leads.last)
    const active = activeListings.get(p.id) ?? 0
    const conversionRate = scans.count > 0 ? leads.count / scans.count : 0
    const accountAgeDays = p.beta_joined_at ? daysSince(p.beta_joined_at, now) : 0

    return {
      id: p.id,
      name: (p.name && String(p.name).trim()) || '—',
      betaJoinedAt: p.beta_joined_at ?? null,
      accountAgeDays,
      daysRemaining,
      expired,
      lastActive,
      activeListings: active,
      totalScans: scans.count,
      leadsCaptured: leads.count,
      conversionRate,
      hot: leads.hot,
      warm: leads.warm,
      cold: leads.cold,
      latestRating: latestRating.get(p.id) ?? null,
      health: computeHealth({
        activeListings: active, totalScans: scans.count, leadsCaptured: leads.count,
        hot: leads.hot, expired, daysRemaining, lastActive,
      }, now),
    }
  })

  // ── Portfolio totals ────────────────────────────────────────────────────────
  const totals: PortfolioTotals = {
    totalBetaAgents: agents.length,
    activeAgents: agents.filter(a => daysSince(a.lastActive, now) <= ACTIVE_WINDOW_DAYS).length,
    totalScans: agents.reduce((s, a) => s + a.totalScans, 0),
    leadsCaptured: agents.reduce((s, a) => s + a.leadsCaptured, 0),
    hot: agents.reduce((s, a) => s + a.hot, 0),
    warm: agents.reduce((s, a) => s + a.warm, 0),
    cold: agents.reduce((s, a) => s + a.cold, 0),
    trialsExpiringSoon: agents.filter(a => !a.expired && a.daysRemaining > 0 && a.daysRemaining <= TRIAL_SOON_DAYS).length,
  }

  return { totals, agents, range: { from, to }, generatedAt: new Date().toISOString() }
}
