import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { ReactElement } from 'react'

export const runtime = 'edge'

export function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const raw = searchParams.get('size')
  const size = raw === '512' ? 512 : 192

  return new ImageResponse(
    (
      <div
        style={{
          width: size, height: size,
          background: '#534AB7',
          borderRadius: size * 0.2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ color: '#ffffff', fontSize: size * 0.38, fontWeight: 700, fontFamily: 'sans-serif', lineHeight: 1, letterSpacing: '-0.5px' }}>
          qr
        </span>
      </div>
    ) as ReactElement,
    { width: size, height: size },
  )
}
