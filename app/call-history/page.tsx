'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase, type Call } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import {
  RefreshCw, X, Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed,
  CalendarCheck, Clock, Search, Download, ChevronRight, Mic,
} from 'lucide-react'
import AppShell from '@/components/ui/app-shell'
import { PageSkeleton } from '@/components/skeleton'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateTime(s: string) {
  const d = new Date(s)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const time = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
  if (isToday) return `Hôm nay ${time}`
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${time}`
}

function formatDuration(s: number | null) {
  if (!s || s === 0) return '--'
  if (s < 60) return `${s}s`
  return `${Math.floor(s/60)}p${s%60 > 0 ? ` ${s%60}s` : ''}`
}

function calcScore(call: Call) {
  let s = 0
  if (call.appointment_booked) s += 50
  const d = call.duration_seconds ?? 0
  if (d >= 120) s += 30; else if (d >= 60) s += 20; else if (d >= 30) s += 10
  if (call.status === 'completed') s += 20
  return Math.min(s, 100)
}

function scoreConfig(score: number) {
  if (score >= 80) return { label: 'Xuất sắc', cls: 'bg-emerald-50 text-emerald-700', bar: 'bg-emerald-500' }
  if (score >= 60) return { label: 'Tốt',       cls: 'bg-blue-50 text-blue-700',     bar: 'bg-blue-500'    }
  if (score >= 40) return { label: 'Trung bình', cls: 'bg-amber-50 text-amber-700',  bar: 'bg-amber-500'   }
  return              { label: 'Thấp',           cls: 'bg-red-50 text-red-600',      bar: 'bg-red-400'     }
}

function exportCSV(calls: Call[]) {
  const headers = ['Thời gian', 'Khách', 'Số điện thoại', 'Loại', 'Thời lượng (s)', 'Trạng thái', 'Đặt lịch', 'Score', 'Tóm tắt']
  const rows = calls.map(c => [
    new Date(c.created_at).toLocaleString('vi-VN'),
    c.contact_name ?? '',
    c.contact_phone ?? '',
    c.direction === 'inbound' ? 'Gọi đến' : 'Gọi đi',
    c.duration_seconds ?? 0,
    c.status ?? '',
    c.appointment_booked ? 'Có' : 'Không',
    calcScore(c),
    (c.summary ?? '').replace(/,/g, ';'),
  ])
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `lich-su-cuoc-goi-${new Date().toISOString().slice(0,10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Call Detail Modal ─────────────────────────────────────────────────────────

function CallDetailModal({ call, onClose }: { call: Call; onClose: () => void }) {
  const score = calcScore(call)
  const cfg   = scoreConfig(score)
  const isIn  = call.direction === 'inbound'

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isIn ? 'bg-emerald-50' : 'bg-blue-50'}`}>
              {isIn
                ? <PhoneIncoming className="w-4 h-4 text-emerald-600" />
                : <PhoneOutgoing className="w-4 h-4 text-blue-600" />}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">{call.contact_name || 'Không rõ tên'}</p>
              <p className="text-xs text-gray-400">{call.contact_phone || '--'} · {formatDateTime(call.created_at)}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* Score */}
          {call.status !== 'no_answer' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-500">Điểm cuộc gọi</span>
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${cfg.cls}`}>{score}đ · {cfg.label}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${cfg.bar}`} style={{ width: `${score}%` }} />
              </div>
            </div>
          )}

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-2.5">
            {[
              ['Loại cuộc gọi', isIn ? 'Gọi đến' : 'Gọi đi'],
              ['Thời lượng',    formatDuration(call.duration_seconds)],
              ['Trạng thái',    call.status === 'completed' ? 'Đã kết nối' : call.status === 'no_answer' ? 'Không nghe máy' : call.status ?? '--'],
              ['Đặt lịch',      call.appointment_booked ? '✓ Đã đặt' : '✗ Chưa đặt'],
            ].map(([label, value]) => (
              <div key={label} className="bg-gray-50 rounded-2xl p-3.5">
                <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                <p className={`text-sm font-semibold ${
                  value === '✓ Đã đặt' ? 'text-emerald-600' :
                  value === '✗ Chưa đặt' ? 'text-gray-400' : 'text-gray-700'
                }`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Appointment */}
          {call.appointment_booked && call.appointment_datetime && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
              <p className="text-xs font-semibold text-emerald-600 mb-1 flex items-center gap-1.5">
                <CalendarCheck className="w-3.5 h-3.5" /> Lịch hẹn đã đặt
              </p>
              <p className="text-sm font-semibold text-emerald-800">{call.appointment_datetime}</p>
              {call.appointment_notes && <p className="text-xs text-emerald-600 mt-1">{call.appointment_notes}</p>}
            </div>
          )}

          {/* Summary */}
          {call.summary && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">Tóm tắt AI</p>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-2xl p-4 leading-relaxed">{call.summary}</p>
            </div>
          )}

          {/* Recording */}
          {call.recording_url && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1.5">
                <Mic className="w-3.5 h-3.5" /> Ghi âm
              </p>
              <audio controls src={call.recording_url} className="w-full rounded-xl" />
            </div>
          )}

          {/* Transcript */}
          {call.transcript && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">Nội dung cuộc gọi</p>
              <div className="bg-gray-50 rounded-2xl p-4 max-h-52 overflow-y-auto space-y-1.5">
                {call.transcript.split('\n').map((line, i) => {
                  if (!line.trim()) return null
                  const isAgent = line.startsWith('Agent:')
                  const isUser  = line.startsWith('User:')
                  return (
                    <p key={i} className={`text-xs leading-relaxed ${
                      isAgent ? 'text-blue-700 font-medium' :
                      isUser  ? 'text-gray-700' : 'text-gray-400 italic'
                    }`}>{line}</p>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Types & filters ───────────────────────────────────────────────────────────

type DirectionFilter = 'all' | 'inbound' | 'outbound'
type StatusFilter    = 'all' | 'completed' | 'no_answer' | 'booked'
type PeriodFilter    = 'today' | '7d' | '30d' | 'all'

const PERIOD_LABELS: Record<PeriodFilter, string> = {
  today: 'Hôm nay', '7d': '7 ngày', '30d': '30 ngày', all: 'Tất cả',
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CallHistoryPage() {
  const router = useRouter()
  const [allCalls, setAllCalls] = useState<Call[]>([])
  const [loading, setLoading]   = useState(true)
  const [clientName, setClientName] = useState<string | null>(null)
  const [selectedCall, setSelectedCall] = useState<Call | null>(null)
  const [lastRefresh, setLastRefresh]   = useState<Date | null>(null)
  const [refreshing, setRefreshing]     = useState(false)

  const [period, setPeriod]       = useState<PeriodFilter>('30d')
  const [direction, setDirection] = useState<DirectionFilter>('all')
  const [status, setStatus]       = useState<StatusFilter>('all')
  const [search, setSearch]       = useState('')

  const clientIdRef = useRef<string | null>(null)

  const fetchCalls = useCallback(async (clientId: string) => {
    const { data } = await supabase
      .from('calls').select('*').eq('tenant_id', clientId)
      .order('created_at', { ascending: false }).limit(500)
    setAllCalls(data ?? [])
    setLastRefresh(new Date())
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: cu } = await supabase.from('client_users').select('client_id').eq('user_id', user.id).single()
      if (!cu) { setLoading(false); return }
      clientIdRef.current = cu.client_id
      const { data: c } = await supabase.from('clients').select('name').eq('id', cu.client_id).single()
      setClientName((c as { name?: string } | null)?.name ?? null)
      await fetchCalls(cu.client_id)
      setLoading(false)
    }
    init()
  }, [router, fetchCalls])

  // Auto-refresh mỗi 30s
  useEffect(() => {
    const iv = setInterval(() => {
      if (clientIdRef.current) fetchCalls(clientIdRef.current)
    }, 30000)
    return () => clearInterval(iv)
  }, [fetchCalls])

  async function handleRefresh() {
    if (!clientIdRef.current) return
    setRefreshing(true)
    await fetchCalls(clientIdRef.current)
    setRefreshing(false)
  }

  // ── Filter pipeline ──────────────────────────────────────────────────────────

  const periodFiltered = allCalls.filter(c => {
    if (period === 'all') return true
    const d = new Date(c.created_at)
    const now = new Date()
    if (period === 'today') return d.toDateString() === now.toDateString()
    if (period === '7d')  { const t = new Date(); t.setDate(t.getDate()-7);  return d >= t }
    if (period === '30d') { const t = new Date(); t.setDate(t.getDate()-30); return d >= t }
    return true
  })

  const filtered = periodFiltered.filter(c => {
    if (direction === 'inbound'  && c.direction !== 'inbound')  return false
    if (direction === 'outbound' && c.direction !== 'outbound') return false
    if (status === 'completed' && c.status !== 'completed') return false
    if (status === 'no_answer' && c.status !== 'no_answer') return false
    if (status === 'booked'    && !c.appointment_booked)    return false
    if (search) {
      const q = search.toLowerCase()
      return (c.contact_name ?? '').toLowerCase().includes(q) || (c.contact_phone ?? '').includes(q)
    }
    return true
  })

  // ── KPIs ─────────────────────────────────────────────────────────────────────

  const base     = periodFiltered
  const totalIn  = base.filter(c => c.direction === 'inbound').length
  const totalOut = base.filter(c => c.direction === 'outbound').length
  const booked   = base.filter(c => c.appointment_booked).length
  const noAnswer = base.filter(c => c.status === 'no_answer').length
  const hotLeads = base.filter(c => calcScore(c) >= 70 && c.status !== 'no_answer').length

  if (loading) return <PageSkeleton />

  const lastRefreshStr = lastRefresh
    ? `${String(lastRefresh.getHours()).padStart(2,'0')}:${String(lastRefresh.getMinutes()).padStart(2,'0')}`
    : null

  return (
    <AppShell clientName={clientName}>
      {selectedCall && <CallDetailModal call={selectedCall} onClose={() => setSelectedCall(null)} />}

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-bold text-gray-800 tracking-tight">Lịch sử cuộc gọi</h1>
          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1.5">
            <RefreshCw className="w-3 h-3" />
            Tự động cập nhật mỗi 30 giây
            {lastRefreshStr && <span>· Lần cuối {lastRefreshStr}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => exportCSV(filtered)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button onClick={handleRefresh}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Làm mới
          </button>
        </div>
      </div>

      {/* ── Period selector ── */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit">
        {(Object.keys(PERIOD_LABELS) as PeriodFilter[]).map(p => (
          <button key={p} onClick={() => setPeriod(p)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              period === p ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {[
          { label: 'Tổng cuộc gọi',  value: base.length, Icon: Phone,         bg: 'bg-indigo-50',  color: 'text-indigo-600'  },
          { label: 'Gọi đến',        value: totalIn,      Icon: PhoneIncoming,  bg: 'bg-emerald-50', color: 'text-emerald-600' },
          { label: 'Gọi đi',         value: totalOut,     Icon: PhoneOutgoing,  bg: 'bg-blue-50',    color: 'text-blue-600'    },
          { label: 'Đặt lịch',       value: booked,       Icon: CalendarCheck,  bg: 'bg-violet-50',  color: 'text-violet-600'  },
          { label: 'Không nghe',     value: noAnswer,     Icon: PhoneMissed,    bg: 'bg-orange-50',  color: 'text-orange-500'  },
        ].map(k => {
          const Icon = k.Icon
          return (
            <div key={k.label} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 shadow-sm">
              <div className={`w-9 h-9 ${k.bg} rounded-xl flex items-center justify-center shrink-0`}>
                <Icon className={`w-4 h-4 ${k.color}`} />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-800 leading-tight">{k.value}</p>
                <p className="text-xs text-gray-400">{k.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Hot leads */}
      {hotLeads > 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
          <span className="text-sm font-semibold text-amber-700">{hotLeads} lead nóng (score ≥ 70)</span>
          <span className="text-xs text-amber-600">— Cần follow-up sớm</span>
          <button onClick={() => setStatus('booked')}
            className="ml-auto text-xs text-amber-600 underline hover:no-underline">Xem ngay</button>
        </div>
      )}

      {/* ── Filter bar ── */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {/* Direction */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {([['all','Tất cả'], ['inbound','Gọi đến'], ['outbound','Gọi đi']] as [DirectionFilter,string][]).map(([k,l]) => (
            <button key={k} onClick={() => setDirection(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                direction === k ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>{l}</button>
          ))}
        </div>

        {/* Status */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {([['all','Tất cả'], ['completed','Kết nối'], ['no_answer','Không nghe'], ['booked','Đặt lịch']] as [StatusFilter,string][]).map(([k,l]) => (
            <button key={k} onClick={() => setStatus(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                status === k ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>{l}</button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Tìm tên, số điện thoại..."
            className="pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 w-52" />
        </div>

        <span className="ml-auto text-xs text-gray-400 font-medium">{filtered.length} cuộc gọi</span>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Phone className="w-5 h-5 text-gray-300" />
            </div>
            <p className="text-sm text-gray-400 font-medium">Không có cuộc gọi nào</p>
            <p className="text-xs text-gray-300 mt-1">Thử đổi bộ lọc hoặc khoảng thời gian</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Thời gian', 'Khách hàng', 'Loại', 'Thời lượng', 'Trạng thái', 'Score', 'Tóm tắt', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(c => {
                  const isIn   = c.direction === 'inbound'
                  const noAns  = c.status === 'no_answer'
                  const score  = calcScore(c)
                  const cfg    = scoreConfig(score)

                  return (
                    <tr key={c.id}
                      onClick={() => setSelectedCall(c)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors group">

                      {/* Time */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs text-gray-500">{formatDateTime(c.created_at)}</span>
                      </td>

                      {/* Contact */}
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-700 leading-tight">{c.contact_name || '—'}</p>
                        <p className="text-xs text-gray-400">{c.contact_phone || ''}</p>
                      </td>

                      {/* Direction */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          isIn ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                        }`}>
                          {isIn
                            ? <PhoneIncoming className="w-3 h-3" />
                            : <PhoneOutgoing className="w-3 h-3" />}
                          {isIn ? 'Đến' : 'Đi'}
                        </span>
                      </td>

                      {/* Duration */}
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-600 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-gray-300" />
                          {formatDuration(c.duration_seconds)}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        {noAns ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-50 text-orange-600">
                            <PhoneMissed className="w-3 h-3" /> Không nghe
                          </span>
                        ) : c.appointment_booked ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-violet-50 text-violet-700">
                            <CalendarCheck className="w-3 h-3" /> Đặt lịch
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">
                            Đã kết nối
                          </span>
                        )}
                      </td>

                      {/* Score */}
                      <td className="px-4 py-3">
                        {noAns ? (
                          <span className="text-xs text-gray-300">--</span>
                        ) : (
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${cfg.cls}`}>{score}đ</span>
                        )}
                      </td>

                      {/* Summary */}
                      <td className="px-4 py-3 max-w-xs">
                        <p className="text-xs text-gray-400 truncate">{c.summary || '--'}</p>
                      </td>

                      {/* Arrow */}
                      <td className="px-3 py-3">
                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  )
}
