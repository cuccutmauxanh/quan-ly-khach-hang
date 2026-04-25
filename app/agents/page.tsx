'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase, type Client } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/ui/app-shell'
import { PageSkeleton } from '@/components/skeleton'
import { useToast } from '@/components/toast'
import {
  PhoneIncoming, PhoneOutgoing, Heart, Zap,
  Save, RefreshCw, Check, ChevronDown, ChevronUp,
  Sparkles, MessageSquare,
} from 'lucide-react'

// ─── Định nghĩa 4 agent ─────────────────────────────────────────────────────

type AgentKey = 'receptionist' | 'cold' | 'cskh' | 'warm'

const AGENTS: {
  key: AgentKey
  label: string
  sublabel: string
  description: string
  dbField: keyof Client
  icon: React.ElementType
  tag: string
  tagBg: string
  tagText: string
  border: string
  activeBg: string
  ring: string
  dotColor: string
  defaultPrompt: string
}[] = [
  {
    key: 'receptionist',
    label: 'Lễ tân',
    sublabel: 'Nhận cuộc gọi đến',
    description: 'Tiếp nhận cuộc gọi từ khách hàng, tư vấn dịch vụ và đặt lịch hẹn khám',
    dbField: 'agent_receptionist_id',
    icon: PhoneIncoming,
    tag: 'bg-emerald-500',
    tagBg: 'bg-emerald-50',
    tagText: 'text-emerald-700',
    border: 'border-emerald-200',
    activeBg: 'bg-emerald-50',
    ring: 'ring-emerald-300',
    dotColor: 'bg-emerald-500',
    defaultPrompt: `Bạn là nhân viên lễ tân của {clinic_name} — phòng khám nha khoa chuyên nghiệp.

Nhiệm vụ chính:
- Chào hỏi khách hàng niềm nở, tạo thiện cảm ngay từ đầu cuộc gọi
- Lắng nghe nhu cầu: đau răng, làm đẹp, tẩy trắng, niềng răng, cấy ghép...
- Thu thập thông tin: họ tên, số điện thoại, thời gian mong muốn đến khám
- Đặt lịch hẹn phù hợp với lịch của phòng khám
- Xác nhận lại đầy đủ thông tin trước khi kết thúc

Nguyên tắc:
- Nói chậm, rõ ràng, thân thiện và chuyên nghiệp
- Không tự chẩn đoán bệnh hoặc đưa ra giá chính xác — hướng dẫn đến khám để tư vấn cụ thể
- Nếu bệnh nhân lo lắng, trấn an và nhấn mạnh đội ngũ bác sĩ giàu kinh nghiệm
- Kết thúc bằng cách nhắc lại lịch hẹn và cảm ơn`,
  },
  {
    key: 'cold',
    label: 'Telesale',
    sublabel: 'Gọi data lạnh',
    description: 'Tiếp cận khách hàng mới từ danh sách data chưa biết đến phòng khám',
    dbField: 'agent_cold_id',
    icon: PhoneOutgoing,
    tag: 'bg-blue-500',
    tagBg: 'bg-blue-50',
    tagText: 'text-blue-700',
    border: 'border-blue-200',
    activeBg: 'bg-blue-50',
    ring: 'ring-blue-300',
    dotColor: 'bg-blue-500',
    defaultPrompt: `Bạn là nhân viên tư vấn của {clinic_name}.
Bạn đang chủ động liên hệ để giới thiệu dịch vụ chăm sóc răng miệng.

Mục tiêu: Tạo thiện cảm, giới thiệu ngắn gọn, chốt lịch khám tư vấn miễn phí.

Quy trình:
1. Xin phép nói chuyện: "Chào anh/chị [tên], em là [tên] từ {clinic_name}, anh/chị có 2 phút không ạ?"
2. Giới thiệu ngắn: phòng khám uy tín, dịch vụ đa dạng
3. Hỏi nhu cầu: "Anh/chị có đang quan tâm đến vấn đề gì về răng miệng không ạ?"
4. Mời khám miễn phí: "Mình đang có chương trình khám tư vấn miễn phí, anh/chị có muốn đặt lịch không?"
5. Nếu đồng ý: thu thập thông tin và đặt lịch
6. Nếu từ chối: cảm ơn lịch sự, hỏi thời gian phù hợp để liên hệ lại

Lưu ý:
- Không ép buộc, tôn trọng quyết định của khách
- Giữ cuộc gọi ngắn gọn dưới 3 phút
- Nếu khách bận, lịch sự hỏi thời gian gọi lại`,
  },
  {
    key: 'cskh',
    label: 'Chăm sóc',
    sublabel: 'Khách hàng cũ',
    description: 'Hỏi thăm, nhắc lịch tái khám và chúc mừng sinh nhật khách đã dùng dịch vụ',
    dbField: 'agent_cskh_id',
    icon: Heart,
    tag: 'bg-amber-500',
    tagBg: 'bg-amber-50',
    tagText: 'text-amber-700',
    border: 'border-amber-200',
    activeBg: 'bg-amber-50',
    ring: 'ring-amber-300',
    dotColor: 'bg-amber-500',
    defaultPrompt: `Bạn là nhân viên chăm sóc khách hàng của {clinic_name}.
Bạn đang gọi điện hỏi thăm khách hàng đã từng điều trị tại phòng khám.

Mục tiêu: Tạo mối quan hệ lâu dài, nhắc nhở tái khám định kỳ.

Cách tiếp cận:
1. Chào hỏi thân mật: nhắc lại lần khám trước (nếu biết dịch vụ đã làm)
2. Hỏi thăm: "Sau lần điều trị vừa rồi, răng của anh/chị có ổn không ạ?"
3. Nhắc lịch tái khám: "Theo lịch, anh/chị nên tái khám định kỳ để kiểm tra..."
4. Nếu có vấn đề: đặt lịch khám sớm, trấn an về quy trình
5. Nếu sinh nhật: "Chúc mừng sinh nhật anh/chị! {clinic_name} có ưu đãi đặc biệt..."

Phong cách: Ấm áp, quan tâm thật sự, không mang tính bán hàng gượng ép.
Mục tiêu cuối: Khách hàng cảm thấy được quan tâm và tự nguyện đặt lịch tái khám.`,
  },
  {
    key: 'warm',
    label: 'Telesale',
    sublabel: 'Data ấm từ quảng cáo',
    description: 'Chốt lịch với khách để lại thông tin qua website hoặc Facebook',
    dbField: 'agent_warm_id',
    icon: Zap,
    tag: 'bg-violet-500',
    tagBg: 'bg-violet-50',
    tagText: 'text-violet-700',
    border: 'border-violet-200',
    activeBg: 'bg-violet-50',
    ring: 'ring-violet-300',
    dotColor: 'bg-violet-500',
    defaultPrompt: `Bạn là nhân viên tư vấn của {clinic_name}.
Khách hàng vừa để lại thông tin đăng ký tư vấn — họ đã có quan tâm nhất định.

Mục tiêu: Xác nhận nhu cầu và chốt lịch hẹn ngay trong cuộc gọi này.

Quy trình:
1. Mở đầu: "Chào anh/chị [tên], em gọi từ {clinic_name}. Anh/chị vừa đăng ký tư vấn về dịch vụ nha khoa ạ?"
2. Xác nhận nhu cầu: hỏi cụ thể vấn đề họ muốn giải quyết
3. Tư vấn ngắn: giới thiệu giải pháp phù hợp, nhấn mạnh lợi ích
4. Tạo cấp bách: "Hiện phòng khám có ưu đãi cho khách đặt lịch trong tuần này..."
5. Chốt lịch: đề xuất 2-3 khung giờ cụ thể để khách chọn
6. Xác nhận: đọc lại thông tin lịch hẹn đầy đủ

Lưu ý quan trọng:
- Khách đã có ý định — đừng giới thiệu quá dài, tập trung chốt lịch
- Giải quyết ngay các lo ngại về giá, thời gian, đau nhức
- Nếu chưa chốt được: hẹn gọi lại sau 30 phút`,
  },
]

