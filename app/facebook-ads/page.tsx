'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase, type Client } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import {
  Megaphone, RefreshCw, Phone, Edit2, CheckCircle2,
  Plus, X, ChevronRight, Clock, User, Target,
  AlertCircle, Loader2, ExternalLink,
} from 'lucide-react'
import AppShell from '@/components/ui/app-shell'
import { PageSkeleton } from '@/components/skeleton'

// ── Types ──────────────────────────────────────────────────────────────────────

type LeadStatus = 'new' | 'calling' | 'called' | 'booked' | 'lost' | 'no_answer'
type Priority = 'HOT' | 'WARM' | 'COLD'
type CampaignStatus = 'active' | 'paused' | 'ended' | 'draft'

type FbLead = {
  id: string
  tenant_id: string
  commenter_name: string | null
  commenter_fb_id: string | null
  real_name: string | null
  phone: string | null
  post_id: string | null
  fb_campaign_id: string | null
  lead_status: LeadStatus
  call_status: string | null
  notes: string | null
  raw_comment: string | null
  last_call_summary: string | null
  outcome: string | null
  sentiment: string | null
  lead_score: number | null
  priority: Priority
  contacted_at: string | null
  dm_sent_at: string | null
  phone_received_at: string | null
  created_at: string
}

type FbCampaign = {
  id: string
  tenant_id: string
  name: string
  description: string | null
  fb_page_id: string | null
  fb_page_name: string | null
  ad_account_id: string | null
  post_id: string | null
  dm_script: string | null
  agent_key: string | null
  status: CampaignStatus
  leads_count: number
  called_count: number
  booked_count: number
  started_at: string | null
  ended_at: string | null
  notes: string | null
  created_at: string
}

// ── Constants ──────────────────────────────────────────────────────────────────

const LEAD_STATUS_MAP: Record<LeadStatus, { label: string; cls: string; pulse?: boolean }> = {
  new:       { label: 'Mới',        cls: 'bg-gray-100 text-gray-600' },
  calling:   { label: 'Đang gọi',   cls: 'bg-blue-100 text-blue-700', pulse: true },
  called:    { label: 'Đã gọi',     cls: 'bg-green-100 text-green-700' },
  booked:    { label: 'Đặt lịch',   cls: 'bg-purple-100 text-purple-700' },
  lost:      { label: 'Mất KH',     cls: 'bg-red-100 text-red-600' },
  no_answer: { label: 'Không nghe', cls: 'bg-orange-100 text-orange-600' },
}

const PRIORITY_MAP: Record<Priority, { label: string; cls: string }> = {
  HOT:  { label: 'HOT',  cls: 'bg-red-500 text-white' },
  WARM: { label: 'WARM', cls: 'bg-orange-400 text-white' },
  COLD: { label: 'COLD', cls: 'bg-blue-400 text-white' },
}

