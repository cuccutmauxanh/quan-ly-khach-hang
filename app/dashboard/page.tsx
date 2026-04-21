'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase, type Client, type Call } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Phone, PhoneIncoming, PhoneOutgoing, CalendarCheck, Upload, LogOut, RefreshCw, X } from 'lucide-react'
import * as XLSX from 'xlsx'

const DIRECTION_MAP: Record<string, { label: string; color: string }> = {
  inbound:  { label: 'Gọi đến', color: 'bg-blue-100 text-blue-700' },
  outbound: { label: 'Gọi đi',  color: 'bg-green-100 text-green-700' },
}

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

function CallDetailModal({ call, onClose }: { call: Call; onClose: () => void }) {
  const score = calcScore(call)
  const dir = DIRECTION_MAP[call.direction ?? ''] ?? { label: '--', color: 'bg-gray-100 text-gray-600' }
  const barColor = score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-blue-500' : score >= 40 ? 'bg-yellow-500' : 'bg-red-500'

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${dir.color}`}>{dir.label}</span>
            <span className="text-sm text-gray-500">{formatDateTime(call.created_at)}</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Score */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-700">Điểm cuộc gọi</span>
              <ScoreBadge score={score} />
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5">
              <div className={`h-2.5 rounded-full transition-all ${barColor}`} style={{ width: `${score}%` }} />
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>Đặt lịch {call.appointment_booked ? '+50' : '+0'}</span>
              <span>Thời lượng +{call.duration_seconds && call.duration_seconds >= 120 ? 30 : call.duration_seconds && call.duration_seconds >= 60 ? 20 : call.duration_seconds && call.duration_seconds >= 30 ? 10 : 0}</span>
              <span>Hoàn thành +{call.status === 'completed' ? 20 : 0}</span>
            </div>
          </div>

          {/* Info */}
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

          {/* Appointment */}
          {call.appointment_booked && call.appointment_datetime && (
            <div className="bg-green-50 border border-green-100 rounded-xl p-4">
              <p className="text-xs font-semibold text-green-700 mb-1">🗓 Lịch hẹn</p>
              <p className="text-sm text-green-800 font-medium">{call.appointment_datetime}</p>
              {call.appointment_notes && (
                <p className="text-xs text-green-600 mt-1">{call.appointment_notes}</p>
              )}
            </div>
          )}

          {/* Summary */}
          {call.summary && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">📋 Tóm tắt AI</p>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-4 leading-relaxed">{call.summary}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const [client, setClient] = useState<Client | null>(null)
  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [selectedCall, setSelectedCall] = useState<Call | null>(null)
  const [outboundList, setOutboundList] = useState<{ name: string; phone: string }[]>([])
  const [uploading, setUploading] = useState(false)
  const [calling, setCalling] = useState(false)
  const [callingIndex, setCallingIndex] = useState<number | null>(null)
  const [callResults, setCallResults] = useState<{ phone: string; success: boolean; error?: string | null }[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const clientIdRef = useRef<string | null>(null)

  const fetchCalls = useCallback(async (clientId: string) => {
    const { data } = await supabase
      .from('calls')
      .select('*')
      .eq('tenant_id', clientId)
      .order('created_at', { ascending: false })
      .limit(50)
    setCalls(data ?? [])
    setLastRefresh(new Date())
  }, [])

  async function fetchData() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: cu } = await supabase
      .from('client_users')
      .select('client_id')
      .eq('user_id', user.id)
      .single()

    if (!cu) { setLoading(false); return }

    clientIdRef.current = cu.client_id

    const { data: c } = await supabase.from('clients').select('*').eq('id', cu.client_id).single()
    setClient(c)
    await fetchCalls(cu.client_id)
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  // Auto-refresh mỗi 30 giây
  useEffect(() => {
    const interval = setInterval(() => {
      if (clientIdRef.current) fetchCalls(clientIdRef.current)
    }, 30000)
    return () => clearInterval(interval)
  }, [fetchCalls])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setCallResults([])

    const reader = new FileReader()
    reader.onload = (evt) => {
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
  }

  async function handleCallOne(item: { name: string; phone: string }, index: number) {
    if (!client?.retell_agent_id || !client?.retell_phone_number) {
      alert('Chưa cấu hình Retell Agent. Liên hệ admin.')
      return
    }
    setCallingIndex(index)
    const res = await fetch('/api/outbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phones: [item], agentId: client.retell_agent_id, fromNumber: client.retell_phone_number }),
    })
    const data = await res.json()
    const result = data.results?.[0]
    setCallResults(prev => { const next = [...prev]; next[index] = result; return next })
    setCallingIndex(null)
  }

  async function handleStartCalling() {
    if (!client?.retell_agent_id || !client?.retell_phone_number) {
      alert('Chưa cấu hình Retell Agent cho khách hàng này. Vui lòng liên hệ admin.')
      return
    }
    if (!confirm(`Xác nhận gọi ${outboundList.length} số điện thoại?`)) return
    setCalling(true)
    setCallResults([])
    const res = await fetch('/api/outbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phones: outboundList, agentId: client.retell_agent_id, fromNumber: client.retell_phone_number }),
    })
    const data = await res.json()
    setCallResults(data.results ?? [])
    setCalling(false)
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Đang tải...</div>
  )

  const totalCalls = calls.length
  const inbound = calls.filter(c => c.direction === 'inbound').length
  const outbound = calls.filter(c => c.direction === 'outbound').length
  const booked = calls.filter(c => c.appointment_booked).length
  const todayCalls = calls.filter(c => new Date(c.created_at).toDateString() === new Date().toDateString()).length

  return (
    <div className="min-h-screen bg-gray-50">
      {selectedCall && <CallDetailModal call={selectedCall} onClose={() => setSelectedCall(null)} />}

      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-indigo-600">{client?.name ?? 'Dashboard'}</h1>
          <p className="text-xs text-gray-400">AutoVoice Pro</p>
        </div>
        <button onClick={handleLogout} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
          <LogOut className="w-4 h-4" /> Đăng xuất
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">

        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Hôm nay', value: todayCalls, icon: <Phone className="w-5 h-5 text-indigo-600" />, bg: 'bg-indigo-50' },
            { label: 'Gọi đến', value: inbound, icon: <PhoneIncoming className="w-5 h-5 text-blue-600" />, bg: 'bg-blue-50' },
            { label: 'Gọi đi', value: outbound, icon: <PhoneOutgoing className="w-5 h-5 text-green-600" />, bg: 'bg-green-50' },
            { label: 'Đặt lịch', value: booked, icon: <CalendarCheck className="w-5 h-5 text-purple-600" />, bg: 'bg-purple-50' },
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

        {/* Upload outbound */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-gray-700">Gọi Outbound Hàng Loạt</h3>
              <p className="text-xs text-gray-400 mt-0.5">Upload file Excel có cột "Tên" và "Số điện thoại"</p>
            </div>
            <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
              <Upload className="w-4 h-4" /> Upload Excel
            </button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
          </div>

          {uploading && <p className="text-sm text-gray-400">Đang đọc file...</p>}

          {outboundList.length > 0 && (
            <div>
              <p className="text-sm text-gray-600 mb-3">Tìm thấy <strong>{outboundList.length}</strong> số điện thoại</p>
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">Tên</th>
                      <th className="px-3 py-2 text-left">Số điện thoại</th>
                      <th className="px-3 py-2 text-center">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {outboundList.slice(0, 10).map((r, i) => {
                      const result = callResults[i]
                      return (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-400 text-xs">{i + 1}</td>
                          <td className="px-3 py-2 text-gray-700">{r.name || '--'}</td>
                          <td className="px-3 py-2 text-gray-700">{r.phone}</td>
                          <td className="px-3 py-2 text-center">
                            {result ? (
                              result.success
                                ? <span className="text-green-600 text-xs font-medium">✓ Đã gọi</span>
                                : <span className="text-red-500 text-xs" title={result.error ?? ''}> ✗ {result.error ?? 'Lỗi'}</span>
                            ) : (
                              <button onClick={() => handleCallOne(r, i)} disabled={callingIndex === i}
                                className="px-3 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50">
                                {callingIndex === i ? '...' : '📞 Gọi'}
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {outboundList.length > 10 && (
                  <p className="text-xs text-gray-400 px-3 py-2 bg-gray-50">...và {outboundList.length - 10} số nữa</p>
                )}
              </div>
              <button onClick={handleStartCalling} disabled={calling}
                className="mt-3 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-60">
                {calling ? '⏳ Đang gọi...' : `🚀 Bắt đầu gọi ${outboundList.length} số`}
              </button>
            </div>
          )}
        </div>

        {/* Call history */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-700 text-sm">Lịch Sử Cuộc Gọi ({totalCalls})</h3>
            <div className="flex items-center gap-3">
              {lastRefresh && (
                <span className="text-xs text-gray-400">
                  Cập nhật {lastRefresh.getHours()}:{String(lastRefresh.getMinutes()).padStart(2,'0')}
                </span>
              )}
              <button onClick={() => clientIdRef.current && fetchCalls(clientIdRef.current)} className="p-1.5 hover:bg-gray-100 rounded-lg">
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
                    <th className="px-4 py-2 text-center">Điểm</th>
                    <th className="px-4 py-2 text-left">Tóm tắt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {calls.map(c => {
                    const dir = DIRECTION_MAP[c.direction ?? ''] ?? { label: '--', color: 'bg-gray-100 text-gray-600' }
                    const score = calcScore(c)
                    return (
                      <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedCall(c)}>
                        <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{formatDateTime(c.created_at)}</td>
                        <td className="px-4 py-2.5 text-gray-700 text-xs">{c.contact_name || c.contact_phone || '--'}</td>
                        <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${dir.color}`}>{dir.label}</span></td>
                        <td className="px-4 py-2.5 text-right text-gray-600 text-xs">{formatDuration(c.duration_seconds)}</td>
                        <td className="px-4 py-2.5 text-center"><ScoreBadge score={score} /></td>
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