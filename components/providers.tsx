'use client'

import { ThemeProvider } from '@/components/ui/theme'
import { ToastProvider } from '@/components/toast'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>{children}</ToastProvider>
    </ThemeProvider>
  )
}
