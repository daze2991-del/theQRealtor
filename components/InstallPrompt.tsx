'use client'

import { useEffect, useState } from 'react'

type Mode = 'android' | 'ios' | null

export default function InstallPrompt() {
  const [mode, setMode] = useState<Mode>(null)
  const [prompt, setPrompt] = useState<any>(null)

  useEffect(() => {
    // Already installed as standalone
    if (window.matchMedia('(display-mode: standalone)').matches) return
    if ((window.navigator as any).standalone === true) return
    // Previously dismissed
    if (sessionStorage.getItem('pwa-dismissed')) return

    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream

    if (isIOS) {
      setMode('ios')
      return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setPrompt(e)
      setMode('android')
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!prompt) return
    prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') dismiss()
    setPrompt(null)
  }

  const dismiss = () => {
    sessionStorage.setItem('pwa-dismissed', '1')
    setMode(null)
  }

  if (!mode) return null

  return (
    <div style={{
      position: 'fixed', bottom: 20, left: 16, right: 16,
      maxWidth: 420, margin: '0 auto',
      background: '#161A22', border: '1px solid #00D4AA',
      borderRadius: 16, padding: '16px 18px',
      display: 'flex', alignItems: 'flex-start', gap: 14,
      boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
      zIndex: 9999,
      fontFamily: 'sans-serif',
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12,
        background: '#00D4AA', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 26, fontWeight: 900, color: '#00130F',
      }}>
        R
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: '#F0F2F5', marginBottom: 4 }}>
          Add theqrealtor to Home Screen
        </div>

        {mode === 'ios' ? (
          <div style={{ fontSize: 13, color: '#9CA3AF', lineHeight: 1.5 }}>
            Tap <strong style={{ color: '#F0F2F5' }}>Share</strong>{' '}
            <span style={{ fontSize: 15 }}>⎙</span> then{' '}
            <strong style={{ color: '#F0F2F5' }}>Add to Home Screen</strong>.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 12 }}>
              Get faster access and offline support.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleInstall}
                style={{
                  background: '#00D4AA', color: '#00130F',
                  border: 'none', borderRadius: 8,
                  padding: '8px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}
              >
                Install
              </button>
              <button
                onClick={dismiss}
                style={{
                  background: 'transparent', color: '#6B7280',
                  border: '1px solid #374151', borderRadius: 8,
                  padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Not now
              </button>
            </div>
          </>
        )}
      </div>

      <button
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          background: 'none', border: 'none', color: '#4B5563',
          cursor: 'pointer', fontSize: 22, lineHeight: 1,
          padding: 0, flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  )
}
