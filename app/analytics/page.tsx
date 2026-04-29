'use client'

import { useEffect, useState } from 'react'
import { supabase, type Client, type Call } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import {
  TrendingUp, Phone, CalendarCheck, Users, Star, PhoneMissed, Download,
  CheckCircle, AlertCircle, Clock, Lightbulb, BarChart2 as BarChart2Icon,
  Flame, MessageSquare,
} from 'lucide-react'
import AppShell from '@/components/ui/app-shell'
import { PageSkeleton } from '@/components/skeleton'

// ── Shared helpers ─────────────────────────────────────────────────────────────

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
  return `${Math.floor(s / 60)}p${s % 60 > 0 ? ` ${s % 60}s` : ''}`
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
  return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
}

function exportCSV(calls: Call[]) {
  const headers = ['Thời gian', 'Tên khách', 'Số điện thoại', 'Loại', 'Thời lượng (s)', 'Đặt lịch', 'Trạng thái', 'Tóm tắt AI']
  const rows = calls.map(c => [
    new Date(c.created_at).toLocaleString('vi-VN'),
    c.contact_name ?? '',
    c.contact_phone ?? '',
    c.direction === 'inbound' ? 'Gọi đến' : 'Gọi đi',
    c.duration_seconds ?? 0,
    c.appointment_booked ? 'Có' : 'Không',
    c.status ?? '',
    (c.summary ?? '').replace(/,/g, ';'),
  ])
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `bao-cao-cuoc-goi-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── AI Insights helpers ────────────────────────────────────────────────────────

type Insight = { type: 'success' | 'warning' | 'info' | 'tip'; title: string; desc: string; value?: string }

function calcInsights(calls: Call[]): Insight[] {
  if (calls.length === 0) return [{ type: 'info', title: 'Chưa có dữ liệu', desc: 'Hãy thực hiện một số cuộc gọi để xem phân tích.' }]

  const insights: Insight[] = []
  const total = calls.length
  const completed = calls.filter(c => c.status === 'completed').length
  const noAnswer  = calls.filter(c => c.status === 'no_answer').length
  const booked    = calls.filter(c => c.appointment_booked).length
  const connectRate = Math.round((completed / total) * 100)
  const bookRate    = completed > 0 ? Math.round((booked / completed) * 100) : 0
  const avgDur      = completed > 0
    ? Math.round(calls.filter(c => c.status === 'completed').reduce((a, c) => a + (c.duration_seconds ?? 0), 0) / completed)
    : 0

  if (connectRate >= 40)
    insights.push({ type: 'success', title: 'Tỷ lệ kết nối tốt',    desc: `${connectRate}% cuộc gọi được nghe máy. Trên mức trung bình ngành (30-40%).`, value: `${connectRate}%` })
  else
    insights.push({ type: 'warning', title: 'Tỷ lệ kết nối thấp',   desc: `Chỉ ${connectRate}% cuộc gọi được nghe. Thử gọi vào khung 9-11h hoặc 14-17h.`, value: `${connectRate}%` })

  if (bookRate >= 20)
    insights.push({ type: 'success', title: 'Tỷ lệ đặt lịch xuất sắc', desc: `${bookRate}% người nghe máy đặt lịch hẹn. AI đang hoạt động rất hiệu quả.`, value: `${bookRate}%` })
  else if (bookRate >= 10)
    insights.push({ type: 'info',    title: 'Tỷ lệ đặt lịch khá',      desc: `${bookRate}% chuyển đổi. Thử cải thiện câu chào hỏi và kịch bản AI.`, value: `${bookRate}%` })
  else if (completed > 0)
    insights.push({ type: 'warning', title: 'Tỷ lệ đặt lịch cần cải thiện', desc: `Chỉ ${bookRate}% chuyển đổi. Hãy vào Trợ lý AI để điều chỉnh kịch bản.`, value: `${bookRate}%` })

  if (avgDur >= 90)
    insights.push({ type: 'success', title: 'Cuộc gọi có chiều sâu',  desc: `Trung bình ${Math.floor(avgDur / 60)}p${avgDur % 60}s — khách đang tương tác tốt với AI.`, value: `${Math.floor(avgDur / 60)}p${avgDur % 60}s` })
  else if (avgDur >= 30)
    insights.push({ type: 'info',    title: 'Thời lượng trung bình',   desc: `${Math.floor(avgDur / 60)}p${avgDur % 60}s mỗi cuộc. Tốt, nhưng có thể cải thiện thêm.`, value: `${Math.floor(avgDur / 60)}p${avgDur % 60}s` })
  else if (avgDur > 0)
    insights.push({ type: 'warning', title: 'Cuộc gọi quá ngắn',       desc: `Trung bình chỉ ${avgDur}s — khách cúp máy sớm. Kiểm tra câu mở đầu của AI.`, value: `${avgDur}s` })

  const noAnswerRate = Math.round((noAnswer / total) * 100)
  if (noAnswerRate > 70)
    insights.push({ type: 'warning', title: 'Quá nhiều cuộc gọi không nghe', desc: `${noAnswerRate}% không bắt máy. Data có thể chưa chất lượng hoặc sai khung giờ.` })

  if (booked === 0 && completed > 5)
    insights.push({ type: 'tip', title: 'Gợi ý: Kiểm tra kịch bản AI',   desc: 'Đã có cuộc gọi kết nối nhưng chưa có lịch hẹn. Thử thêm "lợi ích khám miễn phí" vào kịch bản.' })
  if (noAnswer > 20)
    insights.push({ type: 'tip', title: 'Gợi ý: Bật retry tự động',      desc: `${noAnswer} số chưa nghe máy. WF4 retry scheduler đang tự động gọi lại sau 2h.` })
  if (total > 50 && bookRate > 15)
    insights.push({ type: 'tip', title: 'Gợi ý: Mở rộng data',           desc: 'Tỷ lệ chuyển đổi tốt! Hãy upload thêm data để tăng lịch hẹn.' })

  return insights
}

function HourlyChart({ calls }: { calls: Call[] }) {
  const hourCounts = Array(24).fill(0)
  calls.filter(c => c.status === 'completed').forEach(c => { hourCounts[new Date(c.created_at).getHours()]++ })
  const max = Math.max(...hourCounts, 1)
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts))
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-500">Phân bổ cuộc gọi theo giờ</p>
        <p className="text-xs text-indigo-600 font-medium">Giờ vàng: {peakHour}:00 – {peakHour + 1}:00</p>
      </div>
      <div className="flex items-end gap-0.5 h-16">
        {hourCounts.map((cnt, h) => (
          <div key={h} className="flex-1 flex flex-col items-center gap-0.5">
            <div className={`w-full rounded-sm transition-all ${cnt > 0 ? 'bg-indigo-400' : 'bg-gray-100'}`}
              style={{ height: `${(cnt / max) * 56}px`, minHeight: cnt > 0 ? 4 : 2 }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs text-gray-300 mt-1">
        <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span>
      </div>
    </div>
  )
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  success: <CheckCircle className="w-4 h-4 text-green-500" />,
  warning: <AlertCircle className="w-4 h-4 text-amber-500" />,
  info:    <BarChart2Icon className="w-4 h-4 text-blue-500" />,
  tip:     <Lightbulb className="w-4 h-4 text-violet-500" />,
}
const TYPE_BG: Record<string, string> = {
  success: 'bg-green-50 border-green-100',
  warning: 'bg-amber-50 border-amber-100',
  info:    'bg-blue-50 border-blue-100',
  tip:     'bg-violet-50 border-violet-100',
}

// ── Feature 1: Priority Queue ──────────────────────────────────────────────────

type PriorityContact = {
  phone: string
  name: string
  attempts: number
  lastCalled: string
  priority: 'high' | 'medium' | 'low'
}

function calcPriorityQueue(calls: Call[]): PriorityContact[] {
  const byPhone = new Map<string, Call[]>()
  calls.forEach(c => {
    if (!c.contact_phone) return
    const arr = byPhone.get(c.contact_phone) ?? []
    arr.push(c)
    byPhone.set(c.contact_phone, arr)
  })
  const today = new Date().toDateString()
  const result: PriorityContact[] = []
  byPhone.forEach((pCalls, phone) => {
    if (pCalls.some(c => c.appointment_booked)) return
    const lastCall = pCalls.reduce((a, b) => new Date(a.created_at) > new Date(b.created_at) ? a : b)
    if (new Date(lastCall.created_at).toDateString() === today) return
    if (pCalls.filter(c => c.status === 'no_answer').length >= 5) return
    const name = pCalls.find(c => c.contact_name)?.contact_name ?? 'Không có tên'
    const attempts = pCalls.length
    const priority: 'high' | 'medium' | 'low' = attempts === 1 ? 'high' : attempts <= 3 ? 'medium' : 'low'
    result.push({ phone, name, attempts, lastCalled: lastCall.created_at, priority })
  })
  const ord = { high: 0, medium: 1, low: 2 }
  return result
    .sort((a, b) => ord[a.priority] !== ord[b.priority]
      ? ord[a.priority] - ord[b.priority]
      : new Date(b.lastCalled).getTime() - new Date(a.lastCalled).getTime())
    .slice(0, 8)
}

// ── Feature 2: Heatmap ─────────────────────────────────────────────────────────

function calcHeatmap(calls: Call[]) {
  const grid = Array(7).fill(null).map(() =>
    Array(13).fill(null).map(() => ({ total: 0, answered: 0 }))
  )
  calls.forEach(c => {
    const d = new Date(c.created_at)
    const dow = (d.getDay() + 6) % 7  // Mon=0 … Sun=6
    const h = d.getHours()
    if (h < 8 || h > 20) return
    grid[dow][h - 8].total++
    if (c.status !== 'no_answer') grid[dow][h - 8].answered++
  })
  return grid.map(row => row.map(cell => ({
    rate: cell.total >= 2 ? Math.round((cell.answered / cell.total) * 100) : -1,
    total: cell.total,
  })))
}

function heatColor(rate: number): string {
  if (rate < 0) return '#f3f4f6'
  if (rate < 20) return '#fee2e2'
  if (rate < 40) return '#fef9c3'
  if (rate < 60) return '#bbf7d0'
  return '#4ade80'
}

// ── Feature 3: Drop-off ────────────────────────────────────────────────────────

function calcDropoff(calls: Call[]) {
  const BUCKETS = [
    { label: '< 15s',    min: 0,   max: 15  },
    { label: '15–30s',   min: 15,  max: 30  },
    { label: '30–60s',   min: 30,  max: 60  },
    { label: '1–2 phút', min: 60,  max: 120 },
    { label: '2–3 phút', min: 120, max: 180 },
    { label: '> 3 phút', min: 180, max: Infinity },
  ]
  const answered = calls.filter(c => c.status !== 'no_answer' && (c.duration_seconds ?? 0) > 0)
  const counts = BUCKETS.map(b => answered.filter(c => { const d = c.duration_seconds ?? 0; return d >= b.min && d < b.max }).length)
  const maxCount = Math.max(...counts, 1)
  return BUCKETS.map((b, i) => {
    const inBucket = answered.filter(c => { const d = c.duration_seconds ?? 0; return d >= b.min && d < b.max })
    return { label: b.label, total: inBucket.length, booked: inBucket.filter(c => c.appointment_booked).length, pct: Math.round((counts[i] / maxCount) * 100) }
  })
}

// ── Feature 4: Topic Analysis ──────────────────────────────────────────────────

function calcTopics(calls: Call[]) {
  const TOPICS = [
    { label: 'Đặt lịch thành công',      kw: ['đặt lịch', 'hẹn', 'xác nhận', 'lịch hẹn'],          color: '#22c55e' },
    { label: 'Hỏi giá / chi phí',         kw: ['giá', 'chi phí', 'bao nhiêu', 'phí', 'tiền'],         color: '#f59e0b' },
    { label: 'Muốn tư vấn thêm',          kw: ['tư vấn', 'hỏi thêm', 'biết thêm', 'thông tin'],       color: '#6366f1' },
    { label: 'Hẹn gọi lại sau',           kw: ['gọi lại', 'gọi sau', 'bận', 'không rảnh'],            color: '#3b82f6' },
    { label: 'Đã có nơi điều trị',         kw: ['có nha sĩ', 'chỗ khác', 'phòng khác', 'đang điều trị'], color: '#8b5cf6' },
    { label: 'Từ chối / không quan tâm',  kw: ['không cần', 'không quan tâm', 'từ chối', 'thôi'],     color: '#ef4444' },
  ]
  const summaries = calls.map(c => (c.summary ?? '').toLowerCase())
  const withSummary = calls.filter(c => c.summary && c.summary.length > 5).length
  const raw = TOPICS.map(t => ({
    label: t.label, color: t.color,
    count: summaries.filter(s => t.kw.some(kw => s.includes(kw))).length,
  })).filter(t => t.count > 0).sort((a, b) => b.count - a.count)
  const total = raw.reduce((s, t) => s + t.count, 0)
  return { topics: raw.map(t => ({ ...t, pct: total > 0 ? Math.round((t.count / total) * 100) : 0 })), withSummary }
}

// ── Main page ──────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'insights'

export default function AnalyticsPage() {
  const router = useRouter()
  const [client, setClient] = useState<Client | null>(null)
  const [calls, setCalls] = useState<Call[]>([])
  const [contactCount, setContactCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('overview')

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

  if (loading) return <PageSkeleton />

  // ── Overview derived data ──────────────────────────────────────────────────
  const total      = calls.length
  const booked     = calls.filter(c => c.appointment_booked).length
  const inbound    = calls.filter(c => c.direction === 'inbound').length
  const outbound   = calls.filter(c => c.direction === 'outbound').length
  const noAnswer   = calls.filter(c => c.status === 'no_answer').length
  const completed  = calls.filter(c => c.status === 'completed').length
  const convRate   = total > 0 ? Math.round((booked / total) * 100) : 0
  const answerRate = total > 0 ? Math.round(((total - noAnswer) / total) * 100) : 0
  const scores     = calls.filter(c => c.status !== 'no_answer').map(calcScore)
  const avgScore   = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
  const durations  = calls.filter(c => c.duration_seconds && c.duration_seconds > 0).map(c => c.duration_seconds!)
  const avgDuration = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0

  const last7      = getLast7Days()
  const dailyData  = last7.map(dateStr => {
    const dayCalls = calls.filter(c => new Date(c.created_at).toDateString() === dateStr)
    return {
      label: getDayLabel(dateStr),
      total: dayCalls.length,
      booked: dayCalls.filter(c => c.appointment_booked).length,
      noAnswer: dayCalls.filter(c => c.status === 'no_answer').length,
    }
  })
  const maxDaily = Math.max(...dailyData.map(d => d.total), 1)

  const scoreDist = [
    { label: 'Xuất sắc (80+)',       count: scores.filter(s => s >= 80).length,           color: 'bg-green-500' },
    { label: 'Tốt (60-79)',          count: scores.filter(s => s >= 60 && s < 80).length, color: 'bg-blue-500' },
    { label: 'Trung bình (40-59)',   count: scores.filter(s => s >= 40 && s < 60).length, color: 'bg-yellow-500' },
    { label: 'Cần cải thiện (<40)',  count: scores.filter(s => s < 40).length,            color: 'bg-red-400' },
  ]

  // ── Insights derived data ──────────────────────────────────────────────────
  const insights       = calcInsights(calls)
  const bookRate       = completed > 0 ? Math.round((booked / completed) * 100) : 0
  const avgDurIns      = completed > 0
    ? Math.round(calls.filter(c => c.status === 'completed').reduce((a, c) => a + (c.duration_seconds ?? 0), 0) / completed)
    : 0
  const priorityQueue  = calcPriorityQueue(calls)
  const heatmap        = calcHeatmap(calls)
  const dropoff        = calcDropoff(calls)
  const { topics, withSummary } = calcTopics(calls)

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Tổng quan' },
    { key: 'insights', label: 'AI Insights' },
  ]

  return (
    <AppShell clientName={client?.name}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Báo cáo</h2>
          <p className="text-xs text-gray-400 mt-0.5">30 ngày gần nhất</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-gray-400 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-indigo-500" />
            Cập nhật theo thời gian thực
          </div>
          <button
            onClick={() => exportCSV(calls)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              tab === t.key
                ? 'bg-white text-gray-800 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tổng quan tab ─────────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <>
          {/* KPI Grid — 6 thẻ */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4" style={{ marginBottom: 20 }}>
            {[
              { label: 'Tổng cuộc gọi',    value: total,           sub: '30 ngày',            icon: <Phone className="w-5 h-5 text-indigo-600" />,       bg: 'bg-indigo-50' },
              { label: 'Tỷ lệ đặt lịch',   value: `${convRate}%`,  sub: `${booked}/${total}`, icon: <CalendarCheck className="w-5 h-5 text-green-600" />,  bg: 'bg-green-50' },
              { label: 'Tỷ lệ nghe máy',   value: `${answerRate}%`, sub: `${total - noAnswer} nghe`, icon: <Phone className="w-5 h-5 text-blue-600" />,    bg: 'bg-blue-50' },
              { label: 'Không nghe máy',   value: noAnswer,        sub: 'cần retry',           icon: <PhoneMissed className="w-5 h-5 text-orange-500" />,  bg: 'bg-orange-50' },
              { label: 'Điểm trung bình',  value: avgScore,        sub: 'cuộc gọi kết nối',   icon: <Star className="w-5 h-5 text-yellow-500" />,         bg: 'bg-yellow-50' },
              { label: 'Tổng liên hệ',     value: contactCount,    sub: 'trong danh bạ',       icon: <Users className="w-5 h-5 text-purple-600" />,        bg: 'bg-purple-50' },
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

          <div className="grid md:grid-cols-2 gap-5" style={{ marginBottom: 20 }}>
            {/* 7-day chart */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Cuộc gọi 7 ngày qua</h3>
              <div className="flex items-end gap-2 h-36">
                {dailyData.map(d => (
                  <div key={d.label} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs text-gray-500 font-medium">{d.total || ''}</span>
                    <div className="w-full flex flex-col gap-0.5 rounded-t-md overflow-hidden"
                      style={{ height: `${Math.max((d.total / maxDaily) * 112, d.total > 0 ? 8 : 0)}px` }}>
                      <div className="w-full" style={{ height: `${d.total > 0 ? Math.round((d.booked / d.total) * 100) : 0}%`, minHeight: d.booked > 0 ? '4px' : '0', backgroundColor: '#22c55e' }} />
                      <div className="w-full" style={{ height: `${d.total > 0 ? Math.round((d.noAnswer / d.total) * 100) : 0}%`, minHeight: d.noAnswer > 0 ? '4px' : '0', backgroundColor: '#fb923c' }} />
                      <div className="w-full flex-1" style={{ backgroundColor: '#e0e7ff', minHeight: d.total > 0 ? '4px' : '0' }} />
                    </div>
                    <span className="text-xs text-gray-400 text-center leading-tight">{d.label}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-green-500 inline-block" /> Đặt lịch</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-orange-400 inline-block" /> Không nghe</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-indigo-200 inline-block" /> Còn lại</span>
              </div>
            </div>

            {/* Direction & score breakdown */}
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Loại cuộc gọi</h3>
                <div className="space-y-2">
                  {[
                    { label: 'Gọi đến (Inbound)',  value: inbound,  color: 'bg-blue-500' },
                    { label: 'Gọi đi (Outbound)',  value: outbound, color: 'bg-green-500' },
                    { label: 'Không nghe máy',     value: noAnswer, color: 'bg-orange-400' },
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
                          style={{ width: `${scores.length > 0 ? (s.count / scores.length) * 100 : 0}%` }} />
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
                { label: 'Cuộc gọi',       value: total },
                { label: 'Nghe máy',       value: total - noAnswer },
                { label: 'Quan tâm (>1p)', value: calls.filter(c => (c.duration_seconds ?? 0) >= 60).length },
                { label: 'Đặt lịch',       value: booked },
              ].map((step, i, arr) => (
                <div key={step.label} className="flex items-center gap-2">
                  <div className={`px-4 py-3 rounded-xl text-center min-w-24 ${
                    i === 0 ? 'bg-indigo-100 text-indigo-700' :
                    i === 1 ? 'bg-blue-100 text-blue-700' :
                    i === 2 ? 'bg-yellow-100 text-yellow-700' :
                               'bg-green-100 text-green-700'
                  }`}>
                    <p className="text-lg font-bold">{step.value}</p>
                    <p className="text-xs font-medium">{step.label}</p>
                    {i > 0 && arr[i - 1].value > 0 && (
                      <p className="text-xs opacity-70">{Math.round((step.value / arr[i - 1].value) * 100)}% từ trước</p>
                    )}
                  </div>
                  {i < arr.length - 1 && <span className="text-gray-300 text-lg">→</span>}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── AI Insights tab ────────────────────────────────────────────────────── */}
      {tab === 'insights' && (
        <>
          {/* KPI nhanh */}
          <div className="grid grid-cols-4 gap-3 mb-5">
            {[
              { label: 'Tổng cuộc gọi',     value: total,     Icon: Phone,        color: 'text-indigo-600', bg: 'bg-indigo-50' },
              { label: 'Kết nối thành công', value: completed, Icon: CheckCircle,  color: 'text-green-600',  bg: 'bg-green-50' },
              { label: 'Đặt lịch',           value: booked,    Icon: TrendingUp,   color: 'text-amber-600',  bg: 'bg-amber-50' },
              { label: 'Thời lượng TB',       value: avgDurIns > 0 ? `${Math.floor(avgDurIns / 60)}p${avgDurIns % 60}s` : '--', Icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50' },
            ].map(item => {
              const Icon = item.Icon
              return (
                <div key={item.label} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                  <div className={`w-9 h-9 ${item.bg} rounded-xl flex items-center justify-center mb-3`}>
                    <Icon className={`w-4 h-4 ${item.color}`} />
                  </div>
                  <p className="text-2xl font-bold text-gray-800">{item.value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{item.label}</p>
                </div>
              )
            })}
          </div>

          {/* Priority Queue */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm mb-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-orange-500" /> Gọi ngay hôm nay
                </p>
                <p className="text-xs text-gray-400 mt-0.5">AI xếp hạng theo mức độ ưu tiên — chưa gọi hôm nay & chưa đặt lịch</p>
              </div>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${priorityQueue.length > 0 ? 'bg-orange-50 text-orange-600' : 'bg-gray-100 text-gray-400'}`}>
                {priorityQueue.length} số cần gọi
              </span>
            </div>
            {priorityQueue.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">Tất cả liên hệ đã được gọi hôm nay hoặc đã đặt lịch 🎉</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {priorityQueue.map((c, i) => (
                  <div key={c.phone} className="flex items-center gap-3 py-2.5">
                    <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${
                      c.priority === 'high'   ? 'bg-red-100 text-red-600' :
                      c.priority === 'medium' ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-500'
                    }`}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{c.name}</p>
                      <p className="text-xs text-gray-400">{c.phone}</p>
                    </div>
                    <div className="text-right shrink-0 mr-2">
                      <p className="text-xs text-gray-500">{c.attempts} lần gọi</p>
                      <p className="text-xs text-gray-400">{new Date(c.lastCalled).toLocaleDateString('vi-VN')}</p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${
                      c.priority === 'high'   ? 'bg-red-50 text-red-600' :
                      c.priority === 'medium' ? 'bg-amber-50 text-amber-600' : 'bg-gray-100 text-gray-500'
                    }`}>{c.priority === 'high' ? 'Ưu tiên cao' : c.priority === 'medium' ? 'Bình thường' : 'Thấp'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Heatmap + Drop-off */}
          <div className="grid grid-cols-2 gap-5 mb-5">
            {/* Heatmap Giờ Vàng */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <p className="text-sm font-semibold text-gray-800 mb-0.5">Heatmap Giờ Vàng</p>
              <p className="text-xs text-gray-400 mb-3">Tỷ lệ nghe máy theo giờ & ngày trong tuần</p>
              <div className="flex gap-0.5 mb-1 ml-7">
                {['T2','T3','T4','T5','T6','T7','CN'].map(d => (
                  <div key={d} className="flex-1 text-center text-xs text-gray-400">{d}</div>
                ))}
              </div>
              {Array.from({ length: 13 }, (_, hi) => hi + 8).map(h => (
                <div key={h} className="flex items-center gap-0.5 mb-0.5">
                  <div className="w-6 text-right text-xs text-gray-300 pr-1 shrink-0">{h}h</div>
                  {[0,1,2,3,4,5,6].map(dow => {
                    const cell = heatmap[dow]?.[h - 8]
                    return (
                      <div
                        key={dow}
                        className="flex-1 h-5 rounded-sm cursor-default"
                        style={{ backgroundColor: heatColor(cell?.rate ?? -1) }}
                        title={cell && cell.rate >= 0 ? `${cell.rate}% nghe máy (${cell.total} cuộc)` : 'Chưa đủ dữ liệu'}
                      />
                    )
                  })}
                </div>
              ))}
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                {[
                  { bg: '#f3f4f6', label: 'Chưa đủ data' },
                  { bg: '#fee2e2', label: '<20%' },
                  { bg: '#fef9c3', label: '20-40%' },
                  { bg: '#bbf7d0', label: '40-60%' },
                  { bg: '#4ade80', label: '>60%' },
                ].map(l => (
                  <div key={l.label} className="flex items-center gap-1 text-xs text-gray-400">
                    <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: l.bg }} />
                    {l.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Drop-off Analysis */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <p className="text-sm font-semibold text-gray-800 mb-0.5">Điểm Rơi Cuộc Gọi</p>
              <p className="text-xs text-gray-400 mb-4">Phân bố thời lượng cuộc gọi được nghe máy</p>
              <div className="space-y-3">
                {dropoff.map(b => (
                  <div key={b.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-700 font-medium">{b.label}</span>
                      <span className="text-gray-400">
                        {b.total} cuộc{b.booked > 0 && <span className="text-green-600 ml-1">· {b.booked} đặt lịch</span>}
                      </span>
                    </div>
                    <div className="h-4 bg-gray-100 rounded-full overflow-hidden flex">
                      {b.total > 0 && b.booked > 0 && (
                        <div className="h-full bg-green-400 transition-all"
                          style={{ width: `${b.pct * (b.booked / b.total)}%` }} />
                      )}
                      {b.total > 0 && (b.total - b.booked) > 0 && (
                        <div className="h-full bg-indigo-300 transition-all"
                          style={{ width: `${b.pct * ((b.total - b.booked) / b.total)}%` }} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-4 mt-4 text-xs text-gray-400">
                <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-green-400 inline-block" /> Đặt lịch</span>
                <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-indigo-300 inline-block" /> Kết nối chưa đặt</span>
              </div>
            </div>
          </div>

          {/* Topic Analysis + Insights */}
          <div className="grid grid-cols-3 gap-5">
            {/* Topic Analysis */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <p className="text-sm font-semibold text-gray-800 mb-0.5 flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-indigo-500" /> Chủ đề cuộc gọi
              </p>
              <p className="text-xs text-gray-400 mb-4">Từ {withSummary} tóm tắt AI</p>
              {topics.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">Chưa có tóm tắt để phân tích</p>
              ) : (
                <div className="space-y-3">
                  {topics.map(t => (
                    <div key={t.label}>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-gray-700">{t.label}</span>
                        <span className="font-semibold text-gray-600">{t.count} ({t.pct}%)</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${t.pct}%`, backgroundColor: t.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Insights cards + conversion rates */}
            <div className="col-span-2 space-y-3">
              <p className="text-sm font-semibold text-gray-700">Phân tích & Gợi ý (30 ngày)</p>
              {insights.map((ins, i) => (
                <div key={i} className={`border rounded-2xl p-4 ${TYPE_BG[ins.type]}`}>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">{TYPE_ICON[ins.type]}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-800">{ins.title}</p>
                        {ins.value && <span className="text-lg font-bold text-gray-700 shrink-0">{ins.value}</span>}
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{ins.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
              <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                <p className="text-xs font-semibold text-gray-500 mb-3">Tỷ lệ chuyển đổi</p>
                <div className="space-y-3">
                  {[
                    { label: 'Kết nối',  value: total > 0 ? Math.round((completed / total) * 100) : 0, color: 'bg-indigo-400' },
                    { label: 'Đặt lịch', value: bookRate, color: 'bg-green-400' },
                  ].map(item => (
                    <div key={item.label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-500">{item.label}</span>
                        <span className="font-semibold text-gray-700">{item.value}%</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full ${item.color} rounded-full transition-all`} style={{ width: `${item.value}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </AppShell>
  )
}
