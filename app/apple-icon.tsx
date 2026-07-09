import { ImageResponse } from 'next/og'

export const size = { width: 192, height: 192 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: 192, height: 192,
        background: '#534AB7',
        borderRadius: 192 * 0.2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span style={{ color: '#ffffff', fontSize: 192 * 0.38, fontWeight: 700, fontFamily: 'sans-serif', lineHeight: 1, letterSpacing: '-0.5px' }}>
        qr
      </span>
    </div>,
    { ...size },
  )
}
