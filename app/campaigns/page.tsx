'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase, type Client } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/ui/app-shell'
import { PageSkeleton } from '@/components/skeleton'
import { useToast } from '@/components/toast'
import { Phone, PhoneOutgoing, Heart, Zap, PhoneIncoming, Upload, Play, Square, RefreshCw, X } from 'lucide-react'
import * as XLSX from 'xlsx'

type AgentOption = { key: keyof Client; label: string; icon: React.ElementType; color: string }
const AGENT_OPTIONS: AgentOption[] = [
  { key: 'agent_cold_id',         label: 'Telesale — Data lạnh',  icon: PhoneOutgoing,  color: 'text-blue-600' },
  { key: 'agent_warm_id',         label: 'Telesale — Data ấm',    icon: Zap,            color: 'text-violet-600' },
  { key: 'agent_cskh_id',         label: 'Chăm sóc khách hàng',  icon: Heart,          color: 'text-amber-600' },
  { key: 'agent_receptionist_id', label: 'Lễ tân',               icon: PhoneIncoming,  color: 'text-emerald-600' },
]

type CampaignRow = { name: string; phone: string }
type CallResult = { phone: string; name: string; success: boolean; call_id?: string; error?: string | null; status: 'pending' | 'calling' | 'done' | 'error' }

