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

  useEffect(() => { setOrigin(window.location.origin) }, [])

  useEffect(() => {
    const load = async () => {
      const supabase = createBrowserSupabase()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth'); return }

      const { data: props } = await supabase
        .from('properties')
        .select('id, address, city, state, active, created_at')
        .eq('user_id', session.user.id)
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

  const copyLink = async (propertyId: string) => {
    try { await navigator.clipboard.writeText(`${origin}/report/${propertyId}`) } catch {}
    setCopiedId(propertyId)
    setTimeout(() => setCopiedId(null), 2000)
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
                      onClick={() => copyLink(prop.id)}
                      style={{
                        fontSize: 12, fontWeight: 600,
                        background: copied ? '#052e16' : `${C.purple}14`,
                        color: copied ? '#4ade80' : C.purpleL,
                        border: `1px solid ${copied ? '#166534' : C.purple + '40'}`,
                        borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
                        fontFamily: 'sans-serif', transition: 'all 0.15s', whiteSpace: 'nowrap',
                      }}
                    >
                      {copied ? '✓ Copied' : '📋 Copy Link'}
                    </button>
                    <Link
                      href={`/report/${prop.id}`}
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
