'use client'

import { useEffect, useState } from 'react'
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

export default function SellerReportsPage() {
  const router = useRouter()
  const [loading,     setLoading]     = useState(true)
  const [properties,  setProperties]  = useState<any[]>([])
  const [leadCounts,  setLeadCounts]  = useState<Record<string, number>>({})
  const [copiedId,    setCopiedId]    = useState<string | null>(null)
  const [origin,      setOrigin]      = useState('')
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)
  const [regeneratedId,  setRegeneratedId]  = useState<string | null>(null)

  useEffect(() => { setOrigin(window.location.origin) }, [])

  useEffect(() => {
    const load = async () => {
      const supabase = createBrowserSupabase()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth'); return }

      const { data: props } = await supabase
        .from('properties')
        .select('id, address, city, state, active, created_at, report_token')
        .eq('user_id', session.user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      setProperties(props || [])

      if (props && props.length > 0) {
        const ids = props.map((p: any) => p.id)
        const { data: leads } = await supabase
          .from('leads').select('property_id').in('property_id', ids)
        const m: Record<string, number> = {}
        ;(leads || []).forEach((l: any) => { m[l.property_id] = (m[l.property_id] || 0) + 1 })
        setLeadCounts(m)
      }
      setLoading(false)
    }
    load().catch(() => setLoading(false))
  }, [router])

  // Share links are keyed on report_token, never the property id — the id is
  // printed on QR signage and handed to buyers, so it can't be a credential.
  const copyLink = async (propertyId: string, reportToken: string) => {
    try { await navigator.clipboard.writeText(`${origin}/report/${reportToken}`) } catch {}
    setCopiedId(propertyId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  // Rotate the token, invalidating any link already shared for this property.
  // Destructive and irreversible, so it is gated behind the same confirm()
  // guard used for the other destructive actions in the dashboard (delete
  // lead, delete property, unassign sign). Cancel returns before any fetch.
  const regenerateLink = async (propertyId: string) => {
    const ok = confirm(
      `Regenerate report link?\n\nThe current link will stop working immediately. If you've already shared it with your seller, you'll need to send them the new one.`
    )
    if (!ok) return
    setRegeneratingId(propertyId)
    try {
      const res = await fetch(`/api/properties/${propertyId}/regenerate-report-token`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body?.report_token) {
        alert(body?.error || 'Could not regenerate the link. Please try again.')
        return
      }
      // Swap in the new token so the Copy/Open actions use it right away.
      setProperties(prev => prev.map((p: any) =>
        p.id === propertyId ? { ...p, report_token: body.report_token } : p
      ))
      setRegeneratedId(propertyId)
      setTimeout(() => setRegeneratedId(null), 4000)
    } catch {
      alert('Could not regenerate the link. Please try again.')
    } finally {
      setRegeneratingId(null)
    }
  }

  return (
    <DashboardLayout>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{
        padding: '16px 28px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', gap: 12,
        background: C.bg, position: 'sticky', top: 0, zIndex: 10,
        fontFamily: 'sans-serif',
      }}>
        <h1 style={{ fontSize: 19, fontWeight: 700, color: C.text, margin: 0 }}>Seller Reports</h1>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.purpleL, background: `${C.purple}22`, borderRadius: 20, padding: '2px 9px' }}>
          {properties.length}
        </span>
        <span style={{ fontSize: 12, color: C.muted, marginLeft: 4 }}>
          One shareable report per property — send directly to your seller.
        </span>
      </div>

      <div style={{ padding: '24px 28px', fontFamily: 'sans-serif' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
            <div style={{ width: 32, height: 32, border: `2px solid ${C.purple}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          </div>
        ) : properties.length === 0 ? (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '72px 32px', textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.sub, marginBottom: 8 }}>No properties yet</div>
            <div style={{ fontSize: 14, color: C.muted }}>Add a property to generate your first seller report.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {properties.map((prop: any) => {
              const location = [prop.city, prop.state].filter(Boolean).join(', ')
              const leads    = leadCounts[prop.id] || 0
              const copied   = copiedId === prop.id
              const busy     = regeneratingId === prop.id
              const rotated  = regeneratedId === prop.id
              return (
                <div
                  key={prop.id}
                  style={{
                    background: C.card, border: `1px solid ${C.border}`,
                    borderRadius: 14, padding: '18px 20px',
                    display: 'flex', alignItems: 'center', gap: 16,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {prop.address}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: C.muted, flexWrap: 'wrap' }}>
                      {location && <span>{location}</span>}
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: prop.active ? '#4ade80' : '#6B7280', display: 'inline-block' }} />
                        {prop.active ? 'Live' : 'Offline'}
                      </span>
                      <span style={{ color: C.purpleL, fontWeight: 600 }}>{leads} lead{leads !== 1 ? 's' : ''}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button
                      onClick={() => copyLink(prop.id, prop.report_token)}
                      style={{
                        fontSize: 12, fontWeight: 600,
                        background: copied ? '#052e16' : `${C.purple}14`,
                        color: copied ? '#4ade80' : C.purpleL,
                        border: `1px solid ${copied ? '#166534' : C.purple + '40'}`,
                        borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
                        fontFamily: 'sans-serif', transition: 'all 0.15s', whiteSpace: 'nowrap',
                      }}
                    >
                      {copied ? '✓ Copied' : 'Copy Link'}
                    </button>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <button
                        onClick={() => regenerateLink(prop.id)}
                        disabled={busy}
                        title="Immediately invalidates the current link and issues a new one — the old link stops working right away"
                        style={{
                          fontSize: 12, fontWeight: 600,
                          background: rotated ? '#052e16' : 'transparent',
                          color: rotated ? '#4ade80' : C.muted,
                          border: `1px solid ${rotated ? '#166534' : C.border}`,
                          borderRadius: 8, padding: '8px 14px',
                          cursor: busy ? 'not-allowed' : 'pointer',
                          opacity: busy ? 0.6 : 1,
                          fontFamily: 'sans-serif', transition: 'all 0.15s', whiteSpace: 'nowrap',
                        }}
                      >
                        {busy ? '…' : rotated ? '✓ New link' : '⚠ Revoke & Create New'}
                      </button>
                      {!rotated && (
                        <span style={{ fontSize: 11, color: C.muted, whiteSpace: 'nowrap' }}>
                          Old link stops working
                        </span>
                      )}
                    </div>
                    <Link
                      href={`/report/${prop.report_token}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        fontSize: 12, fontWeight: 700,
                        background: C.purple, color: '#fff',
                        borderRadius: 8, padding: '8px 16px',
                        textDecoration: 'none',
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Open Report →
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
