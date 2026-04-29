'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase, type Call } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import {
  RefreshCw, X, PhoneIncoming, PhoneOutgoing, PhoneMissed,
  CalendarCheck, Clock, Search, Download, Mic, Phone,
} from 'lucide-react'
import AppShell from '@/components/ui/app-shell'
import { PageSkeleton } from '@/components/skeleton'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(s: string) {
  const d = new Date(s)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

function fmtDuration(s: number | null) {
  if (!s || s === 0) return null
  if (s < 60) return `${s}s`
  return `${Math.floor(s/60)}p${s%60 > 0 ? `${s%60}s` : ''}`
}

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = Math.floor((now.setHours(0,0,0,0) - new Date(d.toDateString()).getTime()) / 86400000)
  if (diff === 0) return 'Hôm nay'
  if (diff === 1) return 'Hôm qua'
  const days = ['CN','T2','T3','T4','T5','T6','T7']
  return `${days[d.getDay()]} ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`
}

function calcScore(call: Call) {
  let s = 0
  if (call.appointment_booked) s += 50
  const d = call.duration_seconds ?? 0
  if (d >= 120) s += 30; else if (d >= 60) s += 20; else if (d >= 30) s += 10
  if (call.status === 'completed') s += 20
  return Math.min(s, 100)
}

function exportCSV(calls: Call[]) {
  const headers = ['Thời gian','Khách','SĐT','Loại','Thời lượng (s)','Trạng thái','Đặt lịch','Score','Tóm tắt']
  const rows = calls.map(c => [
    new Date(c.created_at).toLocaleString('vi-VN'),
    c.contact_name ?? '', c.contact_phone ?? '',
    c.direction === 'inbound' ? 'Gọi đến' : 'Gọi đi',
    c.duration_seconds ?? 0, c.status ?? '',
    c.appointment_booked ? 'Có' : 'Không',
    calcScore(c),
    (c.summary ?? '').replace(/,/g, ';'),
  ])
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url
  a.download = `lich-su-cuoc-goi-${new Date().toISOString().slice(0,10)}.csv`
  a.click(); URL.revokeObjectURL(url)
}

// ── Call Detail Modal ─────────────────────────────────────────────────────────

