'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import {
  Phone, FileText, ChevronDown,
  Plus, Heart, Calendar, RefreshCw, Flame, X, AlertCircle,
  ChevronRight, Bell, Users,
} from 'lucide-react'
import AppShell from '@/components/ui/app-shell'
import { PageSkeleton } from '@/components/skeleton'
import { useToast } from '@/components/toast'

// ── Types ──────────────────────────────────────────────────────────────────────

type ClientInfo = {
  id: string
  name: string
  agent_cskh_id: string | null
  retell_phone_number: string | null
}

type ContactRow = {
  id: string
  tenant_id: string
  full_name: string | null
  phone: string
  interest_level: string | null
  stage: string
  followup_at: string | null
  birthday: string | null
  notes: string | null
  lead_source: string | null
}

type CareEvent = {
  id: string
  tenant_id: string
  contact_id: string | null
  appointment_id: string | null
  trigger_type: string
  channel: string
  scheduled_at: string
  sent_at: string | null
  status: string
  message_content: string | null
  metadata: Record<string, unknown> | null
}

type AppointmentRow = {
  id: string
  tenant_id: string
  contact_id: string | null
  scheduled_at: string | null
  status: string | null
  contacts?: { full_name: string | null; phone: string } | null
}

type AppointmentWithEvents = AppointmentRow & { events: CareEvent[] }

// ── Constants ──────────────────────────────────────────────────────────────────

const STAGES = [
  { key: 'new',        label: 'Mới quan tâm',    color: 'text-gray-700',  bg: 'bg-gray-50',   border: 'border-gray-200',  dot: 'bg-gray-400',  header: 'bg-gray-100'  },
  { key: 'discussing', label: 'Đang thảo luận',  color: 'text-blue-700',  bg: 'bg-blue-50',   border: 'border-blue-200',  dot: 'bg-blue-400',  header: 'bg-blue-100'  },
  { key: 'pending',    label: 'Chờ xử lý',       color: 'text-amber-700', bg: 'bg-amber-50',  border: 'border-amber-200', dot: 'bg-amber-400', header: 'bg-amber-100' },
  { key: 'closed',     label: 'Đã chốt',          color: 'text-green-700', bg: 'bg-green-50',  border: 'border-green-200', dot: 'bg-green-500', header: 'bg-green-100' },
]

const INTEREST_MAP: Record<string, { label: string; cls: string }> = {
  high:   { label: 'Cao',        cls: 'bg-green-100 text-green-700'   },
  medium: { label: 'Trung bình', cls: 'bg-yellow-100 text-yellow-700' },
  low:    { label: 'Thấp',       cls: 'bg-gray-100 text-gray-500'     },
}

const JOURNEY_STEPS = [
  { key: 'remind_24h',  label: 'Nhắc lịch T-24h', offsetHours: -24  },
  { key: 'confirm_2h',  label: 'Xác nhận T-2h',    offsetHours: -2   },
  { key: 'followup_3d', label: 'Hỏi thăm T+3d',    offsetHours: 72   },
  { key: 'recall_30d',  label: 'Tái khám T+30d',   offsetHours: 720  },
]

