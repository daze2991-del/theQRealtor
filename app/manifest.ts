import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'theqrealtor',
    short_name: 'theqrealtor',
    description: 'QR sign tracking and lead capture for real estate agents.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#534AB7',
    theme_color: '#534AB7',
    orientation: 'portrait',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/api/icon?size=192', sizes: '192x192', type: 'image/png' },
      { src: '/api/icon?size=512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/api/icon?size=512', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  }
}
