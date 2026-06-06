import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

function RealtQRIcon({ size }: { size: number }) {
  const radius = Math.round(size * 0.18)
  const font = Math.round(size * 0.56)
  return (
    <div
      style={{
        width: size,
        height: size,
        background: '#0f172a',
        borderRadius: radius,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span style={{ color: '#8b5cf6', fontSize: font, fontWeight: 900, fontFamily: 'sans-serif', lineHeight: 1 }}>
        Q
      </span>
    </div>
  )
}

export async function GET(req: NextRequest) {
  const size = Math.min(512, Math.max(16, Number(req.nextUrl.searchParams.get('size')) || 192))
  return new ImageResponse(<RealtQRIcon size={size} />, { width: size, height: size })
}
