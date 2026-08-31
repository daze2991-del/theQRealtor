'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { User, RotateCcw, MapPin, CheckCircle2, X } from 'lucide-react'
import { createBrowserSupabase } from '../../lib/supabase-browser'
import { TIER_V2_CFG, motivationToTierV2 } from '../../lib/leadScoringV2'
import { needsAttention } from '../../lib/leadEligibility'
import { timeAgo, parseTimestamp } from '../../lib/timeAgo'

// ── Tokens (mirrors the dashboard page's local palette) ───────────────────────
const C = {
  card:    '#0F1629',
  card2:   '#0A0D1C',
  border:  '#252533',
  purple:  '#7C3AED',
  purpleL: '#8B5CF6',
  text:    '#FFFFFF',
  sub:     '#C4C4D4',
  muted:   '#6B7280',
} as const

// Tier colors are single-sourced from the V2 scoring config; the labels are
// deliberately plain text rather than TIER_V2_CFG.label, which carries emoji the
// dashboard's visual language doesn't use.
type TierKey = 'hot' | 'warm'
const TIER_BADGE: Record<TierKey, { label: string; color: string; bg: string; border: string }> = {
  hot:  { label: 'Hot',  color: TIER_V2_CFG.hot.color,  bg: TIER_V2_CFG.hot.bg,  border: TIER_V2_CFG.hot.border  },
  warm: { label: 'Warm', color: TIER_V2_CFG.warm.color, bg: TIER_V2_CFG.warm.bg, border: TIER_V2_CFG.warm.border },
}

const ACTIVITY_ACCENT = '#F59E0B'   // amber — deliberately not a tier color, so
                                    // anonymous activity never reads as a lead

const DISMISS_ITEM_TYPE = 'scan_return'
const ACTIVITY_WINDOW_MS = 24 * 60 * 60 * 1000

// ── Types ─────────────────────────────────────────────────────────────────────
type LeadItem = {
  kind:       'lead'
  id:         string
  name:       string | null
  phone:      string | null
  email:      string | null
  propertyId: string | null
  tier:       TierKey
}

type ActivityItem = {
  kind:       'activity'
  propertyId: string
  lastScanAt: string
}

type Item = LeadItem | ActivityItem

