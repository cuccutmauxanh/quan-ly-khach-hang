'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase, type Call } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import {
  RefreshCw, X, PhoneIncoming, PhoneOutgoing, PhoneMissed,
  CalendarCheck, Clock, Search, Download, Mic, Phone,
  ChevronDown, ChevronRight, Users, List,
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
  return `${Math.floor(s/60)}p${s % 60 > 0 ? `${s % 60}s` : ''}`
}

function dayLabel(iso: string): string {
  const d   = new Date(iso)
  const now = new Date()
  const diff = Math.floor((now.setHours(0,0,0,0) - new Date(d.toDateString()).getTime()) / 86400000)
  if (diff === 0) return 'Hôm nay'
  if (diff === 1) return 'Hôm qua'
  const days = ['CN','T2','T3','T4','T5','T6','T7']
  return `${days[d.getDay()]} ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60)    return `${diff}s trước`
  if (diff < 3600)  return `${Math.floor(diff/60)} phút trước`
  if (diff < 86400) return `${Math.floor(diff/3600)} giờ trước`
  return dayLabel(iso)
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
  const scoreClr = score >= 80 ? { cls:'bg-emerald-50 text-emerald-700', bar:'bg-emerald-500', label:'Xuất sắc'  }
                 : score >= 60 ? { cls:'bg-blue-50 text-blue-700',       bar:'bg-blue-500',    label:'Tốt'       }
                 : score >= 40 ? { cls:'bg-amber-50 text-amber-700',     bar:'bg-amber-500',   label:'Trung bình'}
                 :               { cls:'bg-red-50 text-red-600',          bar:'bg-red-400',     label:'Thấp'      }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              call.appointment_booked ? 'bg-violet-50' : isIn ? 'bg-emerald-50' : noAns ? 'bg-orange-50' : 'bg-blue-50'
            }`}>
              {call.appointment_booked ? <CalendarCheck className="w-4 h-4 text-violet-600" />
                : isIn  ? <PhoneIncoming className="w-4 h-4 text-emerald-600" />
                : noAns ? <PhoneMissed   className="w-4 h-4 text-orange-500"  />
                :          <PhoneOutgoing className="w-4 h-4 text-blue-600"   />}
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
          {call.appointment_booked && call.appointment_datetime && (
            <div className="bg-violet-50 border border-violet-100 rounded-xl p-3.5">
              <p className="text-xs font-semibold text-violet-600 mb-1 flex items-center gap-1.5">
                <CalendarCheck className="w-3.5 h-3.5" /> Lịch hẹn đã đặt
              </p>
              <p className="text-sm font-semibold text-violet-800">{call.appointment_datetime}</p>
              {call.appointment_notes && <p className="text-xs text-violet-600 mt-1">{call.appointment_notes}</p>}
            </div>
          )}
          {call.summary && (
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-[11px] font-semibold text-gray-400 mb-1.5">Tóm tắt AI</p>
              <p className="text-sm text-gray-700 leading-relaxed">{call.summary}</p>
            </div>
          )}
          {call.recording_url && (
            <div>
              <p className="text-[11px] font-semibold text-gray-400 mb-1.5 flex items-center gap-1.5">
                <Mic className="w-3 h-3" /> Ghi âm
              </p>
              <audio controls src={call.recording_url} className="w-full rounded-xl" />
            </div>
          )}
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

// ── Contact group (grouped view) ──────────────────────────────────────────────

type ContactGroup = {
  phone: string
  name: string
  calls: Call[]
  booked: boolean
  lastCall: string
  totalConnected: number
  bestSummary: string | null
}

