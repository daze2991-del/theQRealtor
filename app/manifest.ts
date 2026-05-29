import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RealtQR',
    short_name: 'RealtQR',
    description: 'QR sign tracking and lead capture for real estate agents.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#0A0C10',
    theme_color: '#00D4AA',
    orientation: 'portrait',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/api/icon?size=192', sizes: '192x192', type: 'image/png' },
      { src: '/api/icon?size=512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/api/icon?size=512', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  }
}
