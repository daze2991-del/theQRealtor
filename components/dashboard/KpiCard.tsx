'use client'

import { LineChart, Line, ResponsiveContainer } from 'recharts'

interface KpiCardProps {
  title: string
  count: number | string
  icon: React.ReactNode
  iconBg: string
  trend?: string
  trendPositive?: boolean
  sparkData: { v: number }[]
  sparkColor: string
  badge?: React.ReactNode
  loading?: boolean
}

export default function KpiCard({ title, count, icon, iconBg, trend, trendPositive, sparkData, sparkColor, badge, loading }: KpiCardProps) {
  const card: React.CSSProperties = {
    background: '#fff',
    border: '0.5px solid #e5e7eb',
    borderRadius: 12,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ background: iconBg, borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {icon}
          </div>
          <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>{title}</span>
        </div>
      </div>

      {loading ? (
        <div style={{ height: 28, background: '#f3f4f6', borderRadius: 6, width: '60%' }} />
      ) : (
        <div style={{ fontSize: 28, fontWeight: 700, color: '#111827', lineHeight: 1 }}>{count}</div>
      )}

      {badge && <div>{badge}</div>}

      {trend && !loading && (
        <div style={{ fontSize: 12, color: trendPositive ? '#16a34a' : '#dc2626', fontWeight: 500 }}>{trend}</div>
      )}

      <div style={{ height: 40, marginTop: 4 }}>
        <ResponsiveContainer width="100%" height={40}>
          <LineChart data={sparkData}>
            <Line type="monotone" dataKey="v" stroke={sparkColor} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
