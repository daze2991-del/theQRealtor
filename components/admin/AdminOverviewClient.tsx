'use client'

import { useMemo, useState } from 'react'
// Type-only import — erased at compile time, so the 'server-only' guarded module
// is never pulled into the client bundle.
import type { BetaOverview, AgentSummary, HealthLabel } from '../../lib/admin/overview'

const C = {
  bg: '#0F0F13', card: '#1A1A24', card2: '#13131A', border: '#252533',
  purple: '#7C3AED', purpleL: '#8B5CF6', text: '#FFFFFF', sub: '#C4C4D4',
  muted: '#6B7280', red: '#EF4444', green: '#22C55E', amber: '#F59E0B', blue: '#60A5FA',
} as const

const DAY_MS = 86_400_000
function daysSince(iso: string | null): number {
  if (!iso) return Infinity
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS)
}
function fmtAgo(iso: string | null): string {
  if (!iso) return 'never'
  const d = daysSince(iso)
  if (d <= 0) return 'today'
  if (d === 1) return 'yesterday'
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const HEALTH_COLOR: Record<HealthLabel, string> = {
  'Healthy': C.green,
  'Needs onboarding': C.blue,
  'Trial conversion opportunity': C.purpleL,
  'At risk': C.red,
}

type SavedView = 'all' | 'needs_attention' | 'trial_soon' | 'not_activated' | 'inactive'
const VIEWS: { key: SavedView; label: string }[] = [
  { key: 'all', label: 'All agents' },
  { key: 'needs_attention', label: 'Needs attention' },
  { key: 'trial_soon', label: 'Trial ending soon' },
  { key: 'not_activated', label: 'Not activated' },
  { key: 'inactive', label: 'Inactive' },
]

function matchesView(a: AgentSummary, v: SavedView): boolean {
  switch (v) {
    case 'all': return true
    case 'needs_attention': return a.health.label === 'At risk' || a.health.label === 'Needs onboarding'
    case 'trial_soon': return !a.expired && a.daysRemaining > 0 && a.daysRemaining <= 14
    case 'not_activated': return a.activeListings === 0 || a.totalScans === 0
    case 'inactive': return daysSince(a.lastActive) > 21
  }
}

type LastActiveFilter = 'any' | '7' | '14' | '30' | 'stale'
type TrialFilter = 'any' | '7' | '14' | 'expired'

export default function AdminOverviewClient({ initial }: { initial: BetaOverview }) {
  const [data, setData] = useState<BetaOverview>(initial)
  const [view, setView] = useState<SavedView>('all')
  const [search, setSearch] = useState('')
  const [lastActive, setLastActive] = useState<LastActiveFilter>('any')
  const [trial, setTrial] = useState<TrialFilter>('any')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [loading, setLoading] = useState(false)

  const applyRange = async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (from) qs.set('from', new Date(from).toISOString())
      if (to) qs.set('to', new Date(to + 'T23:59:59').toISOString())
      const res = await fetch(`/api/admin/overview?${qs.toString()}`)
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }
  const clearRange = async () => {
    setFrom(''); setTo(''); setLoading(true)
    try {
      const res = await fetch('/api/admin/overview')
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return data.agents.filter(a => {
      if (!matchesView(a, view)) return false
      if (q && !a.name.toLowerCase().includes(q)) return false
      if (lastActive !== 'any') {
        const d = daysSince(a.lastActive)
        if (lastActive === '7' && d > 7) return false
        if (lastActive === '14' && d > 14) return false
        if (lastActive === '30' && d > 30) return false
        if (lastActive === 'stale' && d <= 30) return false
      }
      if (trial !== 'any') {
        if (trial === 'expired' && !a.expired) return false
        if (trial === '7' && (a.expired || a.daysRemaining > 7)) return false
        if (trial === '14' && (a.expired || a.daysRemaining > 14)) return false
      }
      return true
    })
  }, [data, view, search, lastActive, trial])

  const t = data.totals
  const statCards = [
    { label: 'Beta Agents', value: t.totalBetaAgents, color: C.purpleL },
    { label: 'Active (14d)', value: t.activeAgents, color: C.green },
    { label: 'Total Scans', value: t.totalScans, color: C.amber },
    { label: 'Leads Captured', value: t.leadsCaptured, color: C.green },
    { label: 'Hot / Warm / Cold', value: `${t.hot} / ${t.warm} / ${t.cold}`, color: C.text },
    { label: 'Trials Expiring Soon', value: t.trialsExpiringSoon, color: C.red },
  ]

  return (
    <div style={{ padding: 28, fontFamily: 'sans-serif', maxWidth: 1320, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>
            Beta Overview
          </h1>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: C.purpleL, background: 'rgba(124,58,237,0.15)', border: `1px solid ${C.border}`, borderRadius: 20, padding: '3px 10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Read-only
          </span>
        </div>
        <p style={{ fontSize: 13.5, color: C.muted, margin: '4px 0 0' }}>
          All-agent aggregates. No individual buyer data. GET-only.
        </p>
      </div>

      {/* Portfolio totals */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 24 }}>
        {statCards.map(({ label, value, color }) => (
          <div key={label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ fontSize: 22, fontWeight: 900, color, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              {typeof value === 'number' ? value.toLocaleString() : value}
            </div>
            <div style={{ fontSize: 10.5, color: C.muted, marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Saved views */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {VIEWS.map(v => {
          const active = view === v.key
          return (
            <button key={v.key} onClick={() => setView(v.key)} style={{
              background: active ? C.purple : 'transparent',
              color: active ? '#fff' : C.sub,
              border: `1px solid ${active ? C.purple : C.border}`,
              borderRadius: 8, padding: '7px 13px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            }}>
              {v.label}
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name…"
          style={{ background: C.card2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13, padding: '8px 12px', width: 200, outline: 'none' }}
        />
        <select value={lastActive} onChange={e => setLastActive(e.target.value as LastActiveFilter)} style={selStyle}>
          <option value="any">Last active: any</option>
          <option value="7">Active ≤ 7d</option>
          <option value="14">Active ≤ 14d</option>
          <option value="30">Active ≤ 30d</option>
          <option value="stale">Inactive 30d+</option>
        </select>
        <select value={trial} onChange={e => setTrial(e.target.value as TrialFilter)} style={selStyle}>
          <option value="any">Trial: any</option>
          <option value="7">≤ 7 days left</option>
          <option value="14">≤ 14 days left</option>
          <option value="expired">Expired</option>
        </select>
        <span style={{ width: 1, height: 24, background: C.border, margin: '0 2px' }} />
        <span style={{ fontSize: 12, color: C.muted }}>Activity range:</span>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={selStyle} />
        <span style={{ color: C.muted, fontSize: 12 }}>→</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} style={selStyle} />
        <button onClick={applyRange} disabled={loading || (!from && !to)} style={{ ...btnStyle, opacity: loading || (!from && !to) ? 0.5 : 1 }}>
          {loading ? 'Loading…' : 'Apply'}
        </button>
        {(data.range.from || data.range.to) && (
          <button onClick={clearRange} disabled={loading} style={{ ...btnStyle, background: 'transparent', color: C.sub }}>
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Agents</span>
          <span style={{ fontSize: 12, color: C.muted }}>{rows.length} shown</span>
          {(data.range.from || data.range.to) && (
            <span style={{ fontSize: 11, color: C.amber, marginLeft: 'auto' }}>
              Scans/leads scoped to selected range
            </span>
          )}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={TH}>Agent</th>
                <th style={{ ...TH, textAlign: 'right' }}>Acct age</th>
                <th style={{ ...TH, textAlign: 'right' }}>Last active</th>
                <th style={{ ...TH, textAlign: 'right' }}>Active listings</th>
                <th style={{ ...TH, textAlign: 'right' }}>Scans</th>
                <th style={{ ...TH, textAlign: 'right' }}>Leads</th>
                <th style={{ ...TH, textAlign: 'right' }}>Conv.</th>
                <th style={{ ...TH, textAlign: 'center' }}>H / W / C</th>
                <th style={{ ...TH, textAlign: 'right' }}>Trial</th>
                <th style={{ ...TH, textAlign: 'center' }}>Rating</th>
                <th style={TH}>Health</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={11} style={{ ...TD, textAlign: 'center', color: C.muted, padding: '32px 16px' }}>No agents match these filters.</td></tr>
              )}
              {rows.map(a => (
                <tr key={a.id}>
                  <td style={{ ...TD, color: C.text, fontWeight: 600 }}>{a.name}</td>
                  <td style={{ ...TD, textAlign: 'right' }}>{a.accountAgeDays}d</td>
                  <td style={{ ...TD, textAlign: 'right', fontSize: 12 }}>{fmtAgo(a.lastActive)}</td>
                  <td style={{ ...TD, textAlign: 'right' }}>{a.activeListings}</td>
                  <td style={{ ...TD, textAlign: 'right' }}>{a.totalScans.toLocaleString()}</td>
                  <td style={{ ...TD, textAlign: 'right' }}>{a.leadsCaptured.toLocaleString()}</td>
                  <td style={{ ...TD, textAlign: 'right' }}>{(a.conversionRate * 100).toFixed(a.conversionRate >= 0.1 ? 0 : 1)}%</td>
                  <td style={{ ...TD, textAlign: 'center', fontSize: 12 }}>
                    <span style={{ color: C.red }}>{a.hot}</span>
                    <span style={{ color: C.muted }}> / </span>
                    <span style={{ color: C.amber }}>{a.warm}</span>
                    <span style={{ color: C.muted }}> / </span>
                    <span style={{ color: C.blue }}>{a.cold}</span>
                  </td>
                  <td style={{ ...TD, textAlign: 'right' }}>
                    <span style={{ fontWeight: 700, color: a.expired ? C.red : a.daysRemaining <= 14 ? C.amber : C.green }}>
                      {a.expired ? 'Expired' : `${a.daysRemaining}d`}
                    </span>
                  </td>
                  <td style={{ ...TD, textAlign: 'center' }}>{a.latestRating != null ? `${a.latestRating}★` : '—'}</td>
                  <td style={TD}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: HEALTH_COLOR[a.health.label] }}>{a.health.label}</span>
                      <span style={{ fontSize: 11, color: C.muted }}>{a.health.reason}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p style={{ fontSize: 11, color: C.muted, marginTop: 12 }}>
        Generated {new Date(data.generatedAt).toLocaleString()} · aggregates only
      </p>
    </div>
  )
}

const selStyle: React.CSSProperties = {
  background: '#13131A', border: '1px solid #252533', borderRadius: 8,
  color: '#C4C4D4', fontSize: 12.5, padding: '8px 10px', outline: 'none',
}
const btnStyle: React.CSSProperties = {
  background: '#7C3AED', border: '1px solid #7C3AED', borderRadius: 8,
  color: '#fff', fontSize: 12.5, fontWeight: 600, padding: '8px 14px', cursor: 'pointer',
}
const TH: React.CSSProperties = {
  padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#6B7280',
  textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid #252533',
  whiteSpace: 'nowrap', background: '#13131A',
}
const TD: React.CSSProperties = {
  padding: '11px 14px', borderBottom: '1px solid #252533', fontSize: 13, color: '#C4C4D4', verticalAlign: 'middle',
}
