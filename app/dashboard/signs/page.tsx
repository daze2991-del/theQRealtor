'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createBrowserSupabase } from '../../../lib/supabase-browser'
import { useRouter, useSearchParams } from 'next/navigation'
import DashboardLayout from '../../../components/DashboardLayout'

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

type AssignmentProperty = { id: string; address: string; city: string | null; state: string | null }

type Assignment = {
  id: string
  property_id: string
  assigned_at: string
  unassigned_at: string | null
  properties: AssignmentProperty | null
}

type Sign = {
  id: string
  label: string
  created_at: string
  current_assignment: Assignment | null
  history: Assignment[]
}

type RawSign = {
  id: string
  label: string
  created_at: string
  sign_assignments?: Assignment[]
}

type ActiveProperty = { id: string; address: string; city: string | null; state: string | null }

// Same shaping as GET /api/signs — used to normalize the assign response.
function normalizeSign(raw: RawSign): Sign {
  const history = [...(raw.sign_assignments ?? [])].sort(
    (a, b) => new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime()
  )
  return {
    id: raw.id,
    label: raw.label,
    created_at: raw.created_at,
    current_assignment: history.find(a => a.unassigned_at === null) ?? null,
    history,
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function assignmentAddress(a: Assignment): string {
  if (!a.properties) return 'Deleted property'
  const location = [a.properties.city, a.properties.state].filter(Boolean).join(', ')
  return location ? `${a.properties.address} — ${location}` : a.properties.address
}

function SignCard({ sign, origin, onRename, onOpenAssign, onUnassign, unassigning }: {
  sign: Sign
  origin: string
  onRename: (label: string) => Promise<string | null>
  onOpenAssign: () => void
  onUnassign: () => void
  unassigning: boolean
}) {
  const [editing, setEditing]     = useState(false)
  const [editLabel, setEditLabel] = useState(sign.label)
  const [saving, setSaving]       = useState(false)
  const [labelError, setLabelError] = useState('')
  const [copied, setCopied]       = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const url = `${origin}/p/${sign.id}`
  const assigned = sign.current_assignment

  const saveLabel = async () => {
    const next = editLabel.trim()
    if (!next || next === sign.label) { setEditing(false); setEditLabel(sign.label); return }
    setSaving(true)
    setLabelError('')
    const err = await onRename(next)
    setSaving(false)
    if (err) { setLabelError(err); return }
    setEditing(false)
  }

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable */ }
  }

  return (
    <div style={{ background: C.card, border: `1px solid #7C3AED60`, borderRadius: 16, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Label + assignment status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          {editing ? (
            <input
              ref={inputRef}
              value={editLabel}
              disabled={saving}
              onChange={e => setEditLabel(e.target.value)}
              onBlur={saveLabel}
              onKeyDown={e => {
                if (e.key === 'Enter') saveLabel()
                if (e.key === 'Escape') { setEditing(false); setEditLabel(sign.label); setLabelError('') }
              }}
              style={{ width: '100%', background: C.bg, border: `1px solid ${C.purple}`, borderRadius: 8, padding: '7px 10px', color: C.text, fontSize: 14, fontWeight: 700, boxSizing: 'border-box', outline: 'none' }}
            />
          ) : (
            <button
              onClick={() => { setEditLabel(sign.label); setEditing(true) }}
              title="Click to rename"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'text', textAlign: 'left', maxWidth: '100%' }}
            >
              <span style={{ fontSize: 15, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                {sign.label} <span style={{ fontSize: 11, color: C.muted, fontWeight: 400 }}>✎</span>
              </span>
            </button>
          )}
          {labelError && <p style={{ color: '#F87171', fontSize: 12, margin: '6px 0 0' }}>{labelError}</p>}
          <div style={{ fontSize: 12, color: C.muted, marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {assigned ? assignmentAddress(assigned) : 'Created ' + formatDate(sign.created_at)}
          </div>
        </div>
        {assigned ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, background: '#062014', border: '1px solid #166534', borderRadius: 20, padding: '4px 10px' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#4ade80' }}>Assigned</span>
          </span>
        ) : (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, background: '#18181F', border: '1px solid #374151', borderRadius: 20, padding: '4px 10px' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6B7280' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#6B7280' }}>Unassigned</span>
          </span>
        )}
      </div>

      {/* QR URL + copy */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 12px' }}>
        <span style={{ flex: 1, fontSize: 12, color: C.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
          {url}
        </span>
        <button
          onClick={copyUrl}
          style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 7, padding: '5px 11px', fontSize: 11, fontWeight: 700, color: copied ? '#4ade80' : C.sub, cursor: 'pointer', flexShrink: 0 }}
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onOpenAssign}
            style={{ flex: 1, background: C.purple, color: '#fff', border: 'none', borderRadius: 9, padding: '10px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            {assigned ? 'Reassign' : 'Assign'}
          </button>
          <Link
            href={`/dashboard/sign-studio/${sign.id}`}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: C.purpleL, border: `1px solid ${C.purple}60`, borderRadius: 9, padding: '10px 14px', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}
          >
            🖨 Sign Studio
          </Link>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {assigned && (
            <button
              onClick={onUnassign}
              disabled={unassigning}
              style={{ flex: 1, background: 'transparent', color: '#94A3B8', border: '1px solid #1E2340', borderRadius: 9, padding: '10px 14px', fontSize: 13, fontWeight: 600, cursor: unassigning ? 'not-allowed' : 'pointer', opacity: unassigning ? 0.5 : 1 }}
            >
              {unassigning ? '…' : 'Unassign'}
            </button>
          )}
          <button
            onClick={() => setShowHistory(v => !v)}
            style={{ flex: 1, background: 'transparent', color: '#94A3B8', border: '1px solid #1E2340', borderRadius: 9, padding: '10px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            {showHistory ? 'Hide history' : 'View history'}
          </button>
        </div>
      </div>

      {/* Assignment history */}
      {showHistory && (
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
          {sign.history.length === 0 ? (
            <p style={{ fontSize: 12, color: C.muted, margin: 0, textAlign: 'center', padding: '8px 0' }}>
              This sign hasn&apos;t been assigned to a listing yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sign.history.map(a => (
                <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12.5, color: C.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                    {assignmentAddress(a)}
                  </span>
                  <span style={{ fontSize: 11, color: a.unassigned_at ? C.muted : '#4ade80', flexShrink: 0 }}>
                    {formatDate(a.assigned_at)} → {a.unassigned_at ? formatDate(a.unassigned_at) : 'now'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SignsPageInner() {
  const router = useRouter()
  const routerRef = useRef(router)
  routerRef.current = router
  const searchParams = useSearchParams()
  const preselectedPropertyId = searchParams.get('propertyId')

  const [signs, setSigns]                       = useState<Sign[]>([])
  const [activeProperties, setActiveProperties] = useState<ActiveProperty[]>([])
  const [loading, setLoading]                   = useState(true)
  const [origin, setOrigin]                     = useState('')
  const [pageError, setPageError]               = useState('')

  const [createLabel, setCreateLabel] = useState('')
  const [creating, setCreating]       = useState(false)
  const [createError, setCreateError] = useState('')
  const createLabelRef = useRef<HTMLInputElement>(null)

  const [assignSign, setAssignSign]                 = useState<Sign | null>(null)
  const [selectedPropertyId, setSelectedPropertyId] = useState('')
  const [assigning, setAssigning]                   = useState(false)
  const [assignError, setAssignError]               = useState('')

  const [unassigningId, setUnassigningId] = useState<string | null>(null)

  useEffect(() => { setOrigin(window.location.origin) }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const supabase = createBrowserSupabase()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { routerRef.current.push('/auth'); return }

        const [signsRes, { data: props }] = await Promise.all([
          fetch('/api/signs'),
          supabase.from('properties')
            .select('id, address, city, state')
            .eq('user_id', session.user.id)
            .eq('active', true)
            .is('deleted_at', null)
            .order('created_at', { ascending: false }),
        ])

        if (cancelled) return
        if (!signsRes.ok) {
          const body = await signsRes.json().catch(() => ({} as { error?: string }))
          setPageError(body.error || 'Failed to load signs. Please try again.')
        } else {
          const body = await signsRes.json() as { signs: Sign[] }
          setSigns(body.signs || [])
        }
        setActiveProperties((props as ActiveProperty[] | null) || [])
      } catch (err) {
        console.error('[SignsPage] load error:', err)
        if (!cancelled) setPageError('Failed to load signs. Please try again.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // When arriving with a preselected property: open assign modal if signs exist,
  // otherwise focus the create input so the agent can make their first sign.
  useEffect(() => {
    if (loading || !preselectedPropertyId) return
    if (signs.length > 0) {
      const firstUnassigned = signs.find(s => !s.current_assignment) ?? signs[0]
      setAssignSign(firstUnassigned)
      setSelectedPropertyId(preselectedPropertyId)
      setAssignError('')
    } else {
      createLabelRef.current?.focus()
    }
  }, [loading])

  const createSign = async () => {
    const label = createLabel.trim()
    if (!label) return
    setCreating(true)
    setCreateError('')
    try {
      const res = await fetch('/api/signs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      })
      const body = await res.json().catch(() => ({} as { error?: string; sign?: RawSign }))
      if (!res.ok || !body.sign) {
        setCreateError(body.error || 'Failed to create sign. Please try again.')
      } else {
        setSigns(prev => [normalizeSign(body.sign as RawSign), ...prev])
        setCreateLabel('')
      }
    } catch {
      setCreateError('Something went wrong. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  const renameSign = async (signId: string, label: string): Promise<string | null> => {
    try {
      const res = await fetch(`/api/signs/${signId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { error?: string }))
        return body.error || 'Failed to rename the sign. Please try again.'
      }
      setSigns(prev => prev.map(s => s.id === signId ? { ...s, label } : s))
      return null
    } catch {
      return 'Something went wrong. Please try again.'
    }
  }

  const openAssign = (sign: Sign) => {
    setAssignSign(sign)
    setSelectedPropertyId(activeProperties[0]?.id ?? '')
    setAssignError('')
  }

  const confirmAssign = async () => {
    if (!assignSign || !selectedPropertyId) return
    setAssigning(true)
    setAssignError('')
    try {
      const res = await fetch('/api/signs/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sign_id: assignSign.id, property_id: selectedPropertyId }),
      })
      const body = await res.json().catch(() => ({} as { error?: string; sign?: RawSign }))
      if (!res.ok || !body.sign) {
        setAssignError(body.error || 'Failed to assign the sign. Please try again.')
      } else {
        const updated = normalizeSign(body.sign as RawSign)
        setSigns(prev => prev.map(s => s.id === updated.id ? updated : s))
        setAssignSign(null)
      }
    } catch {
      setAssignError('Something went wrong. Please try again.')
    } finally {
      setAssigning(false)
    }
  }

  const unassignSign = async (sign: Sign) => {
    if (!sign.current_assignment) return
    if (!confirm(`Unassign "${sign.label}"? The sign's QR code will show an unassigned page until you assign it again. Past scans and leads are not affected.`)) return
    setUnassigningId(sign.id)
    try {
      const res = await fetch('/api/signs/unassign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sign_id: sign.id }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { error?: string }))
        setPageError(body.error || 'Failed to unassign the sign. Please try again.')
        return
      }
      const closedAt = new Date().toISOString()
      setSigns(prev => prev.map(s => {
        if (s.id !== sign.id) return s
        return {
          ...s,
          current_assignment: null,
          history: s.history.map(a => a.unassigned_at === null ? { ...a, unassigned_at: closedAt } : a),
        }
      }))
    } catch {
      setPageError('Something went wrong. Please try again.')
    } finally {
      setUnassigningId(null)
    }
  }

  const { groupedSections, unassignedSigns } = (() => {
    const byProp = new Map<string, { key: string; label: string; signs: Sign[]; lastAssigned: number }>()
    const unassigned: Sign[] = []
    for (const sign of signs) {
      if (!sign.current_assignment) { unassigned.push(sign); continue }
      const prop = sign.current_assignment.properties
      const key = prop?.id ?? '__deleted__'
      const label = prop
        ? [prop.address, [prop.city, prop.state].filter(Boolean).join(', ')].filter(Boolean).join(' — ')
        : 'Deleted Property'
      const existing = byProp.get(key)
      const at = new Date(sign.current_assignment.assigned_at).getTime()
      if (existing) { existing.signs.push(sign); existing.lastAssigned = Math.max(existing.lastAssigned, at) }
      else byProp.set(key, { key, label, signs: [sign], lastAssigned: at })
    }
    return {
      groupedSections: [...byProp.values()].sort((a, b) => b.lastAssigned - a.lastAssigned),
      unassignedSigns: unassigned,
    }
  })()

  return (
    <DashboardLayout>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
          <div style={{ width: 32, height: 32, border: `2px solid ${C.purple}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>
      ) : (
        <>
          <div className="db-page-topbar" style={{
            padding: '16px 28px', borderBottom: `1px solid ${C.border}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: C.bg, position: 'sticky', top: 0, zIndex: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h1 style={{ fontSize: 19, fontWeight: 700, color: C.text, margin: 0 }}>Signs</h1>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.purpleL, background: `${C.purple}22`, borderRadius: 20, padding: '2px 9px' }}>
                {signs.length}
              </span>
            </div>
          </div>

          <div style={{ padding: '24px 28px' }}>
            {pageError && (
              <div style={{ background: '#1C0A0A', border: '1px solid #7F1D1D', borderRadius: 10, padding: '10px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, color: '#FCA5A5' }}>{pageError}</span>
                <button onClick={() => setPageError('')} style={{ background: 'none', border: 'none', color: '#7F1D1D', cursor: 'pointer', fontSize: 15, lineHeight: 1, flexShrink: 0 }}>✕</button>
              </div>
            )}

            {/* Create sign */}
            <div style={{ display: 'flex', gap: 10, marginBottom: createError ? 8 : preselectedPropertyId && signs.length === 0 ? 6 : 20 }}>
              <input
                ref={createLabelRef}
                type="text"
                placeholder="Sign label, e.g. Front yard sign #1"
                value={createLabel}
                onChange={e => setCreateLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createSign() }}
                style={{ flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 14px', color: C.text, fontSize: 13, outline: 'none' }}
              />
              <button
                onClick={createSign}
                disabled={creating || !createLabel.trim()}
                style={{ background: creating || !createLabel.trim() ? `${C.purple}60` : C.purple, color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, padding: '8px 18px', borderRadius: 9, cursor: creating || !createLabel.trim() ? 'not-allowed' : 'pointer', flexShrink: 0 }}
              >
                {creating ? 'Creating…' : 'Create sign'}
              </button>
            </div>
            {preselectedPropertyId && signs.length === 0 && !createError && (
              <p style={{ fontSize: 12, color: C.purpleL, margin: '0 0 16px' }}>
                Create your first sign to assign it to this listing.
              </p>
            )}
            {createError && <p style={{ color: '#F87171', fontSize: 12, margin: '0 0 20px' }}>{createError}</p>}

            {signs.length === 0 ? (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '72px 32px', textAlign: 'center' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🪧</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>You haven&apos;t created any signs yet</div>
                <p style={{ fontSize: 14, color: C.muted, maxWidth: 400, margin: '0 auto' }}>
                  {preselectedPropertyId
                    ? 'Create your first sign below to get a permanent QR code for this listing.'
                    : 'Create your first sign to get a permanent QR code URL that you can reuse across listings.'}
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                {groupedSections.map(section => (
                  <div key={section.key}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14, paddingBottom: 10, borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{section.label}</span>
                      <span style={{ fontSize: 11, color: C.muted }}>({section.signs.length} {section.signs.length === 1 ? 'sign' : 'signs'})</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
                      {section.signs.map(sign => (
                        <SignCard
                          key={sign.id}
                          sign={sign}
                          origin={origin}
                          onRename={label => renameSign(sign.id, label)}
                          onOpenAssign={() => openAssign(sign)}
                          onUnassign={() => unassignSign(sign)}
                          unassigning={unassigningId === sign.id}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                {unassignedSigns.length > 0 && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14, paddingBottom: 10, borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.muted }}>Unassigned</span>
                      <span style={{ fontSize: 11, color: C.muted }}>({unassignedSigns.length} {unassignedSigns.length === 1 ? 'sign' : 'signs'})</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
                      {unassignedSigns.map(sign => (
                        <SignCard
                          key={sign.id}
                          sign={sign}
                          origin={origin}
                          onRename={label => renameSign(sign.id, label)}
                          onOpenAssign={() => openAssign(sign)}
                          onUnassign={() => unassignSign(sign)}
                          unassigning={unassigningId === sign.id}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Assign modal ── */}
          {assignSign && (
            <div
              onClick={e => { if (e.target === e.currentTarget) setAssignSign(null) }}
              style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
            >
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28, width: '100%', maxWidth: 480 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>
                    {assignSign.current_assignment ? 'Reassign sign' : 'Assign sign'}
                  </h2>
                  <button onClick={() => setAssignSign(null)} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 18, cursor: 'pointer', padding: 4, lineHeight: 1 }}>✕</button>
                </div>
                <p style={{ fontSize: 13, color: C.muted, margin: '0 0 18px' }}>
                  {assignSign.current_assignment
                    ? `"${assignSign.label}" currently points to ${assignmentAddress(assignSign.current_assignment)}. Past scans and leads stay with that listing.`
                    : `Choose the listing "${assignSign.label}" should point to.`}
                </p>

                {activeProperties.length === 0 ? (
                  <p style={{ fontSize: 13, color: C.sub, margin: '0 0 18px' }}>
                    You have no active listings. Add a property or set one to active first.
                  </p>
                ) : (
                  <label style={{ display: 'block', marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Listing</div>
                    <select
                      value={selectedPropertyId}
                      onChange={e => setSelectedPropertyId(e.target.value)}
                      style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', color: C.text, fontSize: 13, boxSizing: 'border-box', cursor: 'pointer' }}
                    >
                      {activeProperties.map(p => (
                        <option key={p.id} value={p.id}>
                          {[p.address, [p.city, p.state].filter(Boolean).join(', ')].filter(Boolean).join(' — ')}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {assignError && <p style={{ color: '#F87171', fontSize: 12, margin: '0 0 14px' }}>{assignError}</p>}

                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setAssignSign(null)}
                    style={{ flex: 1, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 9, padding: 10, color: C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button
                    onClick={confirmAssign}
                    disabled={assigning || !selectedPropertyId}
                    style={{ flex: 2, background: assigning || !selectedPropertyId ? `${C.purple}60` : C.purple, border: 'none', borderRadius: 9, padding: 10, color: '#fff', fontSize: 13, fontWeight: 700, cursor: assigning || !selectedPropertyId ? 'not-allowed' : 'pointer' }}>
                    {assigning ? 'Assigning…' : assignSign.current_assignment ? 'Reassign' : 'Assign'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </DashboardLayout>
  )
}

export default function SignsPage() {
  return (
    <Suspense fallback={null}>
      <SignsPageInner />
    </Suspense>
  )
}