// ─── Types ───────────────────────────────────────────────────────────────────

type SaveStatus = 'idle' | 'saving' | 'ok' | 'error'

type AgentData = {
  agent_name?: string
  voice_id?: string
  begin_message?: string | null
  general_prompt?: string | null
  llm_id?: string | null
  response_engine_type?: string | null
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [client, setClient] = useState<Client | null>(null)
  const [expanded, setExpanded] = useState<AgentKey | null>(null)

  const [agentDataMap, setAgentDataMap] = useState<Partial<Record<AgentKey, AgentData>>>({})
  const [loadingMap, setLoadingMap] = useState<Partial<Record<AgentKey, boolean>>>({})
  const [promptMap, setPromptMap] = useState<Partial<Record<AgentKey, string>>>({})
  const [greetingMap, setGreetingMap] = useState<Partial<Record<AgentKey, string>>>({})
  const [saveMap, setSaveMap] = useState<Partial<Record<AgentKey, SaveStatus>>>({})

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: cu } = await supabase.from('client_users').select('client_id').eq('user_id', user.id).single()
      if (!cu) { setLoading(false); return }
      const { data: c } = await supabase.from('clients').select('*').eq('id', cu.client_id).single()
      if (c) setClient(c)
      setLoading(false)
    }
    load()
  }, [router])

  const fetchAgent = useCallback(async (key: AgentKey) => {
    if (!client) return
    const def = AGENTS.find(a => a.key === key)!
    const agentId = client[def.dbField] as string | null
    if (!agentId) return

    setLoadingMap(p => ({ ...p, [key]: true }))
    try {
      const res = await fetch(`/api/retell-agent?agentId=${agentId}`)
      if (!res.ok) throw new Error()
      const data: AgentData = await res.json()
      setAgentDataMap(p => ({ ...p, [key]: data }))
      setPromptMap(p => ({ ...p, [key]: data.general_prompt ?? '' }))
      setGreetingMap(p => ({ ...p, [key]: data.begin_message ?? '' }))
    } catch {
      toast('Không thể tải cấu hình', 'error')
    }
    setLoadingMap(p => ({ ...p, [key]: false }))
  }, [client, toast])

  function toggleExpand(key: AgentKey) {
    if (expanded === key) {
      setExpanded(null)
      return
    }
    setExpanded(key)
    if (!agentDataMap[key]) fetchAgent(key)
  }

  async function saveAgent(key: AgentKey) {
    if (!client) return
    const def = AGENTS.find(a => a.key === key)!
    const agentId = client[def.dbField] as string | null
    if (!agentId) {
      toast('Chưa có mã cấu hình — liên hệ admin', 'error')
      return
    }
    const agentData = agentDataMap[key]

    setSaveMap(p => ({ ...p, [key]: 'saving' }))
    try {
      const res = await fetch('/api/retell-agent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          begin_message: greetingMap[key] || null,
          general_prompt: promptMap[key] || null,
          llm_id: agentData?.llm_id ?? null,
        }),
      })
      if (!res.ok) throw new Error()
      setSaveMap(p => ({ ...p, [key]: 'ok' }))
      toast('Đã lưu thành công', 'success')
    } catch {
      setSaveMap(p => ({ ...p, [key]: 'error' }))
      toast('Lỗi khi lưu — thử lại', 'error')
    }
    setTimeout(() => setSaveMap(p => ({ ...p, [key]: 'idle' })), 3000)
  }

  function applyDefault(key: AgentKey) {
    const def = AGENTS.find(a => a.key === key)!
    const name = client?.name ?? 'phòng khám'
    setPromptMap(p => ({ ...p, [key]: def.defaultPrompt.replace(/\{clinic_name\}/g, name) }))
  }

  if (loading) return <PageSkeleton />

  return (
    <AppShell clientName={client?.name}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Trợ lý AI</h1>
        <p className="text-sm text-gray-400 mt-0.5">Cấu hình kịch bản giao tiếp cho từng loại cuộc gọi</p>
      </div>

      {/* 4 Agent Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" style={{ marginBottom: 20 }}>
        {AGENTS.map(agent => {
          const agentId = client?.[agent.dbField] as string | null
          const isConfigured = !!agentId
          const isExpanded = expanded === agent.key
          const Icon = agent.icon

          return (
            <button
              key={agent.key}
              onClick={() => toggleExpand(agent.key)}
              className={`text-left rounded-2xl border-2 p-4 transition-all hover:shadow-md ${
                isExpanded
                  ? `${agent.border} ${agent.activeBg} shadow-md ring-2 ${agent.ring}`
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold text-white ${agent.tag}`}>
                  <Icon className="w-3 h-3" />
                  {agent.label}
                </span>
                {isExpanded
                  ? <ChevronUp className="w-4 h-4 text-gray-400 mt-0.5" />
                  : <ChevronDown className="w-4 h-4 text-gray-400 mt-0.5" />
                }
              </div>

              <p className="text-sm font-semibold text-gray-800 mb-1">{agent.sublabel}</p>
              <p className="text-xs text-gray-500 leading-relaxed">{agent.description}</p>

              <div className="mt-3 flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${isConfigured ? agent.dotColor : 'bg-gray-300'}`} />
                <span className={`text-xs font-medium ${isConfigured ? agent.tagText : 'text-gray-400'}`}>
                  {isConfigured ? 'Đã cấu hình' : 'Chưa cài đặt'}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Expanded config panel */}
      {expanded && (() => {
        const agent = AGENTS.find(a => a.key === expanded)!
        const agentId = client?.[agent.dbField] as string | null
        const isLoading = loadingMap[expanded]
        const prompt = promptMap[expanded] ?? ''
        const greeting = greetingMap[expanded] ?? ''
        const saveStatus = saveMap[expanded] ?? 'idle'
        const Icon = agent.icon

        return (
          <div className={`bg-white rounded-2xl border-2 ${agent.border} overflow-hidden shadow-sm`}>
            <div className={`px-6 py-4 ${agent.tagBg} border-b ${agent.border} flex items-center justify-between`}>
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold text-white ${agent.tag}`}>
                  <Icon className="w-3 h-3" />
                  {agent.label}
                </span>
                <h2 className={`font-semibold text-sm ${agent.tagText}`}>{agent.sublabel}</h2>
              </div>
              {isLoading && <RefreshCw className="w-4 h-4 text-gray-400 animate-spin" />}
            </div>

            <div className="p-6 space-y-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-gray-500" />
                    <label className="text-sm font-semibold text-gray-700">Kịch bản giao tiếp</label>
                    <span className="text-xs text-gray-400">{prompt.length} ký tự</span>
                  </div>
                  <button
                    onClick={() => applyDefault(expanded)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2.5 py-1 rounded-lg hover:bg-indigo-50 transition-colors"
                  >
                    Dùng mẫu mặc định
                  </button>
                </div>
                <textarea
                  value={prompt}
                  onChange={e => setPromptMap(p => ({ ...p, [expanded]: e.target.value }))}
                  rows={12}
                  placeholder="Mô tả cách AI cần hoạt động: vai trò, nhiệm vụ, phong cách giao tiếp, những điều không được làm..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none font-mono leading-relaxed"
                  disabled={!agentId}
                />
                {!agentId && (
                  <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                    ⚠ Chưa có mã trợ lý — liên hệ admin để cài đặt
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="w-4 h-4 text-gray-500" />
                  <label className="text-sm font-semibold text-gray-700">Câu mở đầu cuộc gọi</label>
                </div>
                <textarea
                  value={greeting}
                  onChange={e => setGreetingMap(p => ({ ...p, [expanded]: e.target.value }))}
                  rows={3}
                  placeholder="Để trống → AI tự chọn câu mở đầu phù hợp. Ví dụ: Xin chào! Đây là Nha Khoa ABC, tôi có thể giúp gì cho bạn?"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                  disabled={!agentId}
                />
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => saveAgent(expanded)}
                  disabled={!agentId || saveStatus === 'saving' || saveStatus === 'ok'}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 ${
                    saveStatus === 'ok'    ? 'bg-green-600 text-white' :
                    saveStatus === 'error' ? 'bg-red-600 text-white' :
                    saveStatus === 'saving' ? 'bg-indigo-400 text-white cursor-not-allowed' :
                    'bg-indigo-600 hover:bg-indigo-700 text-white'
                  }`}
                >
                  {saveStatus === 'saving' ? <RefreshCw className="w-4 h-4 animate-spin" /> :
                   saveStatus === 'ok'     ? <Check className="w-4 h-4" /> :
                   <Save className="w-4 h-4" />}
                  {saveStatus === 'saving' ? 'Đang lưu...' :
                   saveStatus === 'ok'     ? 'Đã lưu!' :
                   saveStatus === 'error'  ? 'Lỗi — thử lại' : 'Lưu kịch bản'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </AppShell>
  )
}