function CallDetailModal({ call, onClose }: { call: Call; onClose: () => void }) {
  const score = calcScore(call)
  const isIn  = call.direction === 'inbound'
  const noAns = call.status === 'no_answer'

  const scoreClr = score >= 80 ? { cls: 'bg-emerald-50 text-emerald-700', bar: 'bg-emerald-500', label: 'Xuất sắc' }
                 : score >= 60 ? { cls: 'bg-blue-50 text-blue-700',       bar: 'bg-blue-500',    label: 'Tốt'      }
                 : score >= 40 ? { cls: 'bg-amber-50 text-amber-700',     bar: 'bg-amber-500',   label: 'Trung bình' }
                 :               { cls: 'bg-red-50 text-red-600',          bar: 'bg-red-400',     label: 'Thấp'     }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              call.appointment_booked ? 'bg-violet-50' : isIn ? 'bg-emerald-50' : noAns ? 'bg-orange-50' : 'bg-blue-50'
            }`}>
              {call.appointment_booked ? <CalendarCheck className="w-4 h-4 text-violet-600" />
                : isIn                 ? <PhoneIncoming className="w-4 h-4 text-emerald-600" />
                : noAns                ? <PhoneMissed className="w-4 h-4 text-orange-500" />
                :                        <PhoneOutgoing className="w-4 h-4 text-blue-600" />}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">{call.contact_name || 'Không rõ tên'}</p>
              <p className="text-xs text-gray-400">{call.contact_phone} · {fmtTime(call.created_at)} {dayLabel(call.created_at)}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

          {/* Score */}
          {!noAns && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-gray-400">Điểm cuộc gọi</span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${scoreClr.cls}`}>{score}đ · {scoreClr.label}</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${scoreClr.bar}`} style={{ width: `${score}%` }} />
              </div>
            </div>
          )}

          {/* Info chips */}
          <div className="grid grid-cols-2 gap-2">
            {[
              ['Loại', isIn ? 'Gọi đến' : 'Gọi đi'],
              ['Thời lượng', fmtDuration(call.duration_seconds) ?? '--'],
              ['Kết quả', noAns ? 'Không nghe máy' : call.appointment_booked ? 'Đã đặt lịch' : 'Đã kết nối'],
              ['Retry', call.retry_count ? `Lần ${call.retry_count}` : 'Lần 1'],
            ].map(([label, value]) => (
              <div key={label} className="bg-gray-50 rounded-xl p-3">
                <p className="text-[11px] text-gray-400 mb-0.5">{label}</p>
                <p className={`text-sm font-semibold ${
                  value === 'Đã đặt lịch' ? 'text-violet-600' :
                  value === 'Không nghe máy' ? 'text-orange-500' : 'text-gray-700'
                }`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Appointment */}
          {call.appointment_booked && call.appointment_datetime && (
            <div className="bg-violet-50 border border-violet-100 rounded-xl p-3.5">
              <p className="text-xs font-semibold text-violet-600 mb-1 flex items-center gap-1.5">
                <CalendarCheck className="w-3.5 h-3.5" /> Lịch hẹn đã đặt
              </p>
              <p className="text-sm font-semibold text-violet-800">{call.appointment_datetime}</p>
              {call.appointment_notes && <p className="text-xs text-violet-600 mt-1">{call.appointment_notes}</p>}
            </div>
          )}

          {/* Summary */}
          {call.summary && (
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-[11px] font-semibold text-gray-400 mb-1.5">Tóm tắt AI</p>
              <p className="text-sm text-gray-700 leading-relaxed">{call.summary}</p>
            </div>
          )}

          {/* Recording */}
          {call.recording_url && (
            <div>
              <p className="text-[11px] font-semibold text-gray-400 mb-1.5 flex items-center gap-1.5">
                <Mic className="w-3 h-3" /> Ghi âm
              </p>
              <audio controls src={call.recording_url} className="w-full rounded-xl" />
            </div>
          )}

          {/* Transcript */}
          {call.transcript && (
            <div>
              <p className="text-[11px] font-semibold text-gray-400 mb-1.5">Nội dung cuộc gọi</p>
              <div className="bg-gray-50 rounded-xl p-4 max-h-52 overflow-y-auto space-y-1.5 text-xs">
                {call.transcript.split('\n').filter(l => l.trim()).map((line, i) => (
                  <p key={i} className={
                    line.startsWith('Agent:') ? 'text-blue-700 font-medium' :
                    line.startsWith('User:')  ? 'text-gray-700' : 'text-gray-400 italic'
                  }>{line}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────

type StatusFilter = 'all' | 'booked' | 'completed' | 'no_answer'
type PeriodFilter = 'today' | '7d' | '30d' | 'all'

const PERIODS: { key: PeriodFilter; label: string }[] = [
  { key: 'today', label: 'Hôm nay' },
  { key: '7d',    label: '7 ngày'  },
  { key: '30d',   label: '30 ngày' },
  { key: 'all',   label: 'Tất cả'  },
]

// ── Call row card ─────────────────────────────────────────────────────────────

function CallCard({ call, onClick }: { call: Call; onClick: () => void }) {
  const noAns  = call.status === 'no_answer'
  const booked = call.appointment_booked
  const score  = calcScore(call)
  const dur    = fmtDuration(call.duration_seconds)

  const iconBg  = booked ? 'bg-violet-100' : noAns ? 'bg-orange-50' : 'bg-blue-50'
  const iconClr = booked ? 'text-violet-600' : noAns ? 'text-orange-400' : 'text-blue-500'

  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-start gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors group"
    >
      {/* Icon */}
      <div className={`w-9 h-9 rounded-full ${iconBg} flex items-center justify-center shrink-0 mt-0.5`}>
        {booked        ? <CalendarCheck className={`w-4 h-4 ${iconClr}`} />
          : noAns      ? <PhoneMissed   className={`w-4 h-4 ${iconClr}`} />
          : call.direction === 'inbound'
                       ? <PhoneIncoming className={`w-4 h-4 ${iconClr}`} />
                       : <PhoneOutgoing className={`w-4 h-4 ${iconClr}`} />}
      </div>

      {/* Main info */}
      <div className="flex-1 min-w-0">
        {/* Row 1: name + time + status */}
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-semibold text-gray-800 truncate">
            {call.contact_name || call.contact_phone || '—'}
          </span>
          {call.contact_name && (
            <span className="text-xs text-gray-400 shrink-0">{call.contact_phone}</span>
          )}
          <span className="ml-auto text-xs text-gray-400 shrink-0 pl-2">{fmtTime(call.created_at)}</span>
        </div>

        {/* Row 2: summary or status */}
        <p className="text-xs text-gray-400 truncate leading-relaxed">
          {call.summary
            ? call.summary
            : noAns ? 'Không nghe máy'
            : booked ? `Đặt lịch hẹn${call.appointment_datetime ? ' · ' + call.appointment_datetime : ''}`
            : 'Đã kết nối'}
        </p>
      </div>

      {/* Right meta */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        {booked ? (
          <span className="text-[10px] font-bold bg-violet-50 text-violet-600 px-2 py-0.5 rounded-full">Đặt lịch</span>
        ) : noAns ? (
          <span className="text-[10px] font-bold bg-orange-50 text-orange-500 px-2 py-0.5 rounded-full">Không nghe</span>
        ) : (
          <span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">Kết nối</span>
        )}
        <div className="flex items-center gap-1 text-[10px] text-gray-400">
          {dur && <><Clock className="w-2.5 h-2.5" />{dur}</>}
          {!noAns && <span className="text-gray-300 ml-1">{score}đ</span>}
        </div>
      </div>
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CallHistoryPage() {
  const router = useRouter()
  const [allCalls, setAllCalls]         = useState<Call[]>([])
  const [loading, setLoading]           = useState(true)
  const [clientName, setClientName]     = useState<string | null>(null)
  const [selectedCall, setSelectedCall] = useState<Call | null>(null)
  const [refreshing, setRefreshing]     = useState(false)

  const [period, setPeriod]   = useState<PeriodFilter>('30d')
  const [status, setStatus]   = useState<StatusFilter>('all')
  const [search, setSearch]   = useState('')

  const clientIdRef = useRef<string | null>(null)

  const fetchCalls = useCallback(async (id: string) => {
    const { data } = await supabase
      .from('calls').select('*').eq('tenant_id', id)
      .order('created_at', { ascending: false }).limit(500)
    setAllCalls(data ?? [])
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

  useEffect(() => {
    const iv = setInterval(() => { if (clientIdRef.current) fetchCalls(clientIdRef.current) }, 30000)
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
    if (period === 'today') return d.toDateString() === new Date().toDateString()
    const t = new Date(); t.setDate(t.getDate() - (period === '7d' ? 7 : 30)); return d >= t
  })

  const filtered = periodFiltered.filter(c => {
    if (status === 'booked'    && !c.appointment_booked)     return false
    if (status === 'completed' && c.status !== 'completed')  return false
    if (status === 'no_answer' && c.status !== 'no_answer')  return false
    if (search) {
      const q = search.toLowerCase()
      return (c.contact_name ?? '').toLowerCase().includes(q) || (c.contact_phone ?? '').includes(q)
    }
    return true
  })

  // ── KPIs ─────────────────────────────────────────────────────────────────────

  const base    = periodFiltered
  const booked  = base.filter(c => c.appointment_booked).length
  const noAns   = base.filter(c => c.status === 'no_answer').length
  const connect = base.filter(c => c.status === 'completed').length
  const bookRate = base.length > 0 ? Math.round((booked / base.length) * 100) : 0

  // ── Group by day ─────────────────────────────────────────────────────────────

  const grouped: { label: string; calls: Call[] }[] = []
  for (const call of filtered) {
    const label = dayLabel(call.created_at)
    const last  = grouped[grouped.length - 1]
    if (last && last.label === label) last.calls.push(call)
    else grouped.push({ label, calls: [call] })
  }

  if (loading) return <PageSkeleton />

  return (
    <AppShell clientName={clientName}>
      {selectedCall && <CallDetailModal call={selectedCall} onClose={() => setSelectedCall(null)} />}

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Lịch sử cuộc gọi</h1>
          <p className="text-xs text-gray-400 mt-0.5">Tự động cập nhật · {allCalls.length} cuộc đã ghi</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => exportCSV(filtered)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button onClick={handleRefresh}
            className="p-2 bg-white border border-gray-200 rounded-lg text-gray-400 hover:bg-gray-50 transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-5 gap-3 mb-5">
        {[
          { label: 'Tổng cuộc gọi', value: base.length,  sub: period === 'today' ? 'hôm nay' : period, color: 'text-gray-800',    bg: 'bg-gray-50'    },
          { label: 'Kết nối',       value: connect,       sub: `${base.length > 0 ? Math.round(connect/base.length*100) : 0}% nghe`, color: 'text-blue-700',   bg: 'bg-blue-50'    },
          { label: 'Đặt lịch',      value: booked,        sub: `${bookRate}% CR`,  color: 'text-violet-700', bg: 'bg-violet-50'  },
          { label: 'Không nghe',    value: noAns,         sub: `${base.length > 0 ? Math.round(noAns/base.length*100) : 0}% tổng`, color: 'text-orange-600', bg: 'bg-orange-50'  },
          { label: 'Chất lượng',    value: `${bookRate}%`, sub: 'tỷ lệ chốt lịch', color: bookRate >= 15 ? 'text-emerald-700' : bookRate >= 8 ? 'text-amber-600' : 'text-red-500', bg: bookRate >= 15 ? 'bg-emerald-50' : bookRate >= 8 ? 'bg-amber-50' : 'bg-red-50' },
        ].map(k => (
          <div key={k.label} className={`${k.bg} rounded-2xl p-4`}>
            <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
            <p className="text-xs text-gray-600 mt-0.5 font-medium">{k.label}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Filter bar (1 row) ── */}
      <div className="flex items-center gap-2 mb-4">

        {/* Period */}
        <div className="flex bg-gray-100 rounded-xl p-1 gap-0.5">
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                period === p.key ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>{p.label}
            </button>
          ))}
        </div>

        {/* Status */}
        <div className="flex bg-gray-100 rounded-xl p-1 gap-0.5">
          {([['all','Tất cả'],['booked','Đặt lịch'],['completed','Kết nối'],['no_answer','Không nghe']] as [StatusFilter,string][]).map(([k,l]) => (
            <button key={k} onClick={() => setStatus(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                status === k ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>{l}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Tên, SĐT..."
            className="pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 w-44" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <X className="w-3 h-3 text-gray-400 hover:text-gray-600" />
            </button>
          )}
        </div>

        <span className="text-xs text-gray-400 font-medium whitespace-nowrap">{filtered.length} cuộc</span>
      </div>

      {/* ── Grouped card list ── */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center shadow-sm">
          <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Phone className="w-5 h-5 text-gray-300" />
          </div>
          <p className="text-sm text-gray-400 font-medium">Không có cuộc gọi nào</p>
          <p className="text-xs text-gray-300 mt-1">Thử đổi bộ lọc hoặc khoảng thời gian</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(group => (
            <div key={group.label}>
              {/* Date header */}
              <div className="flex items-center gap-3 mb-2 px-1">
                <span className="text-xs font-bold text-gray-500">{group.label}</span>
                <span className="text-xs text-gray-300">{group.calls.length} cuộc</span>
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-xs text-gray-300">
                  {group.calls.filter(c => c.appointment_booked).length > 0
                    ? `${group.calls.filter(c => c.appointment_booked).length} đặt lịch`
                    : ''}
                </span>
              </div>

              {/* Cards */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-50">
                {group.calls.map(call => (
                  <CallCard key={call.id} call={call} onClick={() => setSelectedCall(call)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  )
}
