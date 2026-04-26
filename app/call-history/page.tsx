'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase, type Call } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { RefreshCw, X } from 'lucide-react'
import AppShell from '@/components/ui/app-shell'
import { useTheme } from '@/components/ui/theme'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateTime(s: string) {
  const d = new Date(s)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}
function formatDuration(s: number | null) {
  if (!s) return '--'
  return `${Math.floor(s/60)}p ${s%60}s`
}
function calcScore(call: Call) {
  let s = 0
  if (call.appointment_booked) s += 50
  const d = call.duration_seconds ?? 0
  if (d >= 120) s += 30; else if (d >= 60) s += 20; else if (d >= 30) s += 10
  if (call.status === 'completed') s += 20
  return Math.min(s, 100)
}

function ScoreBadge({ score }: { score: number }) {
  const c = score >= 80 ? ['bg-green-100','text-green-700','Xuất sắc'] :
            score >= 60 ? ['bg-blue-100','text-blue-700','Tốt'] :
            score >= 40 ? ['bg-yellow-100','text-yellow-700','Trung bình'] :
                          ['bg-red-100','text-red-700','Cần cải thiện']
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${c[0]} ${c[1]}`}>{score}đ · {c[2]}</span>
}

function RetryBadge({ call }: { call: Call }) {
  if (call.status !== 'no_answer') return null
  const n = call.retry_count ?? 0
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${n >= 3 ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'}`}>{n >= 3 ? '✗ Không nghe' : `↻ Retry ${n}/3`}</span>
}

// ── Call Detail Modal ─────────────────────────────────────────────────────────

