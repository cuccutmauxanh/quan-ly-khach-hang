'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase, type Client, type Call, type Contact } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import {
  Phone, PhoneIncoming, PhoneOutgoing, CalendarCheck,
  Upload, RefreshCw, X, Heart, Zap, Search,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import Nav from '@/components/nav'
import { PageSkeleton } from '@/components/skeleton'
import { useToast } from '@/components/toast'

// ─── Agent tab config ────────────────────────────────────────────────────────

type AgentTab = 'receptionist' | 'cold' | 'cskh' | 'warm'

const TABS: {
  key: AgentTab
  label: string
  sublabel: string
  icon: React.ElementType
  tag: string
  tagText: string
  tagBg: string
  border: string
  activeTab: string
  agentField: keyof Client
}[] = [
  {
    key: 'receptionist',
    label: 'Lễ tân',
    sublabel: 'Nhận cuộc gọi đến',
    icon: PhoneIncoming,
    tag: 'bg-emerald-500',
    tagText: 'text-emerald-700',
    tagBg: 'bg-emerald-50',
    border: 'border-emerald-200',
    activeTab: 'border-b-2 border-emerald-500 text-emerald-700 bg-emerald-50',
    agentField: 'agent_receptionist_id',
  },
  {
    key: 'cold',
    label: 'Telesale',
    sublabel: 'Gọi data lạnh',
    icon: PhoneOutgoing,
    tag: 'bg-blue-500',
    tagText: 'text-blue-700',
    tagBg: 'bg-blue-50',
    border: 'border-blue-200',
    activeTab: 'border-b-2 border-blue-500 text-blue-700 bg-blue-50',
    agentField: 'agent_cold_id',
  },
  {
    key: 'cskh',
    label: 'Chăm sóc',
    sublabel: 'Khách hàng cũ',
    icon: Heart,
    tag: 'bg-amber-500',
    tagText: 'text-amber-700',
    tagBg: 'bg-amber-50',
    border: 'border-amber-200',
    activeTab: 'border-b-2 border-amber-500 text-amber-700 bg-amber-50',
    agentField: 'agent_cskh_id',
  },
  {
    key: 'warm',
    label: 'Telesale',
    sublabel: 'Data ấm',
    icon: Zap,
    tag: 'bg-violet-500',
    tagText: 'text-violet-700',
    tagBg: 'bg-violet-50',
    border: 'border-violet-200',
    activeTab: 'border-b-2 border-violet-500 text-violet-700 bg-violet-50',
    agentField: 'agent_warm_id',
  },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateTime(s: string) {
  const d = new Date(s)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

function formatDuration(s: number | null) {
  if (!s) return '--'
  return `${Math.floor(s/60)}p ${s%60}s`
}

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

function ScoreBadge({ score }: { score: number }) {
  const { label, color, bg } =
    score >= 80 ? { label: 'Xuất sắc', color: 'text-green-700', bg: 'bg-green-100' } :
    score >= 60 ? { label: 'Tốt', color: 'text-blue-700', bg: 'bg-blue-100' } :
    score >= 40 ? { label: 'Trung bình', color: 'text-yellow-700', bg: 'bg-yellow-100' } :
                  { label: 'Cần cải thiện', color: 'text-red-700', bg: 'bg-red-100' }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${bg} ${color}`}>
      {score}đ · {label}
    </span>
  )
}

function RetryBadge({ call }: { call: Call }) {
  if (call.status !== 'no_answer') return null
  const count = call.retry_count ?? 0
  const maxed = count >= 3
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
      maxed ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'
    }`}>
      {maxed ? '✗ Không nghe' : `↻ Retry ${count}/3`}
    </span>
  )
}

// ─── Call Detail Modal ────────────────────────────────────────────────────────

