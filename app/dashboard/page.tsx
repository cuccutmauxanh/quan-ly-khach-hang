'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase, type Client, type Call, type Contact } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import {
  Phone, PhoneIncoming, PhoneOutgoing, CalendarCheck,
  Upload, RefreshCw, X, Heart, Zap, Search,
  SlidersHorizontal, ChevronDown, ChevronUp, Check, Save, Sparkles, MessageSquare,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import Nav from '@/components/nav'
import { PageSkeleton } from '@/components/skeleton'
import { useToast } from '@/components/toast'

// ─── Agent tab definitions ───────────────────────────────────────────────────

type AgentTab = 'receptionist' | 'cold' | 'cskh' | 'warm'
type SaveStatus = 'idle' | 'saving' | 'ok' | 'error'
type AgentData = { agent_name?: string; begin_message?: string | null; general_prompt?: string | null; llm_id?: string | null }

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
        </div>
      </div>
    </div>
  )
}

// ─── Agent Config Panel (inline, collapsible) ─────────────────────────────────

function AgentConfigPanel({
  tabDef, client, open, onToggle,
  agentData, loadingAgent, prompt, greeting, saveStatus,
  onFetch, onPromptChange, onGreetingChange, onSave, onApplyDefault,
}: {
  tabDef: typeof TABS[0]; client: Client | null; open: boolean; onToggle: () => void
  agentData: AgentData | null; loadingAgent: boolean
  prompt: string; greeting: string; saveStatus: SaveStatus
  onFetch: () => void; onPromptChange: (v: string) => void; onGreetingChange: (v: string) => void
  onSave: () => void; onApplyDefault: () => void
}) {
  const agentId = client?.[tabDef.agentField] as string | null

  // Fetch data when first opened
  useEffect(() => {
    if (open && !agentData && !loadingAgent && agentId) onFetch()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const promptPreview = prompt.split('\n')[0]?.slice(0, 70)

  return (
    <div className={`mb-4 rounded-xl border overflow-hidden transition-all ${open ? `${tabDef.border} shadow-sm` : 'border-gray-100'}`}>
      {/* Toggle bar — always visible */}
      <button
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors ${
          open ? `${tabDef.tagBg}` : 'bg-gray-50 hover:bg-gray-100'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <SlidersHorizontal className={`w-3.5 h-3.5 shrink-0 ${open ? tabDef.tagText : 'text-gray-400'}`} />
          <span className={`text-xs font-semibold ${open ? tabDef.tagText : 'text-gray-500'}`}>Kịch bản AI</span>
          {!open && promptPreview && (
            <span className="text-xs text-gray-400 truncate hidden sm:block">— {promptPreview}...</span>
          )}
          {!agentId && <span className="text-xs text-amber-500 ml-1">⚠ Chưa cài đặt</span>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {loadingAgent && <RefreshCw className="w-3 h-3 text-gray-400 animate-spin" />}
          <span className={`text-xs font-medium ${open ? tabDef.tagText : 'text-gray-400'}`}>
            {open ? 'Đóng' : 'Chỉnh sửa'}
          </span>
          {open ? <ChevronUp className={`w-3.5 h-3.5 ${tabDef.tagText}`} /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
        </div>
      </button>

      {/* Expandable editor */}
      {open && (
        <div className="bg-white p-4 space-y-4 border-t border-gray-100">
          {/* Prompt */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-xs font-semibold text-gray-600">Kịch bản giao tiếp</span>
                <span className="text-xs text-gray-300">{prompt.length} ký tự</span>
              </div>
              <button onClick={onApplyDefault}
                className="text-xs text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2 py-0.5 rounded-lg transition-colors font-medium">
                Dùng mẫu mặc định
              </button>
            </div>
            <textarea
              value={prompt}
              onChange={e => onPromptChange(e.target.value)}
              rows={9}
              disabled={!agentId}
              placeholder="Mô tả vai trò, nhiệm vụ và cách AI cần giao tiếp với khách hàng..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-xs text-gray-700 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none font-mono leading-relaxed disabled:opacity-50 disabled:bg-gray-50"
            />
          </div>

          {/* Greeting */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <MessageSquare className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs font-semibold text-gray-600">Câu mở đầu cuộc gọi</span>
            </div>
            <input
              value={greeting}
              onChange={e => onGreetingChange(e.target.value)}
              disabled={!agentId}
              placeholder="Để trống → AI tự chọn câu mở đầu. VD: Xin chào! Đây là Nha Khoa Mila..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-700 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50"
            />
          </div>

          {/* Save */}
          <div className="flex justify-end">
            <button
              onClick={onSave}
              disabled={!agentId || saveStatus === 'saving' || saveStatus === 'ok'}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-50 ${
                saveStatus === 'ok'     ? 'bg-green-600 text-white' :
                saveStatus === 'error'  ? 'bg-red-600 text-white' :
                saveStatus === 'saving' ? 'bg-indigo-400 text-white cursor-not-allowed' :
                'bg-indigo-600 hover:bg-indigo-700 text-white'
              }`}
            >
              {saveStatus === 'saving' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> :
               saveStatus === 'ok'     ? <Check className="w-3.5 h-3.5" /> :
               <Save className="w-3.5 h-3.5" />}
              {saveStatus === 'saving' ? 'Đang lưu...' : saveStatus === 'ok' ? 'Đã lưu!' : saveStatus === 'error' ? 'Lỗi, thử lại' : 'Lưu kịch bản'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tab: Lễ tân ─────────────────────────────────────────────────────────────

function ReceptionistTab({ calls, client }: { calls: Call[]; client: Client | null }) {
  const inbound = calls.filter(c => c.direction === 'inbound')
  const todayIn = inbound.filter(c => new Date(c.created_at).toDateString() === new Date().toDateString())
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Số điện thoại', value: client?.retell_phone_number ?? '--', color: 'text-emerald-800', bg: 'bg-emerald-50' },
          { label: 'Hôm nay nhận', value: `${todayIn.length} cuộc`, color: 'text-emerald-800', bg: 'bg-emerald-50' },
          { label: 'Đặt lịch hôm nay', value: `${todayIn.filter(c => c.appointment_booked).length} lịch`, color: 'text-emerald-800', bg: 'bg-emerald-50' },
          { label: 'Tổng gọi đến', value: `${inbound.length} cuộc`, color: 'text-emerald-800', bg: 'bg-emerald-50' },
        ].map(k => (
          <div key={k.label} className={`${k.bg} rounded-xl p-3`}>
            <p className="text-xs text-emerald-600 mb-0.5">{k.label}</p>
            <p className={`text-sm font-semibold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-500">Cuộc gọi đến gần đây</p>
        </div>
        {inbound.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Chưa có cuộc gọi đến nào.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {inbound.slice(0, 8).map(c => (
              <div key={c.id} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50">
                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                  <PhoneIncoming className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">{c.contact_name || c.contact_phone || '--'}</p>
                  <p className="text-xs text-gray-400">{formatDateTime(c.created_at)} · {formatDuration(c.duration_seconds)}</p>
                </div>
                {c.status === 'no_answer' ? <RetryBadge call={c} /> :
                 c.appointment_booked ? <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">✓ Đặt lịch</span> :
                 <ScoreBadge score={calcScore(c)} />}
              </div>
            ))}
          </div>
        )}
      </div>
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [client, setClient] = useState<Client | null>(null)
  const [calls, setCalls] = useState<Call[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<AgentTab>('receptionist')
  const [selectedCall, setSelectedCall] = useState<Call | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const clientIdRef = useRef<string | null>(null)

  // ── Agent config state ──────────────────────────────────────────────────────
  const [configOpen, setConfigOpen] = useState(false)
  const [agentDataMap, setAgentDataMap] = useState<Partial<Record<AgentTab, AgentData>>>({})
  const [loadingAgentMap, setLoadingAgentMap] = useState<Partial<Record<AgentTab, boolean>>>({})
  const [promptMap, setPromptMap] = useState<Partial<Record<AgentTab, string>>>({})
  const [greetingMap, setGreetingMap] = useState<Partial<Record<AgentTab, string>>>({})
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
        body: JSON.stringify({ agentId, begin_message: greetingMap[key] || null, general_prompt: promptMap[key] || null, llm_id: agentDataMap[key]?.llm_id ?? null }),
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

  if (loading) return <PageSkeleton />

  const totalCalls = calls.length
  const inbound  = calls.filter(c => c.direction === 'inbound').length
  const outbound = calls.filter(c => c.direction === 'outbound').length
  const booked   = calls.filter(c => c.appointment_booked).length
  const today    = calls.filter(c => new Date(c.created_at).toDateString() === new Date().toDateString()).length
  const tabDef   = TABS.find(t => t.key === activeTab)!

  return (
    <div className="min-h-screen bg-gray-50">
      {selectedCall && <CallDetailModal call={selectedCall} onClose={() => setSelectedCall(null)} />}
      <Nav clientName={client?.name} />

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">

        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Hôm nay', value: today,   icon: <Phone className="w-5 h-5 text-indigo-600" />,  bg: 'bg-indigo-50' },
            { label: 'Gọi đến', value: inbound,  icon: <PhoneIncoming className="w-5 h-5 text-emerald-600" />, bg: 'bg-emerald-50' },
            { label: 'Gọi đi',  value: outbound, icon: <PhoneOutgoing className="w-5 h-5 text-blue-600" />,    bg: 'bg-blue-50' },
            { label: 'Đặt lịch',value: booked,   icon: <CalendarCheck className="w-5 h-5 text-violet-600" />,  bg: 'bg-violet-50' },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-lg ${k.bg}`}>{k.icon}</div>
              <div><p className="text-xs text-gray-500">{k.label}</p><p className="text-2xl font-bold text-gray-800">{k.value}</p></div>
            </div>
          ))}
        </div>

        {/* Main call panel */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">

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
            {/* Inline agent config panel — inside every tab, at the top */}
            <AgentConfigPanel
              tabDef={tabDef}
              client={client}
              open={configOpen}
              onToggle={() => setConfigOpen(o => !o)}
              agentData={agentDataMap[activeTab] ?? null}
              loadingAgent={!!loadingAgentMap[activeTab]}
              prompt={promptMap[activeTab] ?? ''}
              greeting={greetingMap[activeTab] ?? ''}
              saveStatus={saveMap[activeTab] ?? 'idle'}
              onFetch={() => fetchAgent(activeTab)}
              onPromptChange={v => setPromptMap(p => ({ ...p, [activeTab]: v }))}
              onGreetingChange={v => setGreetingMap(p => ({ ...p, [activeTab]: v }))}
              onSave={() => saveAgent(activeTab)}
              onApplyDefault={() => applyDefault(activeTab)}
            />

            {activeTab === 'receptionist' && <ReceptionistTab calls={calls} client={client} />}
            {activeTab === 'cold'         && <ColdCallTab client={client} />}
            {activeTab === 'cskh'         && <CSKHTab client={client} contacts={contacts} />}
            {activeTab === 'warm'         && <WarmLeadsTab client={client} contacts={contacts} />}
          </div>
        </div>

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

      </main>
    </div>
  )
}