function buildContactGroups(calls: Call[]): ContactGroup[] {
  const map = new Map<string, Call[]>()
  for (const c of calls) {
    const key = c.contact_phone ?? 'unknown'
    const arr = map.get(key) ?? []; arr.push(c); map.set(key, arr)
  }
  const groups: ContactGroup[] = []
  map.forEach((cList, phone) => {
    const sorted  = [...cList].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    const booked  = sorted.some(c => c.appointment_booked)
    const name    = sorted.find(c => c.contact_name)?.contact_name ?? phone
    const connected = sorted.filter(c => c.status === 'completed')
    const bestSummary = sorted.find(c => c.summary)?.summary ?? null
    groups.push({
      phone, name, calls: sorted, booked,
      lastCall: sorted[0].created_at,
      totalConnected: connected.length,
      bestSummary,
    })
  })
  return groups.sort((a, b) => new Date(b.lastCall).getTime() - new Date(a.lastCall).getTime())
}

function ContactCard({ group, onCallClick }: { group: ContactGroup; onCallClick: (c: Call) => void }) {
  const [expanded, setExpanded] = useState(false)
  const allNoAnswer = group.calls.every(c => c.status === 'no_answer')
  const attempts    = group.calls.length

  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
      {/* Summary row */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left"
      >
        {/* Avatar */}
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold ${
          group.booked       ? 'bg-violet-100 text-violet-600'
          : allNoAnswer      ? 'bg-orange-50 text-orange-400'
          : group.totalConnected > 0 ? 'bg-blue-50 text-blue-600'
          : 'bg-gray-100 text-gray-400'
        }`}>
          {group.name.slice(-1).toUpperCase()}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-gray-800 truncate">{group.name}</span>
            <span className="text-xs text-gray-400 shrink-0">{group.phone !== group.name ? group.phone : ''}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className={`font-medium ${allNoAnswer ? 'text-orange-500' : group.booked ? 'text-violet-600' : 'text-blue-600'}`}>
              {group.booked ? '✓ Đặt lịch'
                : allNoAnswer ? `${attempts} lần không nghe`
                : `${group.totalConnected}/${attempts} kết nối`}
            </span>
            {group.bestSummary && (
              <span className="truncate text-gray-400">· {group.bestSummary}</span>
            )}
          </div>
        </div>

        {/* Right */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-xs text-gray-400">{timeAgo(group.lastCall)}</span>
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              group.booked ? 'bg-violet-50 text-violet-600'
              : allNoAnswer ? 'bg-orange-50 text-orange-500'
              : 'bg-blue-50 text-blue-600'
            }`}>
              {attempts} cuộc
            </span>
            {expanded
              ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
              : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
          </div>
        </div>
      </button>

      {/* Expanded individual calls */}
      {expanded && (
        <div className="border-t border-gray-50 divide-y divide-gray-50 bg-gray-50/50">
          {group.calls.map(call => {
            const noAns = call.status === 'no_answer'
            const dur   = fmtDuration(call.duration_seconds)
            return (
              <button key={call.id} onClick={() => onCallClick(call)}
                className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-white transition-colors text-left">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                  call.appointment_booked ? 'bg-violet-100' : noAns ? 'bg-orange-50' : 'bg-blue-50'
                }`}>
                  {call.appointment_booked ? <CalendarCheck className="w-3 h-3 text-violet-600" />
                    : noAns ? <PhoneMissed className="w-3 h-3 text-orange-400" />
                    : call.direction === 'inbound' ? <PhoneIncoming className="w-3 h-3 text-blue-500" />
                    : <PhoneOutgoing className="w-3 h-3 text-blue-500" />}
                </div>
                <span className="text-xs text-gray-500 w-12 shrink-0">{fmtTime(call.created_at)}</span>
                <span className="text-xs text-gray-400 shrink-0">{dayLabel(call.created_at)}</span>
                <span className="flex-1 text-xs text-gray-400 truncate ml-2">
                  {call.summary || (noAns ? 'Không nghe máy' : call.appointment_booked ? 'Đã đặt lịch' : 'Đã kết nối')}
                </span>
                {dur && (
                  <span className="text-xs text-gray-400 flex items-center gap-0.5 shrink-0">
                    <Clock className="w-2.5 h-2.5" />{dur}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Call row (timeline view) ──────────────────────────────────────────────────

function CallCard({ call, onClick }: { call: Call; onClick: () => void }) {
  const noAns  = call.status === 'no_answer'
  const booked = call.appointment_booked
  const dur    = fmtDuration(call.duration_seconds)

  return (
    <button onClick={onClick}
      className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
        booked ? 'bg-violet-100' : noAns ? 'bg-orange-50' : 'bg-blue-50'
      }`}>
        {booked ? <CalendarCheck className="w-3.5 h-3.5 text-violet-600" />
          : noAns ? <PhoneMissed className="w-3.5 h-3.5 text-orange-400" />
          : call.direction === 'inbound' ? <PhoneIncoming className="w-3.5 h-3.5 text-blue-500" />
          : <PhoneOutgoing className="w-3.5 h-3.5 text-blue-500" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-gray-800 truncate">
            {call.contact_name || call.contact_phone || '—'}
          </span>
          {call.contact_name && <span className="text-xs text-gray-400 shrink-0">{call.contact_phone}</span>}
        </div>
        <p className="text-xs text-gray-400 truncate mt-0.5">
          {call.summary || (noAns ? 'Không nghe máy' : booked ? 'Đã đặt lịch hẹn' : 'Đã kết nối')}
        </p>
      </div>

      <div className="flex flex-col items-end gap-0.5 shrink-0 text-right">
        <span className="text-xs text-gray-400">{fmtTime(call.created_at)}</span>
        <div className="flex items-center gap-1.5">
          {dur && <span className="text-[10px] text-gray-400 flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{dur}</span>}
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
            booked ? 'bg-violet-50 text-violet-600'
            : noAns ? 'bg-orange-50 text-orange-500'
            : 'bg-blue-50 text-blue-600'
          }`}>
            {booked ? 'Đặt lịch' : noAns ? 'Không nghe' : 'Kết nối'}
          </span>
        </div>
      </div>
    </button>
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────

type StatusFilter = 'all' | 'booked' | 'completed' | 'no_answer'
type PeriodFilter = 'today' | '7d' | '30d' | 'all'
type ViewMode    = 'timeline' | 'contacts'

const PERIODS: { key: PeriodFilter; label: string }[] = [
  { key: 'today', label: 'Hôm nay' },
  { key: '7d',    label: '7 ngày'  },
  { key: '30d',   label: '30 ngày' },
  { key: 'all',   label: 'Tất cả'  },
]

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
  const [viewMode, setViewMode] = useState<ViewMode>('contacts')

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
    if (status === 'booked'    && !c.appointment_booked)    return false
    if (status === 'completed' && c.status !== 'completed') return false
    if (status === 'no_answer' && c.status !== 'no_answer') return false
    if (search) {
      const q = search.toLowerCase()
      return (c.contact_name ?? '').toLowerCase().includes(q) || (c.contact_phone ?? '').includes(q)
    }
    return true
  })

  // ── KPIs ─────────────────────────────────────────────────────────────────────

  const base      = periodFiltered
  const booked    = base.filter(c => c.appointment_booked).length
  const noAns     = base.filter(c => c.status === 'no_answer').length
  const connect   = base.filter(c => c.status === 'completed').length
  const bookRate  = base.length > 0 ? Math.round((booked / base.length) * 100) : 0
  const uniqueContacts = new Set(base.map(c => c.contact_phone).filter(Boolean)).size

  // ── Contact groups ────────────────────────────────────────────────────────────

  const contactGroups = buildContactGroups(filtered)

  // ── Timeline groups (by day) ──────────────────────────────────────────────────

  const dayGroups: { label: string; calls: Call[] }[] = []
  for (const call of filtered) {
    const label = dayLabel(call.created_at)
    const last  = dayGroups[dayGroups.length - 1]
    if (last && last.label === label) last.calls.push(call)
    else dayGroups.push({ label, calls: [call] })
  }

  if (loading) return <PageSkeleton />

  return (
    <AppShell clientName={clientName}>
      {selectedCall && <CallDetailModal call={selectedCall} onClose={() => setSelectedCall(null)} />}

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Lịch sử cuộc gọi</h1>
          <p className="text-xs text-gray-400 mt-0.5">Tự động cập nhật mỗi 30s · {allCalls.length} cuộc đã ghi</p>
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
          { label: 'Khách duy nhất', value: uniqueContacts,   sub: `trong ${base.length} cuộc`,         color: 'text-gray-800',    bg: 'bg-gray-50'    },
          { label: 'Kết nối',        value: connect,           sub: `${base.length > 0 ? Math.round(connect/base.length*100) : 0}% nghe máy`, color: 'text-blue-700',   bg: 'bg-blue-50'    },
          { label: 'Đặt lịch',       value: booked,            sub: `${bookRate}% tỷ lệ chốt`,           color: 'text-violet-700',  bg: 'bg-violet-50'  },
          { label: 'Không nghe',     value: noAns,             sub: `${base.length > 0 ? Math.round(noAns/base.length*100) : 0}% tổng cuộc`,  color: 'text-orange-600', bg: 'bg-orange-50'  },
          { label: 'Chất lượng',     value: `${bookRate}%`,    sub: 'tỷ lệ chốt lịch',
            color: bookRate >= 15 ? 'text-emerald-700' : bookRate >= 8 ? 'text-amber-600' : 'text-red-500',
            bg:    bookRate >= 15 ? 'bg-emerald-50'    : bookRate >= 8 ? 'bg-amber-50'    : 'bg-red-50'    },
        ].map(k => (
          <div key={k.label} className={`${k.bg} rounded-2xl p-4`}>
            <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
            <p className="text-xs text-gray-600 mt-0.5 font-medium">{k.label}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">

        {/* View mode toggle */}
        <div className="flex bg-gray-100 rounded-xl p-1 gap-0.5">
          <button onClick={() => setViewMode('contacts')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              viewMode === 'contacts' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <Users className="w-3 h-3" /> Theo khách
          </button>
          <button onClick={() => setViewMode('timeline')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              viewMode === 'timeline' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <List className="w-3 h-3" /> Timeline
          </button>
        </div>

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
            className="pl-9 pr-8 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 w-40" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <X className="w-3 h-3 text-gray-400 hover:text-gray-600" />
            </button>
          )}
        </div>

        <span className="text-xs text-gray-400 font-medium whitespace-nowrap">
          {viewMode === 'contacts' ? `${contactGroups.length} khách` : `${filtered.length} cuộc`}
        </span>
      </div>

      {/* ── Content ── */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center shadow-sm">
          <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Phone className="w-5 h-5 text-gray-300" />
          </div>
          <p className="text-sm text-gray-400 font-medium">Không có cuộc gọi nào</p>
          <p className="text-xs text-gray-300 mt-1">Thử đổi bộ lọc hoặc khoảng thời gian</p>
        </div>

      ) : viewMode === 'contacts' ? (
        /* ── Contacts view ── */
        <div className="space-y-2">
          {contactGroups.map(group => (
            <ContactCard key={group.phone} group={group} onCallClick={setSelectedCall} />
          ))}
        </div>

      ) : (
        /* ── Timeline view ── */
        <div className="space-y-4">
          {dayGroups.map(group => (
            <div key={group.label}>
              <div className="flex items-center gap-3 mb-2 px-1">
                <span className="text-xs font-bold text-gray-500">{group.label}</span>
                <span className="text-xs text-gray-300">{group.calls.length} cuộc</span>
                <div className="flex-1 h-px bg-gray-100" />
                {group.calls.filter(c => c.appointment_booked).length > 0 && (
                  <span className="text-xs text-violet-500 font-medium">
                    {group.calls.filter(c => c.appointment_booked).length} đặt lịch
                  </span>
                )}
              </div>
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
