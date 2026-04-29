'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase, type Client, type Contact, type Appointment, type CskhEvent } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import {
  UserPlus, Upload, X, Phone, User, ChevronRight,
  CalendarCheck, Clock, CheckCircle2, XCircle, RefreshCw,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import AppShell from '@/components/ui/app-shell'
import { PageSkeleton } from '@/components/skeleton'
import { useToast } from '@/components/toast'

// ── Types ──────────────────────────────────────────────────────────────────────

type MainTab = 'contacts' | 'pipeline' | 'appointments' | 'cskh'
type ContactFilter = 'all' | 'uncalled' | 'called' | 'booked'
type AppointmentFilter = 'all' | 'today' | 'upcoming' | 'past'
type CskhStatus = 'all' | 'pending' | 'sent' | 'failed'
type PipelineStage = { key: string; label: string; sublabel: string; color: string; bg: string; border: string; dot: string }

const MAIN_TABS: { key: MainTab; label: string; sublabel: string; icon: typeof Phone }[] = [
  { key: 'contacts',     label: 'Danh Bạ',    sublabel: 'Quản lý liên hệ',        icon: User },
  { key: 'pipeline',     label: 'Pipeline',    sublabel: 'Hành trình khách hàng',  icon: ChevronRight },
  { key: 'appointments', label: 'Lịch Hẹn',   sublabel: 'Quản lý lịch khám',      icon: CalendarCheck },
  { key: 'cskh',         label: 'Chăm Sóc',   sublabel: 'Hỏi thăm sau điều trị',  icon: Phone },
]

const PIPELINE_STAGES: PipelineStage[] = [
  { key: 'new',       label: 'Mới',         sublabel: 'Chưa liên hệ',   color: 'text-gray-600',  bg: 'bg-gray-50',   border: 'border-gray-200', dot: 'bg-gray-400' },
  { key: 'contacted', label: 'Đã liên hệ',  sublabel: 'Chưa quan tâm',  color: 'text-blue-600',  bg: 'bg-blue-50',   border: 'border-blue-200', dot: 'bg-blue-400' },
  { key: 'interest',  label: 'Quan tâm',    sublabel: 'Mức độ cao',     color: 'text-amber-600', bg: 'bg-amber-50',  border: 'border-amber-200',dot: 'bg-amber-400' },
  { key: 'booked',    label: 'Đặt lịch',    sublabel: 'Đã có hẹn khám', color: 'text-green-600', bg: 'bg-green-50',  border: 'border-green-200',dot: 'bg-green-500' },
]

const INTEREST_LABELS: Record<string, { label: string; color: string }> = {
  high:   { label: 'Quan tâm cao', color: 'bg-green-100 text-green-700' },
  medium: { label: 'Trung bình',   color: 'bg-yellow-100 text-yellow-700' },
  low:    { label: 'Thấp',         color: 'bg-gray-100 text-gray-500' },
}