const APPT_STATUS: Record<string, { label: string; cls: string }> = {
  confirmed: { label: 'Đã xác nhận',  cls: 'bg-green-100 text-green-700'   },
  pending:   { label: 'Chờ xác nhận', cls: 'bg-yellow-100 text-yellow-700' },
  cancelled: { label: 'Đã hủy',       cls: 'bg-red-100 text-red-700'       },
  completed: { label: 'Đã khám',      cls: 'bg-blue-100 text-blue-700'     },
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDateTime(s: string | null) {
  if (!s) return '--'
  const d = new Date(s)
  const days = ['CN','T2','T3','T4','T5','T6','T7']
  return `${days[d.getDay()]} ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

function fmtShort(s: string | null) {
  if (!s) return '--'
  const d = new Date(s)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

function followupBadge(followup_at: string | null) {
  if (!followup_at) return { cls: 'bg-gray-100 text-gray-400', label: 'Chưa đặt' }
  const diffDays = Math.floor((Date.now() - new Date(followup_at).getTime()) / 86_400_000)
  if (diffDays < 0)   return { cls: 'bg-blue-50 text-blue-600',      label: `Còn ${-diffDays}d`   }
  if (diffDays === 0) return { cls: 'bg-green-100 text-green-700',   label: 'Hôm nay'              }
  if (diffDays < 3)   return { cls: 'bg-green-100 text-green-700',   label: `${diffDays}d trước`   }
  if (diffDays < 7)   return { cls: 'bg-yellow-100 text-yellow-700', label: `${diffDays}d trước`   }
  return                     { cls: 'bg-red-100 text-red-700',       label: `${diffDays}d trước`   }
}

function addHours(iso: string, hours: number) {
  return new Date(new Date(iso).getTime() + hours * 3_600_000).toISOString()
}

function isToday(s: string) {
  return new Date(s).toDateString() === new Date().toDateString()
}

async function authFetch(url: string, init: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> ?? {}),
  }
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
  return fetch(url, { ...init, headers })
}

// ── StageDropdown ──────────────────────────────────────────────────────────────

function StageDropdown({
  contact, onMove, moving,
}: {
  contact: ContactRow
  onMove: (id: string, stage: string) => void
  moving: boolean
}) {
  const [open, setOpen] = useState(false)
  const others = STAGES.filter(s => s.key !== contact.stage)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={moving}
        className="flex items-center gap-1 px-2 py-1 text-xs bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
      >
        <ChevronRight className="w-3 h-3 text-gray-400" />
        Chuyển
        <ChevronDown className="w-3 h-3 text-gray-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px]">
            {others.map(s => (
              <button
                key={s.key}
                onClick={() => { onMove(contact.id, s.key); setOpen(false) }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2 ${s.color}`}
              >
                <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                {s.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── ContactCard ────────────────────────────────────────────────────────────────

function ContactCard({
  contact, onCall, onNote, onMove, calling, moving,
}: {
  contact: ContactRow
  onCall: (c: ContactRow) => void
  onNote: (c: ContactRow) => void
  onMove: (id: string, stage: string) => void
  calling: boolean
  moving: boolean
}) {
  const badge    = followupBadge(contact.followup_at)
  const interest = contact.interest_level ? INTEREST_MAP[contact.interest_level] : null

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{contact.full_name || '—'}</p>
          <p className="text-xs text-gray-400">{contact.phone}</p>
        </div>
        {interest && (
          <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${interest.cls}`}>
            {interest.label}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {contact.lead_source && (
          <span className="px-1.5 py-0.5 bg-purple-50 text-purple-600 text-[10px] rounded">
            {contact.lead_source}
          </span>
        )}
        <span className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${badge.cls}`}>
          📅 {badge.label}
        </span>
      </div>

      {contact.notes && (
        <p className="text-[11px] text-gray-400 italic mb-2 line-clamp-1">{contact.notes}</p>
      )}

      <div className="flex items-center gap-1.5 pt-1 border-t border-gray-100">
        <button
          onClick={() => onCall(contact)}
          disabled={calling}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          <Phone className="w-3 h-3" />
          {calling ? '...' : 'Gọi AI'}
        </button>
        <button
          onClick={() => onNote(contact)}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
        >
          <FileText className="w-3 h-3" />
          Ghi chú
        </button>
        <StageDropdown contact={contact} onMove={onMove} moving={moving} />
      </div>
    </div>
  )
}

// ── EventBadge ─────────────────────────────────────────────────────────────────

function EventBadge({ event }: { event: CareEvent }) {
  const step  = JOURNEY_STEPS.find(s => s.key === event.trigger_type)
  const label = step?.label ?? event.trigger_type

  let icon: string, cls: string
  if (event.status === 'sent')         { icon = '✅'; cls = 'bg-green-50 border-green-200 text-green-700'   }
  else if (event.status === 'failed')  { icon = '❌'; cls = 'bg-red-50 border-red-200 text-red-600'         }
  else                                  { icon = '⏳'; cls = 'bg-yellow-50 border-yellow-200 text-yellow-700' }

  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs ${cls}`}>
      <span>{icon}</span>
      <span className="font-medium">{label}</span>
      <span className="text-[10px] opacity-70">{fmtShort(event.scheduled_at)}</span>
    </div>
  )
}

// ── AppointmentJourneyCard ────────────────────────────────────────────────────

function AppointmentJourneyCard({
  appt, onCreateJourney, creating,
}: {
  appt: AppointmentWithEvents
  onCreateJourney: (a: AppointmentRow) => void
  creating: boolean
}) {
  const contact   = appt.contacts
  const hasEvents = appt.events.length > 0
  const statusCfg = APPT_STATUS[appt.status ?? ''] ?? { label: appt.status ?? '--', cls: 'bg-gray-100 text-gray-500' }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
            <Calendar className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">{contact?.full_name ?? '—'}</p>
            <p className="text-xs text-gray-400">{contact?.phone ?? ''} · {fmtDateTime(appt.scheduled_at)}</p>
          </div>
        </div>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusCfg.cls}`}>
          {statusCfg.label}
        </span>
      </div>

      {hasEvents ? (
        <div className="flex flex-wrap gap-2">
          {appt.events.map(ev => <EventBadge key={ev.id} event={ev} />)}
        </div>
      ) : (
        <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
          <p className="text-xs text-gray-400 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            Chưa có hành trình tự động
          </p>
          <button
            onClick={() => onCreateJourney(appt)}
            disabled={creating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            <Plus className="w-3 h-3" />
            {creating ? 'Đang tạo...' : 'Tạo Journey'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function CskhPage() {
  const router     = useRouter()
  const { toast }  = useToast()

  const [loading, setLoading]       = useState(true)
  const [clientName, setClientName] = useState<string | null>(null)
  const [clientId, setClientId]     = useState<string | null>(null)
  const clientRef = useRef<ClientInfo | null>(null)

  const [activeTab, setActiveTab] = useState<'pipeline' | 'journey'>('pipeline')

  const [contacts, setContacts]         = useState<ContactRow[]>([])
  const [appointments, setAppointments] = useState<AppointmentRow[]>([])
  const [careEvents, setCareEvents]     = useState<CareEvent[]>([])

  const [callingId, setCallingId]   = useState<string | null>(null)
  const [movingId, setMovingId]     = useState<string | null>(null)
  const [creatingId, setCreatingId] = useState<string | null>(null)

  const [noteContact, setNoteContact] = useState<ContactRow | null>(null)
  const [noteText, setNoteText]       = useState('')
  const [savingNote, setSavingNote]   = useState(false)

  // ── Data loaders ─────────────────────────────────────────────────────────────

  const loadContacts = useCallback(async (tid: string) => {
    const { data } = await supabase
      .from('contacts')
      .select('id, tenant_id, full_name, phone, interest_level, stage, followup_at, birthday, notes, lead_source')
      .eq('tenant_id', tid)
      .in('stage', ['new', 'discussing', 'pending', 'closed'])
      .order('followup_at', { ascending: true, nullsFirst: false })
    setContacts((data ?? []) as ContactRow[])
  }, [])

  const loadJourney = useCallback(async (tid: string) => {
    const since = new Date()
    since.setDate(since.getDate() - 30)

    const [{ data: appts }, { data: events }] = await Promise.all([
      supabase
        .from('appointments')
        .select('id, tenant_id, contact_id, scheduled_at, status, contacts(full_name, phone)')
        .eq('tenant_id', tid)
        .gte('scheduled_at', since.toISOString())
        .order('scheduled_at', { ascending: false })
        .limit(50),
      supabase
        .from('cskh_care_events')
        .select('*')
        .eq('tenant_id', tid)
        .order('scheduled_at', { ascending: true }),
    ])

    setAppointments((appts ?? []) as unknown as AppointmentRow[])
    setCareEvents((events ?? []) as CareEvent[])
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: cu } = await supabase
        .from('client_users').select('client_id').eq('user_id', user.id).single()
      if (!cu) { setLoading(false); return }

      const { data: c } = await supabase
        .from('clients')
        .select('id, name, agent_cskh_id, retell_phone_number')
        .eq('id', cu.client_id).single()
      if (!c) { setLoading(false); return }

      clientRef.current = c as ClientInfo
      setClientName((c as ClientInfo).name)
      setClientId(cu.client_id)

      await Promise.all([loadContacts(cu.client_id), loadJourney(cu.client_id)])
      setLoading(false)
    }
    init()
  }, [router, loadContacts, loadJourney])

  // ── Actions ───────────────────────────────────────────────────────────────────

  async function handleCallAI(contact: ContactRow) {
    const cli = clientRef.current
    if (!cli?.agent_cskh_id || !cli?.retell_phone_number) {
      toast('Chưa cấu hình agent CSKH cho tài khoản này', 'error')
      return
    }
    setCallingId(contact.id)
    try {
      const res = await authFetch('/api/outbound', {
        method: 'POST',
        body: JSON.stringify({
          phones:     [{ phone: contact.phone, name: contact.full_name ?? '' }],
          agentId:    cli.agent_cskh_id,
          fromNumber: cli.retell_phone_number,
        }),
      })
      const json = await res.json()
      const result = json?.results?.[0]
      if (result?.success) toast(`Đang gọi ${contact.full_name}...`, 'success')
      else toast(result?.error ?? 'Gọi thất bại', 'error')
    } catch {
      toast('Không thể kết nối cuộc gọi', 'error')
    }
    setTimeout(() => setCallingId(null), 3000)
  }

  async function handleMoveStage(contactId: string, newStage: string) {
    setMovingId(contactId)
    const { error } = await supabase.from('contacts').update({ stage: newStage }).eq('id', contactId)
    if (error) {
      toast('Không thể chuyển stage', 'error')
    } else {
      setContacts(prev => prev.map(c => c.id === contactId ? { ...c, stage: newStage } : c))
      const stageName = STAGES.find(s => s.key === newStage)?.label ?? newStage
      toast(`Đã chuyển sang "${stageName}"`, 'success')
    }
    setMovingId(null)
  }

  function openNote(contact: ContactRow) {
    setNoteContact(contact)
    setNoteText(contact.notes ?? '')
  }

  async function saveNote() {
    if (!noteContact) return
    setSavingNote(true)
    const { error } = await supabase
      .from('contacts').update({ notes: noteText }).eq('id', noteContact.id)
    if (error) {
      toast('Lưu thất bại', 'error')
    } else {
      setContacts(prev => prev.map(c => c.id === noteContact.id ? { ...c, notes: noteText } : c))
      toast('Đã lưu ghi chú', 'success')
      setNoteContact(null)
    }
    setSavingNote(false)
  }

  async function handleCreateJourney(appt: AppointmentRow) {
    if (!appt.scheduled_at || !clientId) return
    setCreatingId(appt.id)
    const rows = JOURNEY_STEPS.map(step => ({
      tenant_id:       clientId,
      contact_id:      appt.contact_id,
      appointment_id:  appt.id,
      trigger_type:    step.key,
      channel:         'ai_call',
      scheduled_at:    addHours(appt.scheduled_at!, step.offsetHours),
      status:          'pending',
      message_content: null,
      metadata:        null,
    }))
    const { error } = await supabase.from('cskh_care_events').insert(rows)
    if (error) {
      toast('Tạo journey thất bại', 'error')
    } else {
      toast('Đã tạo hành trình tự động', 'success')
      await loadJourney(clientId)
    }
    setCreatingId(null)
  }

  function handleRefresh() {
    if (!clientId) return
    loadContacts(clientId)
    loadJourney(clientId)
  }

  // ── Derived ───────────────────────────────────────────────────────────────────

  const byStage = Object.fromEntries(
    STAGES.map(s => [s.key, contacts.filter(c => c.stage === s.key)])
  )

  const appointmentsWithEvents: AppointmentWithEvents[] = appointments.map(appt => ({
    ...appt,
    events: careEvents.filter(e => e.appointment_id === appt.id),
  }))

  const todayStats = {
    remind:   careEvents.filter(e => ['remind_24h','confirm_2h'].includes(e.trigger_type) && isToday(e.scheduled_at)).length,
    followup: careEvents.filter(e => e.trigger_type === 'followup_3d' && isToday(e.scheduled_at)).length,
    birthday: careEvents.filter(e => e.trigger_type === 'birthday' && isToday(e.scheduled_at)).length,
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) return <PageSkeleton />

  return (
    <AppShell clientName={clientName}>

      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-pink-100 flex items-center justify-center">
            <Heart className="w-5 h-5 text-pink-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Chăm Sóc Khách Hàng</h1>
            <p className="text-sm text-gray-400">Quản lý follow-up & hành trình tự động</p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Làm mới
        </button>
      </div>

      {/* Tab switch */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-6 w-fit">
        <button
          onClick={() => setActiveTab('pipeline')}
          className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'pipeline'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Flame className="w-4 h-4 text-orange-500" />
          🔥 Follow-up Nhu Cầu
        </button>
        <button
          onClick={() => setActiveTab('journey')}
          className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'journey'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Calendar className="w-4 h-4 text-indigo-500" />
          📅 Hành Trình Tự Động
        </button>
      </div>

      {/* ─────────── Section 1: Kanban Pipeline ─────────── */}
      {activeTab === 'pipeline' && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-base font-semibold text-gray-800">Pipeline Follow-up</h2>
            <span className="px-2 py-0.5 bg-orange-50 text-orange-600 text-xs rounded-full font-medium">
              {contacts.length} khách
            </span>
          </div>

          <div className="grid grid-cols-4 gap-4">
            {STAGES.map(stage => {
              const cols = byStage[stage.key] ?? []
              return (
                <div key={stage.key} className={`rounded-xl border ${stage.border} overflow-hidden`}>
                  <div className={`${stage.header} px-4 py-3 flex items-center justify-between`}>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${stage.dot}`} />
                      <span className={`text-sm font-semibold ${stage.color}`}>{stage.label}</span>
                    </div>
                    <span className="text-xs text-gray-500 bg-white rounded-full px-2 py-0.5 font-medium">
                      {cols.length}
                    </span>
                  </div>

                  <div className={`${stage.bg} p-2 space-y-2 min-h-[200px]`}>
                    {cols.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <Users className="w-8 h-8 text-gray-200 mb-2" />
                        <p className="text-xs text-gray-300">Trống</p>
                      </div>
                    )}
                    {cols.map(contact => (
                      <ContactCard
                        key={contact.id}
                        contact={contact}
                        onCall={handleCallAI}
                        onNote={openNote}
                        onMove={handleMoveStage}
                        calling={callingId === contact.id}
                        moving={movingId === contact.id}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ─────────── Section 2: Journey Timeline ─────────── */}
      {activeTab === 'journey' && (
        <div>
          {/* Mini dashboard */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Bell className="w-4 h-4 text-blue-500" />
                <span className="text-xs font-medium text-blue-600">Nhắc lịch hôm nay</span>
              </div>
              <p className="text-3xl font-bold text-blue-700">{todayStats.remind}</p>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Phone className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-medium text-amber-600">Hỏi thăm hôm nay</span>
              </div>
              <p className="text-3xl font-bold text-amber-700">{todayStats.followup}</p>
            </div>
            <div className="bg-pink-50 border border-pink-100 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Heart className="w-4 h-4 text-pink-500" />
                <span className="text-xs font-medium text-pink-600">Sinh nhật hôm nay</span>
              </div>
              <p className="text-3xl font-bold text-pink-700">{todayStats.birthday}</p>
            </div>
          </div>

          {/* List */}
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-base font-semibold text-gray-800">Lịch Hẹn & Hành Trình</h2>
            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-xs rounded-full font-medium">
              {appointments.length} lịch hẹn
            </span>
          </div>

          {appointments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Calendar className="w-12 h-12 text-gray-200 mb-3" />
              <p className="text-gray-400 font-medium">Chưa có lịch hẹn nào</p>
              <p className="text-sm text-gray-300 mt-1">Lịch hẹn trong 30 ngày gần đây sẽ hiện ở đây</p>
            </div>
          ) : (
            <div className="space-y-3">
              {appointmentsWithEvents.map(appt => (
                <AppointmentJourneyCard
                  key={appt.id}
                  appt={appt}
                  onCreateJourney={handleCreateJourney}
                  creating={creatingId === appt.id}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─────────── Note Modal ─────────── */}
      {noteContact && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-800">Ghi chú</h3>
                <p className="text-xs text-gray-400">{noteContact.full_name} · {noteContact.phone}</p>
              </div>
              <button onClick={() => setNoteContact(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              rows={5}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Nhập ghi chú về khách hàng..."
              autoFocus
            />
            <div className="flex gap-2 mt-4 justify-end">
              <button
                onClick={() => setNoteContact(null)}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={saveNote}
                disabled={savingNote}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {savingNote ? 'Đang lưu...' : 'Lưu ghi chú'}
              </button>
            </div>
          </div>
        </div>
      )}

    </AppShell>
  )
}
