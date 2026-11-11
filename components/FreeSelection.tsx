'use client'

import { useEffect, useMemo, useState } from 'react'
import { rankByActivity, swapTooSoonMessage, type SelectionLimits } from '../lib/planLock'
import type { ChoiceListing, ChoiceSign } from '../lib/planChoice'

// "Choose what stays active". Used in three places:
//   mode 'choose'    — end-of-trial chooser, Free's limits (POST /api/plan/choose-free)
//   mode 'downgrade' — after a move to a plan with lower limits (migration 067),
//                      that plan's limits (POST /api/plan/choose-free)
//   mode 'swap'      — Free agent changes their selection from Settings (POST /api/plan/free-swap)
// Limits come from the server (lib/plans.ts via /api/plan/free-choice-options);
// the UI enforces them and the server enforces them again. Signs offered:
// those on a chosen listing, plus unassigned signs. Signs on other listings
// are not offered.

const C = {
  card: '#1A1A24', card2: '#13131A', border: '#252533', purple: '#7C3AED', purpleL: '#8B5CF6',
  text: '#FFFFFF', sub: '#C4C4D4', muted: '#6B7280', green: '#4ade80',
} as const

type Mode = 'choose' | 'swap' | 'downgrade'
type Options = { mode: Mode; planName?: string; limits?: SelectionLimits; listings: ChoiceListing[]; signs: ChoiceSign[] }

const FREE_LIMITS: SelectionLimits = { maxListings: 1, maxSigns: 3 }

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

/** Recommended tag only appears when an item has real buyer activity. With no
 *  activity, the pre-selection stays the same (ranking still picks a top item
 *  deterministically) but nothing is tagged "Recommended". */
export function hasRecentActivity(i: { scans30: number; leads30: number }): boolean {
  return i.scans30 > 0 || i.leads30 > 0
}

/** Signs eligible for the chosen listing(s), on-listing first (ranked), then unassigned (ranked). */
export function eligibleSigns(signs: ChoiceSign[], listing: string | null | readonly string[]) {
  const chosen = new Set(listing === null ? [] : typeof listing === 'string' ? [listing] : listing)
  const onListing = rankByActivity(signs.filter(s => s.assignedPropertyId !== null && chosen.has(s.assignedPropertyId)))
  const unassigned = rankByActivity(signs.filter(s => s.assignedPropertyId === null))
  return { onListing, unassigned }
}

/** "1 listing", "3 listings", or "all your active listings" when the plan has no cap. */
function listingsPhrase(max: number | null): string {
  if (max === null) return 'all your active listings'
  return `${max} listing${max === 1 ? '' : 's'}`
}