// ── Component ─────────────────────────────────────────────────────────────────
export default function NeedsAttention({
  agentId,
  properties,
}: {
  agentId:    string
  properties: Array<{ id: string; address: string }>
}) {
  const [items,      setItems]      = useState<Item[] | null>(null)
  const [dismissing, setDismissing] = useState<string | null>(null)

  const propAddr: Record<string, string> = {}
  properties.forEach(p => { propAddr[p.id] = p.address })

  const propertyKey = properties.map(p => p.id).join(',')

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const propertyIds = propertyKey ? propertyKey.split(',') : []
      if (!agentId) { if (!cancelled) setItems([]); return }

      const supabase = createBrowserSupabase()
      const since    = new Date(Date.now() - ACTIVITY_WINDOW_MS).toISOString()

      // Leads are agent-scoped so they load even with no properties left; the
      // scan/dismissal queries are property-keyed, so they're skipped entirely
      // rather than sent with an empty IN list.
      const empty = { data: [] as any[], error: null }
      const [leadsRes, scansRes, dismissalsRes] = await Promise.all([
        // Scoped by agent_id — the durable owner stamp (migration 006/030) —
        // not property_id, so a lead survives here regardless of whether its
        // property is soft-deleted, hard-deleted, or gone entirely. Eligibility
        // itself (uncontacted, not do_not_contact, not spam, hot/warm tier) is
        // applied client-side via the canonical needsAttention() predicate
        // below, rather than reimplemented as a chain of query filters here.
        supabase
          .from('leads')
          .select('id, name, phone, email, property_id, tier, motivation, status, do_not_contact, spam, created_at')
          .eq('agent_id', agentId)
          .order('created_at', { ascending: true }),
        propertyIds.length === 0 ? empty : supabase
          .from('scan_events')
          .select('property_id, created_at')
          .in('property_id', propertyIds)
          .eq('return_visit', true)
          .gte('created_at', since)
          .order('created_at', { ascending: false }),
        propertyIds.length === 0 ? empty : supabase
          .from('dashboard_dismissals')
          .select('item_key, dismissed_at')
          .eq('agent_id', agentId)
          .eq('item_type', DISMISS_ITEM_TYPE)
          .in('item_key', propertyIds),
      ])

      if (cancelled) return
      if (leadsRes.error)      console.error('[needs-attention] leads query error:', leadsRes.error)
      if (scansRes.error)      console.error('[needs-attention] scan_events query error:', scansRes.error)
      if (dismissalsRes.error) console.error('[needs-attention] dismissals query error:', dismissalsRes.error)

      // Leads — hot first, then warm, oldest first within each tier (the query
      // already returns oldest-first, so partitioning preserves that).
      const rows = ((leadsRes.data || []) as any[])
        .map(l => ({ ...l, tier: l.tier && ['hot', 'warm', 'cold'].includes(l.tier) ? l.tier : motivationToTierV2(l.motivation) }))
        .filter(needsAttention)
      const toLead = (l: any): LeadItem => ({
        kind: 'lead', id: l.id, name: l.name, phone: l.phone, email: l.email,
        propertyId: l.property_id, tier: l.tier as TierKey,
      })
      const leadItems: LeadItem[] = [
        ...rows.filter(l => l.tier === 'hot').map(toLead),
        ...rows.filter(l => l.tier === 'warm').map(toLead),
      ]

      // Scan returns — most recent qualifying scan per property.
      const latestByProp: Record<string, string> = {}
      ;((scansRes.data || []) as any[]).forEach(s => {
        if (s.property_id && !latestByProp[s.property_id]) latestByProp[s.property_id] = s.created_at
      })

      // A property's activity is suppressed only by a dismissal newer than the
      // scan itself, so a fresh return visit re-surfaces an already-dismissed
      // property rather than staying hidden forever.
      const dismissedAt: Record<string, number> = {}
      ;((dismissalsRes.data || []) as any[]).forEach(d => {
        const t = parseTimestamp(d.dismissed_at)
        if (!(d.item_key in dismissedAt) || t > dismissedAt[d.item_key]) dismissedAt[d.item_key] = t
      })

      const activityItems: ActivityItem[] = Object.entries(latestByProp)
        .filter(([propertyId, scanAt]) => {
          const d = dismissedAt[propertyId]
          return d === undefined || d <= parseTimestamp(scanAt)
        })
        .map(([propertyId, lastScanAt]): ActivityItem => ({ kind: 'activity', propertyId, lastScanAt }))
        .sort((a, b) => parseTimestamp(b.lastScanAt) - parseTimestamp(a.lastScanAt))

      setItems([...leadItems, ...activityItems])
    }

    load().catch(err => { if (!cancelled) { console.error('[needs-attention] load failed:', err); setItems([]) } })
    return () => { cancelled = true }
  }, [agentId, propertyKey])

  const dismiss = async (propertyId: string) => {
    setDismissing(propertyId)
    const supabase = createBrowserSupabase()
    // dismissed_at is intentionally omitted — the column defaults to now(), so
    // the cutoff is stamped by the database clock rather than the browser's.
    const { error } = await supabase.from('dashboard_dismissals').insert({
      agent_id:  agentId,
      item_type: DISMISS_ITEM_TYPE,
      item_key:  propertyId,
    })
    setDismissing(null)
    if (error) { console.error('[needs-attention] dismiss failed:', error); return }
    setItems(prev => (prev || []).filter(i => !(i.kind === 'activity' && i.propertyId === propertyId)))
  }

  const count = items?.length ?? 0

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden', height: 320, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '13px 18px', borderBottom: `1px solid ${C.border}`, background: C.card2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text, display: 'flex', alignItems: 'center', gap: 7 }}>
          Needs Your Attention
          {count > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, color: C.purpleL, background: `${C.purple}22`, borderRadius: 20, padding: '2px 8px' }}>{count}</span>
          )}
        </span>
        <Link href="/dashboard/leads" style={{ fontSize: 11, color: C.purpleL, textDecoration: 'none', fontWeight: 600 }}>View all →</Link>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {items === null ? (
          <div style={{ padding: '32px 18px', textAlign: 'center', color: C.muted, fontSize: 13 }}>Loading…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: '20px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <CheckCircle2 size={18} color="#4ADE80" style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.sub }}>You&rsquo;re all caught up</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Nothing needs your attention right now.</div>
            </div>
          </div>
        ) : (
          items.map((item, i) => {
            const isLast = i === items.length - 1
            const rowStyle: React.CSSProperties = {
              padding: '11px 18px',
              borderBottom: isLast ? 'none' : `1px solid ${C.border}`,
              background: C.card,
            }

            if (item.kind === 'lead') {
              const badge   = TIER_BADGE[item.tier]
              const contact = item.phone || item.email || null
              return (
                <div key={`lead-${item.id}`} style={{ ...rowStyle, borderLeft: `3px solid ${badge.color}` }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <User size={15} color={badge.color} style={{ flexShrink: 0, marginTop: 2 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{item.name || 'Unknown'}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: badge.color, background: badge.bg, border: `1px solid ${badge.border}40`, borderRadius: 5, padding: '2px 7px', whiteSpace: 'nowrap' }}>
                          {badge.label}
                        </span>
                      </div>
                      {contact && (
                        <div style={{ fontSize: 10, color: C.sub, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact}</div>
                      )}
                      <div style={{ fontSize: 10, color: C.muted, display: 'flex', alignItems: 'center', gap: 3, marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <MapPin size={9} />{(item.propertyId && propAddr[item.propertyId]) || '—'}
                      </div>
                      <Link href={`/dashboard/leads/${item.id}`} style={{ fontSize: 10, fontWeight: 700, color: C.purpleL, textDecoration: 'none' }}>View lead →</Link>
                    </div>
                  </div>
                </div>
              )
            }

            const address = propAddr[item.propertyId] || 'a property'
            const busy    = dismissing === item.propertyId
            return (
              <div key={`activity-${item.propertyId}`} style={{ ...rowStyle, borderLeft: `3px solid ${ACTIVITY_ACCENT}` }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <RotateCcw size={15} color={ACTIVITY_ACCENT} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Buyer returned to {address}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: ACTIVITY_ACCENT, background: '#2D1A06', border: `1px solid ${ACTIVITY_ACCENT}40`, borderRadius: 5, padding: '2px 7px', whiteSpace: 'nowrap' }}>
                        Anonymous activity
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: C.muted, marginBottom: 5 }}>
                      No contact details — this is a repeat scan, not a lead · {timeAgo(item.lastScanAt)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <Link href={`/dashboard/properties/${item.propertyId}`} style={{ fontSize: 10, fontWeight: 700, color: C.purpleL, textDecoration: 'none' }}>View Property →</Link>
                      <button
                        onClick={() => dismiss(item.propertyId)}
                        disabled={busy}
                        title="Dismiss this activity"
                        style={{
                          fontSize: 10, fontWeight: 700, color: C.muted,
                          background: 'transparent', border: 'none', padding: 0,
                          cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1,
                          display: 'inline-flex', alignItems: 'center', gap: 3, fontFamily: 'inherit',
                        }}
                      >
                        <X size={10} />{busy ? 'Dismissing…' : 'Dismiss'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
