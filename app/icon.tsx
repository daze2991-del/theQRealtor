import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: 32, height: 32,
        background: '#534AB7',
        borderRadius: 7,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span style={{ color: '#ffffff', fontSize: 13, fontWeight: 700, fontFamily: 'sans-serif', lineHeight: 1, letterSpacing: '-0.5px' }}>
        qr
      </span>
    </div>,
    { ...size },
  )
}