export default function FreeSelection({ mode, onDone, onBack }: {
  mode: Mode
  onDone: () => void
  onBack?: () => void
}) {
  const [opts, setOpts] = useState<Options | null>(null)
  const [loadError, setLoadError] = useState('')
  const [listingIds, setListingIds] = useState<string[]>([])
  const [signIds, setSignIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const limits = opts?.limits ?? FREE_LIMITS
  const maxListings = limits.maxListings ?? Number.POSITIVE_INFINITY
  const maxSigns = limits.maxSigns ?? Number.POSITIVE_INFINITY
  const single = maxListings === 1
  const name = opts?.planName ?? 'Free'

  const rankedListings = useMemo(() => rankByActivity(opts?.listings ?? []), [opts])
  // Tag only the pre-selected top listing(s), and only if they have activity.
  const recommendedListingIds = useMemo(
    () => new Set(rankedListings.slice(0, maxListings).filter(hasRecentActivity).map(l => l.id)),
    [rankedListings, maxListings],
  )
  const { onListing, unassigned } = useMemo(() => eligibleSigns(opts?.signs ?? [], listingIds), [opts, listingIds])
  const recommendedSignIds = useMemo(
    () => new Set(onListing.slice(0, maxSigns).filter(hasRecentActivity).map(s => s.id)),
    [onListing, maxSigns],
  )

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
        const lim = o.limits ?? FREE_LIMITS
        const maxL = lim.maxListings ?? Number.POSITIVE_INFINITY
        const maxS = lim.maxSigns ?? Number.POSITIVE_INFINITY
        const ranked = rankByActivity(o.listings)
        if (mode === 'swap' || mode === 'downgrade') {
          // Start from what's active now (for a downgrade: what was kept automatically).
          const current = ranked.filter(l => !l.locked).slice(0, maxL).map(l => l.id)
          setListingIds(current)
          const { onListing: on, unassigned: un } = eligibleSigns(o.signs, current)
          setSignIds([...on, ...un].filter(s => !s.locked).slice(0, maxS).map(s => s.id))
        } else {
          const top = ranked[0]?.id ?? null
          setListingIds(top ? [top] : [])
          setSignIds(eligibleSigns(o.signs, top).onListing.slice(0, maxS).map(s => s.id))
        }
      } catch {
        if (!cancelled) setLoadError('Failed to load your listings.')
      }
    })()
    return () => { cancelled = true }
  }, [mode])

  const pickListing = (id: string) => {
    if (!opts) return
    if (single) {
      setListingIds([id])
      // Re-seed signs from the new listing's top signs.
      setSignIds(eligibleSigns(opts.signs, id).onListing.slice(0, maxSigns).map(s => s.id))
      return
    }
    const next = listingIds.includes(id)
      ? listingIds.filter(x => x !== id)
      : listingIds.length >= maxListings ? listingIds : [...listingIds, id]
    setListingIds(next)
    // Drop signs that belong to a listing no longer chosen.
    const { onListing: on, unassigned: un } = eligibleSigns(opts.signs, next)
    const allowed = new Set([...on, ...un].map(s => s.id))
    setSignIds(prev => prev.filter(x => allowed.has(x)))
  }

  const toggleSign = (id: string) => {
    setSignIds(prev => prev.includes(id)
      ? prev.filter(x => x !== id)
      : prev.length >= maxSigns ? prev : [...prev, id])
  }

  const confirm = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(mode === 'swap' ? '/api/plan/free-swap' : '/api/plan/choose-free', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingIds, signIds }),
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
    const disabled = !selected && signIds.length >= maxSigns
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
      <h2 style={{ fontSize: 19, fontWeight: 800, color: C.text, margin: '0 0 6px' }}>
        {mode !== 'downgrade' ? `Choose what stays active on ${name}.`
          : opts ? `You're now on ${name}. Choose what stays active.` : 'Choose what stays active.'}
      </h2>
      {/* For a downgrade the plan and its limits come from the server; don't
          show Free's numbers while they load. */}
      {(opts || mode !== 'downgrade') && <p style={{ fontSize: 13, color: C.sub, margin: '0 0 18px', lineHeight: 1.55 }}>
        {mode === 'downgrade' && 'We kept your busiest listings and signs taking buyer requests. You can change which ones below. '}
        {name} keeps {listingsPhrase(limits.maxListings)} and {limits.maxSigns === null ? 'all your active signs' : `up to ${limits.maxSigns} signs`} taking buyer requests. Everything else stays in your
        dashboard with all its leads and history. Buyers just can&apos;t send requests through it.
        {mode === 'swap' && ' You can change your active listing, or swap out a sign, once every 30 days. If your listing goes offline or a sign is archived, you can replace it right away.'}
      </p>}

      {loadError && <p style={{ color: '#F87171', fontSize: 13 }}>{loadError}</p>}
      {!opts && !loadError && <p style={{ color: C.muted, fontSize: 13 }}>Loading your listings…</p>}

      {opts && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            {single ? 'Listing' : <>Listings <span style={{ textTransform: 'none', letterSpacing: 0 }}>({listingIds.length} of {limits.maxListings ?? rankedListings.length} selected)</span></>}
          </div>
          {rankedListings.length === 0 ? (
            <p style={{ fontSize: 13, color: C.muted, margin: '0 0 16px' }}>You have no live listings.</p>
          ) : (
            <div role={single ? 'radiogroup' : 'group'} aria-label={single ? 'Listing to keep active' : 'Listings to keep active'} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {rankedListings.map(l => {
                const selected = listingIds.includes(l.id)
                const disabled = !single && !selected && listingIds.length >= maxListings
                const place = [l.city, l.state].filter(Boolean).join(', ')
                return (
                  <button key={l.id} type="button" role={single ? 'radio' : 'checkbox'} aria-checked={selected} disabled={disabled}
                    onClick={() => pickListing(l.id)} style={{ ...row(selected), opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
                    <input type={single ? 'radio' : 'checkbox'} readOnly checked={selected} tabIndex={-1} aria-hidden="true" />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {l.address}{place ? `, ${place}` : ''}
                      </span>
                      <span style={{ display: 'block', fontSize: 12, color: C.muted }}>{activityLine(l)}</span>
                    </span>
                    {recommendedListingIds.has(l.id) && <RecommendedTag />}
                  </button>
                )
              })}
            </div>
          )}

          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Signs <span style={{ textTransform: 'none', letterSpacing: 0 }}>({signIds.length} of {limits.maxSigns ?? (onListing.length + unassigned.length)} selected)</span>
          </div>
          {onListing.length === 0 && unassigned.length === 0 ? (
            <p style={{ fontSize: 13, color: C.muted, margin: '0 0 16px' }}>{single ? 'No signs on this listing.' : 'No signs on the selected listings.'}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {onListing.length > 0 && <div style={{ fontSize: 12, color: C.sub }}>{single ? 'On this listing' : 'On your selected listings'}</div>}
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
              {saving ? 'Saving…' : mode === 'choose' ? 'Confirm Free plan' : mode === 'downgrade' ? 'Keep these active' : 'Save changes'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
