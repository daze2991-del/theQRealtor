'use client'

import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'

interface MotivationCount {
  motivation: string
  count: number
}

const CONFIG: Record<string, { label: string; color: string }> = {
  hot:       { label: 'Hot',       color: '#ef4444' },
  motivated: { label: 'Motivated', color: '#f59e0b' },
  warm:      { label: 'Warm',      color: '#10b981' },
  cold:      { label: 'Cold',      color: '#185fa5' },
}

interface Props {
  data: MotivationCount[]
  total: number
  loading?: boolean
}

export default function MotivationDonut({ data, total, loading }: Props) {
  const card: React.CSSProperties = {
    background: '#fff',
    border: '0.5px solid #e5e7eb',
    borderRadius: 12,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  }

  const chartData = data
    .filter(d => (CONFIG[d.motivation ?? '']))
    .map(d => ({ name: d.motivation, value: d.count, color: CONFIG[d.motivation].color }))

  return (
    <div style={card}>
      <span style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>Lead motivation</span>

      {loading ? (
        <div style={{ height: 140, background: '#f3f4f6', borderRadius: 8 }} />
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ position: 'relative', width: 140, height: 140, flexShrink: 0 }}>
            <ResponsiveContainer width={140} height={140}>
              <PieChart>
                <Pie
                  data={chartData.length > 0 ? chartData : [{ name: 'none', value: 1, color: '#e5e7eb' }]}
                  cx="50%" cy="50%"
                  innerRadius={45} outerRadius={65}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {(chartData.length > 0 ? chartData : [{ color: '#e5e7eb' }]).map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
            }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>{total}</span>
              <span style={{ fontSize: 10, color: '#9ca3af' }}>leads</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
            {Object.entries(CONFIG).map(([key, cfg]) => {
              const row = data.find(d => d.motivation === key)
              const count = row?.count ?? 0
              const pct = total > 0 ? Math.round((count / total) * 100) : 0
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: '#374151', flex: 1 }}>{cfg.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{pct}%</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
