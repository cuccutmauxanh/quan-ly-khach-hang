'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase, type Client } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Nav from '@/components/nav'
import { PageSkeleton } from '@/components/skeleton'
import { useToast } from '@/components/toast'
import {
  Save, Phone, Bot, Clock, Zap, RefreshCw, Copy, Check,
  ChevronRight, Sparkles, MessageSquare, Calendar, Link2,
} from 'lucide-react'

// ─── Prompt Templates ──────────────────────────────────────────────────────

const PROMPT_TEMPLATES = [
  {
    id: 'receptionist',
    icon: '📋',
    name: 'Lễ tân cơ bản',
    desc: 'Chào hỏi & đặt lịch đơn giản',
    prompt: `Bạn là lễ tân AI của {clinic_name} — một phòng khám nha khoa chuyên nghiệp.

Nhiệm vụ chính:
- Chào hỏi khách hàng niềm nở và chuyên nghiệp
- Lắng nghe nhu cầu (đau răng, làm đẹp, tẩy trắng, niềng răng…)
- Thu thập thông tin: họ tên, số điện thoại, thời gian mong muốn
- Đặt lịch hẹn khám phù hợp
- Xác nhận lại thông tin trước khi kết thúc cuộc gọi

Nguyên tắc:
- Nói chậm, rõ ràng, thân thiện
- Không tự đưa ra chẩn đoán bệnh
- Nếu hỏi về giá, hướng dẫn đến khám để được tư vấn chính xác
- Kết thúc bằng cách nhắc lại lịch hẹn đã đặt`,
  },
  {
    id: 'consultant',
    icon: '💬',
    name: 'Tư vấn dịch vụ',
    desc: 'Giới thiệu dịch vụ chi tiết',
    prompt: `Bạn là chuyên viên tư vấn AI của {clinic_name}.

Dịch vụ có thể tư vấn:
- Khám tổng quát và vệ sinh răng miệng định kỳ
- Điều trị sâu răng, viêm tủy, nhổ răng
- Cấy ghép implant và phục hình răng sứ
- Niềng răng mắc cài và niềng trong suốt (Invisalign)
- Tẩy trắng răng và dán sứ veneer

Quy trình tư vấn:
1. Hỏi khách đang gặp vấn đề gì hoặc muốn cải thiện điều gì
2. Giới thiệu dịch vụ phù hợp một cách ngắn gọn, dễ hiểu
3. Nhấn mạnh sự an toàn và hiệu quả
4. Đề xuất đặt lịch khám tư vấn miễn phí để được xem xét cụ thể`,
  },
  {
    id: 'booking',
    icon: '📅',
    name: 'Đặt lịch Pro',
    desc: 'Tối ưu tỷ lệ booking',
    prompt: `Bạn là trợ lý đặt lịch AI của {clinic_name}. Mục tiêu chính là giúp khách hàng đặt được lịch khám nhanh chóng.

Quy trình đặt lịch (theo thứ tự):
1. Chào hỏi và hỏi nhu cầu của khách
2. Xác nhận dịch vụ cần: khám lần đầu, tái khám, hay làm đẹp?
3. Hỏi tên và số điện thoại liên hệ
4. Đề xuất 2-3 khung giờ khả dụng để khách chọn
5. Xác nhận và đọc lại toàn bộ thông tin lịch hẹn
6. Cảm ơn và nhắc: "Phòng khám sẽ nhắn tin xác nhận lịch cho bạn"

Lưu ý: Tập trung vào việc chốt lịch, tránh lan man`,
  },
  {
    id: 'friendly',
    icon: '✨',
    name: 'Thân thiện',
    desc: 'Phong cách ấm áp, gần gũi',
    prompt: `Bạn là trợ lý AI thân thiện của {clinic_name}!

Tính cách: Vui vẻ, nhiệt tình, luôn quan tâm đến cảm xúc của khách hàng.

Phong cách giao tiếp:
- Dùng ngôn ngữ gần gũi, ấm áp: "Dạ", "Vâng ạ", "Tuyệt vời ạ"
- Thể hiện sự đồng cảm: "Ôi, bạn đang bị đau à, thương quá!"
- Tạo sự an tâm: "Đừng lo nhé, bác sĩ mình rất giỏi và nhẹ nhàng lắm ạ"
- Kết thúc tích cực: "Hẹn gặp bạn sớm, chúc bạn một ngày thật vui nhé!"

Mục tiêu: Khiến khách hàng cảm thấy thoải mái, tin tưởng và muốn đặt lịch ngay.`,
  },
]

const QUICK_GREETINGS = [
  {
    label: 'Ngắn gọn',
    text: 'Xin chào! Đây là {clinic_name}. Tôi có thể giúp gì cho bạn hôm nay?',
  },
  {
    label: 'Chuyên nghiệp',
    text: 'Chào bạn! Cảm ơn đã gọi đến {clinic_name}. Bạn cần đặt lịch khám hay có điều gì cần tư vấn ạ?',
  },
  {
    label: 'Thân thiện',
    text: 'Dạ xin chào! Tôi là trợ lý AI của {clinic_name}. Mình có thể hỗ trợ bạn đặt lịch hoặc tư vấn dịch vụ ạ!',
  },
]

// ─── Types & Helpers ────────────────────────────────────────────────────────

type Tab = 'agent' | 'schedule' | 'connection'
type SaveStatus = 'idle' | 'saving' | 'ok' | 'error'

type AgentData = {
  agent_name?: string
  voice_id?: string
  begin_message?: string | null
  general_prompt?: string | null
  llm_id?: string | null
  response_engine_type?: string | null
}

function applyClinicName(text: string, name: string) {
  return text.replace(/\{clinic_name\}/g, name)
}

function SaveBtn({
  status, onClick, disabled, label = 'Lưu',
}: {
  status: SaveStatus; onClick: () => void; disabled?: boolean; label?: string
}) {
  const colors: Record<SaveStatus, string> = {
    idle:   'bg-indigo-600 hover:bg-indigo-700 text-white',
    saving: 'bg-indigo-400 text-white cursor-not-allowed',
    ok:     'bg-green-600 text-white cursor-default',
    error:  'bg-red-600 text-white',
  }
  const icons: Record<SaveStatus, React.ReactNode> = {
    idle:   <Save className="w-4 h-4" />,
    saving: <RefreshCw className="w-4 h-4 animate-spin" />,
    ok:     <Check className="w-4 h-4" />,
    error:  <span className="text-xs">✗</span>,
  }
  const labels: Record<SaveStatus, string> = {
    idle:   label,
    saving: 'Đang lưu...',
    ok:     'Đã lưu!',
    error:  'Lỗi — thử lại',
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled || status === 'saving' || status === 'ok'}
      className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${colors[status]} disabled:opacity-50`}
    >
      {icons[status]} {labels[status]}
    </button>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [client, setClient] = useState<Client | null>(null)
  const [tab, setTab] = useState<Tab>('agent')

  // Agent state
  const [agentData, setAgentData] = useState<AgentData | null>(null)
  const [loadingAgent, setLoadingAgent] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [beginMessage, setBeginMessage] = useState('')
  const [agentSave, setAgentSave] = useState<SaveStatus>('idle')
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null)

  // Schedule state
  const [workDays, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [workStart, setWorkStart] = useState('08:00')
  const [workEnd, setWorkEnd] = useState('17:30')
  const [scheduleSave, setScheduleSave] = useState<SaveStatus>('idle')

  // Connection
  const [copied, setCopied] = useState(false)

  // Load client
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: cu } = await supabase.from('client_users').select('client_id').eq('user_id', user.id).single()
      if (!cu) { setLoading(false); return }

      const { data: c } = await supabase.from('clients').select('*').eq('id', cu.client_id).single()
      if (c) {
        setClient(c)
        if (c.notes) {
          try {
            const p = JSON.parse(c.notes)
            if (p.work_start) setWorkStart(p.work_start)
            if (p.work_end)   setWorkEnd(p.work_end)
            if (p.work_days)  setWorkDays(p.work_days)
          } catch {}
        }
      }
      setLoading(false)
    }
    load()
  }, [router])

  // Fetch Retell agent info
  const fetchAgent = useCallback(async () => {
    if (!client?.retell_agent_id) return
    setLoadingAgent(true)
    try {
      const res = await fetch(`/api/retell-agent?agentId=${client.retell_agent_id}`)
      if (!res.ok) throw new Error()
      const data: AgentData = await res.json()
      setAgentData(data)
      setPrompt(data.general_prompt ?? '')
      setBeginMessage(data.begin_message ?? '')
    } catch {
      toast('Không thể tải cấu hình agent', 'error')
    }
    setLoadingAgent(false)
  }, [client, toast])

  useEffect(() => { if (client?.retell_agent_id) fetchAgent() }, [client, fetchAgent])

  async function saveAgentSettings() {
    if (!client?.retell_agent_id) return
    setAgentSave('saving')
    try {
      const res = await fetch('/api/retell-agent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: client.retell_agent_id,
          begin_message: beginMessage || null,
          general_prompt: prompt || null,
          llm_id: agentData?.llm_id ?? null,
        }),
      })
      if (!res.ok) throw new Error()
      setAgentSave('ok')
      toast('Đã lưu cài đặt AI thành công', 'success')
    } catch {
      setAgentSave('error')
      toast('Lỗi khi lưu — kiểm tra kết nối Retell', 'error')
    }
    setTimeout(() => setAgentSave('idle'), 3000)
  }

  async function saveSchedule() {
    if (!client) return
    setScheduleSave('saving')
    try {
      const existing = (() => { try { return JSON.parse(client.notes ?? '{}') } catch { return {} } })()
      const notes = JSON.stringify({ ...existing, work_start: workStart, work_end: workEnd, work_days: workDays })
      const { error } = await supabase.from('clients').update({ notes }).eq('id', client.id)
      if (error) throw error
      setScheduleSave('ok')
      toast('Đã lưu lịch làm việc', 'success')
    } catch {
      setScheduleSave('error')
      toast('Lỗi khi lưu lịch', 'error')
    }
    setTimeout(() => setScheduleSave('idle'), 3000)
  }

  function applyTemplate(tpl: typeof PROMPT_TEMPLATES[0]) {
    const name = client?.name ?? 'phòng khám'
    setPrompt(applyClinicName(tpl.prompt, name))
    setActiveTemplate(tpl.id)
  }

  function applyGreeting(text: string) {
    setBeginMessage(applyClinicName(text, client?.name ?? 'phòng khám'))
  }

  function copyWebhook() {
    if (!client?.slug) return
    navigator.clipboard.writeText(`https://letanai.tino.page/webhook/saas-post-call?client=${client.slug}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const DAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'agent',      label: 'AI Agent',       icon: <Bot className="w-4 h-4" /> },
    { key: 'schedule',   label: 'Lịch làm việc',  icon: <Clock className="w-4 h-4" /> },
    { key: 'connection', label: 'Kết nối',         icon: <Link2 className="w-4 h-4" /> },
  ]

  if (loading) return <PageSkeleton />

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav clientName={client?.name} />

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-5">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-gray-800">Cài đặt</h1>
          <p className="text-sm text-gray-400 mt-0.5">Quản lý AI Agent và cấu hình hệ thống</p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1.5 w-fit">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t.key
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* ── Tab: AI Agent ─────────────────────────────────────────────── */}
        {tab === 'agent' && (
          <div className="space-y-4">

            {/* Agent status bar */}
            <div className="bg-white border border-gray-200 rounded-xl px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {loadingAgent ? (
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse" />
                ) : agentData ? (
                  <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                ) : (
                  <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                )}
                <span className="text-sm font-semibold text-gray-700">
                  {agentData?.agent_name ?? client?.retell_agent_id ?? 'Chưa kết nối'}
                </span>
                {agentData?.voice_id && (
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                    🎙 {agentData.voice_id}
                  </span>
                )}
                {agentData?.response_engine_type && (
                  <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                    {agentData.response_engine_type}
                  </span>
                )}
              </div>
              <button onClick={fetchAgent} disabled={loadingAgent}
                className="text-gray-400 hover:text-indigo-600 transition-colors">
                <RefreshCw className={`w-4 h-4 ${loadingAgent ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Prompt editor */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <h2 className="font-semibold text-gray-800 text-sm">Hướng dẫn cho AI (System Prompt)</h2>
                </div>
                <span className="text-xs text-gray-400">{prompt.length} ký tự</span>
              </div>

              {/* Template cards */}
              <div className="px-5 pt-4 pb-2">
                <p className="text-xs text-gray-500 mb-2.5 font-medium uppercase tracking-wide">Chọn mẫu nhanh</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {PROMPT_TEMPLATES.map(tpl => (
                    <button key={tpl.id} onClick={() => applyTemplate(tpl)}
                      className={`text-left p-3 rounded-xl border-2 transition-all hover:border-indigo-300 hover:bg-indigo-50 ${
                        activeTemplate === tpl.id
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-gray-100 bg-gray-50'
                      }`}>
                      <div className="text-lg mb-1">{tpl.icon}</div>
                      <div className="text-xs font-semibold text-gray-700">{tpl.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5 leading-tight">{tpl.desc}</div>
                      {activeTemplate === tpl.id && (
                        <div className="mt-1.5 text-xs text-indigo-600 font-medium flex items-center gap-0.5">
                          <Check className="w-3 h-3" /> Đang dùng
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Textarea */}
              <div className="px-5 pb-2 pt-3">
                <textarea
                  value={prompt}
                  onChange={e => { setPrompt(e.target.value); setActiveTemplate(null) }}
                  rows={10}
                  placeholder={`Mô tả cách AI nên hoạt động:\n- Giới thiệu bản thân là ai\n- Nhiệm vụ chính cần làm\n- Phong cách giao tiếp\n- Những điều không được làm`}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none font-mono leading-relaxed"
                />
                <div className="flex items-center justify-between mt-1.5 px-1">
                  <p className="text-xs text-gray-400 flex items-center gap-1">
                    <Zap className="w-3 h-3 text-yellow-500" />
                    Đây là &quot;não&quot; của AI — ảnh hưởng trực tiếp đến cách AI nói chuyện với khách
                  </p>
                  {!agentData?.llm_id && (
                    <span className="text-xs text-orange-500">⚠ Agent không dùng RetellLLM — prompt không thể cập nhật</span>
                  )}
                </div>
              </div>

              {/* Divider */}
              <div className="mx-5 border-t border-dashed border-gray-100 my-1" />

              {/* Begin message */}
              <div className="px-5 pt-3 pb-5">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="w-4 h-4 text-gray-500" />
                  <h3 className="text-sm font-semibold text-gray-700">Lời chào khi bắt đầu cuộc gọi</h3>
                </div>

                {/* Quick greeting chips */}
                <div className="flex flex-wrap gap-2 mb-2.5">
                  {QUICK_GREETINGS.map(g => (
                    <button key={g.label} onClick={() => applyGreeting(g.text)}
                      className="flex items-center gap-1 px-3 py-1 rounded-full bg-gray-100 hover:bg-indigo-100 hover:text-indigo-700 text-xs font-medium text-gray-600 transition-colors">
                      <ChevronRight className="w-3 h-3" /> {g.label}
                    </button>
                  ))}
                </div>

                <textarea
                  value={beginMessage}
                  onChange={e => setBeginMessage(e.target.value)}
                  rows={3}
                  placeholder="VD: Xin chào! Tôi là trợ lý AI của Nha Khoa ABC. Tôi có thể giúp gì cho bạn hôm nay?"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                />
                <p className="text-xs text-gray-400 mt-1 px-1">
                  Để trống → AI dùng lời chào mặc định từ Retell
                </p>
              </div>
            </div>

            {/* Save */}
            <div className="flex justify-end">
              <SaveBtn
                status={agentSave}
                onClick={saveAgentSettings}
                disabled={!client?.retell_agent_id}
                label="Lưu cài đặt AI"
              />
            </div>
          </div>
        )}

        {/* ── Tab: Lịch làm việc ────────────────────────────────────────── */}
        {tab === 'schedule' && (
          <div className="space-y-4">
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-600" />
                <h2 className="font-semibold text-gray-800 text-sm">Lịch làm việc</h2>
              </div>

              <div>
                <p className="text-sm text-gray-600 mb-3 font-medium">Ngày làm việc trong tuần</p>
                <div className="flex gap-2">
                  {DAY_LABELS.map((label, i) => (
                    <button key={i}
                      onClick={() => setWorkDays(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i].sort())}
                      className={`w-10 h-10 rounded-xl text-xs font-bold transition-all ${
                        workDays.includes(i)
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-2 font-medium">Giờ bắt đầu</label>
                  <input type="time" value={workStart} onChange={e => setWorkStart(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-2 font-medium">Giờ kết thúc</label>
                  <input type="time" value={workEnd} onChange={e => setWorkEnd(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700">
                <span className="font-semibold">Lưu ý:</span> Lịch này được WF4 Retry Scheduler dùng để tránh gọi lại ngoài giờ làm việc.
                Gọi lại chỉ xảy ra trong khung giờ bạn cài đặt và đúng các ngày đã chọn.
              </div>
            </div>

            <div className="flex justify-end">
              <SaveBtn status={scheduleSave} onClick={saveSchedule} label="Lưu lịch làm việc" />
            </div>
          </div>
        )}

        {/* ── Tab: Kết nối ──────────────────────────────────────────────── */}
        {tab === 'connection' && (
          <div className="space-y-4">

            {/* Info cards */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Phone className="w-4 h-4 text-indigo-600" />
                <h2 className="font-semibold text-gray-800 text-sm">Thông tin kết nối</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { label: 'Tên phòng khám',    value: client?.name ?? '--' },
                  { label: 'Số điện thoại AI',  value: client?.retell_phone_number ?? 'Chưa cấu hình' },
                  { label: 'Retell Agent ID',   value: client?.retell_agent_id ?? 'Chưa cấu hình' },
                  { label: 'Gói dịch vụ',       value: client?.package ?? 'Standard' },
                ].map(item => (
                  <div key={item.label} className="bg-gray-50 rounded-xl p-3.5">
                    <p className="text-xs text-gray-400 mb-1">{item.label}</p>
                    <p className="text-sm font-medium text-gray-700 break-all">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Webhook URL */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-indigo-600" />
                <h2 className="font-semibold text-gray-800 text-sm">Webhook URL (Retell Post-call)</h2>
              </div>
              <p className="text-sm text-gray-500 mb-3">
                Copy URL này và dán vào <strong>Retell Agent → Post-call webhook</strong> để kích hoạt xử lý tự động sau cuộc gọi.
              </p>
              {client?.slug ? (
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                  <code className="text-xs text-indigo-700 flex-1 break-all">
                    {`https://letanai.tino.page/webhook/saas-post-call?client=${client.slug}`}
                  </code>
                  <button onClick={copyWebhook}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      copied ? 'bg-green-100 text-green-700' : 'bg-white border border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600'
                    }`}>
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Đã copy!' : 'Copy'}
                  </button>
                </div>
              ) : (
                <p className="text-sm text-gray-400 bg-gray-50 rounded-xl px-4 py-3">
                  Chưa có slug. Liên hệ admin để cấu hình.
                </p>
              )}
            </div>

            {/* How to steps */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5">
              <p className="text-sm font-semibold text-indigo-800 mb-3">Hướng dẫn cài đặt Retell Webhook</p>
              <ol className="space-y-2 text-sm text-indigo-700">
                {[
                  'Đăng nhập vào Retell AI Dashboard',
                  'Chọn Agent của bạn → tab "Settings"',
                  'Tìm mục "Post-call webhook URL"',
                  'Dán URL ở trên vào ô đó',
                  'Nhấn Save — AI sẽ tự động báo cáo sau mỗi cuộc gọi',
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-indigo-200 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
