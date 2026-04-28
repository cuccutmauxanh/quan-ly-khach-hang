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
  PhoneOutgoing, Heart, Upload, X, CheckCircle2,
  Clock, AlertCircle, Copy, RotateCcw, Users, ChevronRight, Search,
  Megaphone, Pencil, Save, ArrowRight, Phone, Filter, Zap,
  Download, PhoneMissed, Ban,
} from 'lucide-react'
import * as XLSX from 'xlsx'

// ── Constants ──────────────────────────────────────────────────────────────────

type AgentKey = 'agent_cold_id' | 'agent_warm_id' | 'agent_cskh_id'

const AGENT_OPTIONS: { key: AgentKey; label: string; icon: React.ElementType; color: string; badge: string }[] = [
  { key: 'agent_cold_id',  label: 'Gọi Lạnh',         icon: PhoneOutgoing, color: 'text-blue-600',   badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  { key: 'agent_cskh_id',  label: 'Khách Hàng Cũ',    icon: Heart,         color: 'text-amber-600',  badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  { key: 'agent_warm_id',  label: 'Facebook Ads',      icon: Megaphone,     color: 'text-violet-600', badge: 'bg-violet-50 text-violet-700 border-violet-200' },
]


type Template = { id: string; name: string; descHint: string; agentKey: AgentKey; icon: React.ElementType; color: string; bg: string; border: string }

const TEMPLATES: Template[] = [
  { id: 'cold',     name: 'Telesale Data Lạnh',     descHint: 'Chào hỏi, giới thiệu dịch vụ',        agentKey: 'agent_cold_id',  icon: PhoneOutgoing, color: 'text-blue-700',   bg: 'bg-blue-50 hover:bg-blue-100',   border: 'border-blue-200' },
  { id: 'cskh',     name: 'Chăm sóc sau điều trị',  descHint: 'Hỏi thăm, nhắc tái khám',             agentKey: 'agent_cskh_id',  icon: Heart,         color: 'text-amber-700',  bg: 'bg-amber-50 hover:bg-amber-100', border: 'border-amber-200' },
  { id: 'facebook', name: 'Facebook Ads Leads',      descHint: 'Data ấm từ quảng cáo, chốt lịch nhanh', agentKey: 'agent_warm_id', icon: Megaphone,     color: 'text-violet-700', bg: 'bg-violet-50 hover:bg-violet-100', border: 'border-violet-200' },
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

async function authFetch(url: string, init: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init.headers as Record<string, string> ?? {}) }
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
  return fetch(url, { ...init, headers })
}

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

function KpiCard({ label, value, icon: Icon, topColor, iconColor, trend }: {
  label: string
  value: string | number
  icon?: React.ElementType
  topColor?: string
  iconColor?: string
  trend?: string
}) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden`}>
      <div className={`h-0.5 w-full ${topColor ?? 'bg-gray-200'}`} />
      <div className="px-4 py-4">
        <div className="flex items-start justify-between mb-3">
          <p className="text-xs text-gray-400 font-medium">{label}</p>
          {Icon && <Icon className={`w-4 h-4 ${iconColor ?? 'text-gray-300'}`} />}
        </div>
        <p className="text-2xl font-bold text-gray-800 leading-none">{value}</p>
        {trend && (
          <p className="text-xs text-gray-400 mt-2">{trend}</p>
        )}
      </div>
    </div>
  )
}

// ── Campaign Card ──────────────────────────────────────────────────────────────

function CampaignCard({
  campaign, client, runningId,
  onStart, onPause, onResume, onStop, onDelete, onViewDetail, onDuplicate, onRetryFailed, onRetryNoAnswer,
}: {
  campaign: Campaign
  client: Client | null
  runningId: string | null
  onStart: (c: Campaign) => void
  onPause: (c: Campaign) => void
  onResume: (c: Campaign) => void
  onStop: (c: Campaign) => void
  onDelete: (c: Campaign) => void
  onViewDetail: (c: Campaign) => void
  onDuplicate: (c: Campaign) => void
  onRetryFailed: (c: Campaign) => void
  onRetryNoAnswer: (c: Campaign) => void
}) {
  const opt = agentOpt(campaign.agent_key)
  const AgentIcon = opt.icon
  const statusCfg = STATUS_CONFIG[campaign.status]
  const isThisRunning = runningId === campaign.id
  const results = campaign.results as CampaignResult[]
  const failedCount = results.filter(r => r.status === 'error').length
  const noAnswerCount = (campaign.no_answer_count ?? 0) || results.filter(r => r.call_outcome === 'no_answer').length

  const progress = campaign.total_count > 0
    ? Math.round((campaign.called_count / campaign.total_count) * 100)
    : 0

  const rate = campaign.called_count > 0
    ? Math.round((campaign.booked_count / campaign.called_count) * 100)
    : 0

  return (
    <div
      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-4 hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => onViewDetail(campaign)}
    >
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
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden relative">
          {/* Booked segment */}
          {campaign.booked_count > 0 && campaign.total_count > 0 && (
            <div
              className="absolute left-0 top-0 h-full bg-emerald-500 transition-all duration-700"
              style={{ width: `${(campaign.booked_count / campaign.total_count) * 100}%` }}
            />
          )}
          {/* Called (non-booked) segment */}
          {(campaign.called_count - campaign.booked_count) > 0 && campaign.total_count > 0 && (
            <div
              className={`absolute top-0 h-full transition-all duration-700 ${isThisRunning ? 'bg-blue-400' : 'bg-blue-300'}`}
              style={{
                left: `${(campaign.booked_count / campaign.total_count) * 100}%`,
                width: `${((campaign.called_count - campaign.booked_count) / campaign.total_count) * 100}%`,
              }}
            />
          )}
          {/* Shimmer overlay when running */}
          {isThisRunning && (
            <div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse"
              style={{ backgroundSize: '200% 100%' }}
            />
          )}
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <div className="flex items-center gap-2 text-[11px] text-gray-400">
            <span className="flex items-center gap-1"><span className="w-2 h-1.5 bg-emerald-500 rounded-sm inline-block" /> {campaign.booked_count} lịch</span>
            <span className="flex items-center gap-1"><span className="w-2 h-1.5 bg-blue-300 rounded-sm inline-block" /> {campaign.called_count - campaign.booked_count} khác</span>
          </div>
          <span className="text-[11px] font-semibold text-gray-500">
            {isThisRunning && <RefreshCw className="w-2.5 h-2.5 text-emerald-500 animate-spin inline mr-1" />}
            {campaign.called_count}/{campaign.total_count} · {progress}%
          </span>
        </div>
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
      <div className="flex gap-2" onClick={e => e.stopPropagation()}>
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
            {noAnswerCount > 0 && (
              <button onClick={() => onRetryNoAnswer(campaign)} title={`Gọi lại ${noAnswerCount} số không nghe`}
                className="flex-1 flex items-center justify-center gap-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-semibold py-2 rounded-xl border border-sky-200 transition-colors">
                <PhoneMissed className="w-3 h-3" /> Không nghe ({noAnswerCount})
              </button>
            )}
            {failedCount > 0 && (
              <button onClick={() => onRetryFailed(campaign)} title={`Gọi lại ${failedCount} số lỗi`}
                className="flex items-center justify-center gap-1.5 bg-orange-50 hover:bg-orange-100 text-orange-600 text-xs font-semibold px-2.5 py-2 rounded-xl border border-orange-200 transition-colors">
                <RotateCcw className="w-3 h-3" /> {failedCount}
              </button>
            )}
            <button onClick={() => onDuplicate(campaign)} title="Sao chép"
              className="p-2 rounded-xl border border-gray-200 text-gray-400 hover:text-indigo-600 hover:border-indigo-200 transition-colors">
              <Copy className="w-3.5 h-3.5" />
            </button>
          </>
        )}
        <button onClick={() => onViewDetail(campaign)}
          className="p-2 rounded-xl border border-gray-200 text-gray-400 hover:text-indigo-600 hover:border-indigo-200 transition-colors ml-auto" title="Chi tiết">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
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
  const [retryEnabled, setRetryEnabled] = useState(false)
  const [retryDelayHours, setRetryDelayHours] = useState(2)
  const [retryMaxRetries, setRetryMaxRetries] = useState(2)
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
      const res = await authFetch('/api/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          tenant_id: client.id,
          name: name.trim(),
          description: description.trim() || null,
          agent_key: agentKey,
          agent_label: opt.label,
          delay_ms: delayMs,
          contacts,
          retry_config: retryEnabled
            ? { enabled: true, delay_hours: retryDelayHours, max_retries: retryMaxRetries }
            : { enabled: false, delay_hours: 2, max_retries: 2 },
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

          {/* Retry config */}
          <div className="border border-gray-100 rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => setRetryEnabled(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <RotateCcw className="w-4 h-4 text-sky-500" />
                <div className="text-left">
                  <p className="text-xs font-semibold text-gray-700">Tự gọi lại số không nghe</p>
                  <p className="text-[11px] text-gray-400">Lên lịch gọi lại sau X giờ nếu không có người nghe</p>
                </div>
              </div>
              <div className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${retryEnabled ? 'bg-sky-500' : 'bg-gray-200'}`}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${retryEnabled ? 'left-4' : 'left-0.5'}`} />
              </div>
            </button>
            {retryEnabled && (
              <div className="px-4 pb-3 pt-1 space-y-3 bg-sky-50/50 border-t border-sky-100">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-gray-500 block mb-1">
                      Gọi lại sau — <span className="text-sky-600 font-bold">{retryDelayHours}h</span>
                    </label>
                    <input type="range" min={1} max={24} step={1} value={retryDelayHours}
                      onChange={e => setRetryDelayHours(Number(e.target.value))} className="w-full" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-gray-500 block mb-1">
                      Tối đa — <span className="text-sky-600 font-bold">{retryMaxRetries} lần</span>
                    </label>
                    <input type="range" min={1} max={5} step={1} value={retryMaxRetries}
                      onChange={e => setRetryMaxRetries(Number(e.target.value))} className="w-full" />
                  </div>
                </div>
                <p className="text-[11px] text-sky-600 bg-sky-100 rounded-lg px-2.5 py-1.5">
                  Sau khi campaign xong, hệ thống sẽ tạo campaign mới và gọi lại {retryMaxRetries} lần, mỗi lần cách {retryDelayHours}h.
                </p>
              </div>
            )}
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

// ── Campaign Detail Modal ──────────────────────────────────────────────────────

type OutcomeFilter = 'all' | 'booked' | 'no_answer' | 'rejected' | 'error'

function getCallOutcome(r: CampaignResult): 'booked' | 'no_answer' | 'rejected' | 'error' | 'calling' | 'pending' {
  if (!r || r.status === 'pending') return 'pending'
  if (r.status === 'calling') return 'calling'
  if (r.status === 'error') return 'error'
  if (r.call_outcome === 'rejected') return 'rejected'
  if (r.call_outcome === 'no_answer') return 'no_answer'
  if (r.success || r.call_outcome === 'booked') return 'booked'
  return 'no_answer'
}

function CampaignDetailModal({
  campaign: initialCampaign, client, runningId,
  onClose, onStart, onPause, onResume, onStop, onDelete, onUpdate, onRetryNoAnswer,
}: {
  campaign: Campaign
  client: Client | null
  runningId: string | null
  onClose: () => void
  onStart: (c: Campaign) => void
  onPause: (c: Campaign) => void
  onResume: (c: Campaign) => void
  onStop: (c: Campaign) => void
  onDelete: (c: Campaign) => void
  onUpdate: (c: Campaign) => void
  onRetryNoAnswer: (c: Campaign) => void
}) {
  const { toast } = useToast()
  const [campaign, setCampaign] = useState(initialCampaign)
  const [editMode, setEditMode] = useState(false)
  const [name, setName] = useState(campaign.name)
  const [description, setDescription] = useState(campaign.description ?? '')
  const [agentKey, setAgentKey] = useState<AgentKey>(campaign.agent_key as AgentKey)
  const [delayMs, setDelayMs] = useState(campaign.delay_ms)
  const [saving, setSaving] = useState(false)
  const [contactFilter, setContactFilter] = useState<OutcomeFilter>('all')
  const [contactSearch, setContactSearch] = useState('')

  // Sync live campaign updates from parent (running progress)
  useEffect(() => { setCampaign(initialCampaign) }, [initialCampaign])

  const results  = campaign.results  as CampaignResult[]
  const contacts = campaign.contacts as CampaignContact[]

  const displayList = contacts.map((c, i) => ({
    ...c,
    result: results[i] ?? { status: 'pending' as const, name: c.name, phone: c.phone, success: false },
  }))

  const outcomeCounts = {
    all:       displayList.length,
    booked:    displayList.filter(c => getCallOutcome(c.result) === 'booked').length,
    no_answer: displayList.filter(c => getCallOutcome(c.result) === 'no_answer').length,
    rejected:  displayList.filter(c => getCallOutcome(c.result) === 'rejected').length,
    error:     displayList.filter(c => getCallOutcome(c.result) === 'error').length,
  }

  const filteredList = displayList.filter(c => {
    if (contactFilter !== 'all' && getCallOutcome(c.result) !== contactFilter) return false
    if (contactSearch) {
      const q = contactSearch.toLowerCase()
      return (c.name ?? '').toLowerCase().includes(q) || c.phone.includes(q)
    }
    return true
  })

  function exportExcel() {
    const rows = displayList.map(c => {
      const outcome = getCallOutcome(c.result)
      const outcomeLabel: Record<string, string> = {
        booked: 'Đặt lịch', no_answer: 'Không nghe', rejected: 'Từ chối',
        error: 'Lỗi', calling: 'Đang gọi', pending: 'Chờ gọi',
      }
      return {
        'Tên': c.name || '',
        'Số điện thoại': c.phone,
        'Kết quả': outcomeLabel[outcome] ?? outcome,
        'Lỗi / Ghi chú': c.result.error || '',
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 14 }, { wch: 30 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Kết quả')
    XLSX.writeFile(wb, `${campaign.name.replace(/[/\\?%*:|"<>]/g, '-')}-ketqua.xlsx`)
  }

  const total       = campaign.total_count
  const called      = campaign.called_count
  const booked      = campaign.booked_count
  const errors      = outcomeCounts.error
  const noAnswerCnt = outcomeCounts.no_answer
  const remaining   = total - called
  const rate        = called > 0 ? Math.round((booked / called) * 100) : 0
  const progress    = total > 0 ? Math.round((called / total) * 100) : 0
  const isRunning   = runningId === campaign.id
  const statusCfg   = STATUS_CONFIG[campaign.status]
  const opt         = agentOpt(agentKey)

  async function handleSaveEdit() {
    setSaving(true)
    try {
      await authFetch('/api/campaigns', {
        method: 'PATCH',
        body: JSON.stringify({ id: campaign.id, name: name.trim(), description: description.trim() || null, agent_key: agentKey, delay_ms: delayMs }),
      })
      const updated = { ...campaign, name: name.trim(), description: description.trim() || null, agent_key: agentKey, delay_ms: delayMs }
      setCampaign(updated)
      onUpdate(updated)
      setEditMode(false)
      toast('Đã cập nhật chiến dịch', 'success')
    } catch {
      toast('Lỗi khi lưu', 'error')
    } finally {
      setSaving(false)
    }
  }

  function cancelEdit() {
    setName(campaign.name)
    setDescription(campaign.description ?? '')
    setAgentKey(campaign.agent_key as AgentKey)
    setDelayMs(campaign.delay_ms)
    setEditMode(false)
  }

  const CONTACT_FILTERS: { key: OutcomeFilter; label: string; color: string; icon: string }[] = [
    { key: 'all',       label: `Tất cả (${outcomeCounts.all})`,          color: 'bg-gray-800 text-white',    icon: '' },
    { key: 'booked',    label: `Đặt lịch (${outcomeCounts.booked})`,     color: 'bg-emerald-600 text-white', icon: '✅' },
    { key: 'no_answer', label: `Không nghe (${outcomeCounts.no_answer})`, color: 'bg-sky-600 text-white',     icon: '📵' },
    { key: 'rejected',  label: `Từ chối (${outcomeCounts.rejected})`,    color: 'bg-rose-500 text-white',    icon: '❌' },
    { key: 'error',     label: `Lỗi (${outcomeCounts.error})`,           color: 'bg-red-500 text-white',     icon: '⚠️' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh]">

        {/* ── Header ── */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {editMode ? (
                <input
                  value={name} onChange={e => setName(e.target.value)} autoFocus
                  className="w-full text-lg font-bold text-gray-800 border-b-2 border-indigo-400 focus:outline-none pb-0.5 bg-transparent"
                />
              ) : (
                <h2 className="text-lg font-bold text-gray-800 truncate">{campaign.name}</h2>
              )}
              {editMode ? (
                <input
                  value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="Mô tả chiến dịch..."
                  className="w-full text-xs text-gray-400 border-b border-gray-200 focus:outline-none mt-1 pb-0.5 bg-transparent"
                />
              ) : (
                <p className="text-xs text-gray-400 mt-0.5 truncate">{campaign.description || 'Không có mô tả'}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${statusCfg.cls}`}>
                {isRunning ? '⟳ Đang chạy' : statusCfg.label}
              </span>
              <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </div>

          {/* Edit mode: agent + delay */}
          {editMode && (
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1.5">Trợ lý AI</p>
                <div className="flex gap-2">
                  {AGENT_OPTIONS.map(o => {
                    const Icon = o.icon
                    const active = agentKey === o.key
                    return (
                      <button key={o.key} onClick={() => setAgentKey(o.key)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                          active ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}>
                        <Icon className="w-3.5 h-3.5" /> {o.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">
                  Độ trễ — <span className="text-indigo-600">{delayMs / 1000}s</span>
                </p>
                <input type="range" min={1000} max={10000} step={500} value={delayMs}
                  onChange={e => setDelayMs(Number(e.target.value))} className="w-full" />
              </div>
            </div>
          )}

          {/* Action bar */}
          <div className="flex items-center gap-2 mt-4">
            {!editMode && (
              <>
                {campaign.status === 'draft' && (
                  <button onClick={() => { onStart(campaign); onClose() }}
                    disabled={!client?.[campaign.agent_key as keyof Client]}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition-colors disabled:opacity-40">
                    <Play className="w-3.5 h-3.5" /> Bắt đầu
                  </button>
                )}
                {campaign.status === 'running' && (
                  <>
                    <button onClick={() => onPause(campaign)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-xl transition-colors">
                      <Pause className="w-3.5 h-3.5" /> Tạm dừng
                    </button>
                    <button onClick={() => { onStop(campaign); onClose() }}
                      className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-600 border border-red-200 text-xs font-semibold rounded-xl hover:bg-red-100 transition-colors">
                      <Square className="w-3.5 h-3.5" /> Kết thúc
                    </button>
                  </>
                )}
                {campaign.status === 'paused' && (
                  <button onClick={() => { onResume(campaign); onClose() }}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition-colors">
                    <Play className="w-3.5 h-3.5" /> Tiếp tục
                  </button>
                )}
                {(campaign.status === 'completed' || campaign.status === 'paused') && noAnswerCnt > 0 && (
                  <button onClick={() => { onRetryNoAnswer(campaign); onClose() }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-sky-50 border border-sky-200 text-sky-700 text-xs font-semibold rounded-xl hover:bg-sky-100 transition-colors">
                    <PhoneMissed className="w-3.5 h-3.5" /> Gọi lại không nghe ({noAnswerCnt})
                  </button>
                )}
                {(campaign.status === 'completed' || campaign.status === 'paused') && (
                  <button onClick={exportExcel}
                    className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-500 text-xs font-semibold rounded-xl hover:border-emerald-300 hover:text-emerald-600 transition-colors">
                    <Download className="w-3.5 h-3.5" /> Xuất Excel
                  </button>
                )}
                <button onClick={() => setEditMode(true)}
                  className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-500 text-xs font-semibold rounded-xl hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                  <Pencil className="w-3.5 h-3.5" /> Chỉnh sửa
                </button>
                <button onClick={() => onDelete(campaign)}
                  className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-400 text-xs font-semibold rounded-xl hover:border-red-200 hover:text-red-500 transition-colors ml-auto">
                  <Trash2 className="w-3.5 h-3.5" /> Xóa
                </button>
              </>
            )}
            {editMode && (
              <>
                <button onClick={handleSaveEdit} disabled={saving || !name.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-colors disabled:opacity-40">
                  {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Lưu
                </button>
                <button onClick={cancelEdit}
                  className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-500 text-xs font-semibold rounded-xl hover:bg-gray-50 transition-colors">
                  Hủy
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── KPI row ── */}
        <div className="px-6 py-4 border-b border-gray-50 shrink-0">
          <div className="grid grid-cols-5 gap-2">
            {[
              { label: 'Tổng số',    value: total,       cls: 'bg-gray-50    text-gray-700'   },
              { label: 'Đã gọi',    value: called,      cls: 'bg-blue-50    text-blue-700'   },
              { label: 'Đặt lịch',  value: booked,      cls: 'bg-emerald-50 text-emerald-700' },
              { label: 'Không nghe', value: noAnswerCnt, cls: noAnswerCnt > 0 ? 'bg-sky-50 text-sky-700' : 'bg-gray-50 text-gray-400' },
              { label: 'Còn lại',   value: remaining,   cls: 'bg-indigo-50  text-indigo-700' },
            ].map(k => (
              <div key={k.label} className={`text-center rounded-xl py-2.5 px-1 ${k.cls}`}>
                <div className="text-xl font-bold leading-tight">{k.value}</div>
                <div className="text-xs font-medium mt-0.5 opacity-70">{k.label}</div>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div className="mt-3">
            <div className="flex justify-between text-xs text-gray-400 mb-1.5">
              <span>Tiến độ</span>
              <span className="font-semibold text-gray-600">
                {called}/{total} · {progress}% · Đặt lịch {rate}%
              </span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden flex">
              {booked > 0 && total > 0 && (
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(booked / total) * 100}%` }} />
              )}
              {called - booked > 0 && total > 0 && (
                <div className="h-full bg-blue-300 transition-all" style={{ width: `${((called - booked) / total) * 100}%` }} />
              )}
            </div>
            <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-400">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2 bg-emerald-500 rounded-sm inline-block" /> Đặt lịch</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2 bg-blue-300 rounded-sm inline-block" /> Đã gọi</span>
              {isRunning && <span className="text-emerald-600 font-medium flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" /> Đang thực hiện...</span>}
            </div>
          </div>
        </div>

        {/* ── Contact list ── */}
        <div className="flex flex-col flex-1 overflow-hidden px-6 py-4">
          <div className="flex items-center gap-2 mb-3 shrink-0">
            <Filter className="w-3.5 h-3.5 text-gray-400" />
            <div className="flex gap-1.5 flex-wrap flex-1">
              {CONTACT_FILTERS.map(f => (
                <button key={f.key} onClick={() => setContactFilter(f.key)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                    contactFilter === f.key ? f.color : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>
            <div className="relative shrink-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
              <input value={contactSearch} onChange={e => setContactSearch(e.target.value)}
                placeholder="Tìm tên, SĐT..."
                className="pl-7 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-300 w-36" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto border border-gray-100 rounded-2xl divide-y divide-gray-50">
            {filteredList.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">Không có kết quả</div>
            ) : (
              filteredList.map((c, i) => {
                const outcome = getCallOutcome(c.result)
                const OUTCOME_ICON: Record<string, React.ReactNode> = {
                  booked:    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />,
                  no_answer: <PhoneMissed  className="w-4 h-4 text-sky-500   shrink-0" />,
                  rejected:  <Ban          className="w-4 h-4 text-rose-400  shrink-0" />,
                  error:     <AlertCircle  className="w-4 h-4 text-red-400   shrink-0" />,
                  calling:   <RefreshCw    className="w-4 h-4 text-blue-500  shrink-0 animate-spin" />,
                  pending:   <Clock        className="w-4 h-4 text-gray-300  shrink-0" />,
                }
                const OUTCOME_BADGE: Record<string, string> = {
                  booked:    'bg-emerald-50 text-emerald-700 border-emerald-200',
                  no_answer: 'bg-sky-50 text-sky-700 border-sky-200',
                  rejected:  'bg-rose-50 text-rose-600 border-rose-200',
                  error:     'bg-red-50 text-red-600 border-red-200',
                  calling:   'bg-blue-50 text-blue-700 border-blue-200',
                  pending:   'bg-gray-50 text-gray-400 border-gray-100',
                }
                const OUTCOME_LABEL: Record<string, string> = {
                  booked: '✅ Đặt lịch', no_answer: '📵 Không nghe', rejected: '❌ Từ chối',
                  error: '⚠️ Lỗi', calling: '🔄 Đang gọi', pending: '⏳ Chờ gọi',
                }
                return (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors">
                    {OUTCOME_ICON[outcome]}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-700 truncate">{c.name || '—'}</p>
                      <p className="text-xs text-gray-400">{c.phone}</p>
                    </div>
                    <div className="shrink-0">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${OUTCOME_BADGE[outcome]}`}>
                        {OUTCOME_LABEL[outcome]}
                      </span>
                      {outcome === 'error' && c.result.error && (
                        <p className="text-[10px] text-red-400 mt-0.5 max-w-32 truncate text-right">{c.result.error.slice(0, 25)}</p>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Flow Builder ──────────────────────────────────────────────────────────────

type MainTab = 'cold' | 'care' | 'facebook'

const MAIN_TABS: { key: MainTab; label: string; sublabel: string; icon: React.ElementType; agentKey: AgentKey; color: string; active: string; border: string }[] = [
  { key: 'cold',     label: 'Telesale Lạnh',  sublabel: 'Gọi lạnh & chốt lịch',    icon: PhoneOutgoing, agentKey: 'agent_cold_id',  color: 'text-blue-700',   active: 'bg-blue-600 text-white',   border: 'border-blue-300' },
  { key: 'care',     label: 'Chăm Sóc',        sublabel: 'Chăm sóc khách hàng cũ',  icon: Heart,         agentKey: 'agent_cskh_id',  color: 'text-amber-700',  active: 'bg-amber-500 text-white',  border: 'border-amber-300' },
  { key: 'facebook', label: 'Facebook Ads',    sublabel: 'Leads từ quảng cáo',       icon: Megaphone,     agentKey: 'agent_warm_id',  color: 'text-violet-700', active: 'bg-violet-600 text-white', border: 'border-violet-300' },
]

interface FlowStep {
  id: string
  name: string
  instruction: string
  condition: string
}

const FLOW_COLORS = [
  { bg: 'bg-yellow-400',  text: 'text-yellow-900', border: 'border-yellow-500', badge: 'bg-yellow-500/25' },
  { bg: 'bg-orange-500',  text: 'text-white',       border: 'border-orange-600', badge: 'bg-orange-600/30' },
  { bg: 'bg-amber-700',   text: 'text-white',       border: 'border-amber-800',  badge: 'bg-amber-800/30' },
  { bg: 'bg-red-800',     text: 'text-white',       border: 'border-red-900',    badge: 'bg-red-900/30' },
  { bg: 'bg-purple-700',  text: 'text-white',       border: 'border-purple-800', badge: 'bg-purple-800/30' },
  { bg: 'bg-teal-600',    text: 'text-white',       border: 'border-teal-700',   badge: 'bg-teal-700/30' },
]

const DEFAULT_COLD_FLOW: FlowStep[] = [
  { id: 'step-1', name: 'Chào hỏi', instruction: 'Xin chào anh/chị! Em là Ly của Nha khoa Mila 208 Thái Hà. Mila đang có quà khám răng miễn phí cho khách mới. Anh/chị có đang rảnh nghe máy không ạ?', condition: 'Khi khách xác nhận đang rảnh và đồng ý nghe' },
  { id: 'step-2', name: 'Hỏi nhu cầu', instruction: 'Dạo này anh chị gặp vấn đề gì với răng không ạ? Hay bao lâu rồi chưa đi khám tổng quát?', condition: 'Khi khách chia sẻ về tình trạng răng hoặc thời gian chưa khám' },
  { id: 'step-3', name: 'Giới thiệu ưu đãi', instruction: 'Mila đang tặng gói khám răng toàn diện miễn phí — X-quang, tư vấn kế hoạch điều trị và làm trắng 1 hàm. Em đặt lịch cho anh chị nhé?', condition: 'Khi khách tỏ ra quan tâm, hỏi thêm hoặc đồng ý đặt lịch' },
  { id: 'step-4', name: 'Chốt lịch', instruction: 'Tuần này anh chị rảnh ngày nào ạ? Mila có khung sáng từ 9h-12h và chiều 2h-6h. Em đặt giờ cụ thể cho anh chị luôn nhé.', condition: 'Sau khi khách xác nhận ngày và giờ phù hợp' },
]

function generatePromptFromFlow(steps: FlowStep[]): string {
  const stepLines = steps.map((s, i) =>
    `Bước ${i + 1} — ${s.name}:\n${s.instruction}\n→ Chuyển tiếp khi: ${s.condition || 'luôn luôn sau khi hoàn thành bước này'}`
  ).join('\n\n')

  return `LUỒNG HỘI THOẠI (${steps.length} bước theo thứ tự):

${stepLines}

TỪ CHỐI / KHÔNG QUAN TÂM:
Nếu khách nói bận, cúp máy, từ chối rõ ràng → "Dạ không sao ạ, anh chị nhớ đến Mila khi cần nhé. Chúc anh chị ngày tốt lành!" → kết thúc cuộc gọi ngay.

INAUDIBLE (transcript ghi "(inaudible)"):
Lần 1: "Dạ em chưa nghe rõ, anh chị nói lại được không ạ?"
Lần 2 liên tiếp: "Hình như kết nối đang khó nghe. Chúc anh chị ngày tốt lành!" → end_call.

NGUYÊN TẮC CHUNG:
- Tối đa 2-3 câu mỗi lượt, 1 câu hỏi cuối
- Không hỏi nhiều hơn 1 câu mỗi lượt
- Thật thà nếu khách hỏi có phải AI không
- Số tiền đọc bằng chữ (VD: "năm triệu chín")`
}

// ── Flow Node ─────────────────────────────────────────────────────────────────

function FlowNode({ step, index, onClick }: { step: FlowStep; index: number; onClick: () => void }) {
  const c = FLOW_COLORS[index % FLOW_COLORS.length]
  const preview = step.instruction ? step.instruction.slice(0, 52) + (step.instruction.length > 52 ? '…' : '') : 'Chưa có kịch bản'
  return (
    <button
      onClick={onClick}
      className={`relative flex-shrink-0 w-44 rounded-2xl ${c.bg} ${c.text} border-2 ${c.border} p-4 flex flex-col gap-2 shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:scale-95 transition-all group text-left`}
    >
      {/* Step badge */}
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${c.badge}`}>
          Bước {index + 1}
        </span>
        <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
      </div>
      {/* Step name */}
      <p className="text-sm font-bold leading-tight">{step.name}</p>
      {/* Script preview */}
      <p className={`text-[11px] leading-snug opacity-75 line-clamp-2`}>{preview}</p>
    </button>
  )
}

// ── Flow Step Modal ────────────────────────────────────────────────────────────

function FlowStepModal({ step, index, onSave, onDelete, onClose }: {
  step: FlowStep; index: number
  onSave: (s: FlowStep) => void
  onDelete: () => void
  onClose: () => void
}) {
  const [name, setName] = useState(step.name)
  const [instruction, setInstruction] = useState(step.instruction)
  const [condition, setCondition] = useState(step.condition)
  const c = FLOW_COLORS[index % FLOW_COLORS.length]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className={`flex items-center justify-between px-6 py-4 ${c.bg} ${c.text}`}>
          <div>
            <h2 className="text-base font-bold">Bước {index + 1} — Chỉnh sửa kịch bản</h2>
            <p className="text-xs opacity-75 mt-0.5">Nội dung AI sẽ nói ở bước này</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-black/10 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1.5">Tên bước *</label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="VD: Chào hỏi, Hỏi nhu cầu, Chốt lịch..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1.5">Kịch bản AI *</label>
            <p className="text-xs text-gray-400 mb-1.5">Câu nói / hướng dẫn cho AI ở bước này</p>
            <textarea value={instruction} onChange={e => setInstruction(e.target.value)}
              placeholder="VD: Xin chào anh/chị! Em là Ly của Nha khoa Mila..."
              rows={5}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none" />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1.5">Điều kiện chuyển bước tiếp</label>
            <p className="text-xs text-gray-400 mb-1.5">Khi nào AI chuyển sang bước tiếp theo?</p>
            <input value={condition} onChange={e => setCondition(e.target.value)}
              placeholder="VD: Khi khách xác nhận đang rảnh và đồng ý nghe"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onDelete}
            className="p-2.5 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 transition-colors" title="Xóa bước">
            <Trash2 className="w-4 h-4" />
          </button>
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-500 hover:bg-gray-50 transition-colors">
            Hủy
          </button>
          <button onClick={() => onSave({ ...step, name, instruction, condition })}
            disabled={!name.trim() || !instruction.trim()}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors disabled:opacity-40">
            Lưu bước
          </button>
        </div>
      </div>
    </div>
  )
}

// ── All Steps Modal ────────────────────────────────────────────────────────────

function AllStepsModal({ steps, onSave, onClose }: {
  steps: FlowStep[]
  onSave: (updated: FlowStep[]) => void
  onClose: () => void
}) {
  const [edited, setEdited] = useState<FlowStep[]>(steps.map(s => ({ ...s })))

  function update(idx: number, field: keyof FlowStep, value: string) {
    setEdited(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s))
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-800">Chỉnh sửa toàn bộ kịch bản</h2>
            <p className="text-xs text-gray-400 mt-0.5">{edited.length} bước · chỉnh sửa nhanh tất cả cùng lúc</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {edited.map((step, i) => {
            const c = FLOW_COLORS[i % FLOW_COLORS.length]
            return (
              <div key={step.id} className={`rounded-2xl border-2 ${c.border} overflow-hidden`}>
                <div className={`${c.bg} ${c.text} px-4 py-2.5 flex items-center gap-3`}>
                  <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${c.badge}`}>Bước {i + 1}</span>
                  <input
                    value={step.name}
                    onChange={e => update(i, 'name', e.target.value)}
                    className="flex-1 bg-transparent font-bold text-sm focus:outline-none border-b border-current/30 pb-0.5 placeholder-current/40 min-w-0"
                    placeholder="Tên bước..."
                  />
                </div>
                <div className="px-4 py-3 space-y-3 bg-white">
                  <div>
                    <label className="text-xs font-semibold text-gray-400 block mb-1.5">Kịch bản AI</label>
                    <textarea
                      value={step.instruction}
                      onChange={e => update(i, 'instruction', e.target.value)}
                      rows={3}
                      placeholder="Câu nói / hướng dẫn cho AI ở bước này..."
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-400 block mb-1.5">Điều kiện chuyển bước</label>
                    <input
                      value={step.condition}
                      onChange={e => update(i, 'condition', e.target.value)}
                      placeholder="Khi nào AI chuyển sang bước tiếp theo?"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-500 hover:bg-gray-50 transition-colors">
            Hủy
          </button>
          <button onClick={() => onSave(edited)}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors">
            Lưu tất cả
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Flow Builder Modal ────────────────────────────────────────────────────────

function FlowBuilderModal({ client, onClose }: { client: Client | null; onClose: () => void }) {
  const { toast } = useToast()
  const agentId = client?.agent_cold_id ?? null
  const [steps, setSteps] = useState<FlowStep[]>(DEFAULT_COLD_FLOW)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [llmId, setLlmId] = useState<string | null>(null)
  const [allStepsOpen, setAllStepsOpen] = useState(false)

  useEffect(() => {
    if (!agentId) return
    const saved = localStorage.getItem(`flow_steps_${agentId}`)
    if (saved) {
      try { setSteps(JSON.parse(saved)) } catch {}
    }
    authFetch(`/api/retell-agent?agentId=${agentId}`)
      .then(r => r.json())
      .then(d => { if (d.llm_id) setLlmId(d.llm_id) })
      .catch(() => {})
  }, [agentId])

  async function handleSave() {
    if (!agentId) { toast('Chưa cấu hình Agent Gọi Lạnh. Vào Cài đặt → Trợ lý AI.', 'error'); return }
    setSaving(true)
    localStorage.setItem(`flow_steps_${agentId}`, JSON.stringify(steps))
    if (llmId) {
      const prompt = generatePromptFromFlow(steps)
      const res = await authFetch('/api/retell-agent', {
        method: 'PATCH',
        body: JSON.stringify({ agentId, llm_id: llmId, general_prompt: prompt }),
      })
      toast(res.ok ? 'Đã lưu & đồng bộ lên RetellAI ✓' : 'Lỗi khi đồng bộ RetellAI', res.ok ? 'success' : 'error')
    } else {
      toast('Đã lưu luồng (chưa đồng bộ — LLM ID chưa có)', 'success')
    }
    setSaving(false)
  }

  function addStep() {
    const newStep: FlowStep = { id: `step-${Date.now()}`, name: `Bước ${steps.length + 1}`, instruction: '', condition: '' }
    setSteps(prev => [...prev, newStep])
    setEditingIdx(steps.length)
  }

  function handleStepSave(updated: FlowStep) {
    setSteps(prev => prev.map(s => s.id === updated.id ? updated : s))
    setEditingIdx(null)
  }

  function handleStepDelete(idx: number) {
    setSteps(prev => prev.filter((_, i) => i !== idx))
    setEditingIdx(null)
  }

  function handleAllStepsSave(updated: FlowStep[]) {
    setSteps(updated)
    setAllStepsOpen(false)
  }

  const editingStep = editingIdx !== null ? steps[editingIdx] : null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-white w-full sm:rounded-3xl shadow-2xl sm:max-w-4xl flex flex-col max-h-[95vh] sm:max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-5 py-4 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Kịch Bản Hội Thoại
              <span className="text-xs font-normal bg-white/20 px-2 py-0.5 rounded-full">{steps.length} bước</span>
            </h2>
            <p className="text-xs text-blue-100 mt-0.5">Click vào bước để chỉnh sửa — AI sẽ theo luồng này khi gọi lạnh</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button onClick={() => setAllStepsOpen(true)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/30 transition-colors">
              <Pencil className="w-3.5 h-3.5" /> Chỉnh sửa toàn bộ
            </button>
            <button onClick={addStep}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/30 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Thêm bước
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-white text-blue-700 hover:bg-blue-50 transition-colors disabled:opacity-60 shadow-sm">
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Lưu & Đồng bộ
            </button>
            <button onClick={onClose} className="p-2 rounded-xl bg-white/15 hover:bg-white/30 transition-colors">
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* Flow canvas */}
        <div className="bg-gradient-to-br from-slate-50 to-blue-50/30 px-5 py-6 overflow-x-auto flex-1">
          <div className="flex items-center gap-0 min-w-max">
            {steps.map((step, i) => (
              <div key={step.id} className="flex items-center">
                <FlowNode step={step} index={i} onClick={() => setEditingIdx(i)} />
                <div className="flex items-center shrink-0 mx-2">
                  <div className="w-6 h-px bg-gray-300" />
                  <ArrowRight className="w-4 h-4 text-gray-400 -ml-1" />
                </div>
              </div>
            ))}
            <div className="flex-shrink-0 w-28 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 border-2 border-green-700 text-white p-4 flex flex-col items-center justify-center gap-2 shadow-lg">
              <CheckCircle2 className="w-6 h-6" />
              <span className="text-xs font-bold">Kết thúc</span>
            </div>
          </div>
        </div>

        {!agentId && (
          <div className="mx-5 mb-4 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Chưa cấu hình Agent Gọi Lạnh. Vào <strong className="mx-0.5">Cài đặt → Trợ lý AI</strong> để thêm Agent ID.
          </div>
        )}
      </div>

      {editingStep && (
        <FlowStepModal
          step={editingStep} index={editingIdx!}
          onSave={handleStepSave}
          onDelete={() => handleStepDelete(editingIdx!)}
          onClose={() => setEditingIdx(null)}
        />
      )}

      {allStepsOpen && (
        <AllStepsModal
          steps={steps}
          onSave={handleAllStepsSave}
          onClose={() => setAllStepsOpen(false)}
        />
      )}
    </div>
  )
}

// ── Flow Builder Card (trigger) ────────────────────────────────────────────────

function FlowBuilderCard({ client }: { client: Client | null }) {
  const [open, setOpen] = useState(false)
  const agentId = client?.agent_cold_id ?? null
  const [previewSteps, setPreviewSteps] = useState<FlowStep[]>(DEFAULT_COLD_FLOW)

  useEffect(() => {
    if (!agentId) return
    const saved = localStorage.getItem(`flow_steps_${agentId}`)
    if (saved) try { setPreviewSteps(JSON.parse(saved)) } catch {}
  }, [agentId])

  function handleClose() {
    setOpen(false)
    if (agentId) {
      const saved = localStorage.getItem(`flow_steps_${agentId}`)
      if (saved) try { setPreviewSteps(JSON.parse(saved)) } catch {}
    }
  }

  return (
    <>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-4 overflow-hidden">
        <div className="flex items-center gap-4 px-5 py-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-gray-800">Kịch Bản Hội Thoại</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {previewSteps.length} bước
              {previewSteps[0]?.name ? ` · Bắt đầu: "${previewSteps[0].name}"` : ''}
            </p>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors shrink-0 shadow-sm shadow-blue-200">
            <Pencil className="w-3.5 h-3.5" /> Chỉnh sửa
          </button>
        </div>
      </div>
      {open && <FlowBuilderModal client={client} onClose={handleClose} />}
    </>
  )
}

// ── Manual Call Panel ─────────────────────────────────────────────────────────

function ManualCallPanel({ client }: { client: Client | null }) {
  const { toast } = useToast()
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [calling, setCalling] = useState(false)

  async function handleCall() {
    const p = phone.trim()
    if (!p) { toast('Nhập số điện thoại', 'error'); return }
    const agentId = client?.agent_cold_id
    const fromNumber = client?.retell_phone_number
    if (!agentId || !fromNumber) { toast('Chưa cấu hình Agent hoặc số gọi. Vào Cài đặt.', 'error'); return }

    setCalling(true)
    try {
      const res = await authFetch('/api/outbound', {
        method: 'POST',
        body: JSON.stringify({ phones: [{ phone: p, name: name.trim() || 'Khách' }], agentId, fromNumber }),
      })
      const { results } = await res.json()
      const ok = results?.[0]?.success
      if (ok) {
        toast(`Đang kết nối đến ${p}...`, 'success')
        setPhone(''); setName('')
      } else {
        toast(`Lỗi: ${results?.[0]?.error ?? 'Không rõ'}`, 'error')
      }
    } catch (e) {
      toast('Không kết nối được API', 'error')
    }
    setCalling(false)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-4 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100 bg-gray-50/50">
        <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
          <Phone className="w-4 h-4 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-gray-800">Gọi Thủ Công</h2>
          <p className="text-xs text-gray-400">Nhập số điện thoại — AI gọi ngay lập tức</p>
        </div>
      </div>
      <div className="px-5 py-4 flex gap-2.5 items-center flex-wrap sm:flex-nowrap">
        <div className="relative flex-1 min-w-0">
          <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" />
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="Tên khách (tuỳ chọn)"
            className="w-full pl-8 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300" />
        </div>
        <div className="relative flex-1 min-w-0">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" />
          <input value={phone} onChange={e => setPhone(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCall()}
            placeholder="0xx xxx xxxx *"
            className="w-full pl-8 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300" />
        </div>
        <button onClick={handleCall} disabled={calling || !phone.trim()}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white text-sm font-bold shadow-md shadow-emerald-200 transition-all disabled:opacity-40 disabled:shadow-none shrink-0">
          {calling ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
          {calling ? 'Đang kết nối...' : 'Gọi ngay'}
        </button>
      </div>
    </div>
  )
}

// ── Campaign Section (shared across tabs) ─────────────────────────────────────

function CampaignSection({
  client, campaigns, agentKey, runningId,
  onStart, onPause, onResume, onStop, onDelete, onViewDetail, onDuplicate, onRetryFailed, onRetryNoAnswer,
  onOpenCreate,
}: {
  client: Client | null
  campaigns: Campaign[]
  agentKey: AgentKey
  runningId: string | null
  onStart: (c: Campaign) => void
  onPause: (c: Campaign) => void
  onResume: (c: Campaign) => void
  onStop: (c: Campaign) => void
  onDelete: (c: Campaign) => void
  onViewDetail: (c: Campaign) => void
  onDuplicate: (c: Campaign) => void
  onRetryFailed: (c: Campaign) => void
  onRetryNoAnswer: (c: Campaign) => void
  onOpenCreate: () => void
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const filtered = campaigns.filter(c => statusFilter === 'all' || c.status === statusFilter)

  const totalCalled  = campaigns.reduce((s, c) => s + c.called_count, 0)
  const totalBooked  = campaigns.reduce((s, c) => s + c.booked_count, 0)
  const avgRate      = totalCalled > 0 ? Math.round((totalBooked / totalCalled) * 100) : 0
  const runningCount = campaigns.filter(c => c.status === 'running').length

  return (
    <div>
      {/* KPI row */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <KpiCard label="Đang chạy"        value={runningCount}   icon={RefreshCw}     topColor="bg-blue-500"   iconColor="text-blue-400" />
        <KpiCard label="Tổng đã gọi"      value={totalCalled}    icon={PhoneOutgoing} topColor="bg-indigo-500" iconColor="text-indigo-400" />
        <KpiCard label="Đặt lịch"         value={totalBooked}    icon={CheckCircle2}  topColor="bg-emerald-500" iconColor="text-emerald-400" />
        <KpiCard label="Tỉ lệ"            value={`${avgRate}%`}  icon={BarChart2}     topColor={avgRate >= 20 ? 'bg-emerald-500' : avgRate >= 10 ? 'bg-amber-400' : 'bg-gray-300'} iconColor={avgRate >= 20 ? 'text-emerald-400' : avgRate >= 10 ? 'text-amber-400' : 'text-gray-300'} />
      </div>

      {/* Toolbar: status filter + create */}
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex gap-0.5 bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
          {(['all', 'running', 'paused', 'completed', 'draft'] as StatusFilter[]).map(key => {
            const labels: Record<StatusFilter, string> = { all: 'Tất cả', running: 'Đang chạy', paused: 'Tạm dừng', completed: 'Hoàn thành', draft: 'Nháp' }
            const count = key === 'all' ? campaigns.length : campaigns.filter(c => c.status === key).length
            const dotColor: Record<StatusFilter, string> = { all: '', running: 'bg-emerald-500', paused: 'bg-amber-500', completed: 'bg-blue-500', draft: 'bg-gray-400' }
            return (
              <button key={key} onClick={() => setStatusFilter(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  statusFilter === key ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}>
                {key !== 'all' && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusFilter === key ? 'bg-white/70' : dotColor[key]}`} />}
                {labels[key]}
                {count > 0 && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${statusFilter === key ? 'bg-white/20' : 'bg-gray-100 text-gray-500'}`}>{count}</span>}
              </button>
            )
          })}
        </div>
        <button onClick={onOpenCreate}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors shadow-md shadow-indigo-200">
          <Plus className="w-4 h-4" /> Tạo chiến dịch
        </button>
      </div>

      {/* Campaign cards */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center shadow-sm">
          <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <PhoneOutgoing className="w-6 h-6 text-gray-300" />
          </div>
          <p className="text-gray-400 text-sm font-medium">Chưa có chiến dịch nào</p>
          <p className="text-gray-300 text-xs mt-1">Nhấn &ldquo;+ Tạo chiến dịch&rdquo; để bắt đầu</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => (
            <CampaignCard
              key={c.id} campaign={c} client={client} runningId={runningId}
              onStart={onStart} onPause={onPause} onResume={onResume}
              onStop={onStop} onDelete={onDelete} onViewDetail={onViewDetail}
              onDuplicate={onDuplicate} onRetryFailed={onRetryFailed} onRetryNoAnswer={onRetryNoAnswer}
            />
          ))}
        </div>
      )}
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
  const [activeTab, setActiveTab] = useState<MainTab>('cold')
  const [showCreate, setShowCreate] = useState(false)
  const [createInitial, setCreateInitial] = useState<Parameters<typeof CreateModal>[0]['initial']>()
  const [detailCampaign, setDetailCampaign] = useState<Campaign | null>(null)

  const [runningId, setRunningId] = useState<string | null>(null)

  const loadCampaigns = useCallback(async (tenantId: string) => {
    const res = await authFetch(`/api/campaigns?tenant_id=${tenantId}`)
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

  // Auto-refresh khi có campaign đang chạy (n8n cập nhật DB, frontend poll)
  useEffect(() => {
    const hasRunning = campaigns.some(c => c.status === 'running')
    if (!hasRunning || !client) return
    const id = setInterval(() => loadCampaigns(client.id), 8000)
    return () => clearInterval(id)
  }, [campaigns, client, loadCampaigns])

  // ── Run engine (n8n server-side) ─────────────────────────────────────────────

  async function triggerN8n(campaign: Campaign) {
    if (!client) return
    const agentId = client[campaign.agent_key as keyof Client] as string | null
    const fromNumber = client.retell_phone_number
    if (!agentId || !fromNumber) { toast('Agent chưa được cấu hình trong Cài đặt', 'error'); return }

    setRunningId(campaign.id)
    setCampaigns(prev => prev.map(c => c.id === campaign.id ? { ...c, status: 'running' as const } : c))

    try {
      const res = await fetch('https://letanai.tino.page/webhook/campaign-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaign.id }),
      })
      if (res.ok) {
        toast('n8n đang xử lý chiến dịch — tiến độ cập nhật tự động', 'success')
      } else {
        throw new Error(`Webhook lỗi ${res.status}`)
      }
    } catch (e) {
      toast(String(e), 'error')
      setCampaigns(prev => prev.map(c => c.id === campaign.id ? { ...c, status: 'draft' as const } : c))
    } finally {
      setRunningId(null)
    }
  }

  function handleStart(c: Campaign) { triggerN8n(c) }
  function handleResume(c: Campaign) { triggerN8n(c) }

  async function handlePause(c: Campaign) {
    await authFetch('/api/campaigns', { method: 'PATCH', body: JSON.stringify({ id: c.id, status: 'paused' }) })
    setCampaigns(prev => prev.map(x => x.id === c.id ? { ...x, status: 'paused' as const } : x))
    toast('Đã tạm dừng', 'success')
  }
  async function handleStop(c: Campaign) {
    await authFetch('/api/campaigns', { method: 'PATCH', body: JSON.stringify({ id: c.id, status: 'paused' }) })
    setCampaigns(prev => prev.map(x => x.id === c.id ? { ...x, status: 'paused' as const } : x))
    toast('Đã dừng chiến dịch', 'success')
  }

  async function handleDelete(c: Campaign) {
    if (!confirm(`Xóa chiến dịch "${c.name}"?`)) return
    await authFetch(`/api/campaigns?id=${c.id}`, { method: 'DELETE' })
    setCampaigns(prev => prev.filter(x => x.id !== c.id))
    toast('Đã xóa', 'success')
  }

  async function handleDuplicate(c: Campaign) {
    if (!client) return
    const res = await authFetch('/api/campaigns', {
      method: 'POST',
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
    const res = await authFetch('/api/campaigns', {
      method: 'POST',
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

  async function handleRetryNoAnswer(c: Campaign) {
    if (!client) return
    const noAnswer = (c.results as CampaignResult[])
      .filter(r => r.call_outcome === 'no_answer' || (r.status === 'done' && !r.success && !r.call_outcome))
      .map(r => ({ name: r.name, phone: r.phone }))
    if (noAnswer.length === 0) { toast('Không có số không nghe nào', 'info'); return }
    const res = await authFetch('/api/campaigns', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: client.id,
        name: `Gọi lại — ${c.name}`,
        description: `Gọi lại ${noAnswer.length} số không nghe từ "${c.name}"`,
        agent_key: c.agent_key,
        agent_label: c.agent_label,
        delay_ms: c.delay_ms,
        contacts: noAnswer,
      }),
    })
    const { campaign, error } = await res.json()
    if (error) { toast(error, 'error'); return }
    setCampaigns(prev => [campaign, ...prev])
    toast(`Đã tạo campaign gọi lại ${noAnswer.length} số không nghe`, 'success')
  }

  function openCreate(agentKey?: AgentKey) {
    setCreateInitial(agentKey ? { agentKey } : undefined)
    setShowCreate(true)
  }

  const sharedHandlers = {
    onStart: handleStart, onPause: handlePause, onResume: handleResume,
    onStop: handleStop, onDelete: handleDelete, onViewDetail: setDetailCampaign,
    onDuplicate: handleDuplicate, onRetryFailed: handleRetryFailed, onRetryNoAnswer: handleRetryNoAnswer,
  }

  if (loading) return <PageSkeleton />

  return (
    <AppShell clientName={client?.name}>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: t.text1, letterSpacing: '-0.02em', margin: 0 }}>
            Chiến Dịch AI
          </h1>
          <p style={{ fontSize: 13, color: t.text3, marginTop: 4 }}>
            Gọi tự động hàng loạt theo từng mục tiêu
          </p>
        </div>
      </div>

      {/* Main tabs — underline style */}
      <div className="flex border-b border-gray-200 mb-6 -mx-1">
        {MAIN_TABS.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          const count = campaigns.filter(c => c.agent_key === tab.agentKey).length
          const activeUnderline = tab.key === 'cold' ? 'border-blue-600' : tab.key === 'care' ? 'border-amber-500' : 'border-violet-600'
          const activeText = tab.key === 'cold' ? 'text-blue-700' : tab.key === 'care' ? 'text-amber-700' : 'text-violet-700'
          const activeBadge = tab.key === 'cold' ? 'bg-blue-100 text-blue-700' : tab.key === 'care' ? 'bg-amber-100 text-amber-700' : 'bg-violet-100 text-violet-700'
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-5 py-3 border-b-2 text-sm font-semibold transition-all -mb-px ${
                isActive
                  ? `${activeUnderline} ${activeText}`
                  : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300'
              }`}>
              <Icon className="w-4 h-4" />
              {tab.label}
              {count > 0 && (
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${isActive ? activeBadge : 'bg-gray-100 text-gray-500'}`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Tab: Telesale Lạnh */}
      {activeTab === 'cold' && (
        <>
          <FlowBuilderCard client={client} />
          <ManualCallPanel client={client} />
          <div className="mt-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Gọi Hàng Loạt</p>
            <CampaignSection
              client={client}
              campaigns={campaigns.filter(c => c.agent_key === 'agent_cold_id')}
              agentKey="agent_cold_id"
              runningId={runningId}
              {...sharedHandlers}
              onOpenCreate={() => openCreate('agent_cold_id')}
            />
          </div>
        </>
      )}

      {/* Tab: Chăm Sóc */}
      {activeTab === 'care' && (
        <CampaignSection
          client={client}
          campaigns={campaigns.filter(c => c.agent_key === 'agent_cskh_id')}
          agentKey="agent_cskh_id"
          runningId={runningId}
          {...sharedHandlers}
          onOpenCreate={() => openCreate('agent_cskh_id')}
        />
      )}

      {/* Tab: Facebook Ads */}
      {activeTab === 'facebook' && (
        <CampaignSection
          client={client}
          campaigns={campaigns.filter(c => c.agent_key === 'agent_warm_id')}
          agentKey="agent_warm_id"
          runningId={runningId}
          {...sharedHandlers}
          onOpenCreate={() => openCreate('agent_warm_id')}
        />
      )}

      {/* Modals */}
      {showCreate && client && (
        <CreateModal client={client} initial={createInitial}
          onClose={() => setShowCreate(false)}
          onCreated={c => { setCampaigns(prev => [c, ...prev]); setShowCreate(false) }}
        />
      )}
      {detailCampaign && (
        <CampaignDetailModal
          campaign={campaigns.find(c => c.id === detailCampaign.id) ?? detailCampaign}
          client={client} runningId={runningId}
          onClose={() => setDetailCampaign(null)}
          onStart={handleStart} onPause={handlePause} onResume={handleResume} onStop={handleStop}
          onDelete={c => { handleDelete(c); setDetailCampaign(null) }}
          onUpdate={c => setCampaigns(prev => prev.map(x => x.id === c.id ? c : x))}
          onRetryNoAnswer={c => { handleRetryNoAnswer(c); setDetailCampaign(null) }}
        />
      )}
    </AppShell>
  )
}