const CAMPAIGN_STATUS_MAP: Record<CampaignStatus, { label: string; cls: string }> = {
  active: { label: 'Đang chạy', cls: 'bg-green-100 text-green-700' },
  paused: { label: 'Tạm dừng',  cls: 'bg-yellow-100 text-yellow-700' },
  ended:  { label: 'Kết thúc',  cls: 'bg-gray-100 text-gray-500' },
  draft:  { label: 'Nháp',      cls: 'bg-indigo-100 text-indigo-600' },
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(s: string): string {
  const diff = Math.floor((Date.now() - new Date(s).getTime()) / 1000)
  if (diff < 60) return `${diff}s trước`
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`
  return `${Math.floor(diff / 86400)} ngày trước`
}

function fmtTime(s: string | null): string {
  if (!s) return '--'
  const d = new Date(s)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

function cr(called: number, leads: number): string {
  if (!leads) return '0%'
  return `${Math.round((called / leads) * 100)}%`
}

// ── Lead Detail Modal ──────────────────────────────────────────────────────────

function LeadModal({
  lead,
  campaigns,
  onClose,
  onSave,
  onCall,
}: {
  lead: FbLead
  campaigns: FbCampaign[]
  onClose: () => void
  onSave: (id: string, updates: Partial<FbLead>) => Promise<void>
  onCall: (lead: FbLead) => void
}) {
  const [realName, setRealName] = useState(lead.real_name ?? '')
  const [notes, setNotes] = useState(lead.notes ?? '')
  const [status, setStatus] = useState<LeadStatus>(lead.lead_status)
  const [priority, setPriority] = useState<Priority>(lead.priority)
  const [saving, setSaving] = useState(false)

  const campaign = campaigns.find(c => c.id === lead.fb_campaign_id)

  async function handleSave() {
    setSaving(true)
    await onSave(lead.id, { real_name: realName, notes, lead_status: status, priority })
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-800">Chi tiết Lead</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-4 space-y-5">
          {/* FB Info */}
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-gray-800">{lead.commenter_name ?? 'Ẩn danh'}</p>
              {lead.commenter_fb_id && (
                <p className="text-xs text-gray-400">FB ID: {lead.commenter_fb_id}</p>
              )}
              {campaign && (
                <p className="text-xs text-indigo-500 mt-0.5">Chiến dịch: {campaign.name}</p>
              )}
            </div>
          </div>

          {/* Comment */}
          {lead.raw_comment && (
            <div className="bg-gray-50 rounded-lg px-4 py-3">
              <p className="text-xs text-gray-500 mb-1">Bình luận gốc</p>
              <p className="text-sm text-gray-700 italic">"{lead.raw_comment}"</p>
            </div>
          )}

          {/* Timeline */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Timeline</p>
            <div className="space-y-1.5">
              {[
                { label: 'Bình luận', time: lead.created_at },
                { label: 'Gửi DM',   time: lead.dm_sent_at },
                { label: 'Nhận SĐT', time: lead.phone_received_at },
                { label: 'Đã gọi',   time: lead.contacted_at },
              ].map(({ label, time }) => (
                <div key={label} className="flex items-center gap-3 text-sm">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${time ? 'bg-indigo-500' : 'bg-gray-200'}`} />
                  <span className="text-gray-500 w-24">{label}</span>
                  <span className="text-gray-700">{fmtTime(time)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Editable Fields */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tên thật</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                value={realName}
                onChange={e => setRealName(e.target.value)}
                placeholder="Nhập tên thật..."
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">SĐT</label>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">{lead.phone ?? '—'}</p>
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">Trạng thái</label>
                <select
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  value={status}
                  onChange={e => setStatus(e.target.value as LeadStatus)}
                >
                  {(Object.keys(LEAD_STATUS_MAP) as LeadStatus[]).map(s => (
                    <option key={s} value={s}>{LEAD_STATUS_MAP[s].label}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">Mức độ</label>
                <select
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  value={priority}
                  onChange={e => setPriority(e.target.value as Priority)}
                >
                  {(Object.keys(PRIORITY_MAP) as Priority[]).map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Ghi chú</label>
              <textarea
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                rows={3}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Ghi chú thêm..."
              />
            </div>
          </div>

          {/* Last Summary */}
          {lead.last_call_summary && (
            <div className="bg-indigo-50 rounded-lg px-4 py-3">
              <p className="text-xs text-indigo-500 mb-1">Tóm tắt cuộc gọi gần nhất</p>
              <p className="text-sm text-indigo-800">{lead.last_call_summary}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex gap-3">
          <button
            onClick={() => onCall(lead)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
          >
            <Phone className="w-4 h-4" /> Gọi AI
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Lưu thay đổi
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  )
}

// ── New Campaign Modal ─────────────────────────────────────────────────────────

function NewCampaignModal({
  tenantId,
  agentWarmId,
  onClose,
  onCreated,
}: {
  tenantId: string
  agentWarmId: string | null
  onClose: () => void
  onCreated: () => void
}) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    fb_page_id: '',
    fb_page_name: '',
    post_id: '',
    dm_script: '',
    agent_key: agentWarmId ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function setField(k: keyof typeof form, v: string) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name) { setError('Tên chiến dịch không được để trống'); return }
    setSaving(true)
    const { error: dbErr } = await supabase.from('fb_campaigns').insert({
      tenant_id: tenantId,
      name: form.name,
      description: form.description || null,
      fb_page_id: form.fb_page_id || null,
      fb_page_name: form.fb_page_name || null,
      post_id: form.post_id || null,
      dm_script: form.dm_script || null,
      agent_key: form.agent_key || null,
      status: 'draft',
      leads_count: 0,
      called_count: 0,
      booked_count: 0,
    })
    setSaving(false)
    if (dbErr) { setError(dbErr.message); return }
    onCreated()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-800">Tạo chiến dịch mới</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 text-red-600 rounded-lg px-3 py-2 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tên chiến dịch *</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              value={form.name}
              onChange={e => setField('name', e.target.value)}
              placeholder="VD: Ads tháng 5 — Niềng răng"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Mô tả</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              value={form.description}
              onChange={e => setField('description', e.target.value)}
              placeholder="Mô tả ngắn..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">FB Page ID</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                value={form.fb_page_id}
                onChange={e => setField('fb_page_id', e.target.value)}
                placeholder="123456789"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tên Page</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                value={form.fb_page_name}
                onChange={e => setField('fb_page_name', e.target.value)}
                placeholder="Nha Khoa ABC"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Post ID (bài viết chạy ads)</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              value={form.post_id}
              onChange={e => setField('post_id', e.target.value)}
              placeholder="page_id_post_id"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Script DM tự động</label>
            <textarea
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
              rows={4}
              value={form.dm_script}
              onChange={e => setField('dm_script', e.target.value)}
              placeholder="Xin chào {name}, bạn vừa bình luận về dịch vụ..."
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Agent ID (Retell)</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              value={form.agent_key}
              onChange={e => setField('agent_key', e.target.value)}
              placeholder={agentWarmId ?? 'agent_xxx...'}
            />
            {agentWarmId && (
              <p className="text-xs text-gray-400 mt-1">Mặc định: agent_warm_id của bạn</p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Tạo chiến dịch
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Hủy
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function FacebookAdsPage() {
  const router = useRouter()
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'leads' | 'campaigns'>('leads')

  // Leads state
  const [leads, setLeads] = useState<FbLead[]>([])
  const [campaigns, setCampaigns] = useState<FbCampaign[]>([])
  const [leadsLoading, setLeadsLoading] = useState(false)
  const [selectedLead, setSelectedLead] = useState<FbLead | null>(null)

  // Campaign state
  const [campaignsLoading, setCampaignsLoading] = useState(false)
  const [showNewCampaign, setShowNewCampaign] = useState(false)
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null)
  const [callingLeadId, setCallingLeadId] = useState<string | null>(null)

  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Auth ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: link } = await supabase
        .from('client_users')
        .select('client_id')
        .eq('user_id', user.id)
        .single()
      if (!link) { router.push('/login'); return }

      const { data: clientData } = await supabase
        .from('clients')
        .select('*')
        .eq('id', link.client_id)
        .single()
      if (!clientData) { router.push('/login'); return }

      setClient(clientData)
      setLoading(false)
    }
    init()
  }, [router])

  // ── Fetch Leads ─────────────────────────────────────────────────────────────
  const fetchLeads = useCallback(async (tenantId: string) => {
    setLeadsLoading(true)
    const { data } = await supabase
      .from('facebook_leads')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(200)
    setLeads(data ?? [])
    setLeadsLoading(false)
  }, [])

  // ── Fetch Campaigns ──────────────────────────────────────────────────────────
  const fetchCampaigns = useCallback(async (tenantId: string) => {
    setCampaignsLoading(true)
    const { data } = await supabase
      .from('fb_campaigns')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
    setCampaigns(data ?? [])
    setCampaignsLoading(false)
  }, [])

  useEffect(() => {
    if (!client) return
    fetchLeads(client.id)
    fetchCampaigns(client.id)

    refreshRef.current = setInterval(() => fetchLeads(client.id), 15_000)
    return () => { if (refreshRef.current) clearInterval(refreshRef.current) }
  }, [client, fetchLeads, fetchCampaigns])

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const todayLeads = leads.filter(l => {
    const d = new Date(l.created_at)
    const now = new Date()
    return d.toDateString() === now.toDateString()
  })
  const unprocessed = leads.filter(l => l.lead_status === 'new').length

  async function updateLead(id: string, updates: Partial<FbLead>) {
    await supabase.from('facebook_leads').update(updates).eq('id', id)
    setLeads(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l))
  }

  async function markDone(lead: FbLead) {
    await updateLead(lead.id, { lead_status: 'called' })
  }

  async function callAI(lead: FbLead) {
    if (!client?.agent_warm_id || !client?.retell_phone_number) {
      alert('Chưa cấu hình agent_warm_id hoặc số điện thoại!')
      return
    }
    if (!lead.phone) { alert('Lead chưa có SĐT!'); return }

    setCallingLeadId(lead.id)
    await updateLead(lead.id, { lead_status: 'calling', contacted_at: new Date().toISOString() })

    const res = await fetch('/api/outbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phones: [{ phone: lead.phone, name: lead.real_name ?? lead.commenter_name ?? '' }],
        agentId: client.agent_warm_id,
        fromNumber: client.retell_phone_number,
      }),
    })
    const result = await res.json()
    const ok = result.results?.[0]?.success
    await updateLead(lead.id, { lead_status: ok ? 'calling' : 'no_answer' })
    setCallingLeadId(null)
  }

  const campaignLeads = activeCampaignId
    ? leads.filter(l => l.fb_campaign_id === activeCampaignId)
    : leads

  const getCampaignName = (id: string | null) =>
    id ? (campaigns.find(c => c.id === id)?.name ?? id.slice(0, 8)) : 'Không rõ'

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) return <PageSkeleton />

  return (
    <AppShell clientName={client?.name}>
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <Megaphone className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800">Facebook Ads</h1>
              <p className="text-sm text-gray-500">Quản lý leads & chiến dịch quảng cáo</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs text-red-500 font-medium">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              LIVE
            </span>
            <button
              onClick={() => client && fetchLeads(client.id)}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              title="Làm mới"
            >
              <RefreshCw className={`w-4 h-4 ${leadsLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-gray-100 rounded-xl p-1 w-fit">
          {([['leads', '📥 Leads Mới'], ['campaigns', '📊 Chiến Dịch']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === key
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── TAB 1: LEADS ──────────────────────────────────────────────────── */}
        {activeTab === 'leads' && (
          <div className="space-y-4">
            {/* Stats Header */}
            <div className="flex items-center gap-4">
              <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="text-2xl font-bold text-gray-800">{todayLeads.length}</div>
                <div>
                  <p className="text-xs text-gray-500">Hôm nay</p>
                  <p className="text-xs font-medium text-gray-700">Leads mới</p>
                </div>
              </div>
              <div className="bg-white border border-orange-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="text-2xl font-bold text-orange-500">{unprocessed}</div>
                <div>
                  <p className="text-xs text-gray-500">Chưa xử lý</p>
                  <p className="text-xs font-medium text-gray-700">Cần liên hệ</p>
                </div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="text-2xl font-bold text-gray-800">{leads.length}</div>
                <div>
                  <p className="text-xs text-gray-500">Tổng</p>
                  <p className="text-xs font-medium text-gray-700">Tất cả leads</p>
                </div>
              </div>

              {/* Campaign Filter */}
              {campaigns.length > 0 && (
                <div className="ml-auto">
                  <select
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                    value={activeCampaignId ?? ''}
                    onChange={e => setActiveCampaignId(e.target.value || null)}
                  >
                    <option value="">Tất cả chiến dịch</option>
                    {campaigns.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Lead List */}
            {leadsLoading && campaignLeads.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" />
                <p className="text-sm">Đang tải leads...</p>
              </div>
            ) : campaignLeads.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <Megaphone className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Chưa có leads nào</p>
                <p className="text-xs mt-1">Kết nối n8n để nhận leads tự động</p>
              </div>
            ) : (
              <div className="space-y-3">
                {campaignLeads.map(lead => {
                  const statusInfo = LEAD_STATUS_MAP[lead.lead_status]
                  const priorityInfo = PRIORITY_MAP[lead.priority]
                  const isCalling = callingLeadId === lead.id

                  return (
                    <div
                      key={lead.id}
                      className="bg-white border border-gray-200 rounded-xl p-4 hover:border-indigo-200 hover:shadow-sm transition-all cursor-pointer"
                      onClick={() => setSelectedLead(lead)}
                    >
                      <div className="flex items-start gap-4">
                        {/* Avatar */}
                        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                          <User className="w-4 h-4 text-blue-600" />
                        </div>

                        {/* Main Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-gray-800 text-sm">
                              {lead.commenter_name ?? 'Ẩn danh'}
                            </span>
                            {lead.real_name && (
                              <span className="text-xs text-gray-500">({lead.real_name})</span>
                            )}
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold ${priorityInfo.cls}`}>
                              {priorityInfo.label}
                            </span>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.cls}`}>
                              {statusInfo.pulse && (
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                              )}
                              {statusInfo.label}
                            </span>
                          </div>

                          <div className="flex items-center gap-4 mt-1 text-xs text-gray-500 flex-wrap">
                            {lead.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" /> {lead.phone}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Target className="w-3 h-3" /> {getCampaignName(lead.fb_campaign_id)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {timeAgo(lead.created_at)}
                            </span>
                          </div>

                          {lead.raw_comment && (
                            <p className="text-xs text-gray-400 mt-1.5 line-clamp-1 italic">
                              "{lead.raw_comment}"
                            </p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => callAI(lead)}
                            disabled={isCalling || !lead.phone}
                            title="Gọi AI"
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isCalling
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Phone className="w-3.5 h-3.5" />
                            }
                            Gọi AI
                          </button>
                          <button
                            onClick={() => setSelectedLead(lead)}
                            title="Sửa thông tin"
                            className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => markDone(lead)}
                            title="Đánh dấu xử lý"
                            className="p-1.5 text-gray-400 hover:text-green-600 rounded-lg hover:bg-green-50 transition-colors"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 2: CAMPAIGNS ──────────────────────────────────────────────── */}
        {activeTab === 'campaigns' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                {campaigns.length} chiến dịch
              </p>
              <button
                onClick={() => setShowNewCampaign(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                <Plus className="w-4 h-4" /> Tạo chiến dịch mới
              </button>
            </div>

            {campaignsLoading ? (
              <div className="text-center py-16 text-gray-400">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" />
              </div>
            ) : campaigns.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <Megaphone className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Chưa có chiến dịch nào</p>
                <button
                  onClick={() => setShowNewCampaign(true)}
                  className="mt-3 text-indigo-600 text-sm underline underline-offset-2"
                >
                  Tạo chiến dịch đầu tiên
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {campaigns.map(campaign => {
                  const statusInfo = CAMPAIGN_STATUS_MAP[campaign.status]
                  const convRate = campaign.leads_count > 0
                    ? Math.round((campaign.booked_count / campaign.leads_count) * 100)
                    : 0
                  const callRate = campaign.leads_count > 0
                    ? Math.round((campaign.called_count / campaign.leads_count) * 100)
                    : 0

                  return (
                    <div
                      key={campaign.id}
                      className="bg-white border border-gray-200 rounded-xl p-5 hover:border-indigo-200 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-gray-800">{campaign.name}</h3>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.cls}`}>
                              {statusInfo.label}
                            </span>
                          </div>

                          {campaign.description && (
                            <p className="text-sm text-gray-500 mt-1">{campaign.description}</p>
                          )}

                          {campaign.fb_page_name && (
                            <p className="text-xs text-gray-400 mt-1">
                              📄 Page: {campaign.fb_page_name}
                              {campaign.post_id && ` · Post: ${campaign.post_id.slice(0, 16)}...`}
                            </p>
                          )}

                          {/* Metrics */}
                          <div className="flex items-center gap-5 mt-3">
                            <div className="text-center">
                              <p className="text-lg font-bold text-gray-800">{campaign.leads_count}</p>
                              <p className="text-xs text-gray-400">Leads</p>
                            </div>
                            <div className="text-center">
                              <p className="text-lg font-bold text-blue-600">{campaign.called_count}</p>
                              <p className="text-xs text-gray-400">Đã gọi ({callRate}%)</p>
                            </div>
                            <div className="text-center">
                              <p className="text-lg font-bold text-purple-600">{campaign.booked_count}</p>
                              <p className="text-xs text-gray-400">Đặt lịch</p>
                            </div>
                            <div className="text-center">
                              <p className={`text-lg font-bold ${convRate >= 20 ? 'text-green-600' : convRate >= 10 ? 'text-yellow-600' : 'text-red-500'}`}>
                                {convRate}%
                              </p>
                              <p className="text-xs text-gray-400">CR</p>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <button
                            onClick={() => {
                              setActiveCampaignId(campaign.id)
                              setActiveTab('leads')
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 border border-indigo-200 text-indigo-600 rounded-lg text-xs font-medium hover:bg-indigo-50 transition-colors"
                          >
                            Xem leads <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                          <p className="text-xs text-gray-400">
                            {fmtTime(campaign.created_at)}
                          </p>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      {campaign.leads_count > 0 && (
                        <div className="mt-4">
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-blue-400 to-purple-500 rounded-full transition-all"
                              style={{ width: `${callRate}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-400 mt-1">
                            Đã xử lý {campaign.called_count}/{campaign.leads_count} leads
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {selectedLead && (
        <LeadModal
          lead={selectedLead}
          campaigns={campaigns}
          onClose={() => setSelectedLead(null)}
          onSave={updateLead}
          onCall={lead => { callAI(lead); setSelectedLead(null) }}
        />
      )}

      {showNewCampaign && client && (
        <NewCampaignModal
          tenantId={client.id}
          agentWarmId={client.agent_warm_id}
          onClose={() => setShowNewCampaign(false)}
          onCreated={() => fetchCampaigns(client.id)}
        />
      )}
    </AppShell>
  )
}
