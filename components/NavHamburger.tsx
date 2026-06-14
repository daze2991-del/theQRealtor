'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

export default function NavHamburger() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', h)
    return () => document.removeEventListener('click', h)
  }, [open])

  return (
    <div ref={ref} className="nav-hamburger" style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        style={{
          background: 'transparent', border: '1px solid #1E3A5F',
          borderRadius: 8, color: '#CBD5E1', fontSize: 18,
          width: 38, height: 38, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {open ? '✕' : '☰'}
      </button>

      {open && (
        <nav aria-label="Mobile navigation" style={{
          position: 'absolute', top: 'calc(100% + 10px)', right: 0,
          background: '#1E293B', border: '1px solid #1E3A5F',
          borderRadius: 14, padding: '8px', minWidth: 220,
          boxShadow: '0 16px 48px rgba(0,0,0,0.6)', zIndex: 200,
          display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          <a href="#features" onClick={() => setOpen(false)} style={{ padding: '11px 16px', fontSize: 15, color: '#CBD5E1', textDecoration: 'none', borderRadius: 8, display: 'block', fontWeight: 500 }}>Features</a>
          <a href="#pricing"  onClick={() => setOpen(false)} style={{ padding: '11px 16px', fontSize: 15, color: '#CBD5E1', textDecoration: 'none', borderRadius: 8, display: 'block', fontWeight: 500 }}>Pricing</a>
          <Link href="/auth"  onClick={() => setOpen(false)} style={{ padding: '11px 16px', fontSize: 15, color: '#CBD5E1', textDecoration: 'none', borderRadius: 8, display: 'block', fontWeight: 500 }}>Sign In</Link>
          <div style={{ height: 1, background: '#1E3A5F', margin: '4px 0' }} />
          <Link href="/auth" onClick={() => setOpen(false)} style={{
            display: 'block', textAlign: 'center',
            padding: '12px 16px', fontSize: 14, fontWeight: 700,
            background: '#2563EB', color: '#fff', borderRadius: 9,
            textDecoration: 'none',
          }}>
            Start Free Trial →
          </Link>
        </nav>
      )}
    </div>
  )
}
