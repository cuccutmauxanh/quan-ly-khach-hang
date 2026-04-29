'use client'

import { useEffect, useState } from 'react'
import { supabase, type Client, type Contact } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/ui/app-shell'
import { PageSkeleton } from '@/components/skeleton'
import { useToast } from '@/components/toast'
import { MessageSquare, Send, Users, CheckCircle, Clock, AlertCircle, TrendingUp } from 'lucide-react'

type Template = { id: string; label: string; content: string }
const TEMPLATES: Template[] = [
  { id: 'confirm', label: 'Xác nhận lịch hẹn', content: 'Xin chào {name}! Nha khoa Mila xác nhận lịch hẹn của bạn vào {datetime}. Nếu cần thay đổi, vui lòng gọi 028-8387-6780. Trân trọng!' },
  { id: 'remind',  label: 'Nhắc lịch tái khám',  content: 'Chào {name}! Đã 6 tháng kể từ lần khám cuối. Nha khoa Mila nhắc bạn kiểm tra răng định kỳ để đảm bảo sức khỏe. Đặt lịch: 028-8387-6780' },
  { id: 'thanks',  label: 'Cảm ơn sau điều trị',  content: 'Cảm ơn {name} đã tin tưởng Nha khoa Mila! Nếu có bất kỳ không thoải mái nào, xin liên hệ ngay 028-8387-6780. Chúc bạn sức khỏe!' },
  { id: 'promo',   label: 'Ưu đãi đặc biệt',      content: 'Chào {name}! Nha khoa Mila có chương trình KHÁM MIỄN PHÍ + Tư vấn niềng răng trong tháng này. Đặt lịch ngay: 028-8387-6780' },
  { id: 'custom',  label: 'Tùy chỉnh',             content: '' },
]

type Filter = 'all' | 'booked' | 'high_interest' | 'uncalled' | 'no_answer'
const FILTERS: { key: Filter; label: string; desc: string }[] = [
  { key: 'all',           label: 'Tất cả',        desc: 'Toàn bộ danh sách' },
  { key: 'booked',        label: 'Đã đặt lịch',   desc: 'Nhắc lịch khám' },
  { key: 'high_interest', label: 'Quan tâm cao',  desc: 'Lead nóng' },
  { key: 'uncalled',      label: 'Chưa gọi',      desc: 'Tiếp cận lần đầu' },
  { key: 'no_answer',     label: 'Không nghe',     desc: 'Chưa liên hệ được' },
]

const BATCH_SIZE = 8

type SendResult = { phone: string; name: string; status: 'sent' | 'error'; message?: string }

