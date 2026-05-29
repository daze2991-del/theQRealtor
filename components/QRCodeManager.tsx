'use client'

import { useState, useEffect, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { createBrowserSupabase } from '../lib/supabase-browser'

interface QRCode {
  id: string
  property_id: string
  label: string
  scan_count: number
  created_at: string
}

interface Property {
  id: string
  address: string
}

interface QRCodeManagerProps {
  propertyId: string
  allProperties: Property[]
}

export default function QRCodeManager({ propertyId, allProperties }: QRCodeManagerProps) {
  const [qrCodes, setQrCodes] = useState<QRCode[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [creating, setCreating] = useState(false)
  const [reassignTarget, setReassignTarget] = useState<QRCode | null>(null)
  const [reassigningTo, setReassigningTo] = useState('')
  const [reassigning, setReassigning] = useState(false)
  const [origin, setOrigin] = useState('')

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const fetchQRCodes = useCallback(async () => {
    const supabase = createBrowserSupabase()
    const { data } = await supabase
      .from('qrcodes')
      .select('*')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false })
    setQrCodes(data || [])
    setLoading(false)
  }, [propertyId])

  useEffect(() => {
    fetchQRCodes()
  }, [fetchQRCodes])

  const createQRCode = async () => {
    if (!newLabel.trim()) return
    setCreating(true)
    const supabase = createBrowserSupabase()
    const { error } = await supabase
      .from('qrcodes')
      .insert([{ property_id: propertyId, label: newLabel.trim() }])
    if (!error) {
      setNewLabel('')
      setShowForm(false)
      await fetchQRCodes()
    }
    setCreating(false)
  }

  const handleReassign = async () => {
    if (!reassignTarget || !reassigningTo) return
    setReassigning(true)
    const supabase = createBrowserSupabase()
    const { error } = await supabase
      .from('qrcodes')
      .update({ property_id: reassigningTo })
      .eq('id', reassignTarget.id)
    if (!error) {
      setReassignTarget(null)
      setReassigningTo('')
      await fetchQRCodes()
    }
    setReassigning(false)
  }

  const downloadQR = (qrId: string, label: string) => {
    const svg = document.getElementById(`qr-svg-${qrId}`)
    if (!svg) return
    const serializer = new XMLSerializer()
    const svgStr = serializer.serializeToString(svg)
    const canvas = document.createElement('canvas')
    canvas.width = 200
    canvas.height = 200
    const img = new Image()
    img.onload = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, 200, 200)
      ctx.drawImage(img, 0, 0, 200, 200)
      const a = document.createElement('a')
      a.download = `${label.replace(/\s+/g, '-').toLowerCase()}.png`
      a.href = canvas.toDataURL('image/png')
      a.click()
    }
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr)
  }

  if (loading) return null

  const otherProperties = allProperties.filter(p => p.id !== propertyId)

  return (
    <div style={{ marginTop: 24, borderTop: '1px solid #1E2330', paddingTop: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ fontSize: 14, color: '#9CA3AF', fontWeight: 600, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          QR Codes
        </h3>
        <button
          onClick={() => setShowForm(v => !v)}
          style={{
            background: showForm ? '#00D4AA' : 'transparent',
            color: showForm ? '#000' : '#00D4AA',
            border: '1px solid #00D4AA',
            borderRadius: 6,
            padding: '4px 14px',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {showForm ? '✕ Cancel' : '+ New QR Code'}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div style={{
          background: '#0D1117',
          border: '1px solid #1E2330',
          borderRadius: 10,
          padding: 16,
          marginBottom: 16,
          display: 'flex',
          gap: 10,
          alignItems: 'center',
        }}>
          <input
            type="text"
            placeholder='e.g. "Front Yard Sign" or "Open House Sign"'
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createQRCode()}
            autoFocus
            style={{
              flex: 1,
              background: '#161A22',
              border: '1px solid #1E2330',
              borderRadius: 8,
              color: '#F0F2F5',
              fontSize: 14,
              padding: '9px 12px',
            }}
          />
          <button
            onClick={createQRCode}
            disabled={creating || !newLabel.trim()}
            style={{
              background: '#00D4AA',
              color: '#000',
              border: 'none',
              borderRadius: 8,
              padding: '9px 18px',
              fontSize: 14,
              fontWeight: 700,
              cursor: (creating || !newLabel.trim()) ? 'not-allowed' : 'pointer',
              opacity: (creating || !newLabel.trim()) ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
      )}

      {/* QR code list */}
      {qrCodes.length === 0 ? (
        <p style={{ color: '#4B5563', fontSize: 13, fontStyle: 'italic', margin: 0 }}>
          No QR codes yet — create one above to get a permanent, trackable URL.
        </p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
          {qrCodes.map(qr => (
            <div
              key={qr.id}
              style={{
                background: '#0D1117',
                border: '1px solid #1E2330',
                borderRadius: 12,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
                width: 180,
              }}
            >
              {/* Label */}
              <span style={{ fontSize: 13, fontWeight: 700, color: '#F0F2F5', textAlign: 'center', lineHeight: 1.3 }}>
                {qr.label}
              </span>

              {/* QR image */}
              <div style={{ background: 'white', padding: 8, borderRadius: 8 }}>
                <QRCodeSVG
                  id={`qr-svg-${qr.id}`}
                  value={`${origin}/q/${qr.id}`}
                  size={120}
                />
              </div>

              {/* Scan count */}
              <span style={{ fontSize: 12, color: '#6B7280' }}>
                {qr.scan_count} {qr.scan_count === 1 ? 'scan' : 'scans'}
              </span>

              {/* Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                <button
                  onClick={() => downloadQR(qr.id, qr.label)}
                  style={{
                    background: 'transparent',
                    color: '#00D4AA',
                    border: '1px solid #004D3D',
                    borderRadius: 6,
                    padding: '5px 0',
                    fontSize: 12,
                    cursor: 'pointer',
                    width: '100%',
                  }}
                >
                  ⬇ Download PNG
                </button>
                {otherProperties.length > 0 && (
                  <button
                    onClick={() => { setReassignTarget(qr); setReassigningTo('') }}
                    style={{
                      background: 'transparent',
                      color: '#60A5FA',
                      border: '1px solid #1E3A5F',
                      borderRadius: 6,
                      padding: '5px 0',
                      fontSize: 12,
                      cursor: 'pointer',
                      width: '100%',
                    }}
                  >
                    ↔ Reassign
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Print button */}
      {qrCodes.length > 0 && (
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => window.open(`/print/${propertyId}`, '_blank')}
            style={{
              background: 'transparent',
              color: '#9CA3AF',
              border: '1px solid #374151',
              borderRadius: 6,
              padding: '6px 14px',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            🖨 Print QR Sheet
          </button>
        </div>
      )}

      {/* Reassign modal */}
      {reassignTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={e => { if (e.target === e.currentTarget) { setReassignTarget(null); setReassigningTo('') } }}
        >
          <div style={{
            background: '#161A22',
            border: '1px solid #1E2330',
            borderRadius: 16,
            padding: 28,
            width: 400,
            maxWidth: '92vw',
          }}>
            <h3 style={{ fontSize: 18, margin: '0 0 8px', color: '#F0F2F5' }}>Reassign QR Code</h3>
            <p style={{ color: '#6B7280', fontSize: 14, margin: '0 0 20px' }}>
              Move <strong style={{ color: '#F0F2F5' }}>"{reassignTarget.label}"</strong> to a different property.
              The QR URL stays the same — it will just redirect buyers to the new listing.
            </p>
            <select
              value={reassigningTo}
              onChange={e => setReassigningTo(e.target.value)}
              style={{
                width: '100%',
                background: '#0D1117',
                border: '1px solid #1E2330',
                borderRadius: 8,
                color: reassigningTo ? '#F0F2F5' : '#6B7280',
                fontSize: 14,
                padding: '10px 12px',
                marginBottom: 20,
                boxSizing: 'border-box',
              }}
            >
              <option value="">Select a property…</option>
              {otherProperties.map(p => (
                <option key={p.id} value={p.id}>{p.address}</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { setReassignTarget(null); setReassigningTo('') }}
                style={{
                  flex: 1,
                  background: 'transparent',
                  color: '#9CA3AF',
                  border: '1px solid #374151',
                  borderRadius: 8,
                  padding: '10px',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleReassign}
                disabled={reassigning || !reassigningTo}
                style={{
                  flex: 1,
                  background: '#00D4AA',
                  color: '#000',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: (reassigning || !reassigningTo) ? 'not-allowed' : 'pointer',
                  opacity: (reassigning || !reassigningTo) ? 0.6 : 1,
                }}
              >
                {reassigning ? 'Moving…' : 'Reassign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