function CallDetailModal({ call, onClose }: { call: Call; onClose: () => void }) {
  const score = calcScore(call)
  const isIn = call.direction === 'inbound'
  const bar = score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-blue-500' : score >= 40 ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isIn ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>{isIn ? 'Gọi đến' : 'Gọi đi'}</span>
            <span className="text-sm text-gray-500">{formatDateTime(call.created_at)}</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-400" /></button>
        </div>
        <div className="px-6 py-5 space-y-5">
          <div>
            <div className="flex justify-between mb-2"><span className="text-sm font-semibold text-gray-700">Điểm cuộc gọi</span><ScoreBadge score={score} /></div>
            <div className="w-full bg-gray-100 rounded-full h-2"><div className={`h-2 rounded-full ${bar}`} style={{ width: `${score}%` }} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[['Khách hàng', call.contact_name || '--'], ['Số điện thoại', call.contact_phone || '--'], ['Thời lượng', formatDuration(call.duration_seconds)], ['Đặt lịch', call.appointment_booked ? '✅ Đã đặt' : '❌ Chưa đặt']].map(([l, v]) => (
              <div key={l} className="bg-gray-50 rounded-xl p-3"><p className="text-xs text-gray-400 mb-0.5">{l}</p><p className="text-sm font-medium text-gray-700">{v}</p></div>
            ))}
          </div>
          {call.appointment_booked && call.appointment_datetime && (
            <div className="bg-green-50 border border-green-100 rounded-xl p-4">
              <p className="text-xs font-semibold text-green-700 mb-1">Lịch hẹn</p>
              <p className="text-sm text-green-800 font-medium">{call.appointment_datetime}</p>
              {call.appointment_notes && <p className="text-xs text-green-600 mt-1">{call.appointment_notes}</p>}
            </div>
          )}
          {call.summary && (
            <div><p className="text-xs font-semibold text-gray-500 mb-2">Tóm tắt</p><p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-4 leading-relaxed">{call.summary}</p></div>
          )}
          {call.recording_url && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">Ghi âm</p>
              <audio controls src={call.recording_url} className="w-full h-10 rounded-xl" />
            </div>
          )}
          {call.transcript && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">Nội dung cuộc gọi</p>
              <div className="bg-gray-50 rounded-xl p-4 max-h-48 overflow-y-auto">
                {call.transcript.split('\n').map((line, i) => {
                  const isAgent = line.startsWith('Agent:')
                  const isUser = line.startsWith('User:')
                  if (!line.trim()) return null
                  return (
                    <p key={i} className={`text-xs mb-1.5 leading-relaxed ${isAgent ? 'text-blue-700' : isUser ? 'text-gray-700' : 'text-gray-400'}`}>
                      {line}
                    </p>
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

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiBox({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex flex-col gap-1">
      <span className="text-xs text-gray-400">{label}</span>
      <span className={`text-2xl font-bold ${color ?? 'text-gray-800'}`}>{value}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Filter = 'all' | 'inbound' | 'outbound'

export default function CallHistoryPage() {
  const router = useRouter()
  const t = useTheme()

  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)
  const [clientName, setClientName] = useState<string | null>(null)
  const [selectedCall, setSelectedCall] = useState<Call | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const clientIdRef = useRef<string | null>(null)

  const fetchCalls = useCallback(async (clientId: string) => {
    const { data } = await supabase
      .from('calls')
      .select('*')
      .eq('tenant_id', clientId)
      .order('created_at', { ascending: false })
      .limit(200)
    setCalls(data ?? [])
    setLastRefresh(new Date())
  }, [])

  useEffect(() => {
    async function init() {
      setLoading(true)
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
    const interval = setInterval(() => {
      if (clientIdRef.current) fetchCalls(clientIdRef.current)
    }, 30000)
    return () => clearInterval(interval)
  }, [fetchCalls])

  const filtered = calls.filter(c => {
    if (filter === 'inbound' && c.direction !== 'inbound') return false
    if (filter === 'outbound' && c.direction !== 'outbound') return false
    if (search) {
      const q = search.toLowerCase()
      return (c.contact_name ?? '').toLowerCase().includes(q) || (c.contact_phone ?? '').includes(q)
    }
    return true
  })

  const totalIn  = calls.filter(c => c.direction === 'inbound').length
  const totalOut = calls.filter(c => c.direction === 'outbound').length
  const booked   = calls.filter(c => c.appointment_booked).length
  const hotLeads = calls.filter(c => calcScore(c) >= 70 && c.status !== 'no_answer').length

  const now = new Date()
  const dateStr = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`

  if (loading) {
    return (
      <AppShell clientName={clientName}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
          <span style={{ color: t.text3, fontSize: 14 }}>Đang tải...</span>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell clientName={clientName}>
      {selectedCall && <CallDetailModal call={selectedCall} onClose={() => setSelectedCall(null)} />}

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: t.text1, letterSpacing: '-0.02em', margin: 0 }}>
          Lịch sử cuộc gọi
        </h1>
        <p style={{ fontSize: 13, color: t.text3, marginTop: 4 }}>
          {dateStr} · Tự động cập nhật mỗi 30 giây
          {lastRefresh && ` · Lần cuối ${String(lastRefresh.getHours()).padStart(2,'0')}:${String(lastRefresh.getMinutes()).padStart(2,'0')}`}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <KpiBox label="Tổng cuộc gọi" value={calls.length} />
        <KpiBox label="Gọi đến" value={totalIn} color="text-emerald-600" />
        <KpiBox label="Gọi đi" value={totalOut} color="text-blue-600" />
        <KpiBox label="Đặt lịch" value={booked} sub={`${calls.length ? Math.round(booked / calls.length * 100) : 0}% tỉ lệ`} color="text-violet-600" />
      </div>

      {/* Hot leads banner */}
      {hotLeads > 0 && (
        <div className="mb-4 bg-green-50 border border-green-100 rounded-xl px-4 py-2.5 flex items-center gap-3">
          <span className="text-green-700 font-bold text-sm">🔥 {hotLeads} lead nóng</span>
          <span className="text-green-600 text-xs">Score ≥ 70đ — cần follow-up ngay!</span>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3 mb-4">
        {/* Filter tabs */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white">
          {([['all','Tất cả'], ['inbound','Gọi đến'], ['outbound','Gọi đi']] as [Filter, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                filter === key ? 'bg-[#00b4d8] text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Tìm theo tên / số điện thoại..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 max-w-xs border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white text-gray-700 placeholder-gray-400 focus:outline-none focus:border-[#00b4d8]"
        />

        <div className="flex-1" />

        <span className="text-sm text-gray-400">{filtered.length} cuộc gọi</span>
        <button
          onClick={() => clientIdRef.current && fetchCalls(clientIdRef.current)}
          className="p-1.5 hover:bg-gray-100 rounded-lg"
          title="Làm mới"
        >
          <RefreshCw className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-sm">Không có cuộc gọi nào.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left">Thời gian</th>
                  <th className="px-4 py-2 text-left">Khách</th>
                  <th className="px-4 py-2 text-left">Số điện thoại</th>
                  <th className="px-4 py-2 text-left">Loại</th>
                  <th className="px-4 py-2 text-right">Thời lượng</th>
                  <th className="px-4 py-2 text-center">Kết quả</th>
                  <th className="px-4 py-2 text-center">Score AI</th>
                  <th className="px-4 py-2 text-left">Tóm tắt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(c => {
                  const isIn = c.direction === 'inbound'
                  return (
                    <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedCall(c)}>
                      <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{formatDateTime(c.created_at)}</td>
                      <td className="px-4 py-2.5 text-gray-700 text-xs">{c.contact_name || '--'}</td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{c.contact_phone || '--'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isIn ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                          {isIn ? 'Gọi đến' : 'Gọi đi'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-600 text-xs">{formatDuration(c.duration_seconds)}</td>
                      <td className="px-4 py-2.5 text-center">
                        {c.status === 'no_answer' ? <RetryBadge call={c} /> : <ScoreBadge score={calcScore(c)} />}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {c.status === 'no_answer' ? (
                          <span className="text-gray-300 text-xs">--</span>
                        ) : (() => {
                          const s = calcScore(c)
                          const ten = Math.ceil(s / 10)
                          const cls = s >= 70 ? 'text-green-700 bg-green-100' : s >= 40 ? 'text-amber-700 bg-amber-100' : 'text-gray-500 bg-gray-100'
                          return <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${cls}`}>{ten}/10</span>
                        })()}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs max-w-xs truncate">{c.summary ?? '--'}</td>
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