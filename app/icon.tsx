import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: 32, height: 32,
        background: '#00D4AA',
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span style={{ color: '#00130F', fontSize: 18, fontWeight: 900, fontFamily: 'sans-serif', lineHeight: 1 }}>
        R
      </span>
    </div>,
    { ...size },
  )
}