const APPT_STATUS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  confirmed: { label: 'Đã xác nhận', color: 'bg-green-100 text-green-700',  icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  pending:   { label: 'Chờ xác nhận',color: 'bg-yellow-100 text-yellow-700',icon: <Clock className="w-3.5 h-3.5" /> },
  cancelled: { label: 'Đã hủy',      color: 'bg-red-100 text-red-700',      icon: <XCircle className="w-3.5 h-3.5" /> },
  completed: { label: 'Đã khám',     color: 'bg-blue-100 text-blue-700',    icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
}

const TRIGGER_LABELS: Record<string, string> = {
  day1_followup:  'Ngày 1 — Hỏi thăm',
  day7_followup:  'Tuần 1 — Kiểm tra',
  day30_reminder: 'Tháng 1 — Tái khám',
  day180_checkup: '6 tháng — Định kỳ',
}

const CSKH_STATUS_MAP: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'Chờ gọi',  cls: 'bg-yellow-100 text-yellow-700' },
  sent:      { label: 'Đã gọi',   cls: 'bg-green-100 text-green-700' },
  failed:    { label: 'Thất bại', cls: 'bg-red-100 text-red-700' },
  cancelled: { label: 'Đã huỷ',   cls: 'bg-gray-100 text-gray-500' },
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(s: string | null) {
  if (!s) return '--'
  const d = new Date(s)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

function fmtFullDate(s: string | null) {
  if (!s) return '--'
  const d = new Date(s)
  const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
  return `${days[d.getDay()]}, ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} lúc ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

function fmtGroupDate(s: string | null) {
  if (!s) return 'Chưa xác định'
  const d = new Date(s)
  const today = new Date()
  const tomorrow = new Date(today.getTime() + 86400000)
  if (d.toDateString() === today.toDateString()) return 'Hôm nay'
  if (d.toDateString() === tomorrow.toDateString()) return 'Ngày mai'
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

function timeAgo(s: string | null) {
  if (!s) return null
  const d = Math.floor((Date.now() - new Date(s).getTime()) / 86400000)
  if (d === 0) return 'Hôm nay'
  if (d === 1) return 'Hôm qua'
  return `${d} ngày trước`
}

function getApptTimeStatus(s: string | null): 'today' | 'upcoming' | 'past' {
  if (!s) return 'upcoming'
  const d = new Date(s)
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(todayStart.getTime() + 86400000)
  if (d >= todayStart && d < todayEnd) return 'today'
  if (d > todayEnd) return 'upcoming'
  return 'past'
}

function getPipelineStage(c: Contact, bookedIds: Set<string>): string {
  if (bookedIds.has(c.id)) return 'booked'
  if (c.interest_level === 'high') return 'interest'
  if ((c.call_count ?? 0) > 0) return 'contacted'
  return 'new'
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TabBar({ active, onChange, counts }: { active: MainTab; onChange: (t: MainTab) => void; counts: Partial<Record<MainTab, number>> }) {
  return (
    <div className="flex items-center gap-0.5 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
      {MAIN_TABS.map(t => {
        const isActive = active === t.key
        const count = counts[t.key]
        return (
          <button key={t.key} onClick={() => onChange(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              isActive ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
            {count !== undefined && count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${isActive ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-200 text-gray-500'}`}>
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── Contacts Tab ───────────────────────────────────────────────────────────────

function ContactsTab({ client, clientId }: { client: Client | null; clientId: string }) {
  const { toast } = useToast()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [bookedIds, setBookedIds] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<ContactFilter>('all')
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ full_name: '', phone: '', email: '', notes: '', interest_level: '' })
  const [saving, setSaving] = useState(false)
  const [callingId, setCallingId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchContacts = useCallback(async () => {
    const [{ data: c }, { data: appts }] = await Promise.all([
      supabase.from('contacts').select('*').eq('tenant_id', clientId).order('created_at', { ascending: false }),
      supabase.from('appointments').select('contact_id').eq('tenant_id', clientId),
    ])
    setContacts(c ?? [])
    setBookedIds(new Set((appts ?? []).map((a: { contact_id: string | null }) => a.contact_id).filter(Boolean) as string[]))
  }, [clientId])

  useEffect(() => { fetchContacts() }, [fetchContacts])

  async function handleSave() {
    if (!addForm.phone) return
    setSaving(true)
    await supabase.from('contacts').insert({
      tenant_id: clientId,
      full_name: addForm.full_name || null,
      phone: addForm.phone.replace(/\D/g, ''),
      email: addForm.email || null,
      notes: addForm.notes || null,
      interest_level: addForm.interest_level || null,
    })
    await fetchContacts()
    setAddForm({ full_name: '', phone: '', email: '', notes: '', interest_level: '' })
    setShowAdd(false)
    setSaving(false)
  }

  async function handleCall(contact: Contact) {
    if (!client?.retell_agent_id || !client?.retell_phone_number) {
      toast('Chưa cấu hình Retell Agent', 'error'); return
    }
    setCallingId(contact.id)
    const res = await fetch('/api/outbound', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phones: [{ name: contact.full_name ?? '', phone: contact.phone }], agentId: client.retell_agent_id, fromNumber: client.retell_phone_number }),
    })
    const data = await res.json()
    const ok = data.results?.[0]?.success
    if (ok) {
      await supabase.from('contacts').update({ last_called_at: new Date().toISOString(), call_count: (contact.call_count ?? 0) + 1 }).eq('id', contact.id)
      await fetchContacts()
      toast(`Đã kết nối đến ${contact.full_name || contact.phone}`, 'success')
    } else {
      toast('Lỗi: ' + (data.results?.[0]?.error ?? 'Không thể gọi'), 'error')
    }
    setCallingId(null)
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = async (evt) => {
      const wb = XLSX.read(evt.target?.result, { type: 'array' })
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets[wb.SheetNames[0]])
      const records = rows.map(r => ({
        tenant_id: clientId,
        full_name: String(r['Tên'] ?? r['ten'] ?? r['name'] ?? '') || null,
        phone: String(r['Số điện thoại'] ?? r['sdt'] ?? r['phone'] ?? '').replace(/\D/g, ''),
        email: String(r['Email'] ?? r['email'] ?? '') || null,
        notes: String(r['Ghi chú'] ?? r['notes'] ?? '') || null,
      })).filter(r => r.phone.length >= 9)
      if (records.length > 0) {
        await supabase.from('contacts').upsert(records, { onConflict: 'phone,tenant_id', ignoreDuplicates: true })
        await fetchContacts()
        toast(`Đã import ${records.length} liên hệ`, 'success')
      } else { toast('Không tìm thấy dữ liệu hợp lệ', 'error') }
    }
    reader.readAsArrayBuffer(file); e.target.value = ''
  }

  const filtered = contacts.filter(c => {
    const matchSearch = !search || (c.full_name ?? '').toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
    if (!matchSearch) return false
    if (filter === 'uncalled') return (c.call_count ?? 0) === 0
    if (filter === 'called')   return (c.call_count ?? 0) > 0
    if (filter === 'booked')   return bookedIds.has(c.id)
    return true
  })

  const filterTabs: { key: ContactFilter; label: string; count: number }[] = [
    { key: 'all',      label: 'Tất cả',   count: contacts.length },
    { key: 'uncalled', label: 'Chưa gọi', count: contacts.filter(c => (c.call_count ?? 0) === 0).length },
    { key: 'called',   label: 'Đã gọi',   count: contacts.filter(c => (c.call_count ?? 0) > 0).length },
    { key: 'booked',   label: 'Đặt lịch', count: contacts.filter(c => bookedIds.has(c.id)).length },
  ]

  return (
    <>
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">Thêm liên hệ</h3>
              <button onClick={() => setShowAdd(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-400" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {[
                { label: 'Họ tên', key: 'full_name', placeholder: 'Nguyễn Văn A', type: 'text' },
                { label: 'Số điện thoại *', key: 'phone', placeholder: '0901234567', type: 'text' },
                { label: 'Email', key: 'email', placeholder: 'email@example.com', type: 'text' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">{f.label}</label>
                  <input value={addForm[f.key as keyof typeof addForm]}
                    onChange={e => setAddForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
              ))}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Mức độ quan tâm</label>
                <select value={addForm.interest_level} onChange={e => setAddForm(f => ({ ...f, interest_level: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                  <option value="">-- Chọn --</option>
                  <option value="high">Quan tâm cao</option>
                  <option value="medium">Trung bình</option>
                  <option value="low">Thấp</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Ghi chú</label>
                <textarea value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" rows={2} />
              </div>
              <button onClick={handleSave} disabled={!addForm.phone || saving}
                className="w-full py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                {saving ? 'Đang lưu...' : 'Lưu liên hệ'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-800">Danh Bạ <span className="text-sm font-normal text-gray-400">({contacts.length})</span></h2>
        <div className="flex items-center gap-2">
          <button onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            <Upload className="w-4 h-4" /> Import Excel
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
            <UserPlus className="w-4 h-4" /> Thêm liên hệ
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 pt-4 pb-0 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-1">
            {filterTabs.map(t => (
              <button key={t.key} onClick={() => setFilter(t.key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === t.key ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}>
                {t.label}
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${filter === t.key ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500'}`}>{t.count}</span>
              </button>
            ))}
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm tên, số điện thoại..."
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 w-56" />
        </div>
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-sm">
            {contacts.length === 0 ? 'Chưa có liên hệ. Thêm mới hoặc import từ Excel.' : 'Không tìm thấy liên hệ phù hợp.'}
          </div>
        ) : (
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2.5 text-left">Họ tên</th>
                  <th className="px-4 py-2.5 text-left">Số điện thoại</th>
                  <th className="px-4 py-2.5 text-left">Quan tâm</th>
                  <th className="px-4 py-2.5 text-center">Số lần gọi</th>
                  <th className="px-4 py-2.5 text-left">Gọi lần cuối</th>
                  <th className="px-4 py-2.5 text-center">Lịch hẹn</th>
                  <th className="px-4 py-2.5 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(c => {
                  const interest = c.interest_level ? INTEREST_LABELS[c.interest_level] : null
                  return (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{c.full_name || '--'}</td>
                      <td className="px-4 py-3 text-gray-600 font-mono text-xs">{c.phone}</td>
                      <td className="px-4 py-3">
                        {interest ? <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${interest.color}`}>{interest.label}</span> : '--'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-semibold ${(c.call_count ?? 0) > 0 ? 'text-indigo-600' : 'text-gray-400'}`}>{c.call_count ?? 0}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(c.last_called_at)}</td>
                      <td className="px-4 py-3 text-center text-xs">
                        {bookedIds.has(c.id) ? <span className="text-green-600 font-medium">✅ Đặt lịch</span> : <span className="text-gray-300">--</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => handleCall(c)} disabled={callingId === c.id}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50">
                          <Phone className="w-3 h-3" /> {callingId === c.id ? '...' : 'Gọi'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

// ── Pipeline Tab ───────────────────────────────────────────────────────────────

type ContactWithStage = Contact & { stage: string }

function PipelineTab({ client, clientId }: { client: Client | null; clientId: string }) {
  const { toast } = useToast()
  const [contacts, setContacts] = useState<ContactWithStage[]>([])
  const [loading, setLoading] = useState(true)
  const [callingId, setCallingId] = useState<string | null>(null)
  const [movingId, setMovingId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [{ data: ctcs }, { data: appts }] = await Promise.all([
        supabase.from('contacts').select('*').eq('tenant_id', clientId).order('created_at', { ascending: false }),
        supabase.from('appointments').select('contact_id').eq('tenant_id', clientId).neq('status', 'cancelled'),
      ])
      const bookedIds = new Set((appts ?? []).map((a: { contact_id: string | null }) => a.contact_id).filter(Boolean) as string[])
      setContacts((ctcs ?? []).map(c => ({ ...c, stage: getPipelineStage(c, bookedIds) })))
      setLoading(false)
    }
    load()
  }, [clientId])

  async function moveStage(contactId: string, currentStage: string, direction: 'next' | 'prev') {
    const stageKeys = PIPELINE_STAGES.map(s => s.key)
    const idx = stageKeys.indexOf(currentStage)
    const newStage = direction === 'next' ? stageKeys[idx + 1] : stageKeys[idx - 1]
    if (!newStage) return
    setMovingId(contactId)
    const interestMap: Record<string, string | null> = { new: null, contacted: 'low', interest: 'high', booked: 'high' }
    await supabase.from('contacts').update({ interest_level: interestMap[newStage] }).eq('id', contactId)
    setContacts(prev => prev.map(c => c.id === contactId ? { ...c, stage: newStage } : c))
    setMovingId(null)
  }

  async function callContact(contact: ContactWithStage) {
    if (!client?.retell_phone_number || !client?.retell_agent_id) { toast('Chưa cấu hình agent', 'error'); return }
    setCallingId(contact.id)
    const res = await fetch('/api/outbound', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phones: [{ phone: contact.phone, name: contact.full_name }], agentId: client.agent_cold_id || client.retell_agent_id, fromNumber: client.retell_phone_number }),
    })
    const { results } = await res.json()
    toast(results?.[0]?.success ? `Đang gọi ${contact.full_name || contact.phone}` : 'Gọi thất bại', results?.[0]?.success ? 'success' : 'error')
    setCallingId(null)
  }

  const byStage = (key: string) => contacts.filter(c => c.stage === key)

  if (loading) return <div className="flex items-center justify-center py-16"><RefreshCw className="w-5 h-5 text-gray-300 animate-spin" /></div>

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-800">Pipeline <span className="text-sm font-normal text-gray-400">({contacts.length} khách)</span></h2>
      </div>
      <div className="grid grid-cols-4 gap-3 mb-6">
        {PIPELINE_STAGES.map(s => (
          <div key={s.key} className={`${s.bg} border ${s.border} rounded-xl p-3`}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2 h-2 rounded-full ${s.dot}`} />
              <span className={`text-xs font-semibold ${s.color}`}>{s.label}</span>
            </div>
            <p className="text-2xl font-bold text-gray-800">{byStage(s.key).length}</p>
            <p className="text-xs text-gray-400">{s.sublabel}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-4" style={{ alignItems: 'start' }}>
        {PIPELINE_STAGES.map(stage => {
          const stageContacts = byStage(stage.key)
          const stageIdx = PIPELINE_STAGES.findIndex(s => s.key === stage.key)
          return (
            <div key={stage.key}>
              <div className="flex items-center gap-2 px-1 mb-3">
                <span className={`w-2.5 h-2.5 rounded-full ${stage.dot}`} />
                <span className="text-sm font-semibold text-gray-700">{stage.label}</span>
                <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${stage.bg} ${stage.color}`}>{stageContacts.length}</span>
              </div>
              <div className="space-y-2">
                {stageContacts.length === 0 ? (
                  <div className={`border-2 border-dashed ${stage.border} rounded-xl p-6 text-center`}>
                    <p className="text-xs text-gray-400">Không có</p>
                  </div>
                ) : stageContacts.map(contact => {
                  const nextStage = PIPELINE_STAGES[stageIdx + 1]
                  const prevStage = PIPELINE_STAGES[stageIdx - 1]
                  return (
                    <div key={contact.id} className={`bg-white rounded-xl border ${stage.border} p-3 shadow-sm hover:shadow-md transition-shadow`}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-7 h-7 rounded-full ${stage.bg} flex items-center justify-center shrink-0`}>
                            <User className={`w-3.5 h-3.5 ${stage.color}`} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">{contact.full_name || 'Không tên'}</p>
                            <p className="text-xs text-gray-400">{contact.phone}</p>
                          </div>
                        </div>
                        <button onClick={() => callContact(contact)} disabled={callingId === contact.id || movingId === contact.id}
                          className="shrink-0 w-7 h-7 bg-indigo-50 hover:bg-indigo-100 rounded-lg flex items-center justify-center">
                          <Phone className="w-3.5 h-3.5 text-indigo-600" />
                        </button>
                      </div>
                      {contact.last_called_at && <p className="text-xs text-gray-400 mb-2">Gọi lần cuối: {timeAgo(contact.last_called_at)}</p>}
                      {contact.notes && <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-2 py-1 truncate mb-2">{contact.notes}</p>}
                      {stage.key !== 'booked' && (
                        <div className="flex gap-1 mt-1">
                          {prevStage && (
                            <button onClick={() => moveStage(contact.id, contact.stage, 'prev')} disabled={movingId === contact.id}
                              className="flex-1 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg py-1 border border-gray-100">
                              ← {prevStage.label}
                            </button>
                          )}
                          {nextStage && (
                            <button onClick={() => moveStage(contact.id, contact.stage, 'next')} disabled={movingId === contact.id}
                              className="flex-1 text-xs text-indigo-600 hover:bg-indigo-50 rounded-lg py-1 border border-indigo-100 font-medium">
                              {nextStage.label} →
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      {callingId && (
        <div className="fixed bottom-4 right-4 bg-indigo-600 text-white px-4 py-2 rounded-xl shadow-lg text-sm flex items-center gap-2">
          <Phone className="w-4 h-4 animate-pulse" /> Đang kết nối...
        </div>
      )}
    </>
  )
}

// ── Appointments Tab ───────────────────────────────────────────────────────────

function AppointmentsTab({ clientId }: { clientId: string }) {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<AppointmentFilter>('all')

  useEffect(() => {
    async function load() {
      const { data: appts } = await supabase
        .from('appointments').select('*, contacts(full_name, phone)')
        .eq('tenant_id', clientId).order('scheduled_at', { ascending: true })

      const { data: calls } = await supabase
        .from('calls').select('id, tenant_id, contact_id, appointment_datetime, appointment_notes, contact_name, contact_phone, created_at')
        .eq('tenant_id', clientId).eq('appointment_booked', true).not('appointment_datetime', 'is', null)

      const apptSet = new Set((appts ?? []).map((a: Appointment) => a.call_id).filter(Boolean))
      const callAppts: Appointment[] = (calls ?? [])
        .filter((call: { id: string }) => !apptSet.has(call.id))
        .map((call: { id: string; tenant_id: string; contact_id: string | null; appointment_datetime: string | null; appointment_notes: string | null; contact_name: string | null; contact_phone: string | null; created_at: string }) => ({
          id: `call-${call.id}`, tenant_id: call.tenant_id, contact_id: call.contact_id,
          call_id: call.id, scheduled_at: call.appointment_datetime, status: 'confirmed',
          appointment_notes: call.appointment_notes, created_at: call.created_at,
          contacts: { full_name: call.contact_name, phone: call.contact_phone ?? '' },
        }))

      setAppointments([...(appts ?? []), ...callAppts].sort((a, b) => {
        if (!a.scheduled_at) return 1; if (!b.scheduled_at) return -1
        return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
      }))
      setLoading(false)
    }
    load()
  }, [clientId])

  async function updateStatus(id: string, status: string) {
    if (id.startsWith('call-')) return
    await supabase.from('appointments').update({ status }).eq('id', id)
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status } : a))
  }

  const filtered = appointments.filter(a => filter === 'all' || getApptTimeStatus(a.scheduled_at) === filter)
  const groups = filtered.reduce<Record<string, Appointment[]>>((acc, a) => {
    const key = a.scheduled_at ? new Date(a.scheduled_at).toDateString() : 'none'
    if (!acc[key]) acc[key] = []
    acc[key].push(a)
    return acc
  }, {})

  const todayCount    = appointments.filter(a => getApptTimeStatus(a.scheduled_at) === 'today').length
  const upcomingCount = appointments.filter(a => getApptTimeStatus(a.scheduled_at) === 'upcoming').length
  const pastCount     = appointments.filter(a => getApptTimeStatus(a.scheduled_at) === 'past').length

  const tabs: { key: AppointmentFilter; label: string; count: number }[] = [
    { key: 'all',      label: 'Tất cả',  count: appointments.length },
    { key: 'today',    label: 'Hôm nay', count: todayCount },
    { key: 'upcoming', label: 'Sắp tới', count: upcomingCount },
    { key: 'past',     label: 'Đã qua',  count: pastCount },
  ]

  if (loading) return <div className="flex items-center justify-center py-16"><RefreshCw className="w-5 h-5 text-gray-300 animate-spin" /></div>

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-800">Lịch Hẹn <span className="text-sm font-normal text-gray-400">({appointments.length})</span></h2>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <CalendarCheck className="w-4 h-4 text-indigo-500" />
          <span>{todayCount} hôm nay · {upcomingCount} sắp tới</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: 'Hôm nay', value: todayCount, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'Sắp tới', value: upcomingCount, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Đã qua',  value: pastCount, color: 'text-gray-500', bg: 'bg-gray-100' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-xs text-gray-400 mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 pt-4 pb-0 flex items-center gap-1">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setFilter(t.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === t.key ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}>
              {t.label}
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${filter === t.key ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500'}`}>{t.count}</span>
            </button>
          ))}
        </div>
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-sm">
            {appointments.length === 0 ? 'Chưa có lịch hẹn. Lịch hẹn tự động xuất hiện sau cuộc gọi thành công.' : 'Không có lịch hẹn trong mục này.'}
          </div>
        ) : (
          <div className="px-4 py-4 space-y-5">
            {Object.entries(groups).map(([dateKey, items]) => {
              const timeStatus = getApptTimeStatus(items[0].scheduled_at)
              const dotColor = timeStatus === 'today' ? 'bg-indigo-500' : timeStatus === 'upcoming' ? 'bg-green-500' : 'bg-gray-300'
              return (
                <div key={dateKey}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-2 h-2 rounded-full ${dotColor}`} />
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{fmtGroupDate(items[0].scheduled_at)}</span>
                    <div className="flex-1 h-px bg-gray-100" />
                  </div>
                  <div className="space-y-2">
                    {items.map(a => {
                      const sc = APPT_STATUS[a.status ?? 'confirmed'] ?? APPT_STATUS.confirmed
                      return (
                        <div key={a.id} className="flex items-start gap-4 p-4 rounded-xl border border-gray-100 hover:border-gray-200 hover:bg-gray-50">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-gray-800 text-sm">{a.contacts?.full_name ?? 'Khách hàng'}</span>
                              <span className="text-gray-400 text-xs">{a.contacts?.phone}</span>
                            </div>
                            <p className="text-xs text-indigo-600 font-medium">{fmtFullDate(a.scheduled_at)}</p>
                            {a.appointment_notes && <p className="text-xs text-gray-500 mt-1">{a.appointment_notes}</p>}
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${sc.color}`}>{sc.icon}{sc.label}</span>
                            {!a.id.startsWith('call-') && a.status !== 'cancelled' && a.status !== 'completed' && (
                              <div className="flex gap-1">
                                <button onClick={() => updateStatus(a.id, 'completed')} className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100">Đã khám</button>
                                <button onClick={() => updateStatus(a.id, 'cancelled')} className="text-xs px-2 py-1 bg-red-50 text-red-500 rounded-lg hover:bg-red-100">Hủy</button>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

// ── CSKH Tab ───────────────────────────────────────────────────────────────────

function CskhTab({ clientId }: { clientId: string }) {
  const [events, setEvents] = useState<CskhEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<CskhStatus>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('cskh_care_events').select('*').eq('tenant_id', clientId).order('scheduled_at', { ascending: false }).limit(200)
      setEvents(data ?? [])
      setLoading(false)
    }
    load()
  }, [clientId])

  const filtered = events.filter(e => {
    if (statusFilter !== 'all' && e.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return (e.contact_name ?? '').toLowerCase().includes(q) || (e.contact_phone ?? '').includes(q)
    }
    return true
  })

  const pending  = events.filter(e => e.status === 'pending').length
  const sent     = events.filter(e => e.status === 'sent').length
  const failed   = events.filter(e => e.status === 'failed').length
  const upcoming = events.filter(e => e.status === 'pending' && new Date(e.scheduled_at) <= new Date(Date.now() + 24 * 3600000)).length

  if (loading) return <div className="flex items-center justify-center py-16"><RefreshCw className="w-5 h-5 text-gray-300 animate-spin" /></div>

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-800">Chăm Sóc Khách Hàng</h2>
        <p className="text-xs text-gray-400">AI gọi thăm hỏi — 1 ngày, 7 ngày, 1 tháng, 6 tháng</p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-4">
        {[
          { label: 'Tổng lịch gọi', value: events.length, color: '' },
          { label: 'Chờ gọi',       value: pending,        color: 'text-yellow-600' },
          { label: 'Đã gọi',        value: sent,           color: 'text-green-600' },
          { label: 'Thất bại',      value: failed,         color: 'text-red-500' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-200 px-5 py-4">
            <p className="text-xs text-gray-400 mb-1">{k.label}</p>
            <p className={`text-2xl font-bold ${k.color || 'text-gray-800'}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {upcoming > 0 && (
        <div className="mb-4 bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5 flex items-center gap-3">
          <Phone className="w-4 h-4 text-blue-600" />
          <span className="text-blue-700 font-bold text-sm">{upcoming} cuộc gọi trong 24h tới</span>
          <span className="text-blue-600 text-xs">Hệ thống sẽ tự động thực hiện</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white">
          {(['all', 'pending', 'sent', 'failed'] as CskhStatus[]).map(key => {
            const labels: Record<CskhStatus, string> = { all: 'Tất cả', pending: 'Chờ gọi', sent: 'Đã gọi', failed: 'Thất bại' }
            return (
              <button key={key} onClick={() => setStatusFilter(key)}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${statusFilter === key ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                {labels[key]}
              </button>
            )
          })}
        </div>
        <input type="text" placeholder="Tìm theo tên / số điện thoại..." value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 max-w-xs border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white placeholder-gray-400 focus:outline-none focus:border-indigo-300" />
        <span className="text-sm text-gray-400 ml-auto">{filtered.length} sự kiện</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-gray-400 text-sm">Chưa có dữ liệu chăm sóc khách hàng.</p>
            <p className="text-gray-300 text-xs mt-1">Lịch gọi tự động tạo sau khi AI đặt lịch hẹn thành công.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left">Khách hàng</th>
                  <th className="px-4 py-2 text-left">Số điện thoại</th>
                  <th className="px-4 py-2 text-left">Mốc chăm sóc</th>
                  <th className="px-4 py-2 text-left">Lịch gọi</th>
                  <th className="px-4 py-2 text-center">Trạng thái</th>
                  <th className="px-4 py-2 text-left">Đã gọi lúc</th>
                  <th className="px-4 py-2 text-center">Retry</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(e => {
                  const sc = CSKH_STATUS_MAP[e.status] ?? { label: e.status, cls: 'bg-gray-100 text-gray-500' }
                  const isOverdue = e.status === 'pending' && new Date(e.scheduled_at) < new Date()
                  const triggerColors: Record<string, string> = {
                    day1_followup: 'bg-blue-100 text-blue-700', day7_followup: 'bg-indigo-100 text-indigo-700',
                    day30_reminder: 'bg-purple-100 text-purple-700', day180_checkup: 'bg-violet-100 text-violet-700',
                  }
                  return (
                    <tr key={e.id} className={isOverdue ? 'bg-yellow-50/40' : 'hover:bg-gray-50'}>
                      <td className="px-4 py-2.5 text-gray-700 text-xs font-medium">{e.contact_name || '--'}</td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{e.contact_phone || '--'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${triggerColors[e.trigger_type] ?? 'bg-gray-100 text-gray-500'}`}>
                          {TRIGGER_LABELS[e.trigger_type] ?? e.trigger_type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 text-xs whitespace-nowrap">
                        {fmtDate(e.scheduled_at)}
                        {isOverdue && <span className="ml-1.5 text-yellow-600 font-semibold">• Quá hạn</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${sc.cls}`}>{sc.label}</span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs">{e.sent_at ? fmtDate(e.sent_at) : '--'}</td>
                      <td className="px-4 py-2.5 text-center">
                        {e.retry_count > 0
                          ? <span className="text-xs text-orange-600 font-medium">{e.retry_count}/3</span>
                          : <span className="text-gray-300 text-xs">--</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ContactsPage() {
  const router = useRouter()
  const [client, setClient]   = useState<Client | null>(null)
  const [clientId, setClientId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab]         = useState<MainTab>('contacts')
  const [contactCount, setContactCount] = useState(0)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: cu } = await supabase.from('client_users').select('client_id').eq('user_id', user.id).single()
      if (!cu) { setLoading(false); return }
      const { data: c } = await supabase.from('clients').select('*').eq('id', cu.client_id).single()
      setClient(c)
      setClientId(cu.client_id)
      const { count } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('tenant_id', cu.client_id)
      setContactCount(count ?? 0)
      setLoading(false)
    }
    init()
  }, [router])

  if (loading) return <PageSkeleton />
  if (!clientId) return null

  return (
    <AppShell clientName={client?.name}>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Khách Hàng</h1>
          <p className="text-sm text-gray-400 mt-0.5">Quản lý toàn bộ hành trình từ lead đến khách quen</p>
        </div>
      </div>

      <TabBar
        active={tab}
        onChange={setTab}
        counts={{ contacts: contactCount }}
      />

      {tab === 'contacts'     && <ContactsTab     client={client} clientId={clientId} />}
      {tab === 'pipeline'     && <PipelineTab      client={client} clientId={clientId} />}
      {tab === 'appointments' && <AppointmentsTab  clientId={clientId} />}
      {tab === 'cskh'         && <CskhTab          clientId={clientId} />}
    </AppShell>
  )
}
