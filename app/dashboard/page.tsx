'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase, type Client, type Call } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Phone, PhoneIncoming, PhoneOutgoing, CalendarCheck, Upload, LogOut, RefreshCw } from 'lucide-react'
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

export default function DashboardPage() {
  const router = useRouter()
  const [client, setClient] = useState<Client | null>(null)
  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)
  const [outboundList, setOutboundList] = useState<{ name: string; phone: string }[]>([])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function fetchData() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    // Lấy client của user này
    const { data: cu } = await supabase
      .from('client_users')
      .select('client_id')
      .eq('user_id', user.id)
      .single()

    if (!cu) { setLoading(false); return }

    const [{ data: c }, { data: cl }] = await Promise.all([
      supabase.from('clients').select('*').eq('id', cu.client_id).single(),
      supabase.from('calls').select('*').eq('tenant_id', cu.client_id).order('created_at', { ascending: false }).limit(50),
    ])

    setClient(c)
    setCalls(cl ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)

    const reader = new FileReader()
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target?.result, { type: 'binary' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws)

      const parsed = rows.map(r => ({
        name: String(r['Tên'] ?? r['ten'] ?? r['name'] ?? ''),
        phone: String(r['Số điện thoại'] ?? r['sdt'] ?? r['phone'] ?? '').replace(/\D/g, ''),
      })).filter(r => r.phone.length >= 9)

      setOutboundList(parsed)
      setUploading(false)
    }
    reader.readAsBinaryString(file)
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
      {/* Header */}
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
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
            >
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {outboundList.slice(0, 10).map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-400 text-xs">{i + 1}</td>
                        <td className="px-3 py-2 text-gray-700">{r.name || '--'}</td>
                        <td className="px-3 py-2 text-gray-700">{r.phone}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {outboundList.length > 10 && (
                  <p className="text-xs text-gray-400 px-3 py-2 bg-gray-50">...và {outboundList.length - 10} số nữa</p>
                )}
              </div>
              <button className="mt-3 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
                🚀 Bắt đầu gọi {outboundList.length} số
              </button>
            </div>
          )}
        </div>

        {/* Call history */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-700 text-sm">Lịch Sử Cuộc Gọi ({totalCalls})</h3>
            <button onClick={fetchData} className="p-1.5 hover:bg-gray-100 rounded-lg">
              <RefreshCw className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          {calls.length === 0 ? (
            <div className="p-10 text-center text-gray-400 text-sm">Chưa có cuộc gọi nào.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Thời gian</th>
                    <th className="px-4 py-2 text-left">Loại</th>
                    <th className="px-4 py-2 text-right">Thời lượng</th>
                    <th className="px-4 py-2 text-center">Đặt lịch</th>
                    <th className="px-4 py-2 text-left">Tóm tắt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {calls.map(c => {
                    const dir = DIRECTION_MAP[c.direction ?? ''] ?? { label: '--', color: 'bg-gray-100 text-gray-600' }
                    return (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{formatDateTime(c.created_at)}</td>
                        <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${dir.color}`}>{dir.label}</span></td>
                        <td className="px-4 py-2.5 text-right text-gray-600 text-xs">{formatDuration(c.duration_seconds)}</td>
                        <td className="px-4 py-2.5 text-center text-sm">{c.appointment_booked ? '✓' : '✗'}</td>
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