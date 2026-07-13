'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '../../../components/DashboardLayout'

export default function QrCodesPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/dashboard/signs')
  }, [])

  return (
    <DashboardLayout>
      <div style={{ padding: 40, color: '#ffffff', fontFamily: 'sans-serif' }}>
        Redirecting to Signs...
      </div>
    </DashboardLayout>
  )
}
