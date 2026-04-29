'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase, type Client, type Call, type Contact } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import {
  PhoneIncoming, Phone, RefreshCw, Save, Check,
  Sparkles, MessageSquare, Settings2, X,
} from 'lucide-react'
import AppShell from '@/components/ui/app-shell'
import { PageSkeleton } from '@/components/skeleton'
import { useToast } from '@/components/toast'

// ── Types ──────────────────────────────────────────────────────────────────────

type AgentData = {
  agent_name?: string
  begin_message?: string | null
  general_prompt?: string | null
  responsiveness?: number | null
  max_call_duration_ms?: number | null
  response_engine_type?: string | null
}
type SaveStatus = 'idle' | 'saving' | 'ok' | 'error'

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDT(s: string) {
  const d = new Date(s)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}
function fmtDur(s: number | null) {
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
function prioMeta(score: number) {
  if (score >= 70) return { label: 'VIP', color: 'text-red-700', bg: 'bg-red-50 border-red-100', dot: 'bg-red-500' }
  if (score >= 40) return { label: 'Quan tâm cao', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-100', dot: 'bg-amber-400' }
  return { label: 'Thông thường', color: 'text-gray-500', bg: 'bg-gray-50 border-gray-100', dot: 'bg-gray-400' }
}
function extractSentiment(summary: string | null) {
  if (!summary) return null
  const s = summary.toLowerCase()
  if (s.includes('không hài lòng') || s.includes('khiếu nại')) return '⚠ Cần xử lý khéo léo'
  if (s.includes('đặt lịch') || s.includes('sẵn sàng') || s.includes('đồng ý')) return '✓ Sẵn sàng đặt lịch'
  if (s.includes('hỏi giá') || s.includes('bao nhiêu') || s.includes('chi phí')) return '💰 Quan tâm đến giá'
  if (s.includes('implant') || s.includes('niềng') || s.includes('tẩy trắng')) return '🦷 Có nhu cầu rõ'
  if (s.includes('bận') || s.includes('gọi lại') || s.includes('sau')) return '⏰ Hẹn gọi lại'
  return null
}

const DEFAULT_PROMPT = `Bạn là nhân viên lễ tân của {clinic_name} — phòng khám nha khoa chuyên nghiệp.

Nhiệm vụ: Tiếp nhận cuộc gọi, lắng nghe nhu cầu, tư vấn và đặt lịch hẹn.

Quy trình:
1. Chào hỏi niềm nở, xưng tên phòng khám
2. Hỏi khách cần hỗ trợ gì (đau răng, làm đẹp, tẩy trắng, niềng...)
3. Thu thập: họ tên, số điện thoại, thời gian mong muốn
4. Xác nhận lịch hẹn và cảm ơn

Nguyên tắc: Không chẩn đoán bệnh, không báo giá cụ thể — mời khách đến để tư vấn trực tiếp.`

// ── Agent Config Panel ─────────────────────────────────────────────────────────

function AgentConfigPanel({ client }: { client: Client | null }) {
  const { toast } = useToast()
  const [agentData, setAgentData]         = useState<AgentData | null>(null)
  const [loadingAgent, setLoadingAgent]   = useState(false)
  const [prompt, setPrompt]               = useState('')
  const [greeting, setGreeting]           = useState('')
  const [responsiveness, setResponsiveness] = useState(0.8)
  const [saveStatus, setSaveStatus]       = useState<SaveStatus>('idle')

  const agentId = client?.agent_receptionist_id as string | null | undefined

  const fetchAgent = useCallback(async () => {
    if (!agentId) return
    setLoadingAgent(true)
    try {
      const res = await fetch(`/api/retell-agent?agentId=${agentId}`)
      if (res.ok) {
        const data: AgentData = await res.json()
        setAgentData(data)
        setPrompt(data.general_prompt ?? '')
        setGreeting(data.begin_message ?? '')
        setResponsiveness(data.responsiveness ?? 0.8)
      }
    } catch { /* silent */ }
    setLoadingAgent(false)
  }, [agentId])

  useEffect(() => { fetchAgent() }, [fetchAgent])

  async function handleSave() {
    if (!agentId) return
    setSaveStatus('saving')
    try {
      const res = await fetch('/api/retell-agent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          general_prompt: prompt || null,
          begin_message: greeting || null,
          responsiveness,
        }),
      })
      if (res.ok) {
        setSaveStatus('ok')
        setTimeout(() => setSaveStatus('idle'), 2500)
      } else {
        setSaveStatus('error')
        toast('Lỗi khi lưu cài đặt', 'error')
      }
    } catch {
      setSaveStatus('error')
      toast('Lỗi kết nối', 'error')
    }
  }

  return (
    <div className="bg-white rounded-xl border border-emerald-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-emerald-50 border-b border-emerald-100">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold text-white bg-emerald-500">
            <PhoneIncoming className="w-3 h-3" /> Lễ tân AI
          </span>
          <span className="text-sm font-semibold text-emerald-700">Cài đặt trợ lý nhận cuộc gọi</span>
        </div>
        {agentId && (
          <button onClick={fetchAgent} className="p-1.5 hover:bg-emerald-100 rounded-lg transition-colors">
            <RefreshCw className="w-3.5 h-3.5 text-emerald-500" />
          </button>
        )}
      </div>

      <div className="p-5">
        {!agentId ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
            ⚠ Trợ lý lễ tân chưa được cấu hình. Liên hệ admin để kích hoạt agent_receptionist_id.
          </div>
        ) : loadingAgent ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-5 h-5 text-gray-300 animate-spin" />
            <span className="text-sm text-gray-400 ml-2">Đang tải cấu hình...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {agentData?.response_engine_type && agentData.response_engine_type !== 'retell-llm' && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-xs text-blue-700">
                ℹ Agent dùng <strong>{agentData.response_engine_type}</strong> — chỉnh kịch bản trực tiếp trên Retell Dashboard.
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-4">
              {/* Kịch bản */}
              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                    <span className="text-sm font-semibold text-gray-700">Kịch bản giao tiếp</span>
                    <span className="text-xs text-gray-400">{prompt.length} ký tự</span>
                  </div>
                  <button onClick={() => setPrompt(DEFAULT_PROMPT)}
                    className="text-xs text-indigo-600 hover:bg-indigo-50 px-2.5 py-1 rounded-lg font-medium">
                    Dùng mẫu mặc định
                  </button>
                </div>
                <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={7}
                  placeholder="Mô tả vai trò AI: nhiệm vụ, cách giao tiếp, những điều không được làm..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none font-mono leading-relaxed" />
              </div>

              {/* Câu mở đầu */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <MessageSquare className="w-3.5 h-3.5 text-indigo-500" />
                  <span className="text-sm font-semibold text-gray-700">Câu mở đầu cuộc gọi</span>
                </div>
                <input value={greeting} onChange={e => setGreeting(e.target.value)}
                  placeholder="Để trống → AI tự chọn. VD: Xin chào! Đây là Nha Khoa Mila..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>

              {/* Tốc độ */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Settings2 className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-sm font-semibold text-gray-700">Tốc độ phản hồi</span>
                  </div>
                  <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                    {responsiveness <= 0.3 ? 'Chậm rãi' : responsiveness <= 0.6 ? 'Cân bằng' : responsiveness <= 0.85 ? 'Nhanh nhẹn' : 'Rất nhanh'}
                  </span>
                </div>
                <input type="range" min="0" max="1" step="0.05"
                  value={responsiveness} onChange={e => setResponsiveness(parseFloat(e.target.value))}
                  className="w-full accent-indigo-600" />
                <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                  <span>Chậm, suy nghĩ kỹ</span><span>Phản hồi tức thì</span>
                </div>
              </div>
            </div>

            {/* Save */}
            <div className="flex justify-end pt-1">
              <button onClick={handleSave}
                disabled={saveStatus === 'saving' || saveStatus === 'ok'}
                className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-60 ${
                  saveStatus === 'ok'     ? 'bg-green-600 text-white' :
                  saveStatus === 'error'  ? 'bg-red-600 text-white' :
                  saveStatus === 'saving' ? 'bg-indigo-400 text-white cursor-not-allowed' :
                  'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
                }`}>
                {saveStatus === 'saving' ? <RefreshCw className="w-4 h-4 animate-spin" /> :
                 saveStatus === 'ok'     ? <Check className="w-4 h-4" /> :
                 <Save className="w-4 h-4" />}
                {saveStatus === 'saving' ? 'Đang lưu...' : saveStatus === 'ok' ? 'Đã lưu!' : saveStatus === 'error' ? 'Lỗi — thử lại' : 'Lưu cài đặt'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Call Detail Modal ──────────────────────────────────────────────────────────

function CallDetailModal({ call, onClose }: { call: Call; onClose: () => void }) {
  const score = calcScore(call)
  const bar = score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-blue-500' : score >= 40 ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Gọi đến</span>
            <span className="text-sm text-gray-500">{fmtDT(call.created_at)}</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <div className="flex justify-between mb-2">
              <span className="text-sm font-semibold text-gray-700">Điểm cuộc gọi</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{score}đ</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className={`h-2 rounded-full ${bar}`} style={{ width: `${score}%` }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[['Khách hàng', call.contact_name || '--'], ['Số điện thoại', call.contact_phone || '--'],
              ['Thời lượng', fmtDur(call.duration_seconds)], ['Đặt lịch', call.appointment_booked ? '✅ Đã đặt' : '❌ Chưa đặt']
            ].map(([l, v]) => (
              <div key={l} className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-0.5">{l}</p>
                <p className="text-sm font-medium text-gray-700">{v}</p>
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
          {call.recording_url && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">🎙 Ghi âm</p>
              <audio controls src={call.recording_url} className="w-full h-10 rounded-xl" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function InboundPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [client, setClient]     = useState<Client | null>(null)
  const [calls, setCalls]       = useState<Call[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading]   = useState(true)
  const [callingId, setCallingId] = useState<string | null>(null)
  const [selectedCall, setSelectedCall] = useState<Call | null>(null)
  const [sendingSms, setSendingSms]     = useState<string | null>(null)
  const clientIdRef = useRef<string | null>(null)

  const fetchData = useCallback(async (clientId: string) => {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const [{ data: callData }, { data: contactData }] = await Promise.all([
      supabase.from('calls').select('*').eq('tenant_id', clientId)
        .eq('direction', 'inbound')
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false }),
      supabase.from('contacts').select('*').eq('tenant_id', clientId),
    ])
    setCalls(callData ?? [])
    setContacts(contactData ?? [])
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: cu } = await supabase.from('client_users').select('client_id').eq('user_id', user.id).single()
      if (!cu) { setLoading(false); return }
      clientIdRef.current = cu.client_id
      const { data: c } = await supabase.from('clients').select('*').eq('id', cu.client_id).single()
      setClient(c)
      await fetchData(cu.client_id)
      setLoading(false)
    }
    init()
  }, [router, fetchData])

  // Phone → contact lookup
  const phoneMap = new Map<string, Contact>()
  contacts.forEach(c => {
    phoneMap.set(c.phone, c)
    phoneMap.set(c.phone.replace(/^0/, ''), c)
    phoneMap.set('+84' + c.phone.replace(/^0/, ''), c)
  })
  function findContact(p: string | null): Contact | null {
    if (!p) return null
    return phoneMap.get(p) ?? phoneMap.get(p.replace(/^\+84/, '0')) ?? phoneMap.get(p.replace(/^0/, '')) ?? null
  }

  function priorityScore(call: Call, contact: Contact | null) {
    let s = 0
    if (contact?.interest_level === 'high') s += 50
    if ((contact?.call_count ?? 0) >= 3) s += 15
    const sum = (call.summary ?? '').toLowerCase()
    if (sum.includes('implant') || sum.includes('niềng')) s += 20
    if (sum.includes('sẵn sàng') || sum.includes('đặt lịch')) s += 15
    return Math.min(s, 100)
  }

  async function callBack(phone: string, name: string) {
    if (!client?.retell_phone_number || !client?.agent_receptionist_id) {
      toast('Chưa cấu hình agent', 'error'); return
    }
    setCallingId(phone)
    try {
      const res = await fetch('/api/outbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phones: [{ phone, name }],
          agentId: client.agent_receptionist_id,
          fromNumber: client.retell_phone_number,
        }),
      })
      const { results } = await res.json()
      toast(results?.[0]?.success ? `Đang gọi lại ${name || phone}` : 'Gọi thất bại', results?.[0]?.success ? 'success' : 'error')
    } catch { toast('Lỗi kết nối', 'error') }
    setCallingId(null)
  }

  async function sendSms(phone: string, name: string) {
    setSendingSms(phone)
    try {
      const msg = `Chào ${name || 'bạn'}! Nha khoa vừa gọi nhỡ cho bạn. Gọi lại ${client?.retell_phone_number || ''} hoặc để lại tin nhắn — chúng tôi hỗ trợ ngay. Trân trọng!`
      const r = await fetch('https://letanai.tino.page/webhook/saas-send-sms', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.startsWith('+84') ? phone : `+84${phone.replace(/^0/, '')}`, message: msg, tenant_id: client?.id }),
      })
      toast(r.ok ? 'Đã gửi SMS' : 'Gửi SMS thất bại', r.ok ? 'success' : 'error')
    } catch { toast('Lỗi kết nối', 'error') }
    setSendingSms(null)
  }

  if (loading) return <PageSkeleton />

  const today = new Date().toDateString()
  const todayCalls   = calls.filter(c => new Date(c.created_at).toDateString() === today)
  const missed       = calls.filter(c => c.status === 'no_answer')
  const connected    = calls.filter(c => c.status !== 'no_answer')
  const todayBooked  = todayCalls.filter(c => c.appointment_booked).length

  const enrichedMissed = missed.map(call => {
    const contact = findContact(call.contact_phone)
    return { call, contact, score: priorityScore(call, contact) }
  }).sort((a, b) => b.score - a.score)

  return (
    <AppShell clientName={client?.name}>
      {selectedCall && (
        <CallDetailModal call={selectedCall} onClose={() => setSelectedCall(null)} />
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Lễ Tân AI</h1>
          <p className="text-sm text-gray-400 mt-0.5">Quản lý cuộc gọi đến và cấu hình AI trực tuyến</p>
        </div>
        <button onClick={() => clientIdRef.current && fetchData(clientIdRef.current)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">
          <RefreshCw className="w-3.5 h-3.5" /> Làm mới
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Số điện thoại',      value: client?.retell_phone_number ?? '--', bg: 'bg-emerald-50', color: 'text-emerald-800', sub: 'Số nhận cuộc gọi' },
          { label: 'Hôm nay nhận',       value: `${todayCalls.length} cuộc`,         bg: 'bg-emerald-50', color: 'text-emerald-800', sub: '30 ngày gần nhất: ' + calls.length },
          { label: 'Gọi nhỡ cần xử lý', value: `${missed.length} cuộc`,             bg: missed.length > 0 ? 'bg-red-50' : 'bg-emerald-50', color: missed.length > 0 ? 'text-red-700 font-bold' : 'text-emerald-800', sub: 'Cần gọi lại' },
          { label: 'Đặt lịch hôm nay',  value: `${todayBooked} lịch`,              bg: 'bg-emerald-50', color: 'text-emerald-800', sub: `Tổng: ${calls.filter(c=>c.appointment_booked).length}` },
        ].map(k => (
          <div key={k.label} className={`${k.bg} rounded-xl p-4`}>
            <p className="text-xs text-emerald-600 mb-1">{k.label}</p>
            <p className={`text-sm font-bold ${k.color}`}>{k.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="space-y-5">
        {/* Agent Config */}
        <AgentConfigPanel client={client} />

        {/* Missed calls */}
        {missed.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <p className="text-sm font-semibold text-red-600">{missed.length} cuộc gọi nhỡ — cần gọi lại</p>
            </div>
            <div className="divide-y divide-gray-50">
              {enrichedMissed.slice(0, 10).map(({ call, contact, score }) => {
                const prio = prioMeta(score)
                const name = contact?.full_name || call.contact_name || call.contact_phone || '--'
                const phone = call.contact_phone ?? ''
                const sentiment = extractSentiment(call.summary)
                return (
                  <div key={call.id}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelectedCall(call)}>
                    <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center font-bold text-emerald-700 text-sm shrink-0">
                      {name[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-800">{name}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${prio.bg} ${prio.color}`}>
                          <span className={`inline-block w-1.5 h-1.5 rounded-full ${prio.dot} mr-1`} />
                          {prio.label}
                        </span>
                        {sentiment && <span className="text-xs text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-md">{sentiment}</span>}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{fmtDT(call.created_at)}{contact ? ` · ${contact.call_count ?? 0} cuộc trước` : ''}</p>
                    </div>
                    <div className="flex gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                      <button onClick={() => callBack(phone, name)} disabled={callingId === phone}
                        className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 disabled:opacity-50">
                        <Phone className="w-3 h-3" /> {callingId === phone ? '...' : 'Gọi lại'}
                      </button>
                      <button onClick={() => sendSms(phone, contact?.full_name || name)} disabled={sendingSms === phone}
                        className="px-2.5 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:border-gray-300 disabled:opacity-50">
                        {sendingSms === phone ? '...' : 'SMS'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Recent connected calls */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700">Cuộc gọi kết nối gần đây</p>
            <span className="text-xs text-gray-400">{connected.length} cuộc</span>
          </div>
          {connected.length === 0 ? (
            <div className="p-10 text-center">
              <PhoneIncoming className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Chưa có cuộc gọi đến nào.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {connected.slice(0, 20).map(call => {
                const contact = findContact(call.contact_phone)
                const name = contact?.full_name || call.contact_name || call.contact_phone || '--'
                const score = calcScore(call)
                return (
                  <div key={call.id}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelectedCall(call)}>
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center font-semibold text-gray-500 text-sm shrink-0">
                      {name[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-700">{name}</p>
                      <p className="text-xs text-gray-400">{fmtDT(call.created_at)} · {fmtDur(call.duration_seconds)}</p>
                    </div>
                    {call.appointment_booked
                      ? <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-medium shrink-0">✓ Đặt lịch</span>
                      : <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full shrink-0">{score}đ</span>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
