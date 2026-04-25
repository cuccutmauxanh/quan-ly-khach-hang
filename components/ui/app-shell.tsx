'use client'

import React from 'react'
import { Sidebar } from './sidebar'
import { useTheme } from './theme'

export default function AppShell({ children, clientName }: {
  children: React.ReactNode
  clientName?: string | null
}) {
  const t = useTheme()
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar clientName={clientName} />
      <main style={{
        marginLeft: 224,
        flex: 1,
        padding: '28px 32px',
        minWidth: 0,
        background: t.bg,
      }}>
        {children}
      </main>
    </div>
  )
}
