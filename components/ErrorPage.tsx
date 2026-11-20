'use client'

// Friendly full-page "something went wrong" in the theqrealtor brand. Shared by
// app/error.tsx and app/global-error.tsx. Shows NO error text, stack or digest —
// the error itself is never rendered, only passed to the retry callback owner.
export default function ErrorPage({ reset }: { reset: () => void }) {
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
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1a1a1a', margin: '0 0 10px', lineHeight: 1.3 }}>Something went wrong.</h1>
          <p style={{ fontSize: 14, color: '#4B5563', margin: '0 0 24px', lineHeight: 1.6 }}>Please try again.</p>
          <button type="button" onClick={() => reset()}
            style={{ background: '#534AB7', color: '#FFFFFF', border: 'none', borderRadius: 10, padding: '12px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: font }}>
            Try again
          </button>
          <div style={{ marginTop: 18 }}>
            <a href="/" style={{ fontSize: 14, color: '#534AB7', textDecoration: 'none', fontWeight: 500 }}>Go to the home page</a>
          </div>
        </div>
      </div>
    </main>
  )
}
