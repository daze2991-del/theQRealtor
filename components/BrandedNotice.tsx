import type { ReactNode } from 'react'

// Friendly full-page notice in the theqrealtor brand — logo, a calm headline and
// one line of help. Used wherever a public link points at something that isn't
// available (unknown/inactive sign, expired report). Deliberately no error
// wording: a buyer who scans an old sign has done nothing wrong.
export default function BrandedNotice({ title, children }: { title: string; children?: ReactNode }) {
  const font = "-apple-system, 'Helvetica Neue', Arial, sans-serif"
  return (
    <main style={{ minHeight: '100vh', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: font }}>
      <div style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
        <div style={{ marginBottom: 28 }}>
          <span style={{ fontFamily: font, letterSpacing: '-0.5px' }}>
            <span style={{ fontSize: '18px', fontWeight: 300, color: '#1a1a1a' }}>the</span>
            <span style={{ fontSize: '18px', fontWeight: 700, color: '#534AB7' }}>qr</span>
            <span style={{ fontSize: '18px', fontWeight: 500, color: '#1a1a1a' }}>ealtor</span>
          </span>
        </div>
        <div style={{ background: '#EEEDFE', borderRadius: 20, padding: '44px 28px' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1a1a1a', margin: '0 0 10px', lineHeight: 1.3 }}>{title}</h1>
          {children && <p style={{ fontSize: 14, color: '#4B5563', margin: 0, lineHeight: 1.6 }}>{children}</p>}
        </div>
      </div>
    </main>
  )
}

export const SIGN_INACTIVE_TITLE = "This sign isn't active right now"
export const SIGN_INACTIVE_BODY = 'Please check back soon, or contact the listing agent directly.'
export const REPORT_UNAVAILABLE_TITLE = "This report link isn't available"
export const REPORT_UNAVAILABLE_BODY = 'Ask your agent to send you a fresh link.'
