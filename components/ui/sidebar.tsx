'use client'

import React, { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useTheme, useToggleDark } from './theme'
import {
  IPhone, IUsers, ICalendar, IBarChart, ISettings, ILogOut,
  IKanban, IBullhorn, ILightbulb, ILayers, IZap, IMail,
  IMoon, ISun,
} from './icons'

// ── Nav items ─────────────────────────────────────────────────────────────────

type NavGroup = 'main' | 'growth' | 'secondary'

const NAV_ITEMS: {
  id: string; label: string; Icon: (p: { size?: number }) => React.ReactElement
  group: NavGroup; href: string | null
}[] = [
  { id: 'dashboard',    label: 'Cuộc gọi',        Icon: IPhone,      group: 'main',      href: '/dashboard' },
  { id: 'contacts',     label: 'Data khách',       Icon: IUsers,      group: 'main',      href: '/contacts' },
  { id: 'pipeline',     label: 'Khách tiềm năng',  Icon: IKanban,     group: 'main',      href: null },
  { id: 'appointments', label: 'Lịch hẹn',         Icon: ICalendar,   group: 'main',      href: '/appointments' },
  { id: 'email',        label: 'Email',            Icon: IMail,       group: 'main',      href: null },
  { id: 'campaigns',    label: 'Chiến dịch AI',    Icon: IBullhorn,   group: 'main',      href: null },
  { id: 'insights',     label: 'Gợi ý AI',         Icon: ILightbulb,  group: 'main',      href: null },
  { id: 'abtesting',    label: 'Thử nghiệm A/B',   Icon: ILayers,     group: 'growth',    href: null },
  { id: 'sms',          label: 'SMS & Zalo',        Icon: IZap,        group: 'growth',    href: null },
  { id: 'analytics',    label: 'Báo cáo',           Icon: IBarChart,   group: 'secondary', href: '/analytics' },
  { id: 'settings',     label: 'Cài đặt',           Icon: ISettings,   group: 'secondary', href: '/settings' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name?: string | null) {
  if (!name) return 'A'
  const parts = name.trim().split(' ')
  return parts.length > 1 ? parts[parts.length - 1][0].toUpperCase() : parts[0][0].toUpperCase()
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

export function Sidebar({ clientName }: { clientName?: string | null }) {
  const t = useTheme()
  const toggleDark = useToggleDark()
  const router = useRouter()
  const pathname = usePathname()
  const [hovered, setHovered] = useState<string | null>(null)

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function navigate(href: string | null) {
    if (href) router.push(href)
  }

  const mainItems      = NAV_ITEMS.filter(n => n.group === 'main')
  const growthItems    = NAV_ITEMS.filter(n => n.group === 'growth')
  const secondaryItems = NAV_ITEMS.filter(n => n.group === 'secondary')

  function NavBtn({ item }: { item: typeof NAV_ITEMS[0] }) {
    const active = item.href ? pathname.startsWith(item.href) : false
    const isHov  = hovered === item.id
    const upcoming = item.href === null
    const { Icon } = item

    return (
      <button
        key={item.id}
        onClick={() => navigate(item.href)}
        onMouseEnter={() => setHovered(item.id)}
        onMouseLeave={() => setHovered(null)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 12px', borderRadius: 8, border: 'none',
          cursor: upcoming ? 'default' : 'pointer',
          fontSize: 13, fontWeight: active ? 600 : 400,
          background: active ? 'rgba(0,180,216,0.08)' : isHov && !upcoming ? t.navHover : 'transparent',
          color: upcoming ? t.text3 : active ? '#00b4d8' : t.text2,
          textAlign: 'left', transition: 'all 0.12s',
          borderLeft: active ? '2.5px solid #00b4d8' : '2.5px solid transparent',
          fontFamily: 'inherit', width: '100%', opacity: upcoming ? 0.6 : 1,
        }}
      >
        <Icon size={15} />
        <span style={{ flex: 1 }}>{item.label}</span>
        {upcoming && (
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
            color: t.text3, background: t.mutedBg,
            padding: '1px 5px', borderRadius: 4,
          }}>
            SỚM
          </span>
        )}
      </button>
    )
  }

  function GroupLabel({ label }: { label: string }) {
    return (
      <div style={{
        fontSize: 9, fontWeight: 700, color: t.text3,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        padding: '10px 12px 6px',
      }}>
        {label}
      </div>
    )
  }

  return (
    <aside style={{
      width: 224, minHeight: '100vh',
      background: t.surface,
      borderRight: `1px solid ${t.border}`,
      display: 'flex', flexDirection: 'column',
      position: 'fixed', top: 0, left: 0, zIndex: 40,
      transition: 'background 0.2s',
    }}>

      {/* Logo */}
      <div style={{ padding: '18px 20px 16px', borderBottom: `1px solid ${t.borderLight}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: 'linear-gradient(135deg,#00b4d8,#0077a8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <span style={{ color: '#fff', fontSize: 18 }}>✦</span>
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.03em', color: '#00b4d8' }}>
                AutoVoice Pro
              </div>
              <div style={{ fontSize: 10, color: t.text3, marginTop: 1 }}>AI Voice Agent · CRM</div>
            </div>
          </div>

          {/* Dark mode toggle */}
          <button
            onClick={toggleDark}
            title={t.dark ? 'Chế độ sáng' : 'Chế độ tối'}
            style={{
              background: 'none', border: `1px solid ${t.border}`,
              borderRadius: 7, padding: '5px 6px', cursor: 'pointer',
              color: t.text3, display: 'flex', alignItems: 'center',
              flexShrink: 0, transition: 'all 0.15s',
            }}
          >
            {t.dark ? <ISun size={13} /> : <IMoon size={13} />}
          </button>
        </div>
      </div>

      {/* Nav */}
      <nav style={{
        flex: 1, padding: '12px 10px',
        display: 'flex', flexDirection: 'column', gap: 2,
        overflowY: 'auto',
      }}>
        <GroupLabel label="Chính" />
        {mainItems.map(item => <NavBtn key={item.id} item={item} />)}

        <GroupLabel label="Tăng trưởng" />
        {growthItems.map(item => <NavBtn key={item.id} item={item} />)}

        <GroupLabel label="Hệ thống" />
        {secondaryItems.map(item => <NavBtn key={item.id} item={item} />)}
      </nav>

      {/* Bottom: client info + logout */}
      <div style={{ padding: '12px 10px 20px', borderTop: `1px solid ${t.borderLight}` }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 12px', borderRadius: 8, marginBottom: 4,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: '#00b4d8', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 12, fontWeight: 600,
          }}>
            {initials(clientName)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 12, fontWeight: 600, color: t.text1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {clientName ?? 'AutoVoice Pro'}
            </div>
            <div style={{ fontSize: 10, color: t.text3 }}>Phòng khám</div>
          </div>
        </div>

        <button
          onClick={logout}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '7px 12px', borderRadius: 8,
            border: `1px dashed ${t.border}`, cursor: 'pointer',
            background: 'transparent', color: t.text3,
            fontSize: 11, fontFamily: 'inherit', transition: 'all 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = t.navHover; e.currentTarget.style.color = t.text2 }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = t.text3 }}
        >
          <ILogOut size={12} /> Đăng xuất
        </button>
      </div>
    </aside>
  )
}
