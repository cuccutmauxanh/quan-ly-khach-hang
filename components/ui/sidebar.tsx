'use client'

import React, { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useTheme, useToggleDark } from './theme'
import {
  IUsers, IBarChart, ISettings, ILogOut,
  IBullhorn, IZap, IMic, IHome,
  IMoon, ISun, IClock, IHeart, IMegaphone,
} from './icons'

// ── Nav items ─────────────────────────────────────────────────────────────────

type NavGroup = 'home' | 'campaigns' | 'tracking' | 'customers' | 'analytics' | 'system'

const NAV_ITEMS: {
  id: string; label: string; sublabel?: string; Icon: (p: { size?: number }) => React.ReactElement
  group: NavGroup; href: string | null
}[] = [
  { id: 'dashboard',    label: 'Tổng quan',          sublabel: 'Bảng điều khiển',  Icon: IHome,      group: 'home',      href: '/dashboard' },
  { id: 'campaigns',    label: 'Chiến dịch AI',    sublabel: 'Gọi ra tự động',   Icon: IBullhorn,  group: 'campaigns', href: '/campaigns' },
  { id: 'inbound',      label: 'Lễ Tân AI',         sublabel: 'Nhận cuộc gọi đến', Icon: IMic,       group: 'campaigns', href: '/inbound' },
  { id: 'call-history', label: 'Lịch sử',           sublabel: 'Tất cả cuộc gọi',  Icon: IClock,     group: 'tracking',  href: '/call-history' },
  { id: 'contacts',     label: 'Khách hàng',        sublabel: 'Data & Pipeline',   Icon: IUsers,     group: 'customers', href: '/contacts' },
  { id: 'cskh',         label: 'Chăm Sóc',          sublabel: 'Follow-up & Journey', Icon: IHeart,      group: 'customers', href: '/cskh' },
  { id: 'facebook-ads', label: 'Facebook Ads',       sublabel: 'Leads & Chiến dịch', Icon: IMegaphone,  group: 'customers', href: '/facebook-ads' },
  { id: 'analytics',    label: 'Báo cáo',           sublabel: 'KPI & AI Insights', Icon: IBarChart,  group: 'analytics', href: '/analytics' },
  { id: 'sms',          label: 'SMS & Zalo',         sublabel: 'Tin nhắn tự động',  Icon: IZap,       group: 'analytics', href: '/sms' },
  { id: 'settings',     label: 'Cài đặt',                                           Icon: ISettings,  group: 'system',    href: '/settings' },
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

  const homeItems      = NAV_ITEMS.filter(n => n.group === 'home')
  const campaignItems  = NAV_ITEMS.filter(n => n.group === 'campaigns')
  const trackingItems  = NAV_ITEMS.filter(n => n.group === 'tracking')
  const customerItems  = NAV_ITEMS.filter(n => n.group === 'customers')
  const analyticsItems = NAV_ITEMS.filter(n => n.group === 'analytics')
  const systemItems    = NAV_ITEMS.filter(n => n.group === 'system')

  function NavBtn({ item }: { item: typeof NAV_ITEMS[0] }) {
    const active = item.href ? pathname.startsWith(item.href) : false
    const isHov  = hovered === item.id
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
          cursor: 'pointer',
          fontSize: 13, fontWeight: active ? 600 : 400,
          background: active ? 'rgba(0,180,216,0.08)' : isHov ? t.navHover : 'transparent',
          color: active ? '#00b4d8' : t.text2,
          textAlign: 'left', transition: 'all 0.12s',
          borderLeft: active ? '2.5px solid #00b4d8' : '2.5px solid transparent',
          fontFamily: 'inherit', width: '100%',
        }}
      >
        <Icon size={15} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ lineHeight: '1.3' }}>{item.label}</div>
          {item.sublabel && (
            <div style={{ fontSize: 10, color: active ? '#00b4d8' : t.text3, fontWeight: 400, lineHeight: '1.2' }}>
              {item.sublabel}
            </div>
          )}
        </div>
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
        {homeItems.map(item => <NavBtn key={item.id} item={item} />)}

        <GroupLabel label="Chiến dịch" />
        {campaignItems.map(item => <NavBtn key={item.id} item={item} />)}

        <GroupLabel label="Theo dõi" />
        {trackingItems.map(item => <NavBtn key={item.id} item={item} />)}

        <GroupLabel label="Khách hàng" />
        {customerItems.map(item => <NavBtn key={item.id} item={item} />)}

        <GroupLabel label="Phân tích" />
        {analyticsItems.map(item => <NavBtn key={item.id} item={item} />)}

        <GroupLabel label="Hệ thống" />
        {systemItems.map(item => <NavBtn key={item.id} item={item} />)}
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
