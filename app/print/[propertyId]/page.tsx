'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { createBrowserSupabase } from '../../../lib/supabase-browser'

export default function PrintPage() {
  const params = useParams()
  const propertyId = params.propertyId as string
  const [property, setProperty] = useState<any>(null)
  const [qrCodes, setQrCodes] = useState<any[]>([])
  const [origin, setOrigin] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  useEffect(() => {
    const load = async () => {
      const supabase = createBrowserSupabase()
      const [{ data: prop }, { data: qrs }] = await Promise.all([
        supabase.from('properties').select('*').eq('id', propertyId).single(),
        supabase.from('qrcodes').select('*').eq('property_id', propertyId).order('created_at', { ascending: true }),
      ])
      setProperty(prop)
      setQrCodes(qrs || [])
      setLoading(false)
    }
    if (propertyId) load()
  }, [propertyId])

  useEffect(() => {
    if (!loading && property) {
      setTimeout(() => window.print(), 400)
    }
  }, [loading, property])

  if (loading) return <div style={{ padding: 40, fontFamily: 'sans-serif' }}>Loading…</div>
  if (!property) return <div style={{ padding: 40, fontFamily: 'sans-serif' }}>Property not found.</div>

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body { font-family: sans-serif; background: white; color: #000; margin: 0; }
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
        }
      `}</style>

      <div className="no-print" style={{ padding: '14px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 14, color: '#6B7280' }}>
          {qrCodes.length} QR code{qrCodes.length !== 1 ? 's' : ''} — {property.address}
        </span>
        <button
          onClick={() => window.print()}
          style={{ background: '#000', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
        >
          🖨 Print
        </button>
      </div>

      <div style={{ padding: 32 }}>
        <h1 style={{ fontSize: 22, margin: '0 0 4px' }}>{property.address}</h1>
        <p style={{ fontSize: 14, color: '#6B7280', margin: '0 0 32px' }}>
          {property.city}{property.city && property.state ? ', ' : ''}{property.state}
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
          {qrCodes.map(qr => (
            <div
              key={qr.id}
              style={{
                width: 190,
                textAlign: 'center',
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                padding: 16,
                pageBreakInside: 'avoid',
              }}
            >
              <QRCodeSVG value={`${origin}/q/${qr.id}`} size={150} />
              <div style={{ fontWeight: 700, fontSize: 13, marginTop: 10, marginBottom: 4 }}>{qr.label}</div>
              <div style={{ fontSize: 10, color: '#9CA3AF', wordBreak: 'break-all' }}>{origin}/q/{qr.id}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
