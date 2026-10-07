'use client'

import { useEffect, useMemo, useState } from 'react'
import { rankByActivity, FREE_MAX_LISTINGS, FREE_MAX_SIGNS, swapTooSoonMessage } from '../lib/planLock'
import type { ChoiceListing, ChoiceSign } from '../lib/planChoice'

// "Choose what stays active on Free". Used in two places:
//   mode 'choose' — end-of-trial chooser (POST /api/plan/choose-free)
//   mode 'swap'   — Free agent changes their selection from Settings (POST /api/plan/free-swap)
// The UI enforces max 1 listing / 3 signs. The server enforces both again.
// Signs offered: those on the chosen listing, plus unassigned signs. Signs on
// other listings are not offered.

const C = {
  card: '#1A1A24', card2: '#13131A', border: '#252533', purple: '#7C3AED', purpleL: '#8B5CF6',
  text: '#FFFFFF', sub: '#C4C4D4', muted: '#6B7280', green: '#4ade80',
} as const

type Options = { mode: 'choose' | 'swap'; listings: ChoiceListing[]; signs: ChoiceSign[] }

function RecommendedTag() {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: C.green, background: '#062014', border: '1px solid #166534', borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap' }}>
      Recommended
    </span>
  )
}

function activityLine(i: { scans30: number; leads30: number }) {
  const s = `${i.scans30} scan${i.scans30 === 1 ? '' : 's'}`
  const l = `${i.leads30} lead${i.leads30 === 1 ? '' : 's'}`
  return `${s} · ${l} in the last 30 days`
}

/** Signs eligible for a listing, on-listing first (ranked), then unassigned (ranked). */
export function eligibleSigns(signs: ChoiceSign[], listingId: string | null) {
  const onListing = listingId ? rankByActivity(signs.filter(s => s.assignedPropertyId === listingId)) : []
  const unassigned = rankByActivity(signs.filter(s => s.assignedPropertyId === null))
  return { onListing, unassigned }
}

