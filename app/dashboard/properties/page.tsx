'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createBrowserSupabase } from '../../../lib/supabase-browser'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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

function StatusBadge({ active, toggling, onToggle }: { active: boolean; toggling: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle} disabled={toggling}
      title={active ? 'Click to take offline' : 'Click to go live'}
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
        {toggling ? '…' : active ? 'Live' : 'Offline'}
      </span>
    </button>
  )
}

function PropertyCard({ prop, scanCount, leadCount, qrCount, toggling, onToggle, onDelete, onArchive, deleting, userId, origin, thumbnail }: {
  prop: any; scanCount: number; leadCount: number; qrCount: number;
  toggling: boolean; onToggle: () => void;
  onDelete: () => void; onArchive: () => void;
  deleting: boolean; userId: string; origin: string; thumbnail?: string;
}) {
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

  const copyBuyerLink = async () => {
    try {
      await navigator.clipboard.writeText(`${origin}/p/${prop.id}`)
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
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
          {thumbnail ? (
            <img src={thumbnail} alt="" style={{ width: 80, height: 80, borderRadius: 10, objectFit: 'cover', flexShrink: 0, border: `1px solid ${C.border}` }} />
          ) : (
            <div style={{ width: 80, height: 80, borderRadius: 10, flexShrink: 0, background: '#252533', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🏠</div>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {prop.address}
            </div>
            {location ? (
              <div style={{ fontSize: 12.5, color: C.muted }}>{location}</div>
            ) : (
              <div style={{ fontSize: 12, color: '#FB923C', fontWeight: 600 }}>⚠️ Missing Location</div>
            )}
          </div>
        </div>
        <StatusBadge active={!!prop.active} toggling={toggling} onToggle={onToggle} />
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, background: `${C.purple}14`, border: `1px solid ${C.purple}30`, borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.purpleL, lineHeight: 1 }}>{scanCount}</div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Scans</div>
        </div>
        <div style={{ flex: 1, background: '#1A170D', border: '1px solid #3A3520', borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#FCD34D', lineHeight: 1 }}>{leadCount}</div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Leads</div>
        </div>
        <div style={{ flex: 1, background: '#0D1117', border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.sub, lineHeight: 1 }}>{qrCount}</div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>QR Codes</div>
        </div>
      </div>

      {/* Photos toggle */}
      <button
        onClick={() => setShowPhotos(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8,
          padding: '8px 12px', cursor: 'pointer', width: '100%',
          color: C.muted, fontSize: 12.5, fontWeight: 500,
        }}
      >
        <span>📷 Manage Photos {photos.length > 0 && !showPhotos ? `(${photos.length})` : ''}</span>
        <span style={{ fontSize: 10, transition: 'transform 0.15s', transform: showPhotos ? 'rotate(180deg)' : 'none', display: 'inline-block' }}>▾</span>
      </button>

      {/* Photos panel */}
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4, borderTop: `1px solid ${C.border}` }}>
        {/* Row 1: page links + menu */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link href={`/p/${prop.id}`} target="_blank" style={{ fontSize: 13, color: C.purpleL, fontWeight: 600, textDecoration: 'none' }}>
            View Buyer Page →
          </Link>
          {origin && (
            <button
              onClick={copyBuyerLink}
              style={{
                fontSize: 12, background: 'transparent',
                color: copied ? '#4ade80' : C.muted,
                border: `1px solid ${copied ? '#166534' : C.border}`,
                borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {copied ? '✓ Copied' : '⎘ Copy Buyer Link'}
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link href="/dashboard/qr-codes" style={{ fontSize: 12, color: C.muted, textDecoration: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 10px' }}>
            QR Codes
          </Link>

          {/* ⋮ menu */}
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setMenuOpen(v => !v)}
              style={{
                fontSize: 16, color: C.muted, background: 'transparent',
                border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 10px',
                cursor: 'pointer', lineHeight: 1,
              }}
            >⋮</button>
            {menuOpen && (
              <div style={{
                position: 'absolute', right: 0, bottom: 'calc(100% + 6px)', zIndex: 50,
                background: C.card, border: `1px solid ${C.border}`,
                borderRadius: 10, padding: '6px 0', minWidth: 140,
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              }}>
                <button
                  onClick={() => { setMenuOpen(false); /* edit not implemented */ }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: C.sub, fontSize: 13, padding: '8px 16px', cursor: 'pointer' }}
                >
                  ✏️ Edit
                </button>
                <button
                  onClick={() => { setMenuOpen(false); onArchive() }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: C.sub, fontSize: 13, padding: '8px 16px', cursor: 'pointer' }}
                >
                  📦 Archive
                </button>
                <div style={{ borderTop: `1px solid ${C.border}`, margin: '4px 0' }} />
                <button
                  onClick={() => { setMenuOpen(false); onDelete() }}
                  disabled={deleting}
                  style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#EF4444', fontSize: 13, padding: '8px 16px', cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.5 : 1 }}
                >
                  {deleting ? '…' : '🗑 Delete'}
                </button>
              </div>
            )}
          </div>
        </div>
        </div>

        {/* Row 2: seller report buttons */}
        {origin && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={copyReportLink}
              style={{
                flex: 1, fontSize: 12, fontWeight: 600,
                background: copiedReport ? '#052e16' : `${C.purple}14`,
                color: copiedReport ? '#4ade80' : C.purpleL,
                border: `1px solid ${copiedReport ? '#166534' : C.purple + '40'}`,
                borderRadius: 7, padding: '6px 10px', cursor: 'pointer',
                transition: 'all 0.15s', textAlign: 'center',
              }}
            >
              {copiedReport ? '✓ Report Link Copied' : '📊 Share Seller Report'}
            </button>
            <a
              href={`/report/${prop.id}?print=true`}
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize: 12, fontWeight: 600,
                background: 'transparent', color: C.purpleL,
                border: `1px solid ${C.purple + '40'}`,
                borderRadius: 7, padding: '6px 12px',
                cursor: 'pointer', textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center',
              }}
            >
              ⬇ PDF
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

export default function PropertiesPage() {
  const router = useRouter()
  const routerRef = useRef(router)
  routerRef.current = router

  const [properties, setProperties]     = useState<any[]>([])
  const [qrCounts, setQrCounts]         = useState<Record<string, number>>({})
  const [scanCounts, setScanCounts]     = useState<Record<string, number>>({})
  const [leadCounts, setLeadCounts]     = useState<Record<string, number>>({})
  const [propThumbs, setPropThumbs]     = useState<Record<string, string>>({})
  const [plan, setPlan]                 = useState<'free' | 'pro'>('free')
  const [loading, setLoading]           = useState(true)
  const [togglingId, setTogglingId]     = useState<string | null>(null)
  const [deletingId, setDeletingId]     = useState<string | null>(null)
  const [userId, setUserId]             = useState('')
  const [origin, setOrigin]             = useState('')

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
          supabase.from('properties').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false }),
        ])

        if (cancelled) return
        setPlan(profile?.plan === 'pro' ? 'pro' : 'free')
        setProperties(props || [])

        if (props && props.length > 0) {
          const ids = props.map((p: any) => p.id)
          const [{ data: qrcodes }, { data: leads }, { data: thumbData }] = await Promise.all([
            supabase.from('qrcodes').select('property_id, scan_count').in('property_id', ids),
            supabase.from('leads').select('property_id').in('property_id', ids),
            supabase.from('property_photos').select('property_id, url')
              .in('property_id', ids).order('sort_order', { ascending: true }),
          ])
          if (cancelled) return

          const qrMap: Record<string, number> = {}
          const scanMap: Record<string, number> = {}
          ;(qrcodes || []).forEach((q: any) => {
            qrMap[q.property_id] = (qrMap[q.property_id] || 0) + 1
            scanMap[q.property_id] = (scanMap[q.property_id] || 0) + (q.scan_count || 0)
          })
          const leadMap: Record<string, number> = {}
          ;(leads || []).forEach((l: any) => { leadMap[l.property_id] = (leadMap[l.property_id] || 0) + 1 })
          const thumbMap: Record<string, string> = {}
          ;(thumbData || []).forEach((t: any) => { if (!thumbMap[t.property_id]) thumbMap[t.property_id] = t.url })

          setQrCounts(qrMap)
          setScanCounts(scanMap)
          setLeadCounts(leadMap)
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

  const archiveProperty = async (prop: any) => {
    setTogglingId(prop.id)
    try {
      const supabase = createBrowserSupabase()
      const { error } = await supabase.from('properties').update({ active: false }).eq('id', prop.id)
      if (!error) setProperties(prev => prev.map(p => p.id === prop.id ? { ...p, active: false } : p))
    } finally {
      setTogglingId(null)
    }
  }

  const deleteProperty = async (prop: any) => {
    if (!confirm(`Delete "${prop.address}"?\n\nThis will permanently remove the property, its photos, and leads. QR codes will be unlinked and available to reassign to a new listing.`)) return
    setDeletingId(prop.id)
    try {
      const supabase = createBrowserSupabase()
      console.log('[deleteProperty] start', prop.id)

      // Fetch QR IDs before any deletes — needed for step 1
      const { data: qrData, error: qrFetchErr } = await supabase
        .from('qrcodes').select('id').eq('property_id', prop.id)
      console.log('[deleteProperty] qr fetch:', qrData?.length ?? 0, 'ids', qrFetchErr ?? '')
      if (qrFetchErr) { console.error('[deleteProperty] BAIL: qr fetch', qrFetchErr); return }
      const qrIds = (qrData || []).map((q: any) => q.id)

      // 1. scan_events — delete before property so qr_id → property chain is still valid
      if (qrIds.length > 0) {
        const { error } = await supabase.from('scan_events').delete().in('qr_id', qrIds)
        console.log('[deleteProperty] 1. scan_events:', error ?? 'OK')
        if (error) { console.error('[deleteProperty] BAIL: scan_events', error); return }
      } else {
        console.log('[deleteProperty] 1. scan_events: skipped (no qr codes)')
      }

      // 2. leads
      const { error: lErr } = await supabase.from('leads').delete().eq('property_id', prop.id)
      console.log('[deleteProperty] 2. leads:', lErr ?? 'OK')
      if (lErr) { console.error('[deleteProperty] BAIL: leads', lErr); return }

      // 3. property_photos
      const { error: phErr } = await supabase.from('property_photos').delete().eq('property_id', prop.id)
      console.log('[deleteProperty] 3. photos:', phErr ?? 'OK')
      if (phErr) { console.error('[deleteProperty] BAIL: photos', phErr); return }

      // 4. delete property — ON DELETE SET NULL fires automatically on qrcodes.property_id
      //    (no manual unlink needed; Postgres handles it within the same transaction)
      const { error: propErr } = await supabase.from('properties').delete().eq('id', prop.id)
      console.log('[deleteProperty] 4. property:', propErr ?? 'OK')
      if (propErr) { console.error('[deleteProperty] BAIL: property', propErr); return }

      // Verify qrcodes were unlinked (property_id should now be NULL)
      const { data: remaining } = await supabase.from('qrcodes').select('id').eq('property_id', prop.id)
      console.log('[deleteProperty] qr verify: remaining with old property_id =', remaining?.length ?? 0)

      setProperties(prev => prev.filter(p => p.id !== prop.id))
      console.log('[deleteProperty] done ✓')
    } finally {
      setDeletingId(null)
    }
  }

  // sort by most leads first
  const sortedProperties = [...properties].sort((a, b) => (leadCounts[b.id] || 0) - (leadCounts[a.id] || 0))

  const canAddProperty = plan === 'pro' || properties.length < 1

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
            {canAddProperty ? (
              <Link href="/dashboard/new-property" style={{ background: C.purple, color: '#fff', fontSize: 13, fontWeight: 700, padding: '8px 18px', borderRadius: 9, textDecoration: 'none' }}>
                + Add Property
              </Link>
            ) : (
              <Link href="/dashboard/billing" style={{ background: C.purple, color: '#fff', fontSize: 13, fontWeight: 700, padding: '8px 18px', borderRadius: 9, textDecoration: 'none' }}>
                ⚡ Upgrade for More
              </Link>
            )}
          </div>

          <div style={{ padding: '24px 28px' }}>
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
                    qrCount={qrCounts[prop.id] || 0}
                    toggling={togglingId === prop.id}
                    onToggle={() => toggleActive(prop)}
                    onDelete={() => deleteProperty(prop)}
                    onArchive={() => archiveProperty(prop)}
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
    </DashboardLayout>
  )
}
