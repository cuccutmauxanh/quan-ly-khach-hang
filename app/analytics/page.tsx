'use client'

import { useEffect, useState } from 'react'
import { supabase, type Client, type Call } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { TrendingUp, Phone, CalendarCheck, Users, Star } from 'lucide-react'
import Nav from '@/components/nav'

function calcScore(call: Call): number {
  let score = 0
  if (call.appointment_booked) score += 50
  const dur = call.duration_seconds ?? 0
  if (dur >= 120) score += 30
  else if (dur >= 60) score += 20
  else if (dur >= 30) score += 10
  if (call.status === 'completed') score += 20
  return Math.min(score, 100)
}

function formatDuration(s: number): string {
  if (s < 60) return `${s}s`
  return `${Math.floor(s/60)}p${s%60 > 0 ? ` ${s%60}s` : ''}`
}

function getLast7Days(): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    return d.toDateString()
  })
}

function getDayLabel(dateStr: string): string {
  const d = new Date(dateStr)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return 'Hôm nay'
  const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
  return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth()+1}`
}

export default function AnalyticsPage() {
  const router = useRouter()
  const [client, setClient] = useState<Client | null>(null)
  const [calls, setCalls] = useState<Call[]>([])
  const [contactCount, setContactCount] = useState(0)
  const [loading, setLoading] = useState(true)

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

      const [{ data: callData }, { count }] = await Promise.all([
        supabase.from('calls').select('*').eq('tenant_id', cu.client_id)
          .gte('created_at', thirtyDaysAgo.toISOString())
          .order('created_at', { ascending: false }),
        supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('tenant_id', cu.client_id),
      ])

      setCalls(callData ?? [])
      setContactCount(count ?? 0)
      setLoading(false)
    }
    init()
  }, [router])

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Đang tải...</div>

  const total = calls.length
  const booked = calls.filter(c => c.appointment_booked).length
  const inbound = calls.filter(c => c.direction === 'inbound').length
  const outbound = calls.filter(c => c.direction === 'outbound').length
  const convRate = total > 0 ? Math.round((booked / total) * 100) : 0
  const scores = calls.map(calcScore)
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
  const durations = calls.filter(c => c.duration_seconds && c.duration_seconds > 0).map(c => c.duration_seconds!)
  const avgDuration = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0

  // Last 7 days chart data
  const last7 = getLast7Days()
  const dailyData = last7.map(dateStr => {
    const dayCalls = calls.filter(c => new Date(c.created_at).toDateString() === dateStr)
    return {
      label: getDayLabel(dateStr),
      total: dayCalls.length,
      booked: dayCalls.filter(c => c.appointment_booked).length,
    }
  })
  const maxDaily = Math.max(...dailyData.map(d => d.total), 1)

  // Score distribution
  const scoreDist = [
    { label: 'Xuất sắc (80+)', count: scores.filter(s => s >= 80).length, color: 'bg-green-500' },
    { label: 'Tốt (60-79)',    count: scores.filter(s => s >= 60 && s < 80).length, color: 'bg-blue-500' },
    { label: 'Trung bình (40-59)', count: scores.filter(s => s >= 40 && s < 60).length, color: 'bg-yellow-500' },
    { label: 'Cần cải thiện (<40)', count: scores.filter(s => s < 40).length, color: 'bg-red-400' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav clientName={client?.name} />

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Báo cáo</h2>
            <p className="text-xs text-gray-400 mt-0.5">30 ngày gần nhất</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-indigo-500" />
            Cập nhật theo thời gian thực
          </div>
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Tổng cuộc gọi', value: total, sub: '30 ngày', icon: <Phone className="w-5 h-5 text-indigo-600" />, bg: 'bg-indigo-50' },
            { label: 'Tỷ lệ đặt lịch', value: `${convRate}%`, sub: `${booked}/${total} cuộc`, icon: <CalendarCheck className="w-5 h-5 text-green-600" />, bg: 'bg-green-50' },
            { label: 'Điểm trung bình', value: avgScore, sub: 'trên 100 điểm', icon: <Star className="w-5 h-5 text-yellow-500" />, bg: 'bg-yellow-50' },
            { label: 'Tổng liên hệ', value: contactCount, sub: 'trong danh bạ', icon: <Users className="w-5 h-5 text-purple-600" />, bg: 'bg-purple-50' },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
              <div className={`p-2.5 rounded-lg ${k.bg} shrink-0`}>{k.icon}</div>
              <div>
                <p className="text-xs text-gray-400">{k.label}</p>
                <p className="text-2xl font-bold text-gray-800 leading-tight">{k.value}</p>
                <p className="text-xs text-gray-400">{k.sub}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          {/* 7-day chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Cuộc gọi 7 ngày qua</h3>
            <div className="flex items-end gap-2 h-36">
              {dailyData.map(d => (
                <div key={d.label} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs text-gray-500 font-medium">{d.total || ''}</span>
                  <div className="w-full flex flex-col gap-0.5" style={{ height: `${Math.max((d.total / maxDaily) * 100, d.total > 0 ? 8 : 0)}px` }}>
                    <div className="w-full rounded-t-md" style={{
                      height: `${d.total > 0 ? Math.round((d.booked / Math.max(d.total, 1)) * 100) : 0}%`,
                      minHeight: d.booked > 0 ? '4px' : '0',
                      backgroundColor: '#22c55e',
                    }} />
                    <div className="w-full flex-1 rounded-b-md" style={{ backgroundColor: '#e0e7ff', minHeight: d.total > 0 ? '4px' : '0' }} />
                  </div>
                  <span className="text-xs text-gray-400 text-center leading-tight">{d.label}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
              <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-green-500 inline-block" /> Đặt lịch</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-indigo-200 inline-block" /> Còn lại</span>
            </div>
          </div>

          {/* Direction & score breakdown */}
          <div className="space-y-4">
            {/* Inbound vs Outbound */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Loại cuộc gọi</h3>
              <div className="space-y-2">
                {[
                  { label: 'Gọi đến (Inbound)', value: inbound, color: 'bg-blue-500' },
                  { label: 'Gọi đi (Outbound)', value: outbound, color: 'bg-green-500' },
                ].map(item => (
                  <div key={item.label}>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{item.label}</span>
                      <span className="font-semibold text-gray-700">{item.value}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className={`h-2 rounded-full ${item.color} transition-all`}
                        style={{ width: `${total > 0 ? (item.value / total) * 100 : 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-3 text-xs">
                <span className="text-gray-400">Thời lượng TB:</span>
                <span className="font-semibold text-gray-700">{avgDuration > 0 ? formatDuration(avgDuration) : '--'}</span>
              </div>
            </div>

            {/* Score distribution */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Phân bố điểm chất lượng</h3>
              <div className="space-y-2">
                {scoreDist.map(s => (
                  <div key={s.label}>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{s.label}</span>
                      <span className="font-semibold text-gray-700">{s.count}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className={`h-2 rounded-full ${s.color} transition-all`}
                        style={{ width: `${total > 0 ? (s.count / total) * 100 : 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Conversion funnel */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Phễu chuyển đổi</h3>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { label: 'Cuộc gọi', value: total, width: '100%', color: 'bg-indigo-100 text-indigo-700' },
              { label: 'Kết nối được', value: calls.filter(c => (c.duration_seconds ?? 0) > 5).length, color: 'bg-blue-100 text-blue-700' },
              { label: 'Quan tâm (>1p)', value: calls.filter(c => (c.duration_seconds ?? 0) >= 60).length, color: 'bg-yellow-100 text-yellow-700' },
              { label: 'Đặt lịch', value: booked, color: 'bg-green-100 text-green-700' },
            ].map((step, i, arr) => (
              <div key={step.label} className="flex items-center gap-2">
                <div className={`px-4 py-3 rounded-xl ${step.color} text-center min-w-24`}>
                  <p className="text-lg font-bold">{step.value}</p>
                  <p className="text-xs font-medium">{step.label}</p>
                  {i > 0 && arr[i-1].value > 0 && (
                    <p className="text-xs opacity-70">{Math.round((step.value / arr[i-1].value) * 100)}% từ trước</p>
                  )}
                </div>
                {i < arr.length - 1 && <span className="text-gray-300 text-lg">→</span>}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}