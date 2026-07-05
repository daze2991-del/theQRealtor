import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

function RealtQRIcon({ size }: { size: number }) {
  const radius = Math.round(size * 0.18)
  const font = Math.round(size * 0.38)
  return (
    <div
      style={{
        width: size,
        height: size,
        background: '#534AB7',
        borderRadius: radius,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span style={{ color: '#ffffff', fontSize: font, fontWeight: 700, fontFamily: 'sans-serif', lineHeight: 1, letterSpacing: '-0.04em' }}>
        qr
      </span>
    </div>
  )
}

export async function GET(req: NextRequest) {
  const size = Math.min(512, Math.max(16, Number(req.nextUrl.searchParams.get('size')) || 192))
  return new ImageResponse(<RealtQRIcon size={size} />, { width: size, height: size })
}
