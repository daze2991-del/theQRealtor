import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: 180, height: 180,
        background: '#534AB7',
        borderRadius: 38,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span style={{ color: '#ffffff', fontSize: 72, fontWeight: 700, fontFamily: 'sans-serif', lineHeight: 1, letterSpacing: '-2px' }}>
        qr
      </span>
    </div>,
    { ...size },
  )
}
