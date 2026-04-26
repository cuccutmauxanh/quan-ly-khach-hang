'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase, type Client, type Call, type Contact, type Appointment } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import {
  Phone, PhoneIncoming, PhoneOutgoing, CalendarCheck,
  Upload, RefreshCw, X, Heart, Zap, Search,
  Check, Save, Sparkles, MessageSquare, Settings2,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { PageSkeleton } from '@/components/skeleton'
import { useToast } from '@/components/toast'
import AppShell from '@/components/ui/app-shell'
import { KpiCard } from '@/components/ui/kpi-card'
import { useTheme } from '@/components/ui/theme'
import { IPhone, IPhoneIn, IPhoneOut, ICalCheck } from '@/components/ui/icons'

// ─── Agent tab definitions ───────────────────────────────────────────────────

type AgentTab = 'receptionist' | 'cold' | 'cskh' | 'warm'
type SaveStatus = 'idle' | 'saving' | 'ok' | 'error'
type AgentData = {
  agent_name?: string
  begin_message?: string | null
  general_prompt?: string | null
  llm_id?: string | null
  responsiveness?: number | null
  max_call_duration_ms?: number | null
  reminder_trigger_ms?: number | null
}

const TABS: {
  key: AgentTab
  label: string
  sublabel: string
  icon: React.ElementType
  tag: string; tagText: string; tagBg: string; border: string
  agentField: keyof Client
  defaultPrompt: string
}[] = [
  {
    key: 'receptionist', label: 'Lễ tân', sublabel: 'Nhận cuộc gọi đến',
    icon: PhoneIncoming,
    tag: 'bg-emerald-500', tagText: 'text-emerald-700', tagBg: 'bg-emerald-50', border: 'border-emerald-200',
    agentField: 'agent_receptionist_id',
    defaultPrompt: `Bạn là nhân viên lễ tân của {clinic_name} — phòng khám nha khoa chuyên nghiệp.

Nhiệm vụ: Tiếp nhận cuộc gọi, lắng nghe nhu cầu, tư vấn và đặt lịch hẹn.

Quy trình:
1. Chào hỏi niềm nở, xưng tên phòng khám
2. Hỏi khách cần hỗ trợ gì (đau răng, làm đẹp, tẩy trắng, niềng...)
3. Thu thập: họ tên, số điện thoại, thời gian mong muốn
4. Xác nhận lịch hẹn và cảm ơn

Nguyên tắc: Không chẩn đoán bệnh, không báo giá cụ thể — mời khách đến để tư vấn trực tiếp.`,
  },
  {
    key: 'cold', label: 'Telesale', sublabel: 'Gọi data lạnh',
    icon: PhoneOutgoing,
    tag: 'bg-blue-500', tagText: 'text-blue-700', tagBg: 'bg-blue-50', border: 'border-blue-200',
    agentField: 'agent_cold_id',
    defaultPrompt: `Bạn là nhân viên tư vấn của {clinic_name}, đang chủ động liên hệ để giới thiệu dịch vụ.

Mục tiêu: Tạo thiện cảm và chốt lịch khám tư vấn miễn phí.

Quy trình:
1. Xin phép 2 phút: "Anh/chị có tiện nói chuyện không ạ?"
2. Giới thiệu ngắn gọn dịch vụ nổi bật
3. Hỏi nhu cầu hiện tại về răng miệng
4. Mời khám miễn phí — đề xuất 2-3 khung giờ
5. Nếu bận: hỏi thời gian gọi lại phù hợp

Lưu ý: Giữ cuộc gọi dưới 3 phút, không ép buộc.`,
  },
  {
    key: 'cskh', label: 'Chăm sóc', sublabel: 'Khách hàng cũ',
    icon: Heart,
    tag: 'bg-amber-500', tagText: 'text-amber-700', tagBg: 'bg-amber-50', border: 'border-amber-200',
    agentField: 'agent_cskh_id',
    defaultPrompt: `Bạn là nhân viên chăm sóc khách hàng của {clinic_name}.
Bạn gọi điện hỏi thăm khách đã từng điều trị tại phòng khám.

Mục tiêu: Tạo mối quan hệ bền vững, nhắc nhở tái khám định kỳ.

Cách tiếp cận:
1. Chào hỏi thân mật, nhắc lại lần điều trị trước
2. Hỏi thăm tình trạng sức khỏe răng miệng
3. Nhắc lịch tái khám định kỳ 6 tháng/lần
4. Nếu sinh nhật: chúc mừng và thông báo ưu đãi
5. Đề xuất đặt lịch nếu khách có nhu cầu

Phong cách: Ấm áp, quan tâm thật sự, không tạo áp lực bán hàng.`,
  },
  {
    key: 'warm', label: 'Telesale', sublabel: 'Data ấm từ quảng cáo',
    icon: Zap,
    tag: 'bg-violet-500', tagText: 'text-violet-700', tagBg: 'bg-violet-50', border: 'border-violet-200',
    agentField: 'agent_warm_id',
    defaultPrompt: `Bạn là nhân viên tư vấn của {clinic_name}.
Khách hàng vừa để lại thông tin đăng ký tư vấn — họ đã có quan tâm nhất định.

Mục tiêu: Xác nhận nhu cầu và chốt lịch hẹn ngay trong cuộc gọi.

Quy trình:
1. "Chào anh/chị, em gọi từ {clinic_name} — anh/chị vừa đăng ký tư vấn về dịch vụ nha khoa ạ?"
2. Xác nhận nhu cầu cụ thể
3. Giới thiệu giải pháp phù hợp, nhấn mạnh lợi ích
4. Tạo động lực: "Hiện có ưu đãi cho khách đặt lịch trong tuần..."
5. Chốt lịch: đề xuất 2-3 khung giờ — đọc lại xác nhận

Lưu ý: Khách đã có ý định — đừng giới thiệu dài, tập trung chốt lịch.`,
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

// ─── Call Detail Modal ────────────────────────────────────────────────────────

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
              <p className="text-xs font-semibold text-green-700 mb-1">🗓 Lịch hẹn</p>
              <p className="text-sm text-green-800 font-medium">{call.appointment_datetime}</p>
              {call.appointment_notes && <p className="text-xs text-green-600 mt-1">{call.appointment_notes}</p>}
            </div>
          )}
          {call.summary && <div><p className="text-xs font-semibold text-gray-500 mb-2">📋 Tóm tắt</p><p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-4 leading-relaxed">{call.summary}</p></div>}
          {call.recording_url && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">🎙 Ghi âm</p>
              <audio controls src={call.recording_url} className="w-full h-10 rounded-xl" />
            </div>
          )}
          {call.transcript && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">💬 Nội dung cuộc gọi</p>
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

// ─── Agent Edit Modal (popup) ─────────────────────────────────────────────────


function AgentModal({
  tabDef, client, open, onClose,
  agentData, loadingAgent,
  prompt, greeting, responsiveness, maxDuration, reminderMs,
  saveStatus,
  onFetch, onPromptChange, onGreetingChange,
  onResponsivenessChange, onMaxDurationChange, onReminderChange,
  onSave, onApplyDefault,
}: {
  tabDef: typeof TABS[0]; client: Client | null; open: boolean; onClose: () => void
  agentData: AgentData | null; loadingAgent: boolean
  prompt: string; greeting: string; responsiveness: number
  maxDuration: number | null; reminderMs: number
  saveStatus: SaveStatus
  onFetch: () => void
  onPromptChange: (v: string) => void; onGreetingChange: (v: string) => void
  onResponsivenessChange: (v: number) => void
  onMaxDurationChange: (v: number | null) => void; onReminderChange: (v: number) => void
  onSave: () => void; onApplyDefault: () => void
}) {
  const agentId = client?.[tabDef.agentField] as string | null
  const Icon = tabDef.icon

  useEffect(() => {
    if (open && !agentData && !loadingAgent && agentId) onFetch()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Khóa scroll body khi modal mở
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col"
        style={{ maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`px-5 py-4 ${tabDef.tagBg} border-b ${tabDef.border} flex items-center justify-between shrink-0 rounded-t-2xl`}>
          <div className="flex items-center gap-2.5">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold text-white ${tabDef.tag}`}>
              <Icon className="w-3 h-3" />{tabDef.label}
            </span>
            <span className={`text-sm font-semibold ${tabDef.tagText}`}>Cài đặt trợ lý AI</span>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-black/10 rounded-lg transition-colors">
            <X className={`w-4 h-4 ${tabDef.tagText}`} />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 min-h-0">
          {loadingAgent ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
              <span className="text-sm text-gray-400 ml-3">Đang tải cấu hình...</span>
            </div>
          ) : (
            <>
              {/* Kịch bản giao tiếp */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                    <span className="text-sm font-semibold text-gray-700">Kịch bản giao tiếp</span>
                    <span className="text-xs text-gray-400">{prompt.length} ký tự</span>
                  </div>
                  <button onClick={onApplyDefault}
                    className="text-xs text-indigo-600 hover:bg-indigo-50 px-2.5 py-1 rounded-lg font-medium transition-colors">
                    Dùng mẫu mặc định
                  </button>
                </div>
                <textarea
                  value={prompt}
                  onChange={e => onPromptChange(e.target.value)}
                  rows={8}
                  disabled={!agentId}
                  placeholder="Mô tả vai trò AI: nhiệm vụ, cách giao tiếp, những điều không được làm..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none font-mono leading-relaxed disabled:opacity-50 disabled:bg-gray-50"
                />
              </div>

              {/* Câu mở đầu */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <MessageSquare className="w-3.5 h-3.5 text-indigo-500" />
                  <span className="text-sm font-semibold text-gray-700">Câu mở đầu cuộc gọi</span>
                </div>
                <input
                  value={greeting}
                  onChange={e => onGreetingChange(e.target.value)}
                  disabled={!agentId}
                  placeholder="Để trống → AI tự chọn. VD: Xin chào! Đây là Nha Khoa Mila, tôi có thể giúp gì?"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50"
                />
              </div>

              {/* Divider */}
              <div className="border-t border-dashed border-gray-200" />

              {/* Cài đặt AI */}
              <div>
                <div className="flex items-center gap-1.5 mb-4">
                  <Settings2 className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-sm font-semibold text-gray-700">Cài đặt hành vi AI</span>
                </div>
                <div className="space-y-4">

                  {/* Responsiveness */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium text-gray-600">Tốc độ phản hồi</span>
                      <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                        {responsiveness <= 0.3 ? 'Chậm rãi' : responsiveness <= 0.6 ? 'Cân bằng' : responsiveness <= 0.85 ? 'Nhanh nhẹn' : 'Rất nhanh'}
                      </span>
                    </div>
                    <input
                      type="range" min="0" max="1" step="0.05"
                      value={responsiveness}
                      onChange={e => onResponsivenessChange(parseFloat(e.target.value))}
                      disabled={!agentId}
                      className="w-full accent-indigo-600 disabled:opacity-50"
                    />
                    <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                      <span>Chậm, suy nghĩ kỹ</span>
                      <span>Phản hồi tức thì</span>
                    </div>
                  </div>


                </div>
              </div>

              {!agentId && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
                  ⚠ Trợ lý này chưa có mã cấu hình — liên hệ admin để kích hoạt.
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between shrink-0 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-xl transition-colors font-medium">
            Đóng
          </button>
          <button
            onClick={onSave}
            disabled={!agentId || saveStatus === 'saving' || saveStatus === 'ok'}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 ${
              saveStatus === 'ok'     ? 'bg-green-600 text-white' :
              saveStatus === 'error'  ? 'bg-red-600 text-white' :
              saveStatus === 'saving' ? 'bg-indigo-400 text-white cursor-not-allowed' :
              'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
            }`}
          >
            {saveStatus === 'saving' ? <RefreshCw className="w-4 h-4 animate-spin" /> :
             saveStatus === 'ok'     ? <Check className="w-4 h-4" /> :
             <Save className="w-4 h-4" />}
            {saveStatus === 'saving' ? 'Đang lưu...' : saveStatus === 'ok' ? 'Đã lưu!' : saveStatus === 'error' ? 'Lỗi — thử lại' : 'Lưu cài đặt'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Lễ tân ─────────────────────────────────────────────────────────────

function prioMeta(score: number) {
  if (score >= 70) return { label: 'VIP', color: 'text-red-700', bg: 'bg-red-50 border-red-100', dot: 'bg-red-500' }
  if (score >= 40) return { label: 'Quan tâm cao', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-100', dot: 'bg-amber-400' }
  return { label: 'Thông thường', color: 'text-gray-500', bg: 'bg-gray-50 border-gray-100', dot: 'bg-gray-400' }
}

function extractSentiment(summary: string | null): string | null {
  if (!summary) return null
  const s = summary.toLowerCase()
  if (s.includes('không hài lòng') || s.includes('khiếu nại') || s.includes('phàn nàn')) return '⚠ Cần xử lý khéo léo'
  if (s.includes('đặt lịch') || s.includes('sẵn sàng') || s.includes('đồng ý')) return '✓ Sẵn sàng đặt lịch'
  if (s.includes('hỏi giá') || s.includes('bao nhiêu') || s.includes('chi phí') || s.includes('giá')) return '💰 Quan tâm đến giá'
  if (s.includes('implant') || s.includes('niềng') || s.includes('tẩy trắng') || s.includes('nhổ')) return '🦷 Có nhu cầu điều trị rõ'
  if (s.includes('bận') || s.includes('gọi lại') || s.includes('sau')) return '⏰ Hẹn gọi lại'
  return null
}

function ReceptionistTab({ calls, client, contacts, onQuickCall }: {
  calls: Call[]; client: Client | null; contacts: Contact[]
  onQuickCall: (phone: string, name: string) => Promise<void>
}) {
  const { toast } = useToast()
  const [selectedId, setSelectedId]   = useState<string | null>(null)
  const [sendingSms, setSendingSms]   = useState<string | null>(null)

  const inbound = calls.filter(c => c.direction === 'inbound')
  const todayIn = inbound.filter(c => new Date(c.created_at).toDateString() === new Date().toDateString())
  const missed  = inbound.filter(c => c.status === 'no_answer')
  const recent  = inbound.filter(c => c.status !== 'no_answer').slice(0, 5)

  // phone normalizer → contact lookup
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
    if ((call.retry_count ?? 0) === 0) s += 10
    return Math.min(s, 100)
  }

  const enriched = missed.map(call => {
    const contact = findContact(call.contact_phone)
    return { call, contact, score: priorityScore(call, contact) }
  }).sort((a, b) => b.score - a.score)

  const sel = selectedId
    ? enriched.find(e => e.call.id === selectedId) ?? enriched[0]
    : enriched[0]

  async function sendSms(phone: string, name: string) {
    setSendingSms(phone)
    try {
      const msg = `Chào ${name || 'bạn'}! Nha khoa Mila vừa gọi nhỡ cho bạn. Gọi lại 028-8387-6780 hoặc để lại tin nhắn — chúng tôi hỗ trợ ngay. Trân trọng!`
      const r = await fetch('https://letanai.tino.page/webhook/saas-send-sms', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.startsWith('+84') ? phone : `+84${phone.replace(/^0/, '')}`, message: msg, tenant_id: client?.id }),
      })
      toast(r.ok ? 'Đã gửi SMS cho khách' : 'Gửi SMS thất bại', r.ok ? 'success' : 'error')
    } catch { toast('Lỗi kết nối', 'error') }
    setSendingSms(null)
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Số điện thoại',     value: client?.retell_phone_number ?? '--', color: 'text-emerald-800', bg: 'bg-emerald-50' },
          { label: 'Hôm nay nhận',      value: `${todayIn.length} cuộc`,           color: 'text-emerald-800', bg: 'bg-emerald-50' },
          { label: 'Gọi nhỡ cần xử lý',value: `${missed.length} cuộc`,            color: missed.length > 0 ? 'text-red-700 font-bold' : 'text-emerald-800', bg: missed.length > 0 ? 'bg-red-50' : 'bg-emerald-50' },
          { label: 'Đặt lịch hôm nay',  value: `${todayIn.filter(c => c.appointment_booked).length} lịch`, color: 'text-emerald-800', bg: 'bg-emerald-50' },
        ].map(k => (
          <div key={k.label} className={`${k.bg} rounded-xl p-3`}>
            <p className="text-xs text-emerald-600 mb-0.5">{k.label}</p>
            <p className={`text-sm ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {inbound.length === 0 ? (
        <div className="rounded-xl border border-gray-100 p-10 text-center">
          <PhoneIncoming className="w-8 h-8 text-gray-200 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Chưa có cuộc gọi đến nào.</p>
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: sel ? '1fr 280px' : '1fr' }}>

          {/* ── Left: priority missed + recent ── */}
          <div className="space-y-2 min-w-0">

            {missed.length > 0 && (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <p className="text-xs font-bold text-red-600 uppercase tracking-wide">
                    {missed.length} cuộc gọi nhỡ — cần gọi lại
                  </p>
                </div>

                {enriched.slice(0, 6).map(({ call, contact, score }) => {
                  const prio   = prioMeta(score)
                  const name   = contact?.full_name || call.contact_name || call.contact_phone || '--'
                  const phone  = call.contact_phone ?? ''
                  const isSelected = sel?.call.id === call.id
                  const sentiment  = extractSentiment(call.summary)

                  return (
                    <div key={call.id}
                      onClick={() => setSelectedId(call.id)}
                      className={`rounded-xl border p-3 cursor-pointer transition-all ${isSelected ? 'border-emerald-300 bg-emerald-50 shadow-sm ring-1 ring-emerald-200' : 'border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm'}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center font-bold text-emerald-700 text-sm shrink-0">
                          {name[0]?.toUpperCase() ?? '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className="text-sm font-semibold text-gray-800 truncate">{name}</span>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${prio.bg} ${prio.color} shrink-0`}>
                              <span className={`inline-block w-1.5 h-1.5 rounded-full ${prio.dot} mr-1`} />
                              {prio.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-gray-400">{formatDateTime(call.created_at)}</span>
                            {contact && <span className="text-xs text-gray-400">· {contact.call_count ?? 0} cuộc trước</span>}
                            {sentiment && <span className="text-xs text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-md">{sentiment}</span>}
                          </div>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <button onClick={e => { e.stopPropagation(); onQuickCall(phone, name) }}
                            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors">
                            <Phone className="w-3 h-3" /> Gọi lại
                          </button>
                          <button onClick={e => { e.stopPropagation(); sendSms(phone, contact?.full_name || name) }}
                            disabled={sendingSms === phone}
                            className="px-2.5 py-1.5 bg-white border border-gray-200 hover:border-gray-300 text-gray-600 rounded-lg text-xs font-medium disabled:opacity-50 transition-colors">
                            {sendingSms === phone ? '...' : 'SMS'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </>
            )}

            {/* Recent connected */}
            {recent.length > 0 && (
              <>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-2">Đã kết nối gần đây</p>
                {recent.map(call => {
                  const contact = findContact(call.contact_phone)
                  const name = contact?.full_name || call.contact_name || call.contact_phone || '--'
                  return (
                    <div key={call.id} className="rounded-xl border border-gray-100 bg-white p-3 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center font-semibold text-gray-500 text-sm shrink-0">
                        {name[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-700 truncate">{name}</p>
                        <p className="text-xs text-gray-400">{formatDateTime(call.created_at)} · {formatDuration(call.duration_seconds)}</p>
                      </div>
                      {call.appointment_booked
                        ? <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-medium shrink-0">✓ Đặt lịch</span>
                        : <ScoreBadge score={calcScore(call)} />}
                    </div>
                  )
                })}
              </>
            )}
          </div>

          {/* ── Right: contact profile panel ── */}
          {sel && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Hồ sơ khách</p>
              <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-4">

                {/* Identity */}
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-lg shrink-0">
                    {(sel.contact?.full_name || sel.call.contact_phone || '?')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-800 truncate">{sel.contact?.full_name || 'Khách chưa có hồ sơ'}</p>
                    <p className="text-xs text-gray-400">{sel.call.contact_phone}</p>
                  </div>
                </div>

                {/* Quick stats */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                    <p className="text-lg font-bold text-gray-700">{sel.contact?.call_count ?? 0}</p>
                    <p className="text-xs text-gray-400">Lần đã gọi</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                    <p className="text-sm font-bold text-gray-700">
                      {sel.contact?.interest_level === 'high' ? '🔥 Cao' : sel.contact?.interest_level === 'low' ? '❄ Thấp' : '— Chưa rõ'}
                    </p>
                    <p className="text-xs text-gray-400">Quan tâm</p>
                  </div>
                </div>

                {/* AI signal */}
                {extractSentiment(sel.call.summary) && (
                  <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3">
                    <p className="text-xs font-semibold text-indigo-700 mb-0.5">Tín hiệu AI từ cuộc gọi trước</p>
                    <p className="text-xs text-indigo-600">{extractSentiment(sel.call.summary)}</p>
                  </div>
                )}

                {/* Summary */}
                {sel.call.summary && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1.5">Tóm tắt cuộc gọi</p>
                    <p className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2.5 leading-relaxed line-clamp-4">{sel.call.summary}</p>
                  </div>
                )}

                {/* Notes from contact */}
                {sel.contact?.notes && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1.5">Ghi chú trong hồ sơ</p>
                    <p className="text-xs text-gray-600 bg-amber-50 border border-amber-100 rounded-lg p-2.5 leading-relaxed">{sel.contact.notes}</p>
                  </div>
                )}

                {/* Last contact time */}
                {sel.contact?.last_called_at && (
                  <p className="text-xs text-gray-400">
                    Liên hệ lần cuối: {formatDateTime(sel.contact.last_called_at)}
                  </p>
                )}

                {/* Actions */}
                <div className="space-y-2 pt-1 border-t border-gray-100">
                  <button onClick={() => onQuickCall(sel.call.contact_phone ?? '', sel.contact?.full_name || '')}
                    className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors">
                    <Phone className="w-4 h-4" /> Gọi lại ngay
                  </button>
                  <button onClick={() => sendSms(sel.call.contact_phone ?? '', sel.contact?.full_name || '')}
                    disabled={sendingSms === sel.call.contact_phone}
                    className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 hover:border-emerald-300 text-gray-700 text-sm font-medium py-2.5 rounded-xl transition-colors disabled:opacity-50">
                    📱 Gửi SMS thông báo
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}

// ─── Tab: Telesale Lạnh ───────────────────────────────────────────────────────

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
      const res = await fetch('/api/outbound', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phones: [{ name, phone: phone.replace(/\D/g,'') }], agentId, fromNumber }) })
      const d = await res.json()
      if (d.results?.[0]?.success) { toast(`Đang gọi ${phone}`, 'success'); setPhone(''); setName('') }
      else toast(d.results?.[0]?.error ?? 'Gọi thất bại', 'error')
    } catch { toast('Lỗi kết nối', 'error') }
    setCallingSingle(false)
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true); setCallResults([])
    const reader = new FileReader()
    reader.onload = evt => {
      const wb = XLSX.read(evt.target?.result, { type: 'array' })
      const rows = XLSX.utils.sheet_to_json<Record<string,string>>(wb.Sheets[wb.SheetNames[0]])
      setOutboundList(rows.map(r => ({ name: String(r['Tên']??r['ten']??r['name']??''), phone: String(r['Số điện thoại']??r['sdt']??r['phone']??'').replace(/\D/g,'') })).filter(r => r.phone.length >= 9))
      setUploading(false)
    }
    reader.readAsArrayBuffer(file); e.target.value = ''
  }

  async function callOne(item: { name: string; phone: string }, i: number) {
    if (!agentId || !fromNumber) { toast('Chưa cấu hình', 'error'); return }
    setCallingIndex(i)
    const res = await fetch('/api/outbound', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phones: [item], agentId, fromNumber }) })
    const d = await res.json()
    setCallResults(p => { const n = [...p]; n[i] = d.results?.[0]; return n })
    setCallingIndex(null)
  }

  async function callAll() {
    if (!agentId || !fromNumber) { toast('Chưa cấu hình', 'error'); return }
    if (!confirm(`Xác nhận gọi ${outboundList.length} số?`)) return
    setCalling(true); setCallResults([])
    const res = await fetch('/api/outbound', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phones: outboundList, agentId, fromNumber }) })
    const d = await res.json(); setCallResults(d.results ?? []); setCalling(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {[{ k: 'single' as const, l: '📞 Gọi đơn lẻ' }, { k: 'batch' as const, l: '📋 Gọi hàng loạt' }].map(m => (
          <button key={m.k} onClick={() => setMode(m.k)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${mode === m.k ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {m.l}
          </button>
        ))}
      </div>

      {mode === 'single' && (
        <div className="bg-gray-50 rounded-xl p-4">
          <div className="flex gap-3 flex-wrap">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Tên khách (tùy chọn)"
              className="flex-1 min-w-[140px] border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300" />
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Số điện thoại *"
              onKeyDown={e => e.key === 'Enter' && callSingle()}
              className="flex-1 min-w-[160px] border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300" />
            <button onClick={callSingle} disabled={callingSingle || !phone.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors whitespace-nowrap">
              <Phone className="w-4 h-4" />{callingSingle ? 'Đang gọi...' : 'Gọi ngay'}
            </button>
          </div>
        </div>
      )}

      {mode === 'batch' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">File Excel cần có cột <strong>Tên</strong> và <strong>Số điện thoại</strong></p>
            <button onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
              <Upload className="w-4 h-4" /> Chọn file
            </button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
          </div>
          {uploading && <p className="text-sm text-gray-400">Đang đọc file...</p>}
          {outboundList.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-600"><strong className="text-blue-700">{outboundList.length}</strong> số điện thoại</p>
                <button onClick={callAll} disabled={calling}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl text-sm font-semibold">
                  <PhoneOutgoing className="w-4 h-4" />{calling ? 'Đang gọi...' : `Gọi tất cả ${outboundList.length} số`}
                </button>
              </div>
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr><th className="px-3 py-2 text-left">#</th><th className="px-3 py-2 text-left">Tên</th><th className="px-3 py-2 text-left">Số điện thoại</th><th className="px-3 py-2 text-center">Trạng thái</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {outboundList.slice(0,15).map((r, i) => {
                      const result = callResults[i]
                      return (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-400 text-xs">{i+1}</td>
                          <td className="px-3 py-2 text-gray-700">{r.name||'--'}</td>
                          <td className="px-3 py-2 text-gray-700 font-mono text-xs">{r.phone}</td>
                          <td className="px-3 py-2 text-center">
                            {result ? (result.success ? <span className="text-emerald-600 text-xs font-medium">✓ Đã gọi</span> : <span className="text-red-500 text-xs">✗ Lỗi</span>)
                              : <button onClick={() => callOne(r,i)} disabled={callingIndex===i} className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700 disabled:opacity-50">{callingIndex===i?'...':'Gọi'}</button>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {outboundList.length > 15 && <p className="text-xs text-gray-400 px-3 py-2 bg-gray-50">...và {outboundList.length - 15} số nữa</p>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Tab: CSKH ───────────────────────────────────────────────────────────────

function CSKHTab({ client, contacts }: { client: Client | null; contacts: Contact[] }) {
  const { toast } = useToast()
  const [filter, setFilter] = useState<'all' | 'inactive' | 'new'>('all')
  const [search, setSearch] = useState('')
  const [callingId, setCallingId] = useState<string | null>(null)
  const agentId = client?.agent_cskh_id ?? client?.retell_agent_id
  const fromNumber = client?.retell_phone_number
  const now = Date.now()

  const filtered = contacts.filter(c => {
    if (search && !c.full_name?.toLowerCase().includes(search.toLowerCase()) && !c.phone.includes(search)) return false
    if (filter === 'inactive') { const l = c.last_called_at ? new Date(c.last_called_at).getTime() : 0; return (now - l) > 30*24*60*60*1000 }
    if (filter === 'new') return !c.last_called_at
    return true
  }).slice(0, 20)

  const inactiveCount = contacts.filter(c => { const l = c.last_called_at ? new Date(c.last_called_at).getTime() : 0; return (now - l) > 30*24*60*60*1000 }).length

  async function callContact(c: Contact) {
    if (!agentId || !fromNumber) { toast('Chưa cấu hình', 'error'); return }
    setCallingId(c.id)
    try {
      const res = await fetch('/api/outbound', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phones: [{ name: c.full_name??'', phone: c.phone }], agentId, fromNumber }) })
      const d = await res.json()
      toast(d.results?.[0]?.success ? `Đang gọi ${c.full_name ?? c.phone}` : 'Gọi thất bại', d.results?.[0]?.success ? 'success' : 'error')
    } catch { toast('Lỗi kết nối', 'error') }
    setCallingId(null)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
          {[{ k:'all' as const, l:'Tất cả' }, { k:'inactive' as const, l:`Chưa liên hệ >30 ngày (${inactiveCount})` }, { k:'new' as const, l:'Chưa từng gọi' }].map(f => (
            <button key={f.k} onClick={() => setFilter(f.k)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${filter === f.k ? 'bg-white text-amber-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {f.l}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-1.5 bg-white">
          <Search className="w-3.5 h-3.5 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm tên hoặc số..."
            className="text-sm focus:outline-none text-gray-700 placeholder-gray-300 w-36" />
        </div>
      </div>
      <div className="rounded-xl border border-gray-100 overflow-hidden">
        {filtered.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">Không có khách hàng trong bộ lọc này.</p> : (
          <div className="divide-y divide-gray-50">
            {filtered.map(c => {
              const days = c.last_called_at ? Math.floor((now - new Date(c.last_called_at).getTime())/(1000*60*60*24)) : null
              return (
                <div key={c.id} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50">
                  <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0 font-semibold text-amber-700 text-sm">{(c.full_name??c.phone)[0].toUpperCase()}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700">{c.full_name||'--'}</p>
                    <p className="text-xs text-gray-400">{c.phone}{days !== null ? ` · ${days} ngày trước` : <span className="text-amber-500"> · Chưa liên hệ</span>}</p>
                  </div>
                  {!!c.call_count && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full shrink-0">{c.call_count} cuộc</span>}
                  <button onClick={() => callContact(c)} disabled={callingId === c.id}
                    className="flex items-center gap-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium shrink-0">
                    <Phone className="w-3 h-3" />{callingId === c.id ? '...' : 'Gọi'}
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

// ─── Tab: Data ấm ─────────────────────────────────────────────────────────────

function WarmLeadsTab({ client, contacts }: { client: Client | null; contacts: Contact[] }) {
  const { toast } = useToast()
  const [callingId, setCallingId] = useState<string | null>(null)
  const [outboundList, setOutboundList] = useState<{ name: string; phone: string }[]>([])
  const [uploading, setUploading] = useState(false)
  const [calling, setCalling] = useState(false)
  const [callResults, setCallResults] = useState<{ phone: string; success: boolean }[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const agentId = client?.agent_warm_id ?? client?.retell_agent_id
  const fromNumber = client?.retell_phone_number

  const hotContacts = contacts.filter(c => c.interest_level === 'high' || !c.last_called_at)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 20)

  async function callContact(c: Contact) {
    if (!agentId || !fromNumber) { toast('Chưa cấu hình', 'error'); return }
    setCallingId(c.id)
    try {
      const res = await fetch('/api/outbound', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phones: [{ name: c.full_name??'', phone: c.phone }], agentId, fromNumber }) })
      const d = await res.json()
      toast(d.results?.[0]?.success ? `Đang gọi ${c.full_name??c.phone}` : 'Gọi thất bại', d.results?.[0]?.success ? 'success' : 'error')
    } catch { toast('Lỗi kết nối', 'error') }
    setCallingId(null)
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true); setCallResults([])
    const reader = new FileReader()
    reader.onload = evt => {
      const wb = XLSX.read(evt.target?.result, { type: 'array' })
      const rows = XLSX.utils.sheet_to_json<Record<string,string>>(wb.Sheets[wb.SheetNames[0]])
      setOutboundList(rows.map(r => ({ name: String(r['Tên']??r['ten']??r['name']??r['Họ tên']??''), phone: String(r['Số điện thoại']??r['sdt']??r['phone']??'').replace(/\D/g,'') })).filter(r => r.phone.length >= 9))
      setUploading(false)
    }
    reader.readAsArrayBuffer(file); e.target.value = ''
  }

  async function callAll() {
    if (!agentId || !fromNumber) { toast('Chưa cấu hình', 'error'); return }
    if (!confirm(`Xác nhận gọi ${outboundList.length} lead?`)) return
    setCalling(true); setCallResults([])
    const res = await fetch('/api/outbound', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phones: outboundList, agentId, fromNumber }) })
    const d = await res.json(); setCallResults(d.results ?? []); setCalling(false)
  }

  return (
    <div className="space-y-4">
      {/* Upload từ quảng cáo */}
      <div className="bg-gray-50 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-semibold text-gray-700">Import data từ quảng cáo</p>
            <p className="text-xs text-gray-400 mt-0.5">Facebook Ads, Google Ads, hoặc form đăng ký website</p>
          </div>
          <button onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700">
            <Upload className="w-4 h-4" /> Tải lên data
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
        </div>
        {uploading && <p className="text-sm text-gray-400">Đang đọc file...</p>}
        {outboundList.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-600"><strong className="text-violet-700">{outboundList.length}</strong> lead</p>
              <button onClick={callAll} disabled={calling}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white rounded-xl text-sm font-semibold">
                <PhoneOutgoing className="w-4 h-4" />{calling ? 'Đang gọi...' : 'Gọi tất cả ngay'}
              </button>
            </div>
            <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr><th className="px-3 py-2 text-left">#</th><th className="px-3 py-2 text-left">Tên</th><th className="px-3 py-2 text-left">Số điện thoại</th><th className="px-3 py-2 text-center">Trạng thái</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {outboundList.slice(0,15).map((r,i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-400 text-xs">{i+1}</td>
                      <td className="px-3 py-2 text-gray-700">{r.name||'--'}</td>
                      <td className="px-3 py-2 text-gray-700 font-mono text-xs">{r.phone}</td>
                      <td className="px-3 py-2 text-center text-xs">
                        {callResults[i] ? (callResults[i].success ? <span className="text-emerald-600 font-medium">✓ Đã gọi</span> : <span className="text-red-500">✗ Lỗi</span>) : <span className="text-gray-400">Chờ</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {outboundList.length > 15 && <p className="text-xs text-gray-400 px-3 py-2 bg-gray-50">...và {outboundList.length - 15} lead nữa</p>}
            </div>
          </div>
        )}
      </div>

      {/* Danh sách ưu tiên từ danh bạ */}
      {hotContacts.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Khách quan tâm trong danh bạ</p>
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <div className="divide-y divide-gray-50">
              {hotContacts.map(c => (
                <div key={c.id} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50">
                  <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center shrink-0 font-semibold text-violet-700 text-sm">{(c.full_name??c.phone)[0].toUpperCase()}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700">{c.full_name||'--'}</p>
                    <p className="text-xs text-gray-400">{c.phone}</p>
                  </div>
                  {c.interest_level === 'high' && <span className="text-xs text-violet-700 bg-violet-100 px-2 py-0.5 rounded-full font-medium shrink-0">Ưu tiên cao</span>}
                  {!c.last_called_at && <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium shrink-0">Chưa gọi</span>}
                  <button onClick={() => callContact(c)} disabled={callingId === c.id}
                    className="flex items-center gap-1 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium shrink-0">
                    <Phone className="w-3 h-3" />{callingId === c.id ? '...' : 'Gọi'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Copilot Panel ────────────────────────────────────────────────────────────

const COPILOT_SCRIPTS = [
  { id: 'price',      trigger: '💰 Hỏi về giá',     answer: 'Giá điều trị phụ thuộc vào tình trạng răng cụ thể của anh/chị. Bên em có khám và tư vấn miễn phí để đánh giá chính xác nhất. Anh/chị muốn đặt lịch khám thử không?' },
  { id: 'braces',     trigger: '😁 Niềng răng',      answer: 'Phòng khám có niềng trong suốt Invisalign và niềng mắc cài kim loại/sứ. Thời gian trung bình 12–24 tháng tùy tình trạng. Anh/chị đến tư vấn miễn phí với bác sĩ chuyên khoa nhé!' },
  { id: 'implant',    trigger: '🔩 Implant',          answer: 'Implant là giải pháp trồng răng vĩnh viễn, giống răng thật nhất hiện nay. Bên em dùng Implant chính hãng, bảo hành trọn đời. Anh/chị đến khám để bác sĩ đánh giá xương hàm — miễn phí hoàn toàn.' },
  { id: 'pain',       trigger: '🚨 Đang đau răng',   answer: 'Em rất tiếc khi nghe điều đó! Phòng khám luôn ưu tiên xử lý khẩn cấp. Anh/chị có thể đến ngay hôm nay không? Bác sĩ sẽ tiếp ngay khi anh/chị đến.' },
  { id: 'whitening',  trigger: '✨ Tẩy trắng',        answer: 'Bên em có tẩy trắng công nghệ Laser, không ê buốt, hiệu quả sau 1 buổi chỉ 45 phút. Đang có ưu đãi giảm 20% cho khách đặt lịch trong tháng này. Anh/chị muốn em giữ lịch không?' },
  { id: 'reschedule', trigger: '📅 Đổi lịch hẹn',   answer: 'Dạ không sao anh/chị. Anh/chị muốn dời sang ngày nào và khung giờ nào thì tiện nhất ạ? Bên em mở từ thứ 2 đến thứ 7, 8h sáng đến 17h30.' },
  { id: 'busy',       trigger: '⏰ Đang bận',         answer: 'Dạ em hiểu ạ. Vậy anh/chị tiện nhất vào thời điểm nào để em gọi lại? Sáng hay chiều ạ?' },
  { id: 'callback',   trigger: '📞 Hẹn gọi lại',     answer: 'Dạ bên em ghi nhận rồi. Em sẽ gọi lại cho anh/chị vào [thời gian]. Anh/chị có số điện thoại nào khác để liên lạc không ạ?' },
]

function generateTimeSlots(date: Date, appointments: Appointment[]) {
  const dayStr = date.toDateString()
  const booked = new Set<string>()
  appointments.forEach(a => {
    if (a.scheduled_at && new Date(a.scheduled_at).toDateString() === dayStr && a.status !== 'cancelled') {
      const d = new Date(a.scheduled_at)
      booked.add(`${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`)
    }
  })
  const slots: { time: string; label: string; booked: boolean }[] = []
  for (let h = 8; h <= 17; h++) {
    for (const m of [0, 30]) {
      if (h === 17 && m === 30) continue
      const time = `${h}:${String(m).padStart(2, '0')}`
      slots.push({ time, label: `${h}h${m === 30 ? '30' : '00'}`, booked: booked.has(time) })
    }
  }
  return slots
}

function CopilotPanel({ appointments, onClose }: { appointments: Appointment[]; onClose: () => void }) {
  const [tab, setTab]       = useState<'script' | 'slots' | 'notes'>('script')
  const [copied, setCopied] = useState<string | null>(null)
  const [note, setNote]     = useState('')
  const [slotDay, setSlotDay] = useState<'today' | 'tomorrow'>('today')

  function copyText(text: string, id: string) {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(id)
    setTimeout(() => setCopied(null), 1800)
  }

  const today = new Date()
  const slots = generateTimeSlots(slotDay === 'today' ? today : new Date(today.getTime() + 86400000), appointments)
  const freeCount = slots.filter(s => !s.booked).length

  return (
    <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm overflow-hidden flex flex-col" style={{ minHeight: 400 }}>
      <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm">🤖</span>
          <span className="text-sm font-bold text-indigo-700">Co-pilot AI</span>
          <span className="text-xs text-indigo-400 hidden lg:inline">Trợ lý thời gian thực</span>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-indigo-100 rounded-lg transition-colors">
          <X className="w-3.5 h-3.5 text-indigo-400" />
        </button>
      </div>

      <div className="flex border-b border-gray-100 shrink-0">
        {[
          { k: 'script' as const, l: 'Script' },
          { k: 'slots'  as const, l: `Lịch (${freeCount})` },
          { k: 'notes'  as const, l: 'Ghi chú' },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`flex-1 py-2 text-xs font-semibold transition-colors ${tab === t.k ? 'text-indigo-600 border-b-2 border-indigo-500' : 'text-gray-400 hover:text-gray-600'}`}>
            {t.l}
          </button>
        ))}
      </div>

      <div className="p-3 overflow-y-auto flex-1">

        {tab === 'script' && (
          <div className="space-y-2">
            <p className="text-xs text-gray-400 mb-2">Chọn tình huống → copy câu trả lời</p>
            {COPILOT_SCRIPTS.map(s => (
              <button key={s.id} onClick={() => copyText(s.answer, s.id)}
                className={`w-full text-left rounded-xl border p-3 transition-all ${copied === s.id ? 'border-green-300 bg-green-50' : 'border-gray-100 hover:border-indigo-200 hover:bg-indigo-50'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-700">{s.trigger}</span>
                  <span className={`text-xs font-medium shrink-0 ml-2 ${copied === s.id ? 'text-green-600' : 'text-indigo-400'}`}>
                    {copied === s.id ? '✓ Copied' : 'Copy'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{s.answer}</p>
              </button>
            ))}
          </div>
        )}

        {tab === 'slots' && (
          <div>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-3">
              {[{ k: 'today' as const, l: 'Hôm nay' }, { k: 'tomorrow' as const, l: 'Ngày mai' }].map(d => (
                <button key={d.k} onClick={() => setSlotDay(d.k)}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${slotDay === d.k ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}`}>
                  {d.l}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {slots.map(s => (
                <button key={s.time} onClick={() => !s.booked && copyText(s.label, `slot-${s.time}`)} disabled={s.booked}
                  className={`py-2 rounded-xl text-xs font-semibold text-center transition-all ${
                    s.booked                       ? 'bg-red-50 text-red-300 cursor-not-allowed' :
                    copied === `slot-${s.time}`    ? 'bg-green-100 text-green-700 border border-green-300' :
                    'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-100'
                  }`}>
                  {s.label}
                  {s.booked && <span className="block text-xs font-normal opacity-60">đã đặt</span>}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2 text-center">Click slot trống để copy giờ</p>
          </div>
        )}

        {tab === 'notes' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">Ghi chú trong lúc nghe máy</p>
            <textarea value={note} onChange={e => setNote(e.target.value)}
              placeholder="VD: Khách hỏi niềng răng, muốn khám thứ 7 sáng, quan tâm giá. Hẹn gọi lại 14h..."
              rows={8}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none placeholder-gray-300 leading-relaxed" />
            <div className="flex gap-2">
              <button onClick={() => copyText(note, 'notes')} disabled={!note}
                className="flex-1 py-2 text-xs font-semibold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-xl transition-colors disabled:opacity-40">
                {copied === 'notes' ? '✓ Đã copy' : '📋 Copy ghi chú'}
              </button>
              <button onClick={() => setNote('')} disabled={!note}
                className="px-3 py-2 text-xs text-gray-400 hover:text-red-500 border border-gray-200 rounded-xl transition-colors disabled:opacity-40">
                Xóa
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [client, setClient] = useState<Client | null>(null)
  const [calls, setCalls] = useState<Call[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<AgentTab>('receptionist')
  const [selectedCall, setSelectedCall] = useState<Call | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [showCopilot, setShowCopilot] = useState(false)
  const clientIdRef = useRef<string | null>(null)

  // ── Agent config state ──────────────────────────────────────────────────────
  const [configOpen, setConfigOpen] = useState(false)
  const [agentDataMap, setAgentDataMap] = useState<Partial<Record<AgentTab, AgentData>>>({})
  const [loadingAgentMap, setLoadingAgentMap] = useState<Partial<Record<AgentTab, boolean>>>({})
  const [promptMap, setPromptMap] = useState<Partial<Record<AgentTab, string>>>({})
  const [greetingMap, setGreetingMap] = useState<Partial<Record<AgentTab, string>>>({})
  const [responsivenessMap, setResponsivenessMap] = useState<Partial<Record<AgentTab, number>>>({})
  const [maxDurationMap, setMaxDurationMap] = useState<Partial<Record<AgentTab, number | null>>>({})
  const [reminderMap, setReminderMap] = useState<Partial<Record<AgentTab, number>>>({})
  const [saveMap, setSaveMap] = useState<Partial<Record<AgentTab, SaveStatus>>>({})

  // Close config when switching tabs
  const prevTabRef = useRef(activeTab)
  useEffect(() => {
    if (prevTabRef.current !== activeTab) { setConfigOpen(false); prevTabRef.current = activeTab }
  }, [activeTab])

  const fetchCalls = useCallback(async (clientId: string) => {
    const { data } = await supabase.from('calls').select('*').eq('tenant_id', clientId).order('created_at', { ascending: false }).limit(50)
    setCalls(data ?? []); setLastRefresh(new Date())
  }, [])

  const fetchContacts = useCallback(async (clientId: string) => {
    const { data } = await supabase.from('contacts').select('*').eq('tenant_id', clientId).order('created_at', { ascending: false }).limit(100)
    setContacts(data ?? [])
  }, [])

  const fetchAppointments = useCallback(async (clientId: string) => {
    const from = new Date(); from.setHours(0, 0, 0, 0)
    const to   = new Date(from.getTime() + 2 * 86400000)
    const { data } = await supabase.from('appointments').select('*')
      .eq('tenant_id', clientId)
      .gte('scheduled_at', from.toISOString())
      .lte('scheduled_at', to.toISOString())
    setAppointments(data ?? [])
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
      await Promise.all([fetchCalls(cu.client_id), fetchContacts(cu.client_id), fetchAppointments(cu.client_id)])
      setLoading(false)
    }
    init()
  }, [router, fetchCalls, fetchContacts, fetchAppointments])

  useEffect(() => {
    const interval = setInterval(() => { if (clientIdRef.current) fetchCalls(clientIdRef.current) }, 30000)
    return () => clearInterval(interval)
  }, [fetchCalls])

  async function fetchAgent(key: AgentTab) {
    if (!client) return
    const tabDef = TABS.find(t => t.key === key)!
    const agentId = client[tabDef.agentField] as string | null
    if (!agentId) return
    setLoadingAgentMap(p => ({ ...p, [key]: true }))
    try {
      const res = await fetch(`/api/retell-agent?agentId=${agentId}`)
      if (!res.ok) throw new Error()
      const data: AgentData = await res.json()
      setAgentDataMap(p => ({ ...p, [key]: data }))
      setPromptMap(p => ({ ...p, [key]: data.general_prompt ?? '' }))
      setGreetingMap(p => ({ ...p, [key]: data.begin_message ?? '' }))
      setResponsivenessMap(p => ({ ...p, [key]: data.responsiveness ?? 0.8 }))
      setMaxDurationMap(p => ({ ...p, [key]: data.max_call_duration_ms ?? null }))
      setReminderMap(p => ({ ...p, [key]: data.reminder_trigger_ms ?? 3000 }))
    } catch { toast('Không thể tải kịch bản AI', 'error') }
    setLoadingAgentMap(p => ({ ...p, [key]: false }))
  }

  async function saveAgent(key: AgentTab) {
    if (!client) return
    const tabDef = TABS.find(t => t.key === key)!
    const agentId = client[tabDef.agentField] as string | null
    if (!agentId) { toast('Chưa có mã cấu hình', 'error'); return }
    setSaveMap(p => ({ ...p, [key]: 'saving' }))
    try {
      const res = await fetch('/api/retell-agent', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          begin_message:        greetingMap[key] || null,
          general_prompt:       promptMap[key] || null,
          llm_id:               agentDataMap[key]?.llm_id ?? null,
          responsiveness:       responsivenessMap[key] ?? 0.8,
          max_call_duration_ms: maxDurationMap[key] ?? null,
          reminder_trigger_ms:  reminderMap[key] ?? 3000,
        }),
      })
      if (!res.ok) throw new Error()
      setSaveMap(p => ({ ...p, [key]: 'ok' }))
      toast('Đã lưu kịch bản AI', 'success')
      setTimeout(() => setConfigOpen(false), 800)
    } catch { setSaveMap(p => ({ ...p, [key]: 'error' })); toast('Lỗi khi lưu', 'error') }
    setTimeout(() => setSaveMap(p => ({ ...p, [key]: 'idle' })), 3000)
  }

  function applyDefault(key: AgentTab) {
    const tabDef = TABS.find(t => t.key === key)!
    const name = client?.name ?? 'phòng khám'
    setPromptMap(p => ({ ...p, [key]: tabDef.defaultPrompt.replace(/\{clinic_name\}/g, name) }))
  }

  async function handleQuickCall(phone: string, name: string) {
    const agentId = client?.agent_receptionist_id ?? client?.retell_agent_id
    const fromNumber = client?.retell_phone_number
    if (!agentId || !fromNumber) { toast('Chưa cấu hình agent lễ tân', 'error'); return }
    try {
      const res = await fetch('/api/outbound', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phones: [{ phone: phone.replace(/\D/g, ''), name }], agentId, fromNumber }),
      })
      const d = await res.json()
      if (d.results?.[0]?.success) toast(`Đang gọi lại ${name || phone}`, 'success')
      else toast(d.results?.[0]?.error || 'Gọi thất bại', 'error')
    } catch { toast('Lỗi kết nối', 'error') }
  }

  if (loading) return <PageSkeleton />

  const totalCalls = calls.length
  const inbound  = calls.filter(c => c.direction === 'inbound').length
  const outbound = calls.filter(c => c.direction === 'outbound').length
  const booked   = calls.filter(c => c.appointment_booked).length
  const today    = calls.filter(c => new Date(c.created_at).toDateString() === new Date().toDateString()).length
  const tabDef   = TABS.find(t => t.key === activeTab)!

  return (
    <AppShell clientName={client?.name}>
      {selectedCall && <CallDetailModal call={selectedCall} onClose={() => setSelectedCall(null)} />}

      {/* Page header */}
      <DashHeader lastRefresh={lastRefresh} />

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 28 }}>
        <KpiCard label="Hôm nay"  value={today}   icon={<IPhone size={15}/>}    accentColor="#0c7c5e" delta="+3 so với hôm qua" />
        <KpiCard label="Gọi đến"  value={inbound}  icon={<IPhoneIn size={15}/>}  accentColor="#059669" />
        <KpiCard label="Gọi đi"   value={outbound} icon={<IPhoneOut size={15}/>} accentColor="#2563eb" />
        <KpiCard label="Đặt lịch" value={booked}   icon={<ICalCheck size={15}/>} accentColor="#7c3aed"
          delta={`${calls.length ? Math.round(booked / calls.length * 100) : 0}% tỉ lệ`} />
      </div>

      {/* Main call panel + Co-pilot */}
      <div className="flex gap-4 items-start" style={{ marginBottom: 20 }}>
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden flex-1 min-w-0">

          {/* Tab bar */}
          <div className="flex border-b border-gray-200">
            {TABS.map(t => {
              const Icon = t.icon
              const active = activeTab === t.key
              return (
                <button key={t.key} onClick={() => setActiveTab(t.key)}
                  className={`flex-1 flex flex-col items-center gap-0.5 px-2 py-3 transition-all border-b-2 ${
                    active ? `${t.tagBg} border-current` : 'border-transparent hover:bg-gray-50'
                  }`}
                  style={active ? { borderColor: '' } : {}}>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold text-white ${active ? t.tag : 'bg-gray-300'}`}>
                    <Icon className="w-3 h-3" />{t.label}
                  </span>
                  <span className={`text-xs font-medium ${active ? t.tagText : 'text-gray-400'}`}>{t.sublabel}</span>
                </button>
              )
            })}
          </div>

          {/* Tab content */}
          <div className="p-4">
            {/* Toolbar góc trên phải */}
            <div className="flex items-center justify-end gap-2 mb-3">
              {activeTab === 'receptionist' && (
                <button
                  onClick={() => setShowCopilot(p => !p)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all hover:shadow-sm ${showCopilot ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100'}`}
                >
                  🤖 Co-pilot{showCopilot ? ' ✕' : ''}
                </button>
              )}
              <button
                onClick={() => setConfigOpen(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all hover:shadow-sm ${tabDef.tagBg} ${tabDef.tagText} ${tabDef.border}`}
              >
                <Settings2 className="w-3.5 h-3.5" />
                Kịch bản AI
              </button>
            </div>

            {activeTab === 'receptionist' && <ReceptionistTab calls={calls} client={client} contacts={contacts} onQuickCall={handleQuickCall} />}
            {activeTab === 'cold'         && <ColdCallTab client={client} />}
            {activeTab === 'cskh'         && <CSKHTab client={client} contacts={contacts} />}
            {activeTab === 'warm'         && <WarmLeadsTab client={client} contacts={contacts} />}
          </div>

          {/* Agent edit modal — portal-style popup */}
          <AgentModal
            tabDef={tabDef}
            client={client}
            open={configOpen}
            onClose={() => setConfigOpen(false)}
            agentData={agentDataMap[activeTab] ?? null}
            loadingAgent={!!loadingAgentMap[activeTab]}
            prompt={promptMap[activeTab] ?? ''}
            greeting={greetingMap[activeTab] ?? ''}
            responsiveness={responsivenessMap[activeTab] ?? 0.8}
            maxDuration={maxDurationMap[activeTab] ?? null}
            reminderMs={reminderMap[activeTab] ?? 3000}
            saveStatus={saveMap[activeTab] ?? 'idle'}
            onFetch={() => fetchAgent(activeTab)}
            onPromptChange={(v: string) => setPromptMap(p => ({ ...p, [activeTab]: v }))}
            onGreetingChange={(v: string) => setGreetingMap(p => ({ ...p, [activeTab]: v }))}
            onResponsivenessChange={(v: number) => setResponsivenessMap(p => ({ ...p, [activeTab]: v }))}
            onMaxDurationChange={(v: number | null) => setMaxDurationMap(p => ({ ...p, [activeTab]: v }))}
            onReminderChange={(v: number) => setReminderMap(p => ({ ...p, [activeTab]: v }))}
            onSave={() => saveAgent(activeTab)}
            onApplyDefault={() => applyDefault(activeTab)}
          />
        </div>

      {/* Co-pilot panel */}
      {showCopilot && activeTab === 'receptionist' && (
        <div className="shrink-0" style={{ width: 288 }}>
          <CopilotPanel appointments={appointments} onClose={() => setShowCopilot(false)} />
        </div>
      )}
      </div>{/* end flex wrapper */}

        {/* Lịch sử cuộc gọi */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-700 text-sm">Lịch sử cuộc gọi ({totalCalls})</h3>
            <div className="flex items-center gap-3">
              {lastRefresh && <span className="text-xs text-gray-400">Cập nhật lúc {lastRefresh.getHours()}:{String(lastRefresh.getMinutes()).padStart(2,'0')}</span>}
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
                    <th className="px-4 py-2 text-center">Kết quả</th>
                    <th className="px-4 py-2 text-left">Tóm tắt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {calls.map(c => {
                    const isIn = c.direction === 'inbound'
                    return (
                      <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedCall(c)}>
                        <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{formatDateTime(c.created_at)}</td>
                        <td className="px-4 py-2.5 text-gray-700 text-xs">{c.contact_name || c.contact_phone || '--'}</td>
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isIn ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>{isIn ? 'Gọi đến' : 'Gọi đi'}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-600 text-xs">{formatDuration(c.duration_seconds)}</td>
                        <td className="px-4 py-2.5 text-center">{c.status === 'no_answer' ? <RetryBadge call={c} /> : <ScoreBadge score={calcScore(c)} />}</td>
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

// ── Dashboard header (needs useTheme — separate component) ────────────────────

function DashHeader({ lastRefresh }: { lastRefresh: Date | null }) {
  const t = useTheme()
  const now = new Date()
  const dateStr = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`
  return (
    <div style={{ marginBottom: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: t.text1, letterSpacing: '-0.02em', margin: 0 }}>
        Trung tâm cuộc gọi
      </h1>
      <p style={{ fontSize: 13, color: t.text3, marginTop: 4 }}>
        {dateStr} · Tự động cập nhật mỗi 30 giây
        {lastRefresh && ` · Lần cuối ${String(lastRefresh.getHours()).padStart(2,'0')}:${String(lastRefresh.getMinutes()).padStart(2,'0')}`}
      </p>
    </div>
  )
}
