import './globals.css'
import type { Metadata, Viewport } from 'next'
import ServiceWorkerRegistrar from '../components/ServiceWorkerRegistrar'
import InstallPrompt from '../components/InstallPrompt'

export const metadata: Metadata = {
  title: 'theqrealtor',
  description: 'QR sign tracking and lead capture for real estate agents.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'theqrealtor',
  },
}

export const viewport: Viewport = {
  themeColor: '#00D4AA',
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <ServiceWorkerRegistrar />
        <InstallPrompt />
      </body>
    </html>
  )
}
