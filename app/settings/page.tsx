'use client'

import { useEffect, useState } from 'react'
import { supabase, type Client } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Nav from '@/components/nav'
import { Save, Phone, Bot, Clock, RefreshCw } from 'lucide-react'

const RETELL_API = 'https://api.retellai.com'

type SaveStatus = 'idle' | 'saving' | 'ok' | 'error'

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-5">
        <span className="text-indigo-600">{icon}</span>
        <h2 className="font-semibold text-gray-700">{title}</h2>
      </div>
      {children}
    </div>
  )
}

function StatusBadge({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null
  const map = {
    saving: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    ok:     'bg-green-50 text-green-700 border-green-200',
    error:  'bg-red-50 text-red-700 border-red-200',
  }
  const label = { saving: 'Đang lưu...', ok: '✓ Đã lưu', error: '✗ Lỗi khi lưu' }
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${map[status]}`}>
      {label[status]}
    </span>
  )
}

export default function SettingsPage() {
  const router = useRouter()
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)

  const [beginMessage, setBeginMessage] = useState('')
  const [workStart, setWorkStart] = useState('08:00')
  const [workEnd, setWorkEnd] = useState('17:30')
  const [workDays, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5])

  const [agentSaveStatus, setAgentSaveStatus] = useState<SaveStatus>('idle')
  const [scheduleSaveStatus, setScheduleSaveStatus] = useState<SaveStatus>('idle')
  const [agentInfo, setAgentInfo] = useState<{ agent_name?: string; voice_id?: string } | null>(null)
  const [loadingAgent, setLoadingAgent] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: cu } = await supabase
        .from('client_users')
        .select('client_id')
        .eq('user_id', user.id)
        .single()
      if (!cu) { setLoading(false); return }

      const { data: c } = await supabase.from('clients').select('*').eq('id', cu.client_id).single()
      if (c) {
        setClient(c)
        if (c.notes) {
          try {
            const parsed = JSON.parse(c.notes)
            if (parsed.begin_message) setBeginMessage(parsed.begin_message)
            if (parsed.work_start)   setWorkStart(parsed.work_start)
            if (parsed.work_end)     setWorkEnd(parsed.work_end)
            if (parsed.work_days)    setWorkDays(parsed.work_days)
          } catch {}
        }
      }
      setLoading(false)
    }
    load()
  }, [router])

  async function fetchAgentInfo() {
    if (!client?.retell_agent_id) return
    setLoadingAgent(true)
    try {
      const res = await fetch(`/api/retell-agent?agentId=${client.retell_agent_id}`)
      const data = await res.json()
      setAgentInfo(data)
    } catch {}
    setLoadingAgent(false)
  }

  useEffect(() => {
    if (client?.retell_agent_id) fetchAgentInfo()
  }, [client])

  async function saveAgentSettings() {
    if (!client?.retell_agent_id) return
    setAgentSaveStatus('saving')
    try {
      const res = await fetch('/api/retell-agent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: client.retell_agent_id, begin_message: beginMessage || null }),
      })
      if (!res.ok) throw new Error()
      setAgentSaveStatus('ok')
    } catch {
      setAgentSaveStatus('error')
    }
    setTimeout(() => setAgentSaveStatus('idle'), 3000)
  }

  async function saveScheduleSettings() {
    if (!client) return
    setScheduleSaveStatus('saving')
    try {
      const existing = (() => { try { return JSON.parse(client.notes ?? '{}') } catch { return {} } })()
      const notes = JSON.stringify({ ...existing, begin_message: beginMessage, work_start: workStart, work_end: workEnd, work_days: workDays })
      const { error } = await supabase.from('clients').update({ notes }).eq('id', client.id)
      if (error) throw error
      setScheduleSaveStatus('ok')
    } catch {
      setScheduleSaveStatus('error')
    }
    setTimeout(() => setScheduleSaveStatus('idle'), 3000)
  }

  const DAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

  function toggleDay(d: number) {
    setWorkDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort())
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Đang tải...</div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav clientName={client?.name} />

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Cài đặt</h1>
          <p className="text-sm text-gray-400 mt-0.5">Cấu hình AI Voice Agent và lịch làm việc</p>
        </div>

        {/* Thông tin kết nối */}
        <Section title="Thông tin kết nối" icon={<Phone className="w-5 h-5" />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: 'Tên phòng khám', value: client?.name ?? '--' },
              { label: 'Số điện thoại AI', value: client?.retell_phone_number ?? 'Chưa cấu hình' },
              { label: 'Agent ID', value: client?.retell_agent_id ?? 'Chưa cấu hình' },
              { label: 'Gói dịch vụ', value: client?.package ?? 'Standard' },
            ].map(item => (
              <div key={item.label} className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-0.5">{item.label}</p>
                <p className="text-sm font-medium text-gray-700 truncate">{item.value}</p>
              </div>
            ))}
          </div>
          {agentInfo && (
            <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
              <span className="w-2 h-2 bg-green-400 rounded-full inline-block" />
              Agent: <span className="font-medium text-gray-700">{agentInfo.agent_name ?? 'N/A'}</span>
              {agentInfo.voice_id && <> · Voice: <span className="font-medium text-gray-700">{agentInfo.voice_id}</span></>}
              <button onClick={fetchAgentInfo} disabled={loadingAgent} className="ml-auto hover:text-indigo-600">
                <RefreshCw className={`w-3.5 h-3.5 ${loadingAgent ? 'animate-spin' : ''}`} />
              </button>
            </div>
          )}
        </Section>

        {/* Cấu hình AI Agent */}
        <Section title="Lời chào AI (Begin Message)" icon={<Bot className="w-5 h-5" />}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1.5">
                Lời chào khi AI bắt đầu cuộc gọi
              </label>
              <textarea
                value={beginMessage}
                onChange={e => setBeginMessage(e.target.value)}
                rows={4}
                placeholder="VD: Xin chào! Tôi là trợ lý AI của Nha Khoa ABC. Tôi có thể giúp gì cho bạn hôm nay?"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
              <p className="text-xs text-gray-400 mt-1">Để trống → AI dùng lời chào mặc định từ Retell.</p>
            </div>
            <div className="flex items-center justify-between">
              <StatusBadge status={agentSaveStatus} />
              <button
                onClick={saveAgentSettings}
                disabled={agentSaveStatus === 'saving' || !client?.retell_agent_id}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                <Save className="w-4 h-4" /> Lưu lời chào
              </button>
            </div>
          </div>
        </Section>

        {/* Lịch làm việc */}
        <Section title="Lịch làm việc" icon={<Clock className="w-5 h-5" />}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-600 mb-2">Ngày làm việc</label>
              <div className="flex gap-2">
                {DAY_LABELS.map((label, i) => (
                  <button
                    key={i}
                    onClick={() => toggleDay(i)}
                    className={`w-9 h-9 rounded-lg text-xs font-semibold transition-colors ${
                      workDays.includes(i)
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1.5">Giờ bắt đầu</label>
                <input
                  type="time"
                  value={workStart}
                  onChange={e => setWorkStart(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1.5">Giờ kết thúc</label>
                <input
                  type="time"
                  value={workEnd}
                  onChange={e => setWorkEnd(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <p className="text-xs text-gray-400">
              Lịch này được lưu vào hồ sơ và dùng để WF4 Retry Scheduler tránh gọi ngoài giờ.
            </p>

            <div className="flex items-center justify-between">
              <StatusBadge status={scheduleSaveStatus} />
              <button
                onClick={saveScheduleSettings}
                disabled={scheduleSaveStatus === 'saving'}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                <Save className="w-4 h-4" /> Lưu lịch làm việc
              </button>
            </div>
          </div>
        </Section>

        {/* Webhook URL */}
        <Section title="Webhook URL (cấu hình Retell)" icon={<Phone className="w-5 h-5" />}>
          {client?.slug ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">Copy URL này vào <strong>Retell Agent → Post-call webhook</strong>:</p>
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
                <code className="text-xs text-indigo-700 flex-1 break-all">
                  {`https://letanai.tino.page/webhook/saas-post-call?client=${client.slug}`}
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText(`https://letanai.tino.page/webhook/saas-post-call?client=${client.slug}`)}
                  className="text-xs text-gray-400 hover:text-indigo-600 whitespace-nowrap"
                >
                  Copy
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Chưa có slug. Liên hệ admin.</p>
          )}
        </Section>
      </main>
    </div>
  )
}
