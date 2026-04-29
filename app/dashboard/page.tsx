'use client'

import { useEffect, useState } from 'react'
import { supabase, type Client, type Call, type Campaign } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/ui/app-shell'
import { PageSkeleton } from '@/components/skeleton'
import {
  Phone, CalendarCheck, PhoneMissed, CheckCircle, AlertCircle,
  Flame, Clock, TrendingUp, TrendingDown, ArrowRight, Zap,
} from 'lucide-react'

// ── Helpers ────────────────────────────────────────────────────────────────────

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Chào buổi sáng'
  if (h < 18) return 'Chào buổi chiều'
  return 'Chào buổi tối'
}

function todayLabel(): string {
  return new Date().toLocaleDateString('vi-VN', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function goldenHours(calls: Call[]): number[] {
  const rates = Array(24).fill(0).map((_, h) => {
    const hc = calls.filter(c => new Date(c.created_at).getHours() === h)
    const answered = hc.filter(c => c.status !== 'no_answer').length
    return hc.length >= 3 ? answered / hc.length : 0
  })
  const max = Math.max(...rates)
  return max > 0 ? rates.map((r, h) => r >= max * 0.7 ? h : -1).filter(h => h >= 0) : []
}

type Alert = { type: 'critical' | 'warning' | 'good'; title: string; desc: string }

function calcAlerts(calls: Call[]): Alert[] {
  const now = Date.now()
  const DAY = 86400000
  const last7  = calls.filter(c => now - new Date(c.created_at).getTime() <= 7 * DAY)
  const prev7  = calls.filter(c => { const a = now - new Date(c.created_at).getTime(); return a > 7 * DAY && a <= 14 * DAY })
  const last24 = calls.filter(c => now - new Date(c.created_at).getTime() <= DAY)
  const alerts: Alert[] = []

  if (last7.length >= 5 && prev7.length >= 5) {
    const r1 = last7.filter(c => c.status !== 'no_answer').length / last7.length
    const r2 = prev7.filter(c => c.status !== 'no_answer').length / prev7.length
    const diff = r1 - r2
    if (diff <= -0.15)
      alerts.push({ type: 'critical', title: `Tỷ lệ nghe máy giảm ${Math.round(Math.abs(diff) * 100)}%`, desc: `7 ngày qua: ${Math.round(r1 * 100)}% · Tuần trước: ${Math.round(r2 * 100)}%` })
    else if (diff >= 0.10)
      alerts.push({ type: 'good', title: `Tỷ lệ nghe máy tăng ${Math.round(diff * 100)}%`, desc: `7 ngày qua: ${Math.round(r1 * 100)}% · Tuần trước: ${Math.round(r2 * 100)}%` })
  }

  const noAnswer24 = last24.filter(c => c.status === 'no_answer').length
  if (noAnswer24 >= 15)
    alerts.push({ type: 'warning', title: `${noAnswer24} cuộc không nghe máy trong 24h`, desc: 'Retry tự động đang xử lý. Kiểm tra lại khung giờ gọi nếu cần.' })

  const booked24 = last24.filter(c => c.appointment_booked).length
  if (booked24 >= 3)
    alerts.push({ type: 'good', title: `${booked24} lịch hẹn mới hôm nay!`, desc: 'AI đang hoạt động hiệu quả.' })

  const exhausted = calls.filter(c => c.retry_count >= 4 && !c.appointment_booked).length
  if (exhausted >= 10)
    alerts.push({ type: 'warning', title: `${exhausted} liên hệ đã hết lượt retry`, desc: 'Cần xem xét thủ công hoặc loại khỏi danh sách.' })

  return alerts
}

type QueueItem = { phone: string; name: string; attempts: number; lastCalled: string; priority: 'high' | 'medium' | 'low' }

function calcQueue(calls: Call[]): QueueItem[] {
  const byPhone = new Map<string, Call[]>()
  calls.forEach(c => {
    if (!c.contact_phone) return
    const arr = byPhone.get(c.contact_phone) ?? []; arr.push(c); byPhone.set(c.contact_phone, arr)
  })
  const today = new Date().toDateString()
  const result: QueueItem[] = []
  byPhone.forEach((pCalls, phone) => {
    if (pCalls.some(c => c.appointment_booked)) return
    const last = pCalls.reduce((a, b) => new Date(a.created_at) > new Date(b.created_at) ? a : b)
    if (new Date(last.created_at).toDateString() === today) return
    if (pCalls.filter(c => c.status === 'no_answer').length >= 5) return
    const name = pCalls.find(c => c.contact_name)?.contact_name ?? 'Không có tên'
    const attempts = pCalls.length
    result.push({ phone, name, attempts, lastCalled: last.created_at, priority: attempts === 1 ? 'high' : attempts <= 3 ? 'medium' : 'low' })
  })
  const ord = { high: 0, medium: 1, low: 2 }
  return result.sort((a, b) => ord[a.priority] - ord[b.priority]).slice(0, 5)
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()
  const [client, setClient]       = useState<Client | null>(null)
  const [calls, setCalls]         = useState<Call[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: cu } = await supabase.from('client_users').select('client_id').eq('user_id', user.id).single()
      if (!cu) { setLoading(false); return }
      const { data: c } = await supabase.from('clients').select('*').eq('id', cu.client_id).single()
      setClient(c)

      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const [{ data: callData }, { data: campaignData }] = await Promise.all([
        supabase.from('calls').select('*').eq('tenant_id', cu.client_id)
          .gte('created_at', thirtyDaysAgo.toISOString())
          .order('created_at', { ascending: false }),
        supabase.from('campaigns').select('*').eq('tenant_id', cu.client_id)
          .order('updated_at', { ascending: false }).limit(10),
      ])

      setCalls(callData ?? [])
      setCampaigns(campaignData ?? [])
      setLoading(false)
    }
    init()
  }, [router])

  if (loading) return <PageSkeleton />

  // ── Derived ──────────────────────────────────────────────────────────────────
  const today         = new Date().toDateString()
  const todayCalls    = calls.filter(c => new Date(c.created_at).toDateString() === today)
  const connected     = todayCalls.filter(c => c.status === 'completed').length
  const booked        = todayCalls.filter(c => c.appointment_booked).length
  const noAnswerToday = todayCalls.filter(c => c.status === 'no_answer').length
  const pendingRetry  = (() => {
    const seen = new Set<string>()
    return calls.filter(c => {
      if (c.status !== 'no_answer' || c.retry_count >= 3) return false
      if (new Date(c.created_at).toDateString() === today) return false
      if (calls.some(c2 => c2.contact_phone === c.contact_phone && c2.appointment_booked)) return false
      if (!c.contact_phone || seen.has(c.contact_phone)) return false
      seen.add(c.contact_phone); return true
    }).length
  })()

  const golden       = goldenHours(calls)
  const isGoldenNow  = golden.includes(new Date().getHours())
  const alerts       = calcAlerts(calls)
  const queue        = calcQueue(calls)
  const recentCalls  = calls.slice(0, 8)
  const activeCamps  = campaigns.filter(c => c.status === 'running' || c.status === 'paused')

  const thisWeekBooked = calls.filter(c => Date.now() - new Date(c.created_at).getTime() <= 7 * 86400000 && c.appointment_booked).length
  const lastWeekBooked = calls.filter(c => { const a = Date.now() - new Date(c.created_at).getTime(); return a > 7 * 86400000 && a <= 14 * 86400000 && c.appointment_booked }).length
  const weekTrend = lastWeekBooked > 0 ? thisWeekBooked - lastWeekBooked : null

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i))
    const ds = d.toDateString()
    const dc = calls.filter(c => new Date(c.created_at).toDateString() === ds)
    return { label: i === 6 ? 'Hôm nay' : ['CN','T2','T3','T4','T5','T6','T7'][d.getDay()], total: dc.length, booked: dc.filter(c => c.appointment_booked).length }
  })
  const maxDaily = Math.max(...last7.map(d => d.total), 1)

  return (
    <AppShell clientName={client?.name}>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            {greeting()}, <span className="text-indigo-600">{client?.name ?? 'AutoVoice Pro'}</span>!
          </h1>
          <p className="text-sm text-gray-400 mt-1 capitalize">{todayLabel()}</p>
        </div>
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border ${
          isGoldenNow ? 'bg-orange-50 text-orange-600 border-orange-200' : 'bg-gray-50 text-gray-400 border-gray-200'
        }`}>
          <Flame className={`w-3.5 h-3.5 ${isGoldenNow ? 'text-orange-500' : 'text-gray-300'}`} />
          {isGoldenNow
            ? `Đang giờ vàng · ${golden.map(h => `${h}h`).join(', ')}`
            : golden.length > 0 ? `Giờ vàng: ${golden.map(h => `${h}h`).join(', ')}` : 'Chưa đủ dữ liệu'}
        </div>
      </div>

      {/* Today KPIs */}
      <div className="grid grid-cols-5 gap-3 mb-5">
        {[
          { label: 'Cuộc gọi hôm nay', value: todayCalls.length,   icon: <Phone className="w-4 h-4 text-indigo-500" />,    bg: 'bg-indigo-50',  sub: `30 ngày: ${calls.length}` },
          { label: 'Kết nối hôm nay',  value: connected,           icon: <CheckCircle className="w-4 h-4 text-green-500" />, bg: 'bg-green-50',   sub: todayCalls.length > 0 ? `${Math.round((connected / todayCalls.length) * 100)}% nghe máy` : '—' },
          { label: 'Lịch hẹn mới',     value: booked,              icon: <CalendarCheck className="w-4 h-4 text-amber-500" />, bg: 'bg-amber-50', sub: `Tuần này: ${thisWeekBooked}` },
          { label: 'Không nghe hôm nay', value: noAnswerToday,     icon: <PhoneMissed className="w-4 h-4 text-orange-500" />, bg: 'bg-orange-50', sub: 'Retry tự động' },
          { label: 'Cần gọi lại',      value: pendingRetry,        icon: <Clock className="w-4 h-4 text-red-400" />,       bg: 'bg-red-50',     sub: 'Chưa đặt lịch' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <div className={`w-8 h-8 ${k.bg} rounded-xl flex items-center justify-center mb-3`}>{k.icon}</div>
            <p className="text-2xl font-bold text-gray-800">{k.value}</p>
            <p className="text-xs text-gray-500 mt-0.5 leading-tight">{k.label}</p>
            <p className="text-xs text-gray-300 mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2 mb-5">
          {alerts.map((a, i) => (
            <div key={i} className={`flex items-start gap-3 p-3.5 rounded-xl border ${
              a.type === 'critical' ? 'bg-red-50 border-red-200' :
              a.type === 'warning'  ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'
            }`}>
              {a.type === 'good'
                ? <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                : <AlertCircle className={`w-4 h-4 shrink-0 mt-0.5 ${a.type === 'critical' ? 'text-red-500' : 'text-amber-500'}`} />}
              <div>
                <p className={`font-semibold text-sm ${a.type === 'critical' ? 'text-red-800' : a.type === 'warning' ? 'text-amber-800' : 'text-green-800'}`}>{a.title}</p>
                <p className={`text-xs mt-0.5 ${a.type === 'critical' ? 'text-red-600' : a.type === 'warning' ? 'text-amber-600' : 'text-green-600'}`}>{a.desc}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Main 2-col grid */}
      <div className="grid grid-cols-3 gap-5">

        {/* Left (2/3) */}
        <div className="col-span-2 space-y-5">

          {/* Priority Queue */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-orange-500" /> Gọi ngay hôm nay
              </p>
              <button onClick={() => router.push('/analytics')}
                className="text-xs text-indigo-500 hover:text-indigo-700 flex items-center gap-1 transition-colors">
                Xem tất cả <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            {queue.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Tất cả liên hệ đã được xử lý hôm nay 🎉</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {queue.map((c, i) => (
                  <div key={c.phone} className="flex items-center gap-3 py-2.5">
                    <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${
                      c.priority === 'high'   ? 'bg-red-100 text-red-600' :
                      c.priority === 'medium' ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-500'
                    }`}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{c.name}</p>
                      <p className="text-xs text-gray-400">{c.phone} · {c.attempts} lần gọi</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                      c.priority === 'high'   ? 'bg-red-50 text-red-600' :
                      c.priority === 'medium' ? 'bg-amber-50 text-amber-600' : 'bg-gray-100 text-gray-500'
                    }`}>{c.priority === 'high' ? 'Ưu tiên cao' : c.priority === 'medium' ? 'Bình thường' : 'Thấp'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-gray-800">Hoạt động gần đây</p>
              <button onClick={() => router.push('/call-history')}
                className="text-xs text-indigo-500 hover:text-indigo-700 flex items-center gap-1 transition-colors">
                Lịch sử đầy đủ <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            {recentCalls.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Chưa có cuộc gọi nào</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {recentCalls.map(c => (
                  <div key={c.id} className="flex items-center gap-3 py-2.5">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      c.appointment_booked ? 'bg-green-100' :
                      c.status === 'completed' ? 'bg-blue-50' : 'bg-gray-100'
                    }`}>
                      {c.appointment_booked
                        ? <CalendarCheck className="w-3.5 h-3.5 text-green-600" />
                        : c.status === 'completed'
                        ? <Phone className="w-3.5 h-3.5 text-blue-500" />
                        : <PhoneMissed className="w-3.5 h-3.5 text-gray-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{c.contact_name ?? c.contact_phone ?? 'Không rõ'}</p>
                      <p className="text-xs text-gray-400 truncate">
                        {c.summary ? c.summary.slice(0, 70) + (c.summary.length > 70 ? '…' : '')
                          : c.status === 'no_answer' ? 'Không nghe máy'
                          : c.appointment_booked ? 'Đã đặt lịch hẹn'
                          : 'Đã kết nối'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-gray-400">
                        {new Date(c.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      {c.duration_seconds && c.duration_seconds > 0 && (
                        <p className="text-xs text-gray-300">{Math.floor(c.duration_seconds / 60)}p{c.duration_seconds % 60}s</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right (1/3) */}
        <div className="space-y-5">

          {/* Weekly mini chart */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-semibold text-gray-800">7 ngày qua</p>
              <div className="flex items-center gap-1 text-sm font-semibold">
                {weekTrend !== null && weekTrend !== 0 && (
                  weekTrend > 0
                    ? <span className="text-green-600 flex items-center gap-0.5"><TrendingUp className="w-3.5 h-3.5" />+{weekTrend}</span>
                    : <span className="text-red-500 flex items-center gap-0.5"><TrendingDown className="w-3.5 h-3.5" />{weekTrend}</span>
                )}
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-4">so tuần trước: {lastWeekBooked} lịch hẹn</p>
            <div className="flex items-end gap-1.5 h-20">
              {last7.map(d => (
                <div key={d.label} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex flex-col justify-end rounded-t-sm overflow-hidden"
                    style={{ height: `${Math.max((d.total / maxDaily) * 64, d.total > 0 ? 6 : 0)}px` }}>
                    {d.booked > 0 && <div className="w-full" style={{ height: `${Math.round((d.booked / d.total) * 100)}%`, minHeight: 3, backgroundColor: '#22c55e' }} />}
                    <div className="w-full flex-1" style={{ backgroundColor: d.total > 0 ? '#e0e7ff' : 'transparent', minHeight: d.total > 0 ? 3 : 0 }} />
                  </div>
                  <span className="text-xs text-gray-300 text-center leading-none">{d.label}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-3 text-xs text-gray-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-500 inline-block" />Đặt lịch</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-indigo-200 inline-block" />Gọi</span>
            </div>
          </div>

          {/* Active Campaigns */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-gray-800">Chiến dịch đang chạy</p>
              <button onClick={() => router.push('/campaigns')}
                className="text-xs text-indigo-500 hover:text-indigo-700 flex items-center gap-1 transition-colors">
                Tất cả <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            {activeCamps.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Không có chiến dịch nào đang chạy</p>
            ) : (
              <div className="space-y-3">
                {activeCamps.slice(0, 4).map(camp => (
                  <div key={camp.id} className="flex items-start gap-3">
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${camp.status === 'running' ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{camp.name}</p>
                      <p className="text-xs text-gray-400">{camp.called_count}/{camp.total_count} gọi · {camp.booked_count} lịch hẹn</p>
                      <div className="h-1.5 bg-gray-100 rounded-full mt-1.5 overflow-hidden">
                        <div className="h-full bg-indigo-400 rounded-full transition-all"
                          style={{ width: `${camp.total_count > 0 ? (camp.called_count / camp.total_count) * 100 : 0}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <p className="text-sm font-semibold text-gray-800 mb-3">Thao tác nhanh</p>
            <div className="space-y-1.5">
              {[
                { label: 'Tạo chiến dịch mới',   icon: <Zap className="w-4 h-4 text-indigo-500" />,      href: '/campaigns',    bg: 'hover:bg-indigo-50 hover:border-indigo-100' },
                { label: 'Xem lịch sử gọi',       icon: <Clock className="w-4 h-4 text-blue-500" />,      href: '/call-history', bg: 'hover:bg-blue-50 hover:border-blue-100' },
                { label: 'Báo cáo AI Insights',   icon: <TrendingUp className="w-4 h-4 text-green-500" />, href: '/analytics',    bg: 'hover:bg-green-50 hover:border-green-100' },
                { label: 'Quản lý khách hàng',    icon: <Phone className="w-4 h-4 text-purple-500" />,    href: '/contacts',     bg: 'hover:bg-purple-50 hover:border-purple-100' },
              ].map(a => (
                <button key={a.label} onClick={() => router.push(a.href)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm text-gray-700 border border-transparent transition-all ${a.bg}`}>
                  {a.icon}
                  <span className="flex-1">{a.label}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-gray-300" />
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>
    </AppShell>
  )
}
