'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'

export const LIGHT = {
  bg: '#f8f7f4',
  surface: '#fff',
  surfaceSubtle: '#faf9f7',
  border: '#e8e3d9',
  borderLight: '#f0ece3',
  text1: '#1c1a17',
  text2: '#6b6557',
  text3: '#a8a29a',
  tagBg: '#f0ece3',
  navHover: '#f8f7f4',
  inputBg: '#fff',
  tableHover: '#f8f7f4',
  mutedBg: '#f0ece3',
  dark: false as const,
}

export const DARK = {
  bg: '#0b1121',
  surface: '#131d30',
  surfaceSubtle: '#0f1829',
  border: '#1e2d47',
  borderLight: '#162035',
  text1: '#e2e8f4',
  text2: '#7b8fad',
  text3: '#3d5070',
  tagBg: '#162035',
  navHover: '#162035',
  inputBg: '#0b1121',
  tableHover: '#162035',
  mutedBg: '#162035',
  dark: true as const,
}

export type Theme = typeof LIGHT | typeof DARK

const ThemeCtx = createContext<Theme>(LIGHT)
const ToggleCtx = createContext<() => void>(() => {})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem('avp-theme') === 'dark') setIsDark(true)
    } catch {}
  }, [])

  function toggle() {
    setIsDark(d => {
      try { localStorage.setItem('avp-theme', !d ? 'dark' : 'light') } catch {}
      return !d
    })
  }

  const theme = isDark ? DARK : LIGHT

  return (
    <ToggleCtx.Provider value={toggle}>
      <ThemeCtx.Provider value={theme}>
        <div style={{
          minHeight: '100vh',
          background: theme.bg,
          color: theme.text1,
          transition: 'background 0.2s, color 0.2s',
          fontFamily: 'var(--font-geist-sans, system-ui, -apple-system, sans-serif)',
        }}>
          {children}
        </div>
      </ThemeCtx.Provider>
    </ToggleCtx.Provider>
  )
}

export function useTheme() { return useContext(ThemeCtx) }
export function useToggleDark() { return useContext(ToggleCtx) }
