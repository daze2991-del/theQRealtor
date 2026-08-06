'use client'

import { useEffect, useState } from 'react'
import { Star, X } from 'lucide-react'

// Weekly in-app feedback card. Non-blocking (no overlay), dismissible, and shown
// at most once per browser session. Eligibility is decided server-side
// (/api/feedback/eligibility); sessionStorage only guards against a same-session
// repeat, it is never the source of truth for eligibility.

const SESSION_KEY = 'qr_feedback_seen'

const C = {
  card:    '#1A1A24',
  border:  '#252533',
  purple:  '#7C3AED',
  purpleL: '#8B5CF6',
  text:    '#FFFFFF',
  sub:     '#C4C4D4',
  muted:   '#6B7280',
} as const

type Phase = 'hidden' | 'form' | 'thanks'

export default function FeedbackPrompt() {
  const [phase, setPhase] = useState<Phase>('hidden')
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    // Same-session guard — never surface twice in one session.
    if (typeof window !== 'undefined' && sessionStorage.getItem(SESSION_KEY)) return

    let cancelled = false
    const check = async () => {
      try {
        const res = await fetch('/api/feedback/eligibility')
        if (!res.ok) return
        const { eligible } = await res.json()
        if (cancelled || !eligible) return

        sessionStorage.setItem(SESSION_KEY, '1')
        setPhase('form')
        // Record that it was shown (fire-and-forget).
        fetch('/api/feedback/shown', { method: 'POST' }).catch(() => {})
      } catch {
        /* eligibility is best-effort; stay hidden on error */
      }
    }
    check()
    return () => { cancelled = true }
  }, [])

  const dismiss = () => {
    setPhase('hidden')
    fetch('/api/feedback/dismiss', { method: 'POST' }).catch(() => {})
  }

  const submit = async () => {
    if (rating < 1 || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/feedback/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment }),
      })
      if (res.ok) {
        setPhase('thanks')
        setTimeout(() => setPhase('hidden'), 2600)
      }
    } finally {
      setBusy(false)
    }
  }

  if (phase === 'hidden') return null

  return (
    <>
      <style>{`
        .fb-card {
          position: fixed; z-index: 60; box-sizing: border-box;
          right: 20px; bottom: 20px; width: 360px;
          border-radius: 16px;
        }
        @media (max-width: 768px) {
          .fb-card {
            right: 0; left: 0; bottom: 0; width: 100%;
            border-radius: 16px 16px 0 0;
          }
        }
      `}</style>

      <div
        className="fb-card"
        role="dialog"
        aria-label="Share feedback"
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          boxShadow: '0 16px 48px rgba(0,0,0,0.45)',
          padding: 20,
          fontFamily: 'sans-serif',
          animation: 'none',
        }}
      >
        {phase === 'thanks' ? (
          <div style={{ padding: '8px 4px', textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>
              Thank you 🙏
            </div>
            <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.5 }}>
              Your feedback helps us make theqrealtor better.
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 4 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
                How&apos;s theqrealtor working for you?
              </div>
              <button
                onClick={dismiss}
                aria-label="Not now"
                style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', padding: 2, marginTop: -2, flexShrink: 0, display: 'flex' }}
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 14, lineHeight: 1.5 }}>
              A quick rating helps us focus on what matters. Takes 10 seconds.
            </div>

            {/* Stars */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              {[1, 2, 3, 4, 5].map(n => {
                const active = (hover || rating) >= n
                return (
                  <button
                    key={n}
                    onClick={() => setRating(n)}
                    onMouseEnter={() => setHover(n)}
                    onMouseLeave={() => setHover(0)}
                    aria-label={`${n} star${n === 1 ? '' : 's'}`}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 2, display: 'flex' }}
                  >
                    <Star
                      size={26}
                      style={{ color: active ? '#F5B301' : C.muted, fill: active ? '#F5B301' : 'transparent', transition: 'color 0.12s, fill 0.12s' }}
                    />
                  </button>
                )
              })}
            </div>

            {/* Optional comment */}
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value.slice(0, 2000))}
              placeholder="Anything you'd like us to know? (optional)"
              rows={3}
              style={{
                width: '100%', boxSizing: 'border-box', resize: 'none',
                background: '#13131A', border: `1px solid ${C.border}`, borderRadius: 10,
                color: C.text, fontSize: 13, padding: '10px 12px', marginBottom: 14,
                fontFamily: 'sans-serif', outline: 'none',
              }}
            />

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={dismiss}
                style={{
                  flex: '0 0 auto', background: 'transparent', border: `1px solid ${C.border}`,
                  color: C.sub, borderRadius: 10, padding: '9px 14px', fontSize: 13, fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Not now
              </button>
              <button
                onClick={submit}
                disabled={rating < 1 || busy}
                style={{
                  flex: 1, border: 'none', borderRadius: 10, padding: '9px 14px',
                  fontSize: 13, fontWeight: 600, color: '#fff',
                  background: rating < 1 ? '#3A3550' : C.purple,
                  cursor: rating < 1 || busy ? 'not-allowed' : 'pointer',
                  opacity: busy ? 0.7 : 1, transition: 'background 0.15s',
                }}
              >
                {busy ? 'Sending…' : 'Send feedback'}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
