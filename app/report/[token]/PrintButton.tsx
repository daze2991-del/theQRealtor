'use client'

import { useEffect } from 'react'
import { Download } from 'lucide-react'

export default function PrintButton() {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('print') === 'true') {
      const t = setTimeout(() => window.print(), 600)
      return () => clearTimeout(t)
    }
  }, [])

  return (
    <button
      className="no-print"
      onClick={() => window.print()}
      style={{
        fontSize: 12, fontWeight: 700,
        background: '#7C3AED', color: '#fff',
        border: 'none', borderRadius: 8,
        padding: '7px 13px', cursor: 'pointer',
        letterSpacing: '-0.01em', whiteSpace: 'nowrap',
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}
    >
      <Download size={13} /> Download PDF
    </button>
  )
}
