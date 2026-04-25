'use client'

import React, { useState } from 'react'
import { useTheme, Theme } from './theme'

// ── Helpers ───────────────────────────────────────────────────────────────────

const AVATAR_PALETTE = ['#00b4d8', '#2563eb', '#7c3aed', '#d97706', '#dc2626', '#0891b2']

function initials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(' ')
  return parts.length > 1
    ? parts[parts.length - 1][0].toUpperCase()
    : parts[0][0].toUpperCase()
}

// ── Avatar ────────────────────────────────────────────────────────────────────

export function Avatar({ name, size = 32, colorIndex = 0 }: {
  name?: string | null; size?: number; colorIndex?: number
}) {
  const bg = AVATAR_PALETTE[colorIndex % AVATAR_PALETTE.length]
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: size * 0.38, fontWeight: 600,
      flexShrink: 0, letterSpacing: '-0.01em',
    }}>
      {initials(name)}
    </div>
  )
}

// ── Badge ─────────────────────────────────────────────────────────────────────

type BadgeColor = 'green' | 'blue' | 'amber' | 'red' | 'violet' | 'gray'

const LIGHT_COLORS: Record<BadgeColor, { bg: string; text: string; border: string }> = {
  green:  { bg: '#f0faf6', text: '#0c7c5e', border: '#bfe9d6' },
  blue:   { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' },
  amber:  { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
  red:    { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' },
  violet: { bg: '#f5f3ff', text: '#7c3aed', border: '#ddd6fe' },
  gray:   { bg: '#f5f4f1', text: '#6b6557', border: '#e0dbd0' },
}

const DARK_COLORS: Record<BadgeColor, { bg: string; text: string; border: string }> = {
  green:  { bg: 'rgba(0,180,216,0.12)',  text: '#4dd9e8', border: 'rgba(0,180,216,0.2)' },
  blue:   { bg: 'rgba(37,99,235,0.15)',  text: '#60a5fa', border: 'rgba(37,99,235,0.25)' },
  amber:  { bg: 'rgba(217,119,6,0.15)',  text: '#fbbf24', border: 'rgba(217,119,6,0.25)' },
  red:    { bg: 'rgba(220,38,38,0.15)',  text: '#f87171', border: 'rgba(220,38,38,0.25)' },
  violet: { bg: 'rgba(124,58,237,0.15)', text: '#a78bfa', border: 'rgba(124,58,237,0.25)' },
  gray:   { bg: 'rgba(107,101,87,0.15)', text: '#a8a29a', border: 'rgba(107,101,87,0.25)' },
}

export function Badge({ children, color = 'gray' }: {
  children: React.ReactNode; color?: BadgeColor
}) {
  const t = useTheme()
  const palette = t.dark ? DARK_COLORS : LIGHT_COLORS
  const c = palette[color] ?? palette.gray
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500,
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  )
}

// ── Btn ───────────────────────────────────────────────────────────────────────

type BtnVariant = 'primary' | 'ghost' | 'danger'

export function Btn({ children, onClick, variant = 'primary', size = 'sm', disabled, style: sx }: {
  children: React.ReactNode
  onClick?: () => void
  variant?: BtnVariant
  size?: 'sm' | 'xs'
  disabled?: boolean
  style?: React.CSSProperties
}) {
  const t = useTheme()
  const [hov, setHov] = useState(false)

  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
    borderRadius: 8, fontWeight: 500, fontFamily: 'inherit',
    transition: 'all 0.12s', opacity: disabled ? 0.5 : 1,
    fontSize: size === 'sm' ? 13 : 12,
    padding: size === 'sm' ? '8px 14px' : '5px 10px',
  }

  const variantStyles: Record<BtnVariant, React.CSSProperties> = {
    primary: { background: hov ? '#0099bb' : '#00b4d8', color: '#fff' },
    ghost:   { background: hov ? t.mutedBg : 'transparent', color: t.text2, border: `1px solid ${t.border}` },
    danger:  { background: hov ? '#dc2626' : '#ef4444', color: '#fff' },
  }

  return (
    <button
      onClick={!disabled ? onClick : undefined}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ ...base, ...variantStyles[variant], ...sx }}
    >
      {children}
    </button>
  )
}