export default function SmsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [client, setClient] = useState<Client | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [noAnswerIds, setNoAnswerIds] = useState<Set<string>>(new Set())
  const [bookedIds, setBookedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('booked')
  const [selectedTemplate, setSelectedTemplate] = useState<Template>(TEMPLATES[0])
  const [customMsg, setCustomMsg] = useState('')
  const [sending, setSending] = useState(false)
  const [sendProgress, setSendProgress] = useState(0)
  const [results, setResults] = useState<SendResult[]>([])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: cu } = await supabase.from('client_users').select('client_id').eq('user_id', user.id).single()
      if (!cu) { setLoading(false); return }
      const { data: c } = await supabase.from('clients').select('*').eq('id', cu.client_id).single()
      setClient(c)
      const [{ data: ctcs }, { data: appts }, { data: calls }] = await Promise.all([
        supabase.from('contacts').select('*').eq('tenant_id', cu.client_id).order('created_at', { ascending: false }),
        supabase.from('appointments').select('contact_id').eq('tenant_id', cu.client_id).neq('status', 'cancelled'),
        supabase.from('calls').select('contact_phone, status').eq('tenant_id', cu.client_id).eq('status', 'no_answer'),
      ])
      setContacts(ctcs ?? [])
      setBookedIds(new Set((appts ?? []).map(a => a.contact_id).filter(Boolean) as string[]))
      setNoAnswerIds(new Set((calls ?? []).map(c => c.contact_phone).filter(Boolean) as string[]))
      setLoading(false)
    }
    init()
  }, [router])

  const filtered = contacts.filter(c => {
    if (filter === 'booked')        return bookedIds.has(c.id)
    if (filter === 'high_interest') return c.interest_level === 'high'
    if (filter === 'uncalled')      return (c.call_count ?? 0) === 0
    if (filter === 'no_answer')     return noAnswerIds.has(c.phone)
    return true
  })

  const message = selectedTemplate.id === 'custom' ? customMsg : selectedTemplate.content

  function preview(contact: Contact) {
    return message.replace('{name}', contact.full_name?.split(' ').pop() || 'bạn')
      .replace('{datetime}', 'thời gian đã đặt')
  }

  async function sendOne(contact: Contact): Promise<SendResult> {
    const msg   = preview(contact)
    const phone = contact.phone.startsWith('+84') ? contact.phone : `+84${contact.phone.replace(/^0/, '')}`
    try {
      const r = await fetch('https://letanai.tino.page/webhook/saas-send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, message: msg, tenant_id: client?.id, contact_id: contact.id }),
      })
      return { phone: contact.phone, name: contact.full_name || contact.phone, status: r.ok ? 'sent' : 'error' }
    } catch {
      return { phone: contact.phone, name: contact.full_name || contact.phone, status: 'error', message: 'Lỗi kết nối' }
    }
  }

  async function sendAll() {
    if (!message || filtered.length === 0) return
    setSending(true)
    setSendProgress(0)
    setResults([])

    const allResults: SendResult[] = []
    for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
      const batch = filtered.slice(i, i + BATCH_SIZE)
      const batchResults = await Promise.all(batch.map(sendOne))
      allResults.push(...batchResults)
      setResults([...allResults])
      setSendProgress(Math.round((allResults.length / filtered.length) * 100))
    }

    setSending(false)
    const ok = allResults.filter(r => r.status === 'sent').length
    toast(`Đã gửi ${ok}/${allResults.length} tin nhắn`, ok === allResults.length ? 'success' : 'error')
  }

  if (loading) return <PageSkeleton />

  const sentCount  = results.filter(r => r.status === 'sent').length
  const errCount   = results.filter(r => r.status === 'error').length

  return (
    <AppShell clientName={client?.name}>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-800">SMS & Zalo</h1>
        <p className="text-sm text-gray-400 mt-0.5">Gửi tin nhắn chăm sóc hàng loạt theo nhóm khách</p>
      </div>

      <div className="grid grid-cols-5 gap-5" style={{ alignItems: 'start' }}>
        {/* Config */}
        <div className="col-span-2 space-y-4">
          {/* Chọn mẫu tin */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <label className="text-xs font-semibold text-gray-500 block mb-3">Mẫu tin nhắn</label>
            <div className="space-y-1.5">
              {TEMPLATES.map(t => (
                <button key={t.id} onClick={() => setSelectedTemplate(t)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors border ${
                    selectedTemplate.id === t.id ? 'border-indigo-300 bg-indigo-50 text-indigo-700 font-medium' : 'border-gray-100 hover:bg-gray-50 text-gray-700'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Nội dung */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-500">Nội dung</label>
              <span className="text-xs text-gray-400">{message.length} ký tự</span>
            </div>
            <textarea
              value={selectedTemplate.id === 'custom' ? customMsg : selectedTemplate.content}
              onChange={e => { if (selectedTemplate.id === 'custom') setCustomMsg(e.target.value) }}
              readOnly={selectedTemplate.id !== 'custom'}
              rows={5}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
              placeholder="Nhập nội dung tin nhắn..."
            />
            <p className="text-xs text-gray-400 mt-1">Dùng <code className="bg-gray-100 px-1 rounded">{'{name}'}</code> để chèn tên khách</p>
          </div>

          {/* Filter nhóm */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <label className="text-xs font-semibold text-gray-500 block mb-3">Nhóm khách nhận</label>
            <div className="space-y-1.5">
              {FILTERS.map(f => {
                const count = contacts.filter(c => {
                  if (f.key === 'booked')        return bookedIds.has(c.id)
                  if (f.key === 'high_interest') return c.interest_level === 'high'
                  if (f.key === 'uncalled')      return (c.call_count ?? 0) === 0
                  if (f.key === 'no_answer')     return noAnswerIds.has(c.phone)
                  return true
                }).length
                return (
                  <button key={f.key} onClick={() => setFilter(f.key)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors border ${
                      filter === f.key ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-gray-100 hover:bg-gray-50 text-gray-600'
                    }`}>
                    <span>{f.label}</span>
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${filter === f.key ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500'}`}>{count}</span>
                  </button>
                )
              })}
            </div>
            <div className="mt-3 flex items-center gap-2 pt-3 border-t border-gray-100">
              <Users className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs font-semibold text-gray-700">{filtered.length} người nhận</span>
              {filtered.length > 0 && (
                <span className="text-xs text-gray-400 ml-auto">~{Math.ceil(filtered.length / BATCH_SIZE)} batches</span>
              )}
            </div>
          </div>

          {/* Send button */}
          <div className="space-y-2">
            <button onClick={sendAll} disabled={sending || !message || filtered.length === 0}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm">
              {sending
                ? <><Clock className="w-4 h-4 animate-spin" /> Đang gửi {sendProgress}%</>
                : <><Send className="w-4 h-4" /> Gửi {filtered.length} tin nhắn</>}
            </button>
            {sending && (
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                  style={{ width: `${sendProgress}%` }} />
              </div>
            )}
          </div>
        </div>

        {/* Preview & Results */}
        <div className="col-span-3 space-y-4">
          {/* Preview */}
          {filtered.length > 0 && message && (
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 mb-3">Xem trước (mẫu với khách đầu tiên)</p>
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center shrink-0">
                    <MessageSquare className="w-4 h-4 text-white" />
                  </div>
                  <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm max-w-xs">
                    <p className="text-sm text-gray-700 leading-relaxed">{preview(filtered[0])}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">Kết quả gửi</p>
                <div className="flex gap-3 text-xs">
                  <span className="text-green-600 font-semibold">{sentCount} thành công</span>
                  {errCount > 0 && <span className="text-red-500 font-semibold">{errCount} lỗi</span>}
                </div>
              </div>
              <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
                {results.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-2.5">
                    {r.status === 'sent'
                      ? <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                      : <span className="w-4 h-4 flex items-center justify-center text-red-400 text-xs shrink-0">✗</span>}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 truncate">{r.name}</p>
                      <p className="text-xs text-gray-400">{r.phone}</p>
                    </div>
                    {r.status === 'sent' ? <span className="text-xs text-green-600">Đã gửi</span>
                      : <span className="text-xs text-red-400">Lỗi</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {results.length === 0 && filtered.length === 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
              <MessageSquare className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400">Chọn nhóm khách để bắt đầu gửi tin nhắn</p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
