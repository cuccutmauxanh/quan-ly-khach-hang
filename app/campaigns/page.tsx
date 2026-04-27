'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase, type Client, type Campaign, type CampaignResult, type Contact } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/ui/app-shell'
import { PageSkeleton } from '@/components/skeleton'
import { useToast } from '@/components/toast'
import { useTheme } from '@/components/ui/theme'
import {
  Plus, Play, Pause, Square, RefreshCw, Trash2, BarChart2,
  PhoneOutgoing, Zap, Heart, PhoneIncoming, Upload, X, CheckCircle2,
  Clock, AlertCircle, Copy, RotateCcw, Users, ChevronRight, Search,
} from 'lucide-react'
import * as XLSX from 'xlsx'

// ── Constants ──────────────────────────────────────────────────────────────────

type AgentKey = 'agent_cold_id' | 'agent_warm_id' | 'agent_cskh_id' | 'agent_receptionist_id'

const AGENT_OPTIONS: { key: AgentKey; label: string; icon: React.ElementType; color: string; badge: string }[] = [
  { key: 'agent_cold_id',         label: 'Telesale — Data lạnh', icon: PhoneOutgoing, color: 'text-blue-600',    badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  { key: 'agent_warm_id',         label: 'Telesale — Data ấm',   icon: Zap,           color: 'text-violet-600',  badge: 'bg-violet-50 text-violet-700 border-violet-200' },
  { key: 'agent_cskh_id',         label: 'Chăm sóc khách hàng', icon: Heart,         color: 'text-amber-600',   badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  { key: 'agent_receptionist_id', label: 'Lễ tân',              icon: PhoneIncoming, color: 'text-emerald-600', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
]

type Template = { id: string; name: string; descHint: string; agentKey: AgentKey; icon: React.ElementType; color: string; bg: string; border: string }

const TEMPLATES: Template[] = [
  {
    id: 'cold', name: 'Telesale Data Lạnh', descHint: 'Chào hỏi, giới thiệu dịch vụ',
    agentKey: 'agent_cold_id', icon: PhoneOutgoing,
    color: 'text-blue-700', bg: 'bg-blue-50 hover:bg-blue-100', border: 'border-blue-200',
  },
  {
    id: 'warm', name: 'Telesale Data Ấm', descHint: 'Nhắc lại quan tâm, chốt lịch',
    agentKey: 'agent_warm_id', icon: Zap,
    color: 'text-violet-700', bg: 'bg-violet-50 hover:bg-violet-100', border: 'border-violet-200',
  },
  {
    id: 'cskh', name: 'Chăm sóc sau điều trị', descHint: 'Hỏi thăm, nhắc tái khám',
    agentKey: 'agent_cskh_id', icon: Heart,
    color: 'text-amber-700', bg: 'bg-amber-50 hover:bg-amber-100', border: 'border-amber-200',
  },
  {
    id: 'reception', name: 'Xác nhận lịch hẹn', descHint: 'Nhắc lịch, xác nhận đến khám',
    agentKey: 'agent_receptionist_id', icon: PhoneIncoming,
    color: 'text-emerald-700', bg: 'bg-emerald-50 hover:bg-emerald-100', border: 'border-emerald-200',
  },
]

const STATUS_CONFIG = {
  draft:     { label: 'Nháp',       cls: 'bg-gray-100 text-gray-500 border-gray-200' },
  running:   { label: 'Đang chạy',  cls: 'bg-green-50 text-green-700 border-green-200' },
  paused:    { label: 'Tạm dừng',   cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  completed: { label: 'Hoàn thành', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
} as const

type StatusFilter = 'all' | Campaign['status']
type CampaignContact = { name: string; phone: string }
type ContactSource = 'excel' | 'crm'
type CrmFilter = 'uncalled' | 'high_interest' | 'all'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(s: string) {
  const d = new Date(s)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

function agentOpt(key: string) {
  return AGENT_OPTIONS.find(a => a.key === key) ?? AGENT_OPTIONS[0]
}

function monthLabel() {
  const d = new Date()
  return `tháng ${d.getMonth()+1}/${d.getFullYear()}`
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4 shadow-sm flex flex-col gap-1">
      <span className="text-xs text-gray-400 font-medium">{label}</span>
      <span className="text-2xl font-bold text-gray-800">{value}</span>
    </div>
  )
}

// ── Campaign Card ──────────────────────────────────────────────────────────────

function CampaignCard({
  campaign, client, runningId,
  onStart, onPause, onResume, onStop, onDelete, onViewReport, onDuplicate, onRetryFailed,
}: {
  campaign: Campaign
  client: Client | null
  runningId: string | null
  onStart: (c: Campaign) => void
  onPause: (c: Campaign) => void
  onResume: (c: Campaign) => void
  onStop: (c: Campaign) => void
  onDelete: (c: Campaign) => void
  onViewReport: (c: Campaign) => void
  onDuplicate: (c: Campaign) => void
  onRetryFailed: (c: Campaign) => void
}) {
  const opt = agentOpt(campaign.agent_key)
  const AgentIcon = opt.icon
  const statusCfg = STATUS_CONFIG[campaign.status]
  const isThisRunning = runningId === campaign.id
  const results = campaign.results as CampaignResult[]
  const failedCount = results.filter(r => r.status === 'error').length

  const progress = campaign.total_count > 0
    ? Math.round((campaign.called_count / campaign.total_count) * 100)
    : 0

  const rate = campaign.called_count > 0
    ? Math.round((campaign.booked_count / campaign.called_count) * 100)
    : 0

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-4 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-800 text-sm leading-tight truncate">{campaign.name}</h3>
          {campaign.description && (
            <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{campaign.description}</p>
          )}
        </div>
        <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border ${statusCfg.cls}`}>
          {statusCfg.label}
        </span>
      </div>

      {/* Badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${opt.badge}`}>
          <AgentIcon className="w-3 h-3" />
          {opt.label}
        </span>
        <span className="text-xs text-gray-400 flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {fmtDate(campaign.created_at)}
        </span>
      </div>

      {/* Progress */}
      <div>
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
          <span>Tiến độ</span>
          <span className="font-semibold text-gray-700">{campaign.called_count}/{campaign.total_count} ({progress}%)</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${campaign.status === 'completed' ? 'bg-blue-500' : 'bg-emerald-500'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        {isThisRunning && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <RefreshCw className="w-3 h-3 text-emerald-500 animate-spin" />
            <span className="text-xs text-emerald-600 font-medium">Đang thực hiện...</span>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-gray-50 rounded-xl py-2">
          <div className="text-base font-bold text-gray-700">{campaign.called_count}</div>
          <div className="text-xs text-gray-400">Đã gọi</div>
        </div>
        <div className="bg-gray-50 rounded-xl py-2">
          <div className="text-base font-bold text-emerald-600">{campaign.booked_count}</div>
          <div className="text-xs text-gray-400">Đặt lịch</div>
        </div>
        <div className="bg-gray-50 rounded-xl py-2">
          <div className="text-base font-bold text-amber-600">{rate}%</div>
          <div className="text-xs text-gray-400">Tỉ lệ</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {campaign.status === 'draft' && (
          <>
            <button onClick={() => onStart(campaign)}
              disabled={campaign.total_count === 0 || !client?.[campaign.agent_key as keyof Client]}
              className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2 rounded-xl transition-colors disabled:opacity-40">
              <Play className="w-3 h-3" /> Bắt đầu
            </button>
            <button onClick={() => onDuplicate(campaign)} title="Sao chép"
              className="p-2 rounded-xl border border-gray-200 text-gray-400 hover:text-indigo-600 hover:border-indigo-200 transition-colors">
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onDelete(campaign)} title="Xóa"
              className="p-2 rounded-xl border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
        {campaign.status === 'running' && (
          <>
            <button onClick={() => onPause(campaign)}
              className="flex-1 flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold py-2 rounded-xl transition-colors">
              <Pause className="w-3 h-3" /> Tạm dừng
            </button>
            <button onClick={() => onStop(campaign)}
              className="px-3 flex items-center justify-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold py-2 rounded-xl border border-red-200 transition-colors">
              <Square className="w-3 h-3" /> Kết thúc
            </button>
          </>
        )}
        {campaign.status === 'paused' && (
          <>
            <button onClick={() => onResume(campaign)}
              className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2 rounded-xl transition-colors">
              <Play className="w-3 h-3" /> Tiếp tục
            </button>
            <button onClick={() => onDuplicate(campaign)} title="Sao chép"
              className="p-2 rounded-xl border border-gray-200 text-gray-400 hover:text-indigo-600 hover:border-indigo-200 transition-colors">
              <Copy className="w-3.5 h-3.5" />
            </button>
          </>
        )}
        {campaign.status === 'completed' && (
          <>
            <button onClick={() => onViewReport(campaign)}
              className="flex-1 flex items-center justify-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold py-2 rounded-xl border border-blue-200 transition-colors">
              <BarChart2 className="w-3 h-3" /> Báo cáo
            </button>
            {failedCount > 0 && (
              <button onClick={() => onRetryFailed(campaign)} title={`Gọi lại ${failedCount} số lỗi`}
                className="px-3 flex items-center justify-center gap-1.5 bg-orange-50 hover:bg-orange-100 text-orange-600 text-xs font-semibold py-2 rounded-xl border border-orange-200 transition-colors">
                <RotateCcw className="w-3 h-3" /> Retry {failedCount}
              </button>
            )}
            <button onClick={() => onDuplicate(campaign)} title="Sao chép"
              className="p-2 rounded-xl border border-gray-200 text-gray-400 hover:text-indigo-600 hover:border-indigo-200 transition-colors">
              <Copy className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── CRM Contact Selector ───────────────────────────────────────────────────────

function CrmSelector({
  client, selectedPhones, onSelect,
}: {
  client: Client
  selectedPhones: Set<string>
  onSelect: (contacts: CampaignContact[]) => void
}) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [crmFilter, setCrmFilter] = useState<CrmFilter>('uncalled')
  const [search, setSearch] = useState('')
  const [checked, setChecked] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('contacts').select('*').eq('tenant_id', client.id).limit(300)
    if (crmFilter === 'uncalled') query = query.or('call_count.is.null,call_count.eq.0')
    if (crmFilter === 'high_interest') query = query.eq('interest_level', 'high')
    const { data } = await query.order('created_at', { ascending: false })
    setContacts(data ?? [])
    setLoading(false)
  }, [client.id, crmFilter])

  useEffect(() => { load() }, [load])

  const filtered = contacts.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return (c.full_name ?? '').toLowerCase().includes(q) || c.phone.includes(q)
  })

  function toggleOne(c: Contact) {
    const key = c.phone
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleAll() {
    if (checked.size === filtered.length) {
      setChecked(new Set())
    } else {
      setChecked(new Set(filtered.map(c => c.phone)))
    }
  }

  useEffect(() => {
    const selected = contacts
      .filter(c => checked.has(c.phone))
      .map(c => ({ name: c.full_name ?? '', phone: c.phone.replace(/^0/, '') }))
    onSelect(selected)
  }, [checked, contacts, onSelect])

  const CRM_FILTERS: { key: CrmFilter; label: string }[] = [
    { key: 'uncalled', label: 'Chưa gọi' },
    { key: 'high_interest', label: 'Quan tâm cao' },
    { key: 'all', label: 'Tất cả' },
  ]

  return (
    <div className="flex flex-col gap-3">
      {/* Filter pills */}
      <div className="flex gap-1.5">
        {CRM_FILTERS.map(f => (
          <button key={f.key} onClick={() => { setCrmFilter(f.key); setChecked(new Set()) }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
              crmFilter === f.key
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Tìm tên, số điện thoại..."
          className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" />
      </div>

      {/* Header row */}
      {!loading && filtered.length > 0 && (
        <div className="flex items-center justify-between px-1">
          <button onClick={toggleAll} className="flex items-center gap-2 text-xs font-medium text-indigo-600 hover:text-indigo-700">
            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
              checked.size === filtered.length ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'
            }`}>
              {checked.size === filtered.length && <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5 3.5-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </div>
            Chọn tất cả ({filtered.length})
          </button>
          {checked.size > 0 && (
            <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
              {checked.size} đã chọn
            </span>
          )}
        </div>
      )}

      {/* List */}
      <div className="border border-gray-100 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
        {loading ? (
          <div className="p-6 text-center text-sm text-gray-400">Đang tải...</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-400">Không có khách hàng phù hợp</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map(c => {
              const isChecked = checked.has(c.phone)
              return (
                <button key={c.id} onClick={() => toggleOne(c)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${isChecked ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                    isChecked ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'
                  }`}>
                    {isChecked && <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5 3.5-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">{c.full_name || '—'}</p>
                    <p className="text-xs text-gray-400">{c.phone}</p>
                  </div>
                  {c.interest_level === 'high' && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full shrink-0">Hot</span>
                  )}
                  {(c.call_count ?? 0) > 0 && (
                    <span className="text-xs text-gray-300 shrink-0">{c.call_count}x</span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Create/Edit Modal ──────────────────────────────────────────────────────────

function CreateModal({
  client, initial, onClose, onCreated,
}: {
  client: Client
  initial?: Partial<{ name: string; description: string; agentKey: AgentKey; contacts: CampaignContact[]; source: ContactSource }>
  onClose: () => void
  onCreated: (c: Campaign) => void
}) {
  const { toast } = useToast()
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [agentKey, setAgentKey] = useState<AgentKey>(initial?.agentKey ?? 'agent_cold_id')
  const [delayMs, setDelayMs] = useState(3000)
  const [source, setSource] = useState<ContactSource>(initial?.source ?? 'excel')
  const [excelRows, setExcelRows] = useState<CampaignContact[]>(initial?.contacts ?? [])
  const [crmRows, setCrmRows] = useState<CampaignContact[]>([])
  const [saving, setSaving] = useState(false)
  const [templatePicked, setTemplatePicked] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const contacts = source === 'excel' ? excelRows : crmRows
  const opt = agentOpt(agentKey)

  function applyTemplate(t: Template) {
    setAgentKey(t.agentKey)
    if (!name) setName(`${t.name} ${monthLabel()}`)
    if (!description) setDescription(t.descHint)
    setTemplatePicked(true)
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const wb = XLSX.read(ev.target?.result, { type: 'binary' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' })
      const parsed: CampaignContact[] = raw.map(r => {
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
      setExcelRows(parsed)
      toast(`Đã tải ${parsed.length} số`, 'success')
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

  async function handleSave() {
    if (!name.trim()) { toast('Nhập tên chiến dịch', 'error'); return }
    if (contacts.length === 0) { toast('Chọn ít nhất 1 số điện thoại', 'error'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: client.id,
          name: name.trim(),
          description: description.trim() || null,
          agent_key: agentKey,
          agent_label: opt.label,
          delay_ms: delayMs,
          contacts,
        }),
      })
      const { campaign, error } = await res.json()
      if (error) throw new Error(error)
      toast('Đã tạo chiến dịch', 'success')
      onCreated(campaign)
    } catch (e) {
      toast(String(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-800">Tạo chiến dịch mới</h2>
            <p className="text-xs text-gray-400 mt-0.5">Chọn template → Chọn danh sách → Bắt đầu</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">

          {/* Templates */}
          {!templatePicked && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2.5">Chọn nhanh theo loại chiến dịch</p>
              <div className="grid grid-cols-2 gap-2">
                {TEMPLATES.map(t => {
                  const Icon = t.icon
                  const avail = !!client[t.agentKey as keyof Client]
                  return (
                    <button key={t.id} onClick={() => applyTemplate(t)}
                      disabled={!avail}
                      className={`flex items-center gap-3 px-3 py-3 rounded-xl border text-left transition-all ${t.bg} ${t.border} disabled:opacity-40 disabled:cursor-not-allowed`}>
                      <Icon className={`w-4 h-4 shrink-0 ${t.color}`} />
                      <div className="min-w-0">
                        <p className={`text-xs font-bold ${t.color} truncate`}>{t.name}</p>
                        <p className="text-xs text-gray-400 truncate">{t.descHint}</p>
                      </div>
                      <ChevronRight className={`w-3.5 h-3.5 shrink-0 ${t.color} opacity-60`} />
                    </button>
                  )
                })}
              </div>
              <div className="relative mt-3">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-100" />
                </div>
                <div className="relative text-center">
                  <span className="bg-white px-3 text-xs text-gray-400">hoặc tùy chỉnh</span>
                </div>
              </div>
            </div>
          )}

          {/* Tên */}
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1.5">Tên chiến dịch *</label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="VD: Telesale Implant tháng 5"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" />
          </div>

          {/* Mô tả */}
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1.5">Mô tả</label>
            <input value={description} onChange={e => setDescription(e.target.value)}
              placeholder="VD: Data Facebook Ads tháng 5"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" />
          </div>

          {/* Agent */}
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-2">Trợ lý AI *</label>
            <div className="grid grid-cols-2 gap-2">
              {AGENT_OPTIONS.map(o => {
                const Icon = o.icon
                const avail = !!client[o.key as keyof Client]
                const active = agentKey === o.key
                return (
                  <button key={o.key} onClick={() => setAgentKey(o.key)} disabled={!avail}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-left transition-all border ${
                      active ? 'border-indigo-300 bg-indigo-50' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                    } disabled:opacity-40 disabled:cursor-not-allowed`}>
                    <Icon className={`w-4 h-4 shrink-0 ${o.color}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-700 truncate">{o.label}</p>
                    </div>
                    {active && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Delay */}
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-2">
              Độ trễ giữa các cuộc gọi — <span className="text-indigo-600 font-bold">{delayMs / 1000}s</span>
            </label>
            <input type="range" min={1000} max={10000} step={500} value={delayMs}
              onChange={e => setDelayMs(Number(e.target.value))} className="w-full" />
            <p className="text-xs text-gray-400 mt-1">Tránh bị block bởi nhà mạng</p>
          </div>

          {/* Contact source tabs */}
          <div>
            <div className="flex gap-1 mb-3 bg-gray-100 rounded-xl p-1">
              <button onClick={() => setSource('crm')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  source === 'crm' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
                }`}>
                <Users className="w-3.5 h-3.5" /> Từ Data khách
              </button>
              <button onClick={() => setSource('excel')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  source === 'excel' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
                }`}>
                <Upload className="w-3.5 h-3.5" /> Upload Excel
              </button>
            </div>

            {source === 'crm' ? (
              <CrmSelector client={client} selectedPhones={new Set(crmRows.map(r => r.phone))} onSelect={setCrmRows} />
            ) : (
              <div>
                <p className="text-xs text-gray-400 mb-2">File Excel cần có cột Tên và Số điện thoại</p>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
                {excelRows.length === 0 ? (
                  <button onClick={() => fileRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-4 text-sm text-gray-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                    <Upload className="w-4 h-4" /> Chọn file Excel
                  </button>
                ) : (
                  <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span className="text-sm font-semibold text-emerald-700">{excelRows.length} số điện thoại</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => fileRef.current?.click()} className="text-xs text-indigo-500 hover:underline">Đổi file</button>
                      <button onClick={() => setExcelRows([])} className="text-gray-400 hover:text-red-500 transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Contact summary */}
          {contacts.length > 0 && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2.5 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0" />
              <span className="text-sm font-semibold text-indigo-700">
                {contacts.length} số điện thoại sẵn sàng
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-500 hover:bg-gray-50 transition-colors">
            Hủy
          </button>
          <button onClick={handleSave}
            disabled={saving || !name.trim() || contacts.length === 0}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
            {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
            Lưu chiến dịch
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Report Modal ───────────────────────────────────────────────────────────────

function ReportModal({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) {
  const results = campaign.results as CampaignResult[]
  const done  = results.filter(r => r.status === 'done').length
  const err   = results.filter(r => r.status === 'error').length
  const rate  = done > 0 ? Math.round((campaign.booked_count / done) * 100) : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-800">{campaign.name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Báo cáo chiến dịch</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div className="px-6 py-5">
          <div className="grid grid-cols-4 gap-3 mb-5">
            {[
              { label: 'Tổng số', value: campaign.total_count, cls: 'bg-gray-50 text-gray-700' },
              { label: 'Đã gọi', value: done, cls: 'bg-emerald-50 text-emerald-600' },
              { label: 'Đặt lịch', value: campaign.booked_count, cls: 'bg-blue-50 text-blue-600' },
              { label: 'Lỗi', value: err, cls: 'bg-red-50 text-red-500' },
            ].map(s => (
              <div key={s.label} className={`text-center rounded-xl p-3 ${s.cls}`}>
                <div className="text-xl font-bold">{s.value}</div>
                <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="mb-4">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Tỉ lệ đặt lịch</span>
              <span className="font-semibold text-amber-600">{rate}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full">
              <div className="h-full bg-amber-400 rounded-full" style={{ width: `${rate}%` }} />
            </div>
          </div>

          {results.length > 0 && (
            <div className="max-h-64 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
              {results.map((r, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  {r.status === 'done'  && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                  {r.status === 'error' && <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />}
                  {(r.status === 'pending' || r.status === 'calling') && <Clock className="w-4 h-4 text-gray-300 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700">{r.name || '—'}</p>
                    <p className="text-xs text-gray-400">{r.phone}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {r.status === 'done'    && <span className="text-xs text-emerald-600 font-medium">Đã gọi</span>}
                    {r.status === 'error'   && <span className="text-xs text-red-500">{r.error?.slice(0, 25) || 'Lỗi'}</span>}
                    {r.status === 'pending' && <span className="text-xs text-gray-300">Chưa gọi</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100">
          <button onClick={onClose}
            className="w-full py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-500 hover:bg-gray-50 transition-colors">
            Đóng
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const router = useRouter()
  const t = useTheme()
  const { toast } = useToast()

  const [client, setClient] = useState<Client | null>(null)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [createInitial, setCreateInitial] = useState<Parameters<typeof CreateModal>[0]['initial']>()
  const [reportCampaign, setReportCampaign] = useState<Campaign | null>(null)

  const abortRef = useRef(false)
  const [runningId, setRunningId] = useState<string | null>(null)

  const loadCampaigns = useCallback(async (tenantId: string) => {
    const res = await fetch(`/api/campaigns?tenant_id=${tenantId}`)
    const { campaigns: data } = await res.json()
    if (data) setCampaigns(data)
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: cu } = await supabase.from('client_users').select('client_id').eq('user_id', user.id).single()
      if (!cu) { setLoading(false); return }
      const { data: c } = await supabase.from('clients').select('*').eq('id', cu.client_id).single()
      setClient(c)
      await loadCampaigns(cu.client_id)
      setLoading(false)
    }
    init()
  }, [router, loadCampaigns])

  // ── Run engine ───────────────────────────────────────────────────────────────

  async function runCampaign(campaign: Campaign, startFromIndex = 0) {
    if (!client) return
    const agentId = client[campaign.agent_key as keyof Client] as string | null
    const fromNumber = client.retell_phone_number
    if (!agentId || !fromNumber) { toast('Agent chưa được cấu hình trong Cài đặt', 'error'); return }

    abortRef.current = false
    setRunningId(campaign.id)

    const contacts = campaign.contacts as CampaignContact[]

    await fetch('/api/campaigns', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: campaign.id, status: 'running', started_at: campaign.started_at ?? new Date().toISOString() }),
    })
    setCampaigns(prev => prev.map(c => c.id === campaign.id ? { ...c, status: 'running' } : c))

    let called = campaign.called_count
    let errors = campaign.error_count
    const booked = campaign.booked_count
    const results: CampaignResult[] = [...(campaign.results as CampaignResult[])]

    for (let i = startFromIndex; i < contacts.length; i++) {
      if (abortRef.current) break

      if (results[i]) results[i] = { ...results[i], status: 'calling' }
      else results.push({ ...contacts[i], success: false, status: 'calling' })
      setCampaigns(prev => prev.map(c => c.id === campaign.id ? { ...c, results: [...results] } : c))

      try {
        const res = await fetch('/api/outbound', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phones: [{ phone: contacts[i].phone, name: contacts[i].name }], agentId, fromNumber }),
        })
        const { results: r } = await res.json()
        const ok = r?.[0]?.success ?? false
        results[i] = { ...contacts[i], success: ok, call_id: r?.[0]?.call_id, error: r?.[0]?.error ?? null, status: ok ? 'done' : 'error' }
        if (ok) called++; else errors++
      } catch (e) {
        results[i] = { ...contacts[i], success: false, error: String(e), status: 'error' }
        errors++
      }

      if ((i + 1) % 5 === 0 || i === contacts.length - 1) {
        await fetch('/api/campaigns', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: campaign.id, called_count: called, error_count: errors, booked_count: booked, results }),
        })
      }

      setCampaigns(prev => prev.map(c => c.id === campaign.id
        ? { ...c, called_count: called, error_count: errors, results: [...results] }
        : c
      ))

      if (i < contacts.length - 1 && !abortRef.current) {
        await new Promise(r => setTimeout(r, campaign.delay_ms))
      }
    }

    const finalStatus = abortRef.current ? 'paused' : 'completed'
    await fetch('/api/campaigns', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: campaign.id, status: finalStatus,
        called_count: called, error_count: errors, booked_count: booked, results,
        completed_at: finalStatus === 'completed' ? new Date().toISOString() : null,
      }),
    })
    setCampaigns(prev => prev.map(c => c.id === campaign.id
      ? { ...c, status: finalStatus, called_count: called, error_count: errors, results }
      : c
    ))
    setRunningId(null)
    toast(finalStatus === 'completed' ? 'Chiến dịch hoàn tất' : 'Đã tạm dừng', 'success')
  }

  function handleStart(c: Campaign) { runCampaign(c, 0) }
  function handleResume(c: Campaign) {
    const results = c.results as CampaignResult[]
    const nextIdx = results.findIndex(r => r.status === 'pending' || r.status === 'calling')
    runCampaign(c, nextIdx >= 0 ? nextIdx : c.called_count)
  }
  function handlePause(_c: Campaign) { abortRef.current = true }
  function handleStop(_c: Campaign)  { abortRef.current = true }

  async function handleDelete(c: Campaign) {
    if (!confirm(`Xóa chiến dịch "${c.name}"?`)) return
    await fetch(`/api/campaigns?id=${c.id}`, { method: 'DELETE' })
    setCampaigns(prev => prev.filter(x => x.id !== c.id))
    toast('Đã xóa', 'success')
  }

  async function handleDuplicate(c: Campaign) {
    if (!client) return
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: client.id,
        name: `Sao chép — ${c.name}`,
        description: c.description,
        agent_key: c.agent_key,
        agent_label: c.agent_label,
        delay_ms: c.delay_ms,
        contacts: c.contacts,
      }),
    })
    const { campaign, error } = await res.json()
    if (error) { toast(error, 'error'); return }
    setCampaigns(prev => [campaign, ...prev])
    toast('Đã nhân bản chiến dịch', 'success')
  }

  async function handleRetryFailed(c: Campaign) {
    if (!client) return
    const failed = (c.results as CampaignResult[])
      .filter(r => r.status === 'error')
      .map(r => ({ name: r.name, phone: r.phone }))
    if (failed.length === 0) return
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: client.id,
        name: `Retry — ${c.name}`,
        description: `Gọi lại ${failed.length} số lỗi từ "${c.name}"`,
        agent_key: c.agent_key,
        agent_label: c.agent_label,
        delay_ms: c.delay_ms,
        contacts: failed,
      }),
    })
    const { campaign, error } = await res.json()
    if (error) { toast(error, 'error'); return }
    setCampaigns(prev => [campaign, ...prev])
    toast(`Đã tạo campaign retry ${failed.length} số`, 'success')
  }

  function openCreate(initial?: typeof createInitial) {
    setCreateInitial(initial)
    setShowCreate(true)
  }

  // ── Stats ────────────────────────────────────────────────────────────────────

  const runningCount = campaigns.filter(c => c.status === 'running').length
  const totalCalled  = campaigns.reduce((s, c) => s + c.called_count, 0)
  const totalBooked  = campaigns.reduce((s, c) => s + c.booked_count, 0)
  const avgRate      = totalCalled > 0 ? Math.round((totalBooked / totalCalled) * 100) : 0
  const filtered     = campaigns.filter(c => statusFilter === 'all' || c.status === statusFilter)

  if (loading) return <PageSkeleton />

  return (
    <AppShell clientName={client?.name}>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: t.text1, letterSpacing: '-0.02em', margin: 0 }}>
            Campaign AI
          </h1>
          <p style={{ fontSize: 13, color: t.text3, marginTop: 4 }}>
            Quản lý chiến dịch gọi tự động hàng loạt
          </p>
        </div>
        <button onClick={() => openCreate()}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> Tạo campaign
        </button>
      </div>

      {/* Quick start templates */}
      <div className="mb-6">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2.5">Tạo nhanh</p>
        <div className="grid grid-cols-4 gap-3">
          {TEMPLATES.map(tmpl => {
            const Icon = tmpl.icon
            const avail = !!client?.[tmpl.agentKey as keyof Client]
            return (
              <button key={tmpl.id}
                onClick={() => openCreate({ agentKey: tmpl.agentKey, name: `${tmpl.name} ${monthLabel()}`, description: tmpl.descHint })}
                disabled={!avail}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-all shadow-sm ${tmpl.bg} ${tmpl.border} disabled:opacity-40 disabled:cursor-not-allowed`}>
                <Icon className={`w-5 h-5 shrink-0 ${tmpl.color}`} />
                <div className="min-w-0">
                  <p className={`text-xs font-bold ${tmpl.color}`}>{tmpl.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{tmpl.descHint}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <KpiCard label="Đang chạy"    value={runningCount} />
        <KpiCard label="Tổng đã gọi"  value={totalCalled} />
        <KpiCard label="Tổng đặt lịch" value={totalBooked} />
        <KpiCard label="Tỉ lệ TB"     value={`${avgRate}%`} />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit">
        {(['all', 'running', 'paused', 'completed', 'draft'] as StatusFilter[]).map(key => {
          const labels: Record<StatusFilter, string> = { all: 'Tất cả', running: 'Đang chạy', paused: 'Tạm dừng', completed: 'Hoàn thành', draft: 'Nháp' }
          const count = key === 'all' ? campaigns.length : campaigns.filter(c => c.status === key).length
          return (
            <button key={key} onClick={() => setStatusFilter(key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                statusFilter === key ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {labels[key]}{count > 0 && <span className="ml-1 text-xs text-gray-400">({count})</span>}
            </button>
          )
        })}
      </div>

      {/* Campaign cards */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center shadow-sm">
          <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <PhoneOutgoing className="w-6 h-6 text-gray-300" />
          </div>
          <p className="text-gray-400 text-sm font-medium">Chưa có chiến dịch nào</p>
          <p className="text-gray-300 text-xs mt-1">Chọn template ở trên hoặc nhấn "+ Tạo campaign"</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => (
            <CampaignCard
              key={c.id} campaign={c} client={client} runningId={runningId}
              onStart={handleStart} onPause={handlePause} onResume={handleResume}
              onStop={handleStop} onDelete={handleDelete} onViewReport={setReportCampaign}
              onDuplicate={handleDuplicate} onRetryFailed={handleRetryFailed}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {showCreate && client && (
        <CreateModal client={client} initial={createInitial}
          onClose={() => setShowCreate(false)}
          onCreated={c => { setCampaigns(prev => [c, ...prev]); setShowCreate(false) }}
        />
      )}
      {reportCampaign && (
        <ReportModal campaign={reportCampaign} onClose={() => setReportCampaign(null)} />
      )}
    </AppShell>
  )
}