export default function CampaignsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedAgent, setSelectedAgent] = useState<keyof Client>('agent_cold_id')
  const [rows, setRows] = useState<CampaignRow[]>([])
  const [results, setResults] = useState<CallResult[]>([])
  const [running, setRunning] = useState(false)
  const [campaignName, setCampaignName] = useState('')
  const [delayMs, setDelayMs] = useState(3000)
  const fileRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef(false)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: cu } = await supabase.from('client_users').select('client_id').eq('user_id', user.id).single()
      if (!cu) { setLoading(false); return }
      const { data: c } = await supabase.from('clients').select('*').eq('id', cu.client_id).single()
      setClient(c)
      setLoading(false)
    }
    init()
  }, [router])

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const wb = XLSX.read(ev.target?.result, { type: 'binary' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' })
      const parsed: CampaignRow[] = raw.map(r => {
        const phone = String(Object.values(r).find((v, i) =>
          Object.keys(r)[i].toLowerCase().includes('phone') ||
          Object.keys(r)[i].toLowerCase().includes('điện') ||
          Object.keys(r)[i].toLowerCase().includes('sdt') ||
          /^\d{9,11}$/.test(String(v))
        ) || '').replace(/\D/g, '').replace(/^0/, '')
        const name = String(Object.values(r).find((v, i) =>
          Object.keys(r)[i].toLowerCase().includes('name') ||
          Object.keys(r)[i].toLowerCase().includes('tên')
        ) || '')
        return { name, phone }
      }).filter(r => r.phone.length >= 9)
      setRows(parsed)
      setResults([])
      toast(`Đã tải ${parsed.length} số`, 'success')
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

  async function startCampaign() {
    if (!client || rows.length === 0) return
    const agentId = client[selectedAgent] as string | null
    const fromNumber = client.retell_phone_number
    if (!agentId || !fromNumber) { toast('Chưa cấu hình agent', 'error'); return }

    abortRef.current = false
    setRunning(true)
    const initial: CallResult[] = rows.map(r => ({ ...r, success: false, status: 'pending' }))
    setResults(initial)

    for (let i = 0; i < rows.length; i++) {
      if (abortRef.current) break
      setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'calling' } : r))
      try {
        const res = await fetch('/api/outbound', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phones: [{ phone: rows[i].phone, name: rows[i].name }],
            agentId, fromNumber,
          }),
        })
        const { results: r } = await res.json()
        const ok = r?.[0]?.success ?? false
        setResults(prev => prev.map((row, idx) => idx === i ? { ...row, success: ok, call_id: r?.[0]?.call_id, error: r?.[0]?.error, status: ok ? 'done' : 'error' } : row))
      } catch (err) {
        setResults(prev => prev.map((row, idx) => idx === i ? { ...row, success: false, error: String(err), status: 'error' } : row))
      }
      if (i < rows.length - 1 && !abortRef.current) await new Promise(r => setTimeout(r, delayMs))
    }
    setRunning(false)
    toast('Chiến dịch hoàn tất', 'success')
  }

  function stopCampaign() { abortRef.current = true }

  const doneCount  = results.filter(r => r.status === 'done').length
  const errCount   = results.filter(r => r.status === 'error').length
  const pendCount  = results.filter(r => r.status === 'pending').length

  if (loading) return <PageSkeleton />

  const agentOpt = AGENT_OPTIONS.find(a => a.key === selectedAgent)!

  return (
    <AppShell clientName={client?.name}>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-800">Chiến dịch AI</h1>
        <p className="text-sm text-gray-400 mt-0.5">Tạo và chạy chiến dịch gọi tự động hàng loạt</p>
      </div>

      <div className="grid grid-cols-5 gap-5" style={{ alignItems: 'start' }}>
        {/* Config panel */}
        <div className="col-span-2 space-y-4">
          {/* Tên chiến dịch */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <label className="text-xs font-semibold text-gray-500 block mb-2">Tên chiến dịch</label>
            <input value={campaignName} onChange={e => setCampaignName(e.target.value)}
              placeholder="VD: Telesale tháng 4/2026"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>

          {/* Chọn AI Agent */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <label className="text-xs font-semibold text-gray-500 block mb-3">Trợ lý AI</label>
            <div className="space-y-2">
              {AGENT_OPTIONS.map(opt => {
                const Icon = opt.icon
                const agentId = client?.[opt.key] as string | null
                const active = selectedAgent === opt.key
                return (
                  <button key={String(opt.key)} onClick={() => setSelectedAgent(opt.key)}
                    disabled={!agentId}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all border ${
                      active ? 'border-indigo-300 bg-indigo-50' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                    } disabled:opacity-40 disabled:cursor-not-allowed`}>
                    <Icon className={`w-4 h-4 ${opt.color}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-700 truncate">{opt.label}</p>
                      <p className="text-xs text-gray-400 truncate">{agentId ? agentId.slice(0, 20) + '…' : 'Chưa cấu hình'}</p>
                    </div>
                    {active && <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Cài đặt */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <label className="text-xs font-semibold text-gray-500 block mb-3">Độ trễ giữa các cuộc gọi</label>
            <div className="flex items-center gap-3">
              <input type="range" min={1000} max={10000} step={500} value={delayMs}
                onChange={e => setDelayMs(Number(e.target.value))}
                className="flex-1" />
              <span className="text-sm font-bold text-indigo-600 w-14 text-right">{delayMs / 1000}s</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">Tránh bị block bởi nhà mạng</p>
          </div>

          {/* Upload */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <label className="text-xs font-semibold text-gray-500 block mb-2">Danh sách số điện thoại</label>
            <p className="text-xs text-gray-400 mb-3">File Excel cần có cột Tên và Số điện thoại</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
            <button onClick={() => fileRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-3 text-sm text-gray-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
              <Upload className="w-4 h-4" /> Chọn file Excel
            </button>
            {rows.length > 0 && (
              <div className="mt-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">{rows.length} số điện thoại</span>
                <button onClick={() => { setRows([]); setResults([]) }}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Action */}
          {!running ? (
            <button onClick={startCampaign} disabled={rows.length === 0}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm">
              <Play className="w-4 h-4" /> Bắt đầu chiến dịch ({rows.length} số)
            </button>
          ) : (
            <button onClick={stopCampaign}
              className="w-full flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white font-semibold py-3 rounded-xl transition-colors">
              <Square className="w-4 h-4" /> Dừng chiến dịch
            </button>
          )}
        </div>

        {/* Results panel */}
        <div className="col-span-3">
          {results.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
              <Phone className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">Upload danh sách và bắt đầu chiến dịch</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              {/* Header */}
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-semibold text-gray-700">{campaignName || 'Chiến dịch'}</span>
                  {running && <RefreshCw className="w-4 h-4 text-indigo-500 animate-spin" />}
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-green-600 font-semibold">{doneCount} thành công</span>
                  <span className="text-red-500 font-semibold">{errCount} lỗi</span>
                  <span className="text-gray-400">{pendCount} chờ</span>
                </div>
              </div>
              {/* Progress bar */}
              {running && (
                <div className="h-1 bg-gray-100">
                  <div className="h-1 bg-indigo-500 transition-all"
                    style={{ width: `${((doneCount + errCount) / results.length) * 100}%` }} />
                </div>
              )}
              {/* List */}
              <div className="divide-y divide-gray-50 max-h-[calc(100vh-280px)] overflow-y-auto">
                {results.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 ${
                      r.status === 'done'    ? 'bg-green-100 text-green-600' :
                      r.status === 'error'   ? 'bg-red-100 text-red-500' :
                      r.status === 'calling' ? 'bg-indigo-100 text-indigo-600' :
                                               'bg-gray-100 text-gray-400'
                    }`}>
                      {r.status === 'done' ? '✓' : r.status === 'error' ? '✗' : r.status === 'calling' ? <RefreshCw className="w-3 h-3 animate-spin" /> : i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-700">{r.name || '—'}</p>
                      <p className="text-xs text-gray-400">{r.phone}</p>
                    </div>
                    <div className="text-right">
                      {r.status === 'done'    && <span className="text-xs text-green-600 font-medium">Đã gọi</span>}
                      {r.status === 'error'   && <span className="text-xs text-red-500">{r.error?.slice(0, 30) || 'Lỗi'}</span>}
                      {r.status === 'calling' && <span className="text-xs text-indigo-600 font-medium">Đang gọi...</span>}
                      {r.status === 'pending' && <span className="text-xs text-gray-300">Chờ</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
