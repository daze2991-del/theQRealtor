'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createBrowserSupabase } from '../../../lib/supabase-browser'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DashboardLayout from '../../../components/DashboardLayout'
import { propertyLimitForPlan } from '../../../lib/plans'

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

function StatusBadge({ active, toggling, onToggle }: { active: boolean; toggling: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle} disabled={toggling}
      title={active ? 'Live 24/7 — buyers can scan anytime; you get the lead when they request info or a showing.' : 'Click to go live'}
      style={{
        display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
        background: active ? '#062014' : '#18181F',
        border: `1px solid ${active ? '#166534' : '#374151'}`,
        borderRadius: 20, padding: '4px 10px',
        cursor: toggling ? 'not-allowed' : 'pointer',
        opacity: toggling ? 0.6 : 1, transition: 'all 0.15s',
      }}
    >
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: active ? '#4ade80' : '#6B7280', transition: 'background 0.15s' }} />
      <span style={{ fontSize: 11, fontWeight: 700, color: active ? '#4ade80' : '#6B7280' }}>
        {toggling ? '…' : active ? 'Active' : 'Inactive'}
      </span>
    </button>
  )
}

function PropertyCard({ prop, scanCount, leadCount, hotLeadCount, toggling, onToggle, onDelete, onEdit, deleting, userId, origin, thumbnail }: {
  prop: any; scanCount: number; leadCount: number; hotLeadCount: number;
  toggling: boolean; onToggle: () => void;
  onDelete: () => void; onEdit: (updated: any) => void;
  deleting: boolean; userId: string; origin: string; thumbnail?: string;
}) {
  const router   = useRouter()
  const location = [prop.city, prop.state].filter(Boolean).join(', ')
  const [showPhotos, setShowPhotos]     = useState(false)
  const [photos, setPhotos]             = useState<any[]>([])
  const [loadingPhotos, setLoadingPhotos] = useState(false)
  const [uploading, setUploading]       = useState(false)
  const [uploadError, setUploadError]   = useState('')
  const [isDragging, setIsDragging]       = useState(false)
  const [dragIndex, setDragIndex]         = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [hasReordered, setHasReordered]   = useState(false)
  const [menuOpen, setMenuOpen]           = useState(false)
  const [copied, setCopied]               = useState(false)
  const [copiedReport, setCopiedReport]   = useState(false)
  const [editOpen, setEditOpen]           = useState(false)
  const [editForm, setEditForm]           = useState<any>({})
  const [editSaving, setEditSaving]       = useState(false)
  const [editError, setEditError]         = useState('')
  const fileInputRef  = useRef<HTMLInputElement>(null)
  const menuRef       = useRef<HTMLDivElement>(null)
  const photoGridRef  = useRef<HTMLDivElement>(null)
  const touchDragFrom = useRef<number | null>(null)
  const touchDragOver = useRef<number | null>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const loadPhotos = useCallback(async () => {
    setLoadingPhotos(true)
    const supabase = createBrowserSupabase()
    const { data, error } = await supabase.from('property_photos').select('*').eq('property_id', prop.id).order('sort_order', { ascending: true })
    if (error) console.error('[photos] load error:', error)
    setPhotos(data || [])
    setLoadingPhotos(false)
  }, [prop.id])

  useEffect(() => { if (showPhotos) loadPhotos() }, [showPhotos, loadPhotos])

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    if (!userId) return
    const arr = Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, 10 - photos.length)
    if (arr.length === 0) return
    setUploading(true)
    setUploadError('')
    const supabase = createBrowserSupabase()
    for (const file of arr) {
      const ext = file.name.split('.').pop() || 'jpg'
      const storagePath = `${userId}/${prop.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: uploadErr } = await supabase.storage.from('property-photos').upload(storagePath, file, { cacheControl: '3600', upsert: false })
      if (uploadErr) { setUploadError(`Upload failed: ${uploadErr.message}`); continue }
      const { data: { publicUrl } } = supabase.storage.from('property-photos').getPublicUrl(storagePath)
      const { error: dbErr } = await supabase.from('property_photos').insert({ property_id: prop.id, url: publicUrl, storage_path: storagePath, sort_order: photos.length })
      if (dbErr) { setUploadError(`Failed to save photo: ${dbErr.message}`); continue }
    }
    await loadPhotos()
    setUploading(false)
  }, [userId, prop.id, photos.length, loadPhotos])

  const deletePhoto = async (photo: any) => {
    const supabase = createBrowserSupabase()
    await Promise.all([
      photo.storage_path ? supabase.storage.from('property-photos').remove([photo.storage_path]) : Promise.resolve(),
      supabase.from('property_photos').delete().eq('id', photo.id),
    ])
    setPhotos(prev => prev.filter(p => p.id !== photo.id))
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false); uploadFiles(e.dataTransfer.files)
  }, [uploadFiles])

  const reorderPhotos = async (fromIdx: number, toIdx: number) => {
    const reordered = [...photos]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    setPhotos(reordered)
    setHasReordered(true)

    const supabase = createBrowserSupabase()
    const results = await Promise.all(
      reordered.map((p, i) =>
        supabase.from('property_photos').update({ sort_order: i }).eq('id', p.id)
      )
    )
    const errs = results.filter(r => r.error)
    if (errs.length > 0) console.error('[reorder] update errors:', errs.map(r => r.error))
  }

  const handleGridTouchMove = (e: React.TouchEvent) => {
    if (touchDragFrom.current === null) return
    const touch = e.touches[0]
    const el = document.elementFromPoint(touch.clientX, touch.clientY)
    const tile = el?.closest('[data-photo-index]') as HTMLElement | null
    if (tile) {
      const idx = parseInt(tile.dataset.photoIndex ?? '-1')
      if (idx >= 0 && idx !== touchDragFrom.current) {
        touchDragOver.current = idx
        setDragOverIndex(idx)
      }
    }
  }

  const handleGridTouchEnd = () => {
    const from = touchDragFrom.current
    const to = touchDragOver.current
    if (from !== null && to !== null && from !== to) reorderPhotos(from, to)
    touchDragFrom.current = null
    touchDragOver.current = null
    setDragIndex(null)
    setDragOverIndex(null)
  }

  // Non-passive listener so we can preventDefault during touch-drag (blocks page scroll)
  useEffect(() => {
    const el = photoGridRef.current
    if (!el) return
    const prevent = (e: TouchEvent) => { if (touchDragFrom.current !== null) e.preventDefault() }
    el.addEventListener('touchmove', prevent, { passive: false })
    return () => el.removeEventListener('touchmove', prevent)
  })

  const openEdit = () => {
    setEditForm({
      address:     prop.address || '',
      city:        prop.city || '',
      state:       prop.state || '',
      price:       prop.price ?? '',
      beds:        prop.beds ?? '',
      baths:       prop.baths ?? '',
      description: prop.description || '',
      agent_name:     prop.agent_name || '',
      agent_phone:    prop.agent_phone || '',
      active:         !!prop.active,
      packet_enabled: !!prop.packet_enabled,
    })
    setEditError('')
    setEditOpen(true)
  }

  const saveEdit = async () => {
    if (!editForm.address.trim()) return
    setEditSaving(true)
    setEditError('')
    const supabase = createBrowserSupabase()
    const updates = {
      address:     editForm.address.trim(),
      city:        editForm.city.trim() || null,
      state:       editForm.state.trim().toUpperCase() || null,
      price:       editForm.price !== '' ? Number(editForm.price) : null,
      beds:        editForm.beds !== '' ? Number(editForm.beds) : null,
      baths:       editForm.baths !== '' ? Number(editForm.baths) : null,
      description: editForm.description.trim() || null,
      agent_name:     editForm.agent_name.trim() || null,
      agent_phone:    editForm.agent_phone.trim() || null,
      active:         editForm.active,
      packet_enabled: editForm.packet_enabled,
    }
    const { error } = await supabase.from('properties').update(updates).eq('id', prop.id)
    if (error) {
      setEditError('Failed to save. Please try again.')
    } else {
      onEdit({ ...prop, ...updates })
      setEditOpen(false)
    }
    setEditSaving(false)
  }

  const copyBuyerLink = async () => {
    try {
      await navigator.clipboard.writeText(`https://theqrealtor.com/p/${prop.id}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable */ }
  }

  const copyReportLink = async () => {
    try {
      await navigator.clipboard.writeText(`${origin}/report/${prop.id}`)
      setCopiedReport(true)
      setTimeout(() => setCopiedReport(false), 2000)
    } catch { /* clipboard unavailable */ }
  }

  return (
    <div style={{ background: C.card, border: `1px solid #7C3AED60`, borderRadius: 16, padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
          {thumbnail ? (
            <img src={thumbnail} alt="" style={{ width: 60, height: 60, borderRadius: 10, objectFit: 'cover', flexShrink: 0, border: `1px solid ${C.border}` }} />
          ) : (
            <div style={{ width: 60, height: 60, borderRadius: 10, flexShrink: 0, background: '#252533', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🏠</div>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {prop.address}
            </div>
            {location ? (
              <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 4 }}>{location}</div>
            ) : (
              <div style={{ fontSize: 12, color: '#FB923C', fontWeight: 600, marginBottom: 4 }}>⚠️ Missing Location</div>
            )}
            <Link href={`/p/${prop.id}`} target="_blank" style={{ fontSize: 12, fontWeight: 600, color: C.purpleL, textDecoration: 'none' }}>
              Preview public page →
            </Link>
          </div>
        </div>
        <StatusBadge active={!!prop.active} toggling={toggling} onToggle={onToggle} />
      </div>

      {/* Analytics strip — Scans · Leads · Buyer Interest */}
      <div style={{ display: 'flex' }}>
        {[
          { label: 'Scans',          value: scanCount,    color: '#F1F5F9' },
          { label: 'Leads',          value: leadCount,    color: '#F1F5F9' },
          { label: 'Buyer Interest', value: hotLeadCount, color: '#8B5CF6' },
        ].map((s, i) => (
          <div key={s.label} style={{ flex: 1, textAlign: 'center', borderRight: i < 2 ? '1px solid #1E2340' : 'none' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Photos panel (toggled via ··· → Manage Photos) */}
      {showPhotos && (
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
          {loadingPhotos ? (
            <div style={{ textAlign: 'center', padding: '16px 0', color: C.muted, fontSize: 13 }}>Loading photos…</div>
          ) : (
            <>
              {photos.length > 0 && (
                <>
                  {photos.length > 1 && !hasReordered && (
                    <div style={{ fontSize: 11, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, marginBottom: 8 }}>
                      <span style={{ letterSpacing: '0.15em', opacity: 0.5 }}>⋮⋮</span> Drag to reorder
                    </div>
                  )}
                  <div
                    ref={photoGridRef}
                    style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 8, marginBottom: 12 }}
                    onTouchMove={handleGridTouchMove}
                    onTouchEnd={handleGridTouchEnd}
                  >
                    {photos.map((photo, i) => (
                      <div
                        key={photo.id}
                        data-photo-index={i}
                        draggable
                        onDragStart={() => setDragIndex(i)}
                        onDragOver={e => { e.preventDefault(); if (dragOverIndex !== i) setDragOverIndex(i) }}
                        onDragEnd={() => {
                          if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
                            reorderPhotos(dragIndex, dragOverIndex)
                          }
                          setDragIndex(null); setDragOverIndex(null)
                        }}
                        onDrop={e => e.preventDefault()}
                        onTouchStart={() => { touchDragFrom.current = i; setDragIndex(i) }}
                        style={{
                          position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden',
                          border: `1px solid ${dragOverIndex === i && dragIndex !== i ? C.purple : C.border}`,
                          opacity: dragIndex === i ? 0.4 : 1,
                          cursor: 'grab',
                          transition: 'opacity 0.15s, border-color 0.1s',
                        }}
                      >
                        {i === 0 && (
                          <div style={{ position: 'absolute', top: 3, left: 3, zIndex: 2, background: C.purple, color: '#fff', fontSize: 8, fontWeight: 800, padding: '2px 5px', borderRadius: 3 }}>HERO</div>
                        )}
                        <div style={{ position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)', zIndex: 2, background: 'rgba(0,0,0,0.55)', color: 'rgba(255,255,255,0.65)', fontSize: 11, padding: '2px 6px', borderRadius: 4, letterSpacing: '0.15em', pointerEvents: 'none', userSelect: 'none' }}>⋮⋮</div>
                        <img src={photo.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none', userSelect: 'none' }} />
                        <button
                          onClick={() => deletePhoto(photo)}
                          style={{ position: 'absolute', top: 3, right: 3, zIndex: 2, background: 'rgba(0,0,0,0.75)', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >✕</button>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {photos.length < 10 && (
                <div
                  onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  style={{ border: `2px dashed ${isDragging ? C.purple : C.border}`, borderRadius: 10, padding: '20px 12px', textAlign: 'center', cursor: 'pointer', background: isDragging ? `${C.purple}08` : 'transparent', transition: 'all 0.2s' }}
                >
                  <div style={{ fontSize: 20, marginBottom: 6 }}>{uploading ? '⏳' : '+'}</div>
                  <div style={{ fontSize: 12, color: C.muted }}>{uploading ? 'Uploading…' : `Add photos (${10 - photos.length} remaining)`}</div>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => e.target.files && uploadFiles(e.target.files)} />
              {uploadError && <p style={{ color: '#F87171', fontSize: 12, marginTop: 8 }}>{uploadError}</p>}
              {photos.length === 0 && !uploading && (
                <p style={{ fontSize: 12, color: C.muted, textAlign: 'center', marginTop: 8 }}>No photos yet. Photos appear in the buyer page gallery.</p>
              )}
            </>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Primary CTA */}
        <Link
          href={`/dashboard/properties/${prop.id}`}
          style={{
            display: 'block', textAlign: 'center',
            background: '#7C3AED', color: '#fff',
            borderRadius: 9, padding: '11px 14px',
            fontSize: 13, fontWeight: 700, textDecoration: 'none',
          }}
        >
          View Details →
        </Link>

        {/* Secondary actions: Open Report + Add QR + ··· overflow */}
        <div style={{ display: 'flex', gap: 8 }}>
          <a
            href={`/report/${prop.id}`}
            target="_blank"
            rel="noreferrer"
            style={{
              flex: 1, textAlign: 'center',
              background: 'transparent', color: '#8B5CF6',
              border: '1px solid #7C3AED40', borderRadius: 8,
              padding: '9px 12px', fontSize: 12, fontWeight: 600, textDecoration: 'none',
            }}
          >
            Open Seller Report
          </a>

          <button
            onClick={() => router.push(`/dashboard/signs?propertyId=${prop.id}`)}
            style={{
              flex: 1, background: 'transparent', color: '#94A3B8',
              border: '1px solid #1E2340', borderRadius: 8,
              padding: '9px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            + Add Sign
          </button>

          <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              onClick={() => setMenuOpen(v => !v)}
              style={{
                fontSize: 18, color: '#94A3B8', background: 'transparent',
                border: '1px solid #1E2340', borderRadius: 8,
                padding: '6px 13px', cursor: 'pointer', lineHeight: 1,
              }}
            >···</button>
            {menuOpen && (
              <div style={{
                position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 50,
                background: C.card, border: `1px solid ${C.border}`,
                borderRadius: 10, padding: '6px 0', minWidth: 210,
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              }}>
                <button onClick={() => { setMenuOpen(false); copyBuyerLink() }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: copied ? '#4ade80' : C.sub, fontSize: 13, padding: '9px 16px', cursor: 'pointer' }}>
                  {copied ? '✓ Copied!' : '🔗 Copy Buyer Link'}
                </button>
                <button onClick={() => { setMenuOpen(false); setShowPhotos(v => !v) }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: C.sub, fontSize: 13, padding: '9px 16px', cursor: 'pointer' }}>
                  📷 Manage Photos {photos.length > 0 ? `(${photos.length})` : ''}
                </button>
                <button onClick={() => { setMenuOpen(false); router.push(`/dashboard/signs?propertyId=${prop.id}`) }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: C.sub, fontSize: 13, padding: '9px 16px', cursor: 'pointer' }}>
                  📱 Manage Signs
                </button>
                <button onClick={() => { setMenuOpen(false); openEdit() }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: C.sub, fontSize: 13, padding: '9px 16px', cursor: 'pointer' }}>
                  ✏️ Edit Property
                </button>
                <a href={`/report/${prop.id}?print=true`} target="_blank" rel="noreferrer"
                  onClick={() => setMenuOpen(false)}
                  style={{ display: 'block', width: '100%', boxSizing: 'border-box', textAlign: 'left', textDecoration: 'none', color: C.sub, fontSize: 13, padding: '9px 16px', cursor: 'pointer' }}>
                  📄 PDF
                </a>
                <button onClick={() => { setMenuOpen(false); onToggle() }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: C.sub, fontSize: 13, padding: '9px 16px', cursor: 'pointer' }}>
                  {prop.active ? '🔴 Take Offline' : '🟢 Go Live'}
                </button>
                <div style={{ borderTop: `1px solid ${C.border}`, margin: '4px 0' }} />
                <button onClick={() => { setMenuOpen(false); onDelete() }}
                  disabled={deleting}
                  style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#EF4444', fontSize: 13, padding: '9px 16px', cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.5 : 1 }}>
                  {deleting ? '…' : '🗑️ Delete Property'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Edit Modal ── */}
      {editOpen && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setEditOpen(false) }}
          style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Edit Property</h2>
              <button onClick={() => setEditOpen(false)} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 18, cursor: 'pointer', padding: 4, lineHeight: 1 }}>✕</button>
            </div>

            {/* Address */}
            <label style={{ display: 'block', marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Address *</div>
              <input value={editForm.address} onChange={e => setEditForm((f: any) => ({ ...f, address: e.target.value }))}
                style={{ width: '100%', background: '#0F0F13', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', color: C.text, fontSize: 13, boxSizing: 'border-box' }} />
            </label>

            {/* City / State */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 10, marginBottom: 14 }}>
              <label>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>City</div>
                <input value={editForm.city} onChange={e => setEditForm((f: any) => ({ ...f, city: e.target.value }))}
                  style={{ width: '100%', background: '#0F0F13', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', color: C.text, fontSize: 13, boxSizing: 'border-box' }} />
              </label>
              <label>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>State</div>
                <input value={editForm.state} onChange={e => setEditForm((f: any) => ({ ...f, state: e.target.value }))}
                  maxLength={2} placeholder="CA"
                  style={{ width: '100%', background: '#0F0F13', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', color: C.text, fontSize: 13, boxSizing: 'border-box', textTransform: 'uppercase' }} />
              </label>
            </div>

            {/* Price */}
            <label style={{ display: 'block', marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Price ($)</div>
              <input type="number" value={editForm.price} onChange={e => setEditForm((f: any) => ({ ...f, price: e.target.value }))}
                placeholder="500000"
                style={{ width: '100%', background: '#0F0F13', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', color: C.text, fontSize: 13, boxSizing: 'border-box' }} />
            </label>

            {/* Beds / Baths */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <label>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Beds</div>
                <input type="number" value={editForm.beds} onChange={e => setEditForm((f: any) => ({ ...f, beds: e.target.value }))}
                  min="0" step="1"
                  style={{ width: '100%', background: '#0F0F13', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', color: C.text, fontSize: 13, boxSizing: 'border-box' }} />
              </label>
              <label>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Baths</div>
                <input type="number" value={editForm.baths} onChange={e => setEditForm((f: any) => ({ ...f, baths: e.target.value }))}
                  min="0" step="0.5"
                  style={{ width: '100%', background: '#0F0F13', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', color: C.text, fontSize: 13, boxSizing: 'border-box' }} />
              </label>
            </div>

            {/* Description */}
            <label style={{ display: 'block', marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Description</div>
              <textarea value={editForm.description} onChange={e => setEditForm((f: any) => ({ ...f, description: e.target.value }))}
                rows={3}
                style={{ width: '100%', background: '#0F0F13', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', color: C.text, fontSize: 13, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
            </label>

            {/* Agent Name */}
            <label style={{ display: 'block', marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Agent Name</div>
              <input value={editForm.agent_name} onChange={e => setEditForm((f: any) => ({ ...f, agent_name: e.target.value }))}
                style={{ width: '100%', background: '#0F0F13', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', color: C.text, fontSize: 13, boxSizing: 'border-box' }} />
            </label>

            {/* Agent Phone */}
            <label style={{ display: 'block', marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Agent Phone (SMS alerts)</div>
              <input type="tel" value={editForm.agent_phone} onChange={e => setEditForm((f: any) => ({ ...f, agent_phone: e.target.value }))}
                placeholder="+15551234567"
                style={{ width: '100%', background: '#0F0F13', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', color: C.text, fontSize: 13, boxSizing: 'border-box' }} />
            </label>

            {/* TODO: Restore Property Packet toggle when V2 is built with proper file upload and delivery flow */}

            {/* Active toggle */}
            <div
              onClick={() => setEditForm((f: any) => ({ ...f, active: !f.active }))}
              style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22, cursor: 'pointer', userSelect: 'none' }}
            >
              <div style={{ width: 40, height: 22, borderRadius: 11, background: editForm.active ? C.purple : C.border, position: 'relative', flexShrink: 0, transition: 'background 0.15s' }}>
                <div style={{ position: 'absolute', top: 3, left: editForm.active ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
              </div>
              <span style={{ fontSize: 13, color: C.sub }}>{editForm.active ? 'Listing is Live' : 'Listing is Offline'}</span>
            </div>

            {editError && <p style={{ color: '#F87171', fontSize: 12, marginBottom: 14, margin: '0 0 14px' }}>{editError}</p>}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setEditOpen(false)}
                style={{ flex: 1, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 9, padding: 10, color: C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={saveEdit} disabled={editSaving || !editForm.address?.trim()}
                style={{ flex: 2, background: editSaving ? `${C.purple}80` : C.purple, border: 'none', borderRadius: 9, padding: 10, color: '#fff', fontSize: 13, fontWeight: 700, cursor: editSaving ? 'not-allowed' : 'pointer' }}>
                {editSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default function PropertiesPage() {
  const router = useRouter()
  const routerRef = useRef(router)
  routerRef.current = router

  const [properties, setProperties]       = useState<any[]>([])
  const [scanCounts, setScanCounts]       = useState<Record<string, number>>({})
  const [leadCounts, setLeadCounts]       = useState<Record<string, number>>({})
  const [hotLeadCounts, setHotLeadCounts] = useState<Record<string, number>>({})
  const [propThumbs, setPropThumbs]       = useState<Record<string, string>>({})
  const [plan, setPlan]                   = useState('free')
  const [loading, setLoading]             = useState(true)
  const [togglingId, setTogglingId]       = useState<string | null>(null)
  const [deletingId, setDeletingId]       = useState<string | null>(null)
  const [userId, setUserId]               = useState('')
  const [origin, setOrigin]               = useState('')
  const [search, setSearch]               = useState('')
  const [sortMode, setSortMode]           = useState<'recent' | 'leads' | 'active'>('recent')
  const [deleteTarget, setDeleteTarget]   = useState<any | null>(null)
  const [deleteModal, setDeleteModal]     = useState<'confirm' | null>(null)
  const [exportingCsv, setExportingCsv]   = useState(false)

  useEffect(() => { setOrigin(window.location.origin) }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const supabase = createBrowserSupabase()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { routerRef.current.push('/auth'); return }
        setUserId(session.user.id)

        const [{ data: profile }, { data: props }] = await Promise.all([
          supabase.from('profiles').select('plan').eq('id', session.user.id).single(),
          supabase.from('properties').select('*').eq('user_id', session.user.id).is('deleted_at', null).order('created_at', { ascending: false }),
        ])

        if (cancelled) return
        setPlan(profile?.plan || 'free')
        setProperties(props || [])

        if (props && props.length > 0) {
          const ids = props.map((p: any) => p.id)
          // Scan counts now come from scan_events (property_id is a required,
          // reliable stamp on every row) instead of qrcodes.scan_count, which
          // lived on the now-empty/retired qrcodes table.
          const [{ data: scanEvents }, { data: leads }, { data: thumbData }] = await Promise.all([
            supabase.from('scan_events').select('property_id').in('property_id', ids),
            supabase.from('leads').select('property_id, tier').in('property_id', ids),
            supabase.from('property_photos').select('property_id, url')
              .in('property_id', ids).order('sort_order', { ascending: true }),
          ])
          if (cancelled) return

          const scanMap: Record<string, number> = {}
          ;(scanEvents || []).forEach((s: any) => {
            scanMap[s.property_id] = (scanMap[s.property_id] || 0) + 1
          })
          const leadMap: Record<string, number> = {}
          const hotMap: Record<string, number> = {}
          ;(leads || []).forEach((l: any) => {
            leadMap[l.property_id] = (leadMap[l.property_id] || 0) + 1
            if (l.tier === 'hot') hotMap[l.property_id] = (hotMap[l.property_id] || 0) + 1
          })
          const thumbMap: Record<string, string> = {}
          ;(thumbData || []).forEach((t: any) => { if (!thumbMap[t.property_id]) thumbMap[t.property_id] = t.url })

          setScanCounts(scanMap)
          setLeadCounts(leadMap)
          setHotLeadCounts(hotMap)
          setPropThumbs(thumbMap)
        }
      } catch (err) {
        console.error('[PropertiesPage] load error:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const toggleActive = async (prop: any) => {
    setTogglingId(prop.id)
    try {
      const supabase = createBrowserSupabase()
      const { error } = await supabase.from('properties').update({ active: !prop.active }).eq('id', prop.id)
      if (!error) setProperties(prev => prev.map(p => p.id === prop.id ? { ...p, active: !prop.active } : p))
    } finally {
      setTogglingId(null)
    }
  }

  const handleDeleteClick = (prop: any) => {
    // Soft-delete preserves leads and scan history, so deletion is always safe —
    // no need to inspect data or block properties that have leads/scans.
    setDeleteTarget(prop)
    setDeleteModal('confirm')
  }

  // Offered from the delete-confirm modal, before the soft-delete runs. The
  // underlying lead rows are NOT destroyed by delete (see deleteProperty below)
  // — this exists because a soft-deleted property drops out of the Leads page's
  // property filter and its address label (leads/page.tsx:218-224), so isolating
  // "just this property's leads" gets harder afterward, even though nothing is
  // actually lost. A CSV taken now is the easy way to keep that grouping.
  const downloadPropertyLeadsCsv = async (prop: any) => {
    setExportingCsv(true)
    try {
      const supabase = createBrowserSupabase()
      const { data: leads, error } = await supabase
        .from('leads')
        .select('name, phone, email, status, motivation, tier, notes, created_at')
        .eq('property_id', prop.id)
        .order('created_at', { ascending: false })
      if (error) { console.error('[downloadPropertyLeadsCsv] query failed:', error); return }
      if (!leads || leads.length === 0) return

      const rows = [
        ['Name', 'Phone', 'Email', 'Status', 'Tier', 'Motivation', 'Notes', 'Submitted'],
        ...leads.map((l: any) => [
          l.name || '', l.phone || '', l.email || '',
          l.status || 'new', l.tier || '', l.motivation || '',
          l.notes || '', new Date(l.created_at).toLocaleString(),
        ]),
      ]
      const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
      const slug = (prop.address || 'property').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
      a.download = `leads-${slug}-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
    } finally {
      setExportingCsv(false)
    }
  }

  const deleteProperty = async () => {
    if (!deleteTarget) return
    const prop = deleteTarget
    setDeleteModal(null)
    setDeleteTarget(null)
    setDeletingId(prop.id)
    try {
      const supabase = createBrowserSupabase()

      // Soft delete: archive the property by stamping deleted_at. Leads, scan
      // events, QR codes, and photos are all preserved and keep pointing at this
      // (still-present) property row. Active views filter on deleted_at IS NULL.
      const { error } = await supabase
        .from('properties')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', prop.id)
      if (error) { console.error('[deleteProperty] soft-delete failed:', error); return }

      setProperties(prev => prev.filter(p => p.id !== prop.id))
    } finally {
      setDeletingId(null)
    }
  }

  const filteredProperties = properties.filter(p =>
    p.address.toLowerCase().includes(search.toLowerCase())
  )
  const sortedProperties = [...filteredProperties].sort((a, b) => {
    if (sortMode === 'leads')  return (leadCounts[b.id]  || 0) - (leadCounts[a.id]  || 0)
    if (sortMode === 'active') return (scanCounts[b.id]  || 0) - (scanCounts[a.id]  || 0)
    return 0 // 'recent' — preserve DB order (created_at desc)
  })

  const propertyLimit = propertyLimitForPlan(plan)
  const canAddProperty = propertyLimit === null || properties.length < propertyLimit

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
              <h1 style={{ fontSize: 19, fontWeight: 700, color: C.text, margin: 0 }}>Properties</h1>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.purpleL, background: `${C.purple}22`, borderRadius: 20, padding: '2px 9px' }}>
                {properties.length}
              </span>
            </div>
            {canAddProperty && (
              <Link href="/dashboard/new-property" style={{ background: C.purple, color: '#fff', fontSize: 13, fontWeight: 700, padding: '8px 18px', borderRadius: 9, textDecoration: 'none' }}>
                + Add Property
              </Link>
            )}
            {/* TODO: Restore "Upgrade for More" button here when Stripe is live.
                Was: <button onClick={() => router.push('/dashboard/billing')}>
                ⚡ Upgrade for More</button> with purple styling */}
          </div>

          <div style={{ padding: '24px 28px' }}>
            {/* FIX 6 — Search + Sort */}
            {properties.length > 0 && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                <input
                  type="text"
                  placeholder="Search by address…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 14px', color: C.text, fontSize: 13, outline: 'none' }}
                />
                <select
                  value={sortMode}
                  onChange={e => setSortMode(e.target.value as 'recent' | 'leads' | 'active')}
                  style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 14px', color: C.sub, fontSize: 13, cursor: 'pointer', flexShrink: 0, minWidth: 140 }}
                >
                  <option value="recent">Most Recent</option>
                  <option value="leads">Most Leads</option>
                  <option value="active">Most Active</option>
                </select>
              </div>
            )}
            {sortedProperties.length === 0 ? (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '72px 32px', textAlign: 'center' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🏠</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>No properties yet</div>
                <p style={{ fontSize: 14, color: C.muted, maxWidth: 360, margin: '0 auto 24px' }}>
                  Add your first property to start capturing buyer leads with trackable QR codes.
                </p>
                <Link href="/dashboard/new-property" style={{ background: C.purple, color: '#fff', fontSize: 14, fontWeight: 700, padding: '10px 24px', borderRadius: 10, textDecoration: 'none' }}>
                  + Add Your First Property
                </Link>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
                {sortedProperties.map((prop: any) => (
                  <PropertyCard
                    key={prop.id}
                    prop={prop}
                    scanCount={scanCounts[prop.id] || 0}
                    leadCount={leadCounts[prop.id] || 0}
                    hotLeadCount={hotLeadCounts[prop.id] || 0}
                    toggling={togglingId === prop.id}
                    onToggle={() => toggleActive(prop)}
                    onDelete={() => handleDeleteClick(prop)}
                    onEdit={updated => setProperties(prev => prev.map(p => p.id === updated.id ? updated : p))}
                    deleting={deletingId === prop.id}
                    userId={userId}
                    origin={origin}
                    thumbnail={propThumbs[prop.id]}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
      {/* Delete confirm modal — soft-delete (archive); history is preserved */}
      {deleteModal === 'confirm' && deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#1A1A24', border: '1px solid #252533', borderRadius: 16, padding: 28, maxWidth: 420, width: '100%' }}>
            <div style={{ fontSize: 24, marginBottom: 12 }}>🗑️</div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: '#FFFFFF', margin: '0 0 12px' }}>Delete &ldquo;{deleteTarget.address}&rdquo;?</h2>
            <p style={{ fontSize: 14, color: '#C4C4D4', lineHeight: 1.6, margin: '0 0 14px' }}>
              This removes the property from your dashboard. Its leads and scan history are <strong style={{ color: '#FFFFFF' }}>preserved</strong> and stay in your Leads list — but this property won&apos;t appear in the Leads filter anymore, so those leads will be harder to pull out as a group afterward. This can&apos;t be undone from the dashboard.
            </p>
            <button
              onClick={() => downloadPropertyLeadsCsv(deleteTarget)}
              disabled={exportingCsv}
              style={{ width: '100%', background: 'transparent', color: C.purpleL, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: exportingCsv ? 'not-allowed' : 'pointer', opacity: exportingCsv ? 0.7 : 1, fontFamily: 'sans-serif', marginBottom: 16 }}
            >
              {exportingCsv ? 'Preparing…' : '⬇ Download leads as CSV'}
            </button>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={deleteProperty}
                disabled={!!deletingId}
                style={{ flex: 1, background: '#EF4444', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: deletingId ? 'not-allowed' : 'pointer', opacity: deletingId ? 0.7 : 1, fontFamily: 'sans-serif' }}
              >
                {deletingId ? 'Deleting…' : 'Delete Property'}
              </button>
              <button
                onClick={() => { setDeleteModal(null); setDeleteTarget(null) }}
                style={{ flex: 1, background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'sans-serif' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