export default function FreeSelection({ mode, onDone, onBack }: {
  mode: 'choose' | 'swap'
  onDone: () => void
  onBack?: () => void
}) {
  const [opts, setOpts] = useState<Options | null>(null)
  const [loadError, setLoadError] = useState('')
  const [listingId, setListingId] = useState<string | null>(null)
  const [signIds, setSignIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const rankedListings = useMemo(() => rankByActivity(opts?.listings ?? []), [opts])
  const recommendedListingId = rankedListings[0]?.id ?? null
  const { onListing, unassigned } = useMemo(() => eligibleSigns(opts?.signs ?? [], listingId), [opts, listingId])
  const recommendedSignIds = useMemo(() => new Set(onListing.slice(0, FREE_MAX_SIGNS).map(s => s.id)), [onListing])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/plan/free-choice-options')
        const body = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) { setLoadError(body.error || 'Failed to load your listings.'); return }
        const o = body as Options
        setOpts(o)
        const ranked = rankByActivity(o.listings)
        if (mode === 'swap') {
          // Start from what's active now.
          const current = o.listings.find(l => !l.locked)?.id ?? null
          setListingId(current)
          const { onListing: on, unassigned: un } = eligibleSigns(o.signs, current)
          setSignIds([...on, ...un].filter(s => !s.locked).slice(0, FREE_MAX_SIGNS).map(s => s.id))
        } else {
          const top = ranked[0]?.id ?? null
          setListingId(top)
          setSignIds(eligibleSigns(o.signs, top).onListing.slice(0, FREE_MAX_SIGNS).map(s => s.id))
        }
      } catch {
        if (!cancelled) setLoadError('Failed to load your listings.')
      }
    })()
    return () => { cancelled = true }
  }, [mode])

  const pickListing = (id: string) => {
    setListingId(id)
    // Re-seed signs from the new listing's top 3.
    if (opts) setSignIds(eligibleSigns(opts.signs, id).onListing.slice(0, FREE_MAX_SIGNS).map(s => s.id))
  }

  const toggleSign = (id: string) => {
    setSignIds(prev => prev.includes(id)
      ? prev.filter(x => x !== id)
      : prev.length >= FREE_MAX_SIGNS ? prev : [...prev, id])
  }

  const confirm = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(mode === 'choose' ? '/api/plan/choose-free' : '/api/plan/free-swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingIds: listingId ? [listingId] : [], signIds }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        // 429 = 30-day swap limit (migration 062). Re-format the date in the
        // viewer's own timezone rather than the server's UTC wording.
        setError(res.status === 429 && typeof body.nextChangeAt === 'string'
          ? swapTooSoonMessage(body.nextChangeAt)
          : body.error || 'Something went wrong. Please try again.')
        setSaving(false)
        return
      }
      onDone()
    } catch {
      setError('Network error. Please try again.')
      setSaving(false)
    }
  }

  const row = (selected: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
    background: selected ? `${C.purple}18` : C.card2,
    border: `1px solid ${selected ? C.purple : C.border}`, borderRadius: 10,
    padding: '11px 14px', cursor: 'pointer', fontFamily: 'sans-serif', color: C.text,
  })

  const signRow = (s: ChoiceSign) => {
    const selected = signIds.includes(s.id)
    const disabled = !selected && signIds.length >= FREE_MAX_SIGNS
    return (
      <button key={s.id} type="button" role="checkbox" aria-checked={selected} disabled={disabled}
        onClick={() => toggleSign(s.id)} style={{ ...row(selected), opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
        <input type="checkbox" readOnly checked={selected} tabIndex={-1} aria-hidden="true" />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
          <span style={{ display: 'block', fontSize: 12, color: C.muted }}>{activityLine(s)}</span>
        </span>
        {recommendedSignIds.has(s.id) && <RecommendedTag />}
      </button>
    )
  }

  return (
    <div>
      <h2 style={{ fontSize: 19, fontWeight: 800, color: C.text, margin: '0 0 6px' }}>Choose what stays active on Free.</h2>
      <p style={{ fontSize: 13, color: C.sub, margin: '0 0 18px', lineHeight: 1.55 }}>
        Free keeps {FREE_MAX_LISTINGS} listing and up to {FREE_MAX_SIGNS} signs taking buyer requests. Everything else stays in your
        dashboard with all its leads and history. Buyers just can&apos;t send requests through it.
        {mode === 'swap' && ' You can change your active listing, or swap out a sign, once every 30 days. If your listing goes offline or a sign is archived, you can replace it right away.'}
      </p>

      {loadError && <p style={{ color: '#F87171', fontSize: 13 }}>{loadError}</p>}
      {!opts && !loadError && <p style={{ color: C.muted, fontSize: 13 }}>Loading your listings…</p>}

      {opts && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Listing</div>
          {rankedListings.length === 0 ? (
            <p style={{ fontSize: 13, color: C.muted, margin: '0 0 16px' }}>You have no live listings.</p>
          ) : (
            <div role="radiogroup" aria-label="Listing to keep active" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {rankedListings.map(l => {
                const selected = listingId === l.id
                const place = [l.city, l.state].filter(Boolean).join(', ')
                return (
                  <button key={l.id} type="button" role="radio" aria-checked={selected} onClick={() => pickListing(l.id)} style={row(selected)}>
                    <input type="radio" readOnly checked={selected} tabIndex={-1} aria-hidden="true" />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {l.address}{place ? `, ${place}` : ''}
                      </span>
                      <span style={{ display: 'block', fontSize: 12, color: C.muted }}>{activityLine(l)}</span>
                    </span>
                    {l.id === recommendedListingId && <RecommendedTag />}
                  </button>
                )
              })}
            </div>
          )}

          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Signs <span style={{ textTransform: 'none', letterSpacing: 0 }}>({signIds.length} of {FREE_MAX_SIGNS} selected)</span>
          </div>
          {onListing.length === 0 && unassigned.length === 0 ? (
            <p style={{ fontSize: 13, color: C.muted, margin: '0 0 16px' }}>No signs on this listing.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {onListing.length > 0 && <div style={{ fontSize: 12, color: C.sub }}>On this listing</div>}
              {onListing.map(signRow)}
              {unassigned.length > 0 && <div style={{ fontSize: 12, color: C.sub, marginTop: 6 }}>Not assigned to a listing</div>}
              {unassigned.map(signRow)}
            </div>
          )}

          {error && <p role="alert" style={{ color: '#F87171', fontSize: 13, margin: '0 0 12px' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {onBack && (
              <button type="button" onClick={onBack} disabled={saving}
                style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.sub, borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Back
              </button>
            )}
            <button type="button" onClick={confirm} disabled={saving}
              style={{ background: C.purple, border: 'none', color: '#fff', borderRadius: 9, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving…' : mode === 'choose' ? 'Confirm Free plan' : 'Save changes'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
