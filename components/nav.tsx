'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Phone, Users, Calendar, BarChart2, LogOut } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const links = [
  { href: '/dashboard', label: 'Cuộc gọi', icon: Phone },
  { href: '/contacts', label: 'Danh bạ', icon: Users },
  { href: '/appointments', label: 'Lịch hẹn', icon: Calendar },
  { href: '/analytics', label: 'Báo cáo', icon: BarChart2 },
]

export default function Nav({ clientName }: { clientName?: string }) {
  const pathname = usePathname()
  const router = useRouter()

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-40">
      <div className="flex items-center gap-6">
        <div>
          <p className="text-sm font-bold text-indigo-600">{clientName ?? 'AutoVoice Pro'}</p>
          <p className="text-xs text-gray-400 leading-none">AutoVoice Pro</p>
        </div>
        <nav className="flex items-center gap-0.5">
          {links.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                pathname === href
                  ? 'bg-indigo-50 text-indigo-600'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}>
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
        </nav>
      </div>
      <button onClick={logout} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors">
        <LogOut className="w-4 h-4" /> Đăng xuất
      </button>
    </header>
  )
}