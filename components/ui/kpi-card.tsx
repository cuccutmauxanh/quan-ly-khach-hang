'use client'

import React from 'react'
import { useTheme } from './theme'
import { ITrend } from './icons'

export function KpiCard({ label, value, icon, accentColor = '#00bcd4', delta }: {
  label: string
  value: number | string
  icon?: React.ReactNode
  accentColor?: string
  delta?: string | null
}) {
  const t = useTheme()
  return (
    <div style={{
      background: t.surface,
      border: `1px solid ${t.border}`,
      borderRadius: 12,
      padding: '18px 20px',
      borderTop: `3px solid ${accentColor}`,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      minWidth: 0,
      transition: 'all 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: t.text3, fontWeight: 500 }}>{label}</span>
        <span style={{ color: accentColor, opacity: 0.8 }}>{icon}</span>
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, color: t.text1, lineHeight: 1 }}>{value}</div>
      {delta && (
        <div style={{ fontSize: 11, color: '#00a0b8', display: 'flex', alignItems: 'center', gap: 3 }}>
          <ITrend size={11} />{delta}
        </div>
      )}
    </div>
  )
}