function CallDetailModal({ call, onClose }: { call: Call; onClose: () => void }) {
  const score = calcScore(call)
  const isInbound = call.direction === 'inbound'
  const barColor = score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-blue-500' : score >= 40 ? 'bg-yellow-500' : 'bg-red-500'

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isInbound ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
              {isInbound ? 'Gọi đến' : 'Gọi đi'}
            </span>
            <span className="text-sm text-gray-500">{formatDateTime(call.created_at)}</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-700">Điểm cuộc gọi</span>
              <ScoreBadge score={score} />
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5">
              <div className={`h-2.5 rounded-full transition-all ${barColor}`} style={{ width: `${score}%` }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Khách hàng', value: call.contact_name || '--' },
              { label: 'Số điện thoại', value: call.contact_phone || '--' },
              { label: 'Thời lượng', value: formatDuration(call.duration_seconds) },
              { label: 'Đặt lịch', value: call.appointment_booked ? '✅ Đã đặt' : '❌ Chưa đặt' },
            ].map(item => (
              <div key={item.label} className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-0.5">{item.label}</p>
                <p className="text-sm font-medium text-gray-700">{item.value}</p>
              </div>
            ))}
          </div>
          {call.appointment_booked && call.appointment_datetime && (
            <div className="bg-green-50 border border-green-100 rounded-xl p-4">
              <p className="text-xs font-semibold text-green-700 mb-1">🗓 Lịch hẹn</p>
              <p className="text-sm text-green-800 font-medium">{call.appointment_datetime}</p>
              {call.appointment_notes && <p className="text-xs text-green-600 mt-1">{call.appointment_notes}</p>}
            </div>
          )}
          {call.summary && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">📋 Tóm tắt</p>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-4 leading-relaxed">{call.summary}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Lễ tân — Nhận cuộc gọi ─────────────────────────────────────────────

function ReceptionistTab({ calls, client }: { calls: Call[]; client: Client | null }) {
  const inbound = calls.filter(c => c.direction === 'inbound')
  const todayInbound = inbound.filter(c => new Date(c.created_at).toDateString() === new Date().toDateString())
  const bookedToday = todayInbound.filter(c => c.appointment_booked)

  return (
    <div className="space-y-4">
      {/* Trạng thái */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-700 text-sm">Trạng thái đường dây</h3>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-medium text-emerald-700">Đang hoạt động</span>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Số điện thoại', value: client?.retell_phone_number ?? 'Chưa cài đặt' },
            { label: 'Hôm nay nhận', value: `${todayInbound.length} cuộc` },
            { label: 'Đặt lịch hôm nay', value: `${bookedToday.length} lịch` },
            { label: 'Tổng đã nhận', value: `${inbound.length} cuộc` },
          ].map(item => (
            <div key={item.label} className="bg-emerald-50 rounded-xl p-3">
              <p className="text-xs text-emerald-600 mb-0.5">{item.label}</p>
              <p className="text-sm font-semibold text-emerald-800">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Cuộc gọi đến gần nhất */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-700 text-sm">Cuộc gọi đến gần đây</h3>
        </div>
        {inbound.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">Chưa có cuộc gọi đến nào.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {inbound.slice(0, 8).map(c => (
              <div key={c.id} className="px-4 py-3 flex items-center gap-4 hover:bg-gray-50">
                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                  <PhoneIncoming className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">{c.contact_name || c.contact_phone || '--'}</p>
                  <p className="text-xs text-gray-400">{formatDateTime(c.created_at)} · {formatDuration(c.duration_seconds)}</p>
                </div>
                <div>
                  {c.status === 'no_answer'
                    ? <RetryBadge call={c} />
                    : c.appointment_booked
                    ? <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded-full">✓ Đặt lịch</span>
                    : <ScoreBadge score={calcScore(c)} />
                  }
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tab: Telesale — Gọi lạnh ─────────────────────────────────────────────────

function ColdCallTab({ client }: { client: Client | null }) {
  const { toast } = useToast()
  const [mode, setMode] = useState<'single' | 'batch'>('single')
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [callingSingle, setCallingSingle] = useState(false)
  const [outboundList, setOutboundList] = useState<{ name: string; phone: string }[]>([])
  const [uploading, setUploading] = useState(false)
  const [calling, setCalling] = useState(false)
  const [callingIndex, setCallingIndex] = useState<number | null>(null)
  const [callResults, setCallResults] = useState<{ phone: string; success: boolean; error?: string | null }[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const agentId = client?.agent_cold_id ?? client?.retell_agent_id
  const fromNumber = client?.retell_phone_number

  async function callSingle() {
    if (!phone.trim()) { toast('Nhập số điện thoại', 'error'); return }
    if (!agentId || !fromNumber) { toast('Chưa cấu hình — liên hệ admin', 'error'); return }
    setCallingSingle(true)
    try {
      const res = await fetch('/api/outbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phones: [{ name, phone: phone.replace(/\D/g,'') }], agentId, fromNumber }),
      })
      const data = await res.json()
      const ok = data.results?.[0]?.success
      if (ok) { toast(`Đang gọi ${phone}`, 'success'); setPhone(''); setName('') }
      else toast(data.results?.[0]?.error ?? 'Gọi thất bại', 'error')
    } catch { toast('Lỗi kết nối', 'error') }
    setCallingSingle(false)
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setCallResults([])
    const reader = new FileReader()
    reader.onload = evt => {
      const wb = XLSX.read(evt.target?.result, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws)
      const parsed = rows.map(r => ({
        name: String(r['Tên'] ?? r['ten'] ?? r['name'] ?? ''),
        phone: String(r['Số điện thoại'] ?? r['sdt'] ?? r['phone'] ?? '').replace(/\D/g, ''),
      })).filter(r => r.phone.length >= 9)
      setOutboundList(parsed)
      setUploading(false)
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  async function callOne(item: { name: string; phone: string }, index: number) {
    if (!agentId || !fromNumber) { toast('Chưa cấu hình — liên hệ admin', 'error'); return }
    setCallingIndex(index)
    const res = await fetch('/api/outbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phones: [item], agentId, fromNumber }),
    })
    const data = await res.json()
    setCallResults(prev => { const next = [...prev]; next[index] = data.results?.[0]; return next })
    setCallingIndex(null)
  }

  async function callAll() {
    if (!agentId || !fromNumber) { toast('Chưa cấu hình — liên hệ admin', 'error'); return }
    if (!confirm(`Xác nhận gọi ${outboundList.length} số?`)) return
    setCalling(true)
    setCallResults([])
    const res = await fetch('/api/outbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phones: outboundList, agentId, fromNumber }),
    })
    const data = await res.json()
    setCallResults(data.results ?? [])
    setCalling(false)
  }

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 w-fit">
        {[
          { key: 'single' as const, label: '📞 Gọi đơn lẻ' },
          { key: 'batch'  as const, label: '📋 Gọi hàng loạt' },
        ].map(m => (
          <button key={m.key} onClick={() => setMode(m.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              mode === m.key ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'
            }`}>
            {m.label}
          </button>
        ))}
      </div>

      {/* Gọi đơn lẻ */}
      {mode === 'single' && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-700 text-sm mb-4">Gọi ngay một số</h3>
          <div className="flex gap-3 max-w-lg">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Tên khách (tùy chọn)"
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="Số điện thoại *"
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              onKeyDown={e => e.key === 'Enter' && callSingle()}
            />
            <button onClick={callSingle} disabled={callingSingle || !phone.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium whitespace-nowrap transition-colors">
              <Phone className="w-4 h-4" />
              {callingSingle ? 'Đang gọi...' : 'Gọi ngay'}
            </button>
          </div>
        </div>
      )}

      {/* Gọi hàng loạt */}
      {mode === 'batch' && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-gray-700 text-sm">Gọi hàng loạt từ file</h3>
              <p className="text-xs text-gray-400 mt-0.5">File Excel cần có cột "Tên" và "Số điện thoại"</p>
            </div>
            <button onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
              <Upload className="w-4 h-4" /> Chọn file Excel
            </button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
          </div>

          {uploading && <p className="text-sm text-gray-400 py-2">Đang đọc file...</p>}

          {outboundList.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-gray-600">
                  <strong className="text-blue-700">{outboundList.length}</strong> số điện thoại
                </p>
                <button onClick={callAll} disabled={calling}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl text-sm font-semibold">
                  <PhoneOutgoing className="w-4 h-4" />
                  {calling ? '⏳ Đang gọi...' : `Bắt đầu gọi tất cả`}
                </button>
              </div>
              <div className="border border-gray-100 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">Tên</th>
                      <th className="px-3 py-2 text-left">Số điện thoại</th>
                      <th className="px-3 py-2 text-center">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {outboundList.slice(0, 15).map((r, i) => {
                      const result = callResults[i]
                      return (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-400 text-xs">{i + 1}</td>
                          <td className="px-3 py-2 text-gray-700">{r.name || '--'}</td>
                          <td className="px-3 py-2 text-gray-700 font-mono text-xs">{r.phone}</td>
                          <td className="px-3 py-2 text-center">
                            {result ? (
                              result.success
                                ? <span className="text-emerald-600 text-xs font-medium">✓ Đã gọi</span>
                                : <span className="text-red-500 text-xs">✗ Lỗi</span>
                            ) : (
                              <button onClick={() => callOne(r, i)} disabled={callingIndex === i}
                                className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50">
                                {callingIndex === i ? '...' : 'Gọi'}
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {outboundList.length > 15 && (
                  <p className="text-xs text-gray-400 px-3 py-2 bg-gray-50">...và {outboundList.length - 15} số nữa</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Tab: CSKH — Chăm sóc khách hàng cũ ─────────────────────────────────────

function CSKHTab({ client, contacts }: { client: Client | null; contacts: Contact[] }) {
  const { toast } = useToast()
  const [filter, setFilter] = useState<'all' | 'inactive' | 'new'>('all')
  const [search, setSearch] = useState('')
  const [callingId, setCallingId] = useState<string | null>(null)

  const agentId = client?.agent_cskh_id ?? client?.retell_agent_id
  const fromNumber = client?.retell_phone_number

  const now = Date.now()
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000

  const filtered = contacts.filter(c => {
    if (search && !c.full_name?.toLowerCase().includes(search.toLowerCase()) && !c.phone.includes(search)) return false
    if (filter === 'inactive') {
      const last = c.last_called_at ? new Date(c.last_called_at).getTime() : 0
      return (now - last) > THIRTY_DAYS
    }
    if (filter === 'new') return !c.last_called_at
    return true
  }).slice(0, 20)

  async function callContact(contact: Contact) {
    if (!agentId || !fromNumber) { toast('Chưa cấu hình — liên hệ admin', 'error'); return }
    setCallingId(contact.id)
    try {
      const res = await fetch('/api/outbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phones: [{ name: contact.full_name ?? '', phone: contact.phone }],
          agentId,
          fromNumber,
        }),
      })
      const data = await res.json()
      const ok = data.results?.[0]?.success
      toast(ok ? `Đang gọi ${contact.full_name ?? contact.phone}` : 'Gọi thất bại', ok ? 'success' : 'error')
    } catch { toast('Lỗi kết nối', 'error') }
    setCallingId(null)
  }

  const inactiveCount = contacts.filter(c => {
    const last = c.last_called_at ? new Date(c.last_called_at).getTime() : 0
    return (now - last) > THIRTY_DAYS
  }).length

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {[
            { key: 'all' as const,      label: 'Tất cả' },
            { key: 'inactive' as const, label: `Chưa liên hệ >30 ngày (${inactiveCount})` },
            { key: 'new' as const,      label: 'Chưa từng gọi' },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                filter === f.key ? 'bg-white text-amber-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 flex-1 max-w-xs bg-white">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm tên hoặc số..."
            className="text-sm flex-1 focus:outline-none text-gray-700 placeholder-gray-300"
          />
        </div>
      </div>

      {/* Contact list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">Không có khách hàng nào trong bộ lọc này.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map(c => {
              const daysSince = c.last_called_at
                ? Math.floor((now - new Date(c.last_called_at).getTime()) / (1000 * 60 * 60 * 24))
                : null

              return (
                <div key={c.id} className="px-4 py-3.5 flex items-center gap-4 hover:bg-gray-50">
                  <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0 font-semibold text-amber-700 text-sm">
                    {(c.full_name ?? c.phone)[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700">{c.full_name || '--'}</p>
                    <p className="text-xs text-gray-400">{c.phone}
                      {daysSince !== null && <span className="ml-2">· {daysSince} ngày trước</span>}
                      {daysSince === null && <span className="ml-2 text-amber-500">· Chưa liên hệ lần nào</span>}
                    </p>
                  </div>
                  {c.call_count ? (
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{c.call_count} cuộc</span>
                  ) : null}
                  <button onClick={() => callContact(c)} disabled={callingId === c.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors">
                    <Phone className="w-3.5 h-3.5" />
                    {callingId === c.id ? '...' : 'Gọi'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tab: Data ấm — Quảng cáo / Lead ─────────────────────────────────────────

function WarmLeadsTab({ client, contacts }: { client: Client | null; contacts: Contact[] }) {
  const { toast } = useToast()
  const [callingId, setCallingId] = useState<string | null>(null)
  const [outboundList, setOutboundList] = useState<{ name: string; phone: string }[]>([])
  const [uploading, setUploading] = useState(false)
  const [calling, setCalling] = useState(false)
  const [callResults, setCallResults] = useState<{ phone: string; success: boolean; error?: string | null }[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const agentId = client?.agent_warm_id ?? client?.retell_agent_id
  const fromNumber = client?.retell_phone_number

  // Ưu tiên: khách có interest_level = high hoặc chưa từng gọi
  const hotContacts = contacts.filter(c => c.interest_level === 'high' || !c.last_called_at)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 20)

  async function callContact(contact: Contact) {
    if (!agentId || !fromNumber) { toast('Chưa cấu hình — liên hệ admin', 'error'); return }
    setCallingId(contact.id)
    try {
      const res = await fetch('/api/outbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phones: [{ name: contact.full_name ?? '', phone: contact.phone }], agentId, fromNumber }),
      })
      const data = await res.json()
      const ok = data.results?.[0]?.success
      toast(ok ? `Đang gọi ${contact.full_name ?? contact.phone}` : 'Gọi thất bại', ok ? 'success' : 'error')
    } catch { toast('Lỗi kết nối', 'error') }
    setCallingId(null)
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setCallResults([])
    const reader = new FileReader()
    reader.onload = evt => {
      const wb = XLSX.read(evt.target?.result, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws)
      const parsed = rows.map(r => ({
        name: String(r['Tên'] ?? r['ten'] ?? r['name'] ?? r['Họ tên'] ?? ''),
        phone: String(r['Số điện thoại'] ?? r['sdt'] ?? r['phone'] ?? r['Phone'] ?? '').replace(/\D/g, ''),
      })).filter(r => r.phone.length >= 9)
      setOutboundList(parsed)
      setUploading(false)
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  async function callAll() {
    if (!agentId || !fromNumber) { toast('Chưa cấu hình — liên hệ admin', 'error'); return }
    if (!confirm(`Xác nhận gọi ${outboundList.length} lead?`)) return
    setCalling(true)
    setCallResults([])
    const res = await fetch('/api/outbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phones: outboundList, agentId, fromNumber }),
    })
    const data = await res.json()
    setCallResults(data.results ?? [])
    setCalling(false)
  }

  return (
    <div className="space-y-4">
      {/* Upload từ Facebook */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-gray-700 text-sm">Import data từ quảng cáo</h3>
            <p className="text-xs text-gray-400 mt-0.5">Upload file Excel từ Facebook Ads hoặc website</p>
          </div>
          <button onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700">
            <Upload className="w-4 h-4" /> Tải lên data
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
        </div>

        {uploading && <p className="text-sm text-gray-400">Đang đọc file...</p>}

        {outboundList.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-600">
                <strong className="text-violet-700">{outboundList.length}</strong> lead cần liên hệ
              </p>
              <button onClick={callAll} disabled={calling}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white rounded-xl text-sm font-semibold">
                <PhoneOutgoing className="w-4 h-4" />
                {calling ? 'Đang gọi...' : 'Gọi tất cả ngay'}
              </button>
            </div>
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">Tên</th>
                    <th className="px-3 py-2 text-left">Số điện thoại</th>
                    <th className="px-3 py-2 text-center">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {outboundList.slice(0, 15).map((r, i) => {
                    const result = callResults[i]
                    return (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-400 text-xs">{i + 1}</td>
                        <td className="px-3 py-2 text-gray-700">{r.name || '--'}</td>
                        <td className="px-3 py-2 text-gray-700 font-mono text-xs">{r.phone}</td>
                        <td className="px-3 py-2 text-center">
                          {result
                            ? result.success
                              ? <span className="text-emerald-600 text-xs font-medium">✓ Đã gọi</span>
                              : <span className="text-red-500 text-xs">✗ Lỗi</span>
                            : <span className="text-xs text-gray-400">Chờ gọi</span>
                          }
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {outboundList.length > 15 && (
                <p className="text-xs text-gray-400 px-3 py-2 bg-gray-50">...và {outboundList.length - 15} lead nữa</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Danh sách hot contacts từ danh bạ */}
      {hotContacts.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-700 text-sm">Khách quan tâm trong danh bạ</h3>
            <p className="text-xs text-gray-400 mt-0.5">Ưu tiên cao hoặc chưa từng được liên hệ</p>
          </div>
          <div className="divide-y divide-gray-50">
            {hotContacts.map(c => (
              <div key={c.id} className="px-4 py-3.5 flex items-center gap-4 hover:bg-gray-50">
                <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center shrink-0 font-semibold text-violet-700 text-sm">
                  {(c.full_name ?? c.phone)[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700">{c.full_name || '--'}</p>
                  <p className="text-xs text-gray-400">{c.phone}</p>
                </div>
                {c.interest_level === 'high' && (
                  <span className="text-xs text-violet-700 bg-violet-100 px-2 py-0.5 rounded-full font-medium">Ưu tiên cao</span>
                )}
                {!c.last_called_at && (
                  <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">Chưa gọi</span>
                )}
                <button onClick={() => callContact(c)} disabled={callingId === c.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors">
                  <Phone className="w-3.5 h-3.5" />
                  {callingId === c.id ? '...' : 'Gọi'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()

  const [client, setClient] = useState<Client | null>(null)
  const [calls, setCalls] = useState<Call[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<AgentTab>('receptionist')
  const [selectedCall, setSelectedCall] = useState<Call | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const clientIdRef = useRef<string | null>(null)

  const fetchCalls = useCallback(async (clientId: string) => {
    const { data } = await supabase
      .from('calls').select('*').eq('tenant_id', clientId)
      .order('created_at', { ascending: false }).limit(50)
    setCalls(data ?? [])
    setLastRefresh(new Date())
  }, [])

  const fetchContacts = useCallback(async (clientId: string) => {
    const { data } = await supabase
      .from('contacts').select('*').eq('tenant_id', clientId)
      .order('created_at', { ascending: false }).limit(100)
    setContacts(data ?? [])
  }, [])

  useEffect(() => {
    async function init() {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: cu } = await supabase.from('client_users').select('client_id').eq('user_id', user.id).single()
      if (!cu) { setLoading(false); return }
      clientIdRef.current = cu.client_id
      const { data: c } = await supabase.from('clients').select('*').eq('id', cu.client_id).single()
      setClient(c)
      await Promise.all([fetchCalls(cu.client_id), fetchContacts(cu.client_id)])
      setLoading(false)
    }
    init()
  }, [router, fetchCalls, fetchContacts])

  useEffect(() => {
    const interval = setInterval(() => {
      if (clientIdRef.current) fetchCalls(clientIdRef.current)
    }, 30000)
    return () => clearInterval(interval)
  }, [fetchCalls])

  if (loading) return <PageSkeleton />

  const totalCalls = calls.length
  const inbound = calls.filter(c => c.direction === 'inbound').length
  const outbound = calls.filter(c => c.direction === 'outbound').length
  const booked = calls.filter(c => c.appointment_booked).length
  const todayCalls = calls.filter(c => new Date(c.created_at).toDateString() === new Date().toDateString()).length

  return (
    <div className="min-h-screen bg-gray-50">
      {selectedCall && <CallDetailModal call={selectedCall} onClose={() => setSelectedCall(null)} />}
      <Nav clientName={client?.name} />

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">

        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Hôm nay', value: todayCalls, icon: <Phone className="w-5 h-5 text-indigo-600" />, bg: 'bg-indigo-50' },
            { label: 'Gọi đến', value: inbound, icon: <PhoneIncoming className="w-5 h-5 text-emerald-600" />, bg: 'bg-emerald-50' },
            { label: 'Gọi đi', value: outbound, icon: <PhoneOutgoing className="w-5 h-5 text-blue-600" />, bg: 'bg-blue-50' },
            { label: 'Đặt lịch', value: booked, icon: <CalendarCheck className="w-5 h-5 text-violet-600" />, bg: 'bg-violet-50' },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-lg ${k.bg}`}>{k.icon}</div>
              <div>
                <p className="text-xs text-gray-500">{k.label}</p>
                <p className="text-2xl font-bold text-gray-800">{k.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Agent Tabs */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-gray-200">
            {TABS.map(tab => {
              const Icon = tab.icon
              const isActive = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 flex flex-col items-center gap-0.5 px-2 py-3 transition-all ${
                    isActive ? tab.activeTab : 'text-gray-500 hover:bg-gray-50 border-b-2 border-transparent'
                  }`}
                >
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold text-white ${
                    isActive ? tab.tag : 'bg-gray-300'
                  }`}>
                    <Icon className="w-3 h-3" />
                    {tab.label}
                  </span>
                  <span className={`text-xs font-medium ${isActive ? tab.tagText : 'text-gray-400'}`}>
                    {tab.sublabel}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Tab content */}
          <div className="p-4">
            {activeTab === 'receptionist' && <ReceptionistTab calls={calls} client={client} />}
            {activeTab === 'cold' && <ColdCallTab client={client} />}
            {activeTab === 'cskh' && <CSKHTab client={client} contacts={contacts} />}
            {activeTab === 'warm' && <WarmLeadsTab client={client} contacts={contacts} />}
          </div>
        </div>

        {/* Lịch sử tất cả cuộc gọi */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-700 text-sm">Lịch sử cuộc gọi ({totalCalls})</h3>
            <div className="flex items-center gap-3">
              {lastRefresh && (
                <span className="text-xs text-gray-400">
                  Cập nhật lúc {lastRefresh.getHours()}:{String(lastRefresh.getMinutes()).padStart(2,'0')}
                </span>
              )}
              <button onClick={() => clientIdRef.current && fetchCalls(clientIdRef.current)}
                className="p-1.5 hover:bg-gray-100 rounded-lg">
                <RefreshCw className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </div>

          {calls.length === 0 ? (
            <div className="p-10 text-center text-gray-400 text-sm">Chưa có cuộc gọi nào.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Thời gian</th>
                    <th className="px-4 py-2 text-left">Khách</th>
                    <th className="px-4 py-2 text-left">Loại</th>
                    <th className="px-4 py-2 text-right">Thời lượng</th>
                    <th className="px-4 py-2 text-center">Kết quả</th>
                    <th className="px-4 py-2 text-left">Tóm tắt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {calls.map(c => {
                    const isIn = c.direction === 'inbound'
                    const score = calcScore(c)
                    return (
                      <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedCall(c)}>
                        <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{formatDateTime(c.created_at)}</td>
                        <td className="px-4 py-2.5 text-gray-700 text-xs">{c.contact_name || c.contact_phone || '--'}</td>
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            isIn ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {isIn ? 'Gọi đến' : 'Gọi đi'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-600 text-xs">{formatDuration(c.duration_seconds)}</td>
                        <td className="px-4 py-2.5 text-center">
                          {c.status === 'no_answer' ? <RetryBadge call={c} /> : <ScoreBadge score={score} />}
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

      </main>
    </div>
  )
}
