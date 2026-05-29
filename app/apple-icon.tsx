import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: 180, height: 180,
        background: '#00D4AA',
        borderRadius: 38,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span style={{ color: '#00130F', fontSize: 96, fontWeight: 900, fontFamily: 'sans-serif', lineHeight: 1 }}>
        R
      </span>
    </div>,
    { ...size },
  )
}
