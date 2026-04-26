'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase, type Client, type Contact } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/ui/app-shell'
import { PageSkeleton } from '@/components/skeleton'
import { useToast } from '@/components/toast'
import { Phone, ChevronRight, User } from 'lucide-react'

type Stage = { key: string; label: string; sublabel: string; color: string; bg: string; border: string; dot: string }

const STAGES: Stage[] = [
  { key: 'new',       label: 'Mới',         sublabel: 'Chưa liên hệ',    color: 'text-gray-600',  bg: 'bg-gray-50',   border: 'border-gray-200', dot: 'bg-gray-400'   },
  { key: 'contacted', label: 'Đã liên hệ',  sublabel: 'Chưa quan tâm',   color: 'text-blue-600',  bg: 'bg-blue-50',   border: 'border-blue-200', dot: 'bg-blue-400'   },
  { key: 'interest',  label: 'Quan tâm',    sublabel: 'Mức độ cao',      color: 'text-amber-600', bg: 'bg-amber-50',  border: 'border-amber-200',dot: 'bg-amber-400'  },
  { key: 'booked',    label: 'Đặt lịch',    sublabel: 'Đã có hẹn khám', color: 'text-green-600', bg: 'bg-green-50',  border: 'border-green-200',dot: 'bg-green-500'  },
]

type ContactWithStage = Contact & { stage: string; hasAppointment: boolean }

function getStage(c: Contact, bookedIds: Set<string>): string {
  if (bookedIds.has(c.id)) return 'booked'
  if (c.interest_level === 'high') return 'interest'
  if ((c.call_count ?? 0) > 0) return 'contacted'
  return 'new'
}

function formatPhone(p: string) {
  return p.replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3')
}

function timeAgo(dateStr: string | null) {
  if (!dateStr) return null
  const diff = Date.now() - new Date(dateStr).getTime()
  const d = Math.floor(diff / 86400000)
  if (d === 0) return 'Hôm nay'
  if (d === 1) return 'Hôm qua'
  return `${d} ngày trước`
}

function ContactCard({ contact, stage, client, onMoved, onCall }: {
  contact: ContactWithStage; stage: Stage; client: Client | null
  onMoved: (id: string, newStage: string) => void
  onCall: (c: ContactWithStage) => void
}) {
  const [moving, setMoving] = useState(false)

  const nextStage = STAGES[STAGES.findIndex(s => s.key === stage.key) + 1]
  const prevStage = STAGES[STAGES.findIndex(s => s.key === stage.key) - 1]

  async function moveStage(targetKey: string) {
    setMoving(true)
    const interestMap: Record<string, string | null> = {
      new: null, contacted: 'low', interest: 'high', booked: 'high',
    }
    await supabase.from('contacts').update({ interest_level: interestMap[targetKey] }).eq('id', contact.id)
    onMoved(contact.id, targetKey)
    setMoving(false)
  }

  return (
    <div className={`bg-white rounded-xl border ${stage.border} p-3 shadow-sm hover:shadow-md transition-shadow`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-7 h-7 rounded-full ${stage.bg} flex items-center justify-center shrink-0`}>
            <User className={`w-3.5 h-3.5 ${stage.color}`} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 truncate">{contact.full_name || 'Không tên'}</p>
            <p className="text-xs text-gray-400">{formatPhone(contact.phone)}</p>
          </div>
        </div>
        <button
          onClick={() => onCall(contact)}
          disabled={moving}
          className="shrink-0 w-7 h-7 bg-indigo-50 hover:bg-indigo-100 rounded-lg flex items-center justify-center transition-colors"
        >
          <Phone className="w-3.5 h-3.5 text-indigo-600" />
        </button>
      </div>

      {contact.last_called_at && (
        <p className="text-xs text-gray-400 mb-2">Gọi lần cuối: {timeAgo(contact.last_called_at)}</p>
      )}
      {contact.notes && (
        <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-2 py-1 truncate mb-2">{contact.notes}</p>
      )}

      {/* Move buttons */}
      {stage.key !== 'booked' && (
        <div className="flex gap-1 mt-1">
          {prevStage && (
            <button onClick={() => moveStage(prevStage.key)} disabled={moving}
              className="flex-1 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg py-1 transition-colors border border-gray-100">
              ← {prevStage.label}
            </button>
          )}
          {nextStage && (
            <button onClick={() => moveStage(nextStage.key)} disabled={moving}
              className="flex-1 text-xs text-indigo-600 hover:bg-indigo-50 rounded-lg py-1 transition-colors border border-indigo-100 font-medium">
              {nextStage.label} →
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function PipelinePage() {
  const router = useRouter()
  const { toast } = useToast()
  const [client, setClient] = useState<Client | null>(null)
  const [contacts, setContacts] = useState<ContactWithStage[]>([])
  const [loading, setLoading] = useState(true)
  const [callingId, setCallingId] = useState<string | null>(null)

  const fetchData = useCallback(async (clientId: string) => {
    const [{ data: ctcs }, { data: appts }] = await Promise.all([
      supabase.from('contacts').select('*').eq('tenant_id', clientId).order('created_at', { ascending: false }),
      supabase.from('appointments').select('contact_id').eq('tenant_id', clientId).neq('status', 'cancelled'),
    ])
    const bookedIds = new Set((appts ?? []).map(a => a.contact_id).filter(Boolean) as string[])
    setContacts((ctcs ?? []).map(c => ({ ...c, stage: getStage(c, bookedIds), hasAppointment: bookedIds.has(c.id) })))
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: cu } = await supabase.from('client_users').select('client_id').eq('user_id', user.id).single()
      if (!cu) { setLoading(false); return }
      const { data: c } = await supabase.from('clients').select('*').eq('id', cu.client_id).single()
      setClient(c)
      await fetchData(cu.client_id)
      setLoading(false)
    }
    init()
  }, [router, fetchData])

  function handleMoved(id: string, newStage: string) {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, stage: newStage, interest_level: newStage === 'interest' || newStage === 'booked' ? 'high' : newStage === 'contacted' ? 'low' : null } : c))
  }

  async function handleCall(contact: ContactWithStage) {
    if (!client?.retell_phone_number || !client?.retell_agent_id) {
      toast('Chưa cấu hình agent gọi đi', 'error'); return
    }
    setCallingId(contact.id)
    try {
      const res = await fetch('/api/outbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phones: [{ phone: contact.phone, name: contact.full_name }],
          agentId: client.agent_cold_id || client.retell_agent_id,
          fromNumber: client.retell_phone_number,
        }),
      })
      const { results } = await res.json()
      if (results?.[0]?.success) toast(`Đang gọi ${contact.full_name || contact.phone}`, 'success')
      else toast(results?.[0]?.error || 'Lỗi gọi', 'error')
    } catch {
      toast('Lỗi kết nối', 'error')
    }
    setCallingId(null)
  }

  const byStage = (key: string) => contacts.filter(c => c.stage === key)

  if (loading) return <PageSkeleton />

  return (
    <AppShell clientName={client?.name}>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-800">Khách tiềm năng</h1>
        <p className="text-sm text-gray-400 mt-0.5">Pipeline theo dõi hành trình từ lead đến khách hàng</p>
      </div>

      {/* Tổng quan */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {STAGES.map(s => (
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

      {/* Kanban */}
      <div className="grid grid-cols-4 gap-4" style={{ alignItems: 'start' }}>
        {STAGES.map(stage => (
          <div key={stage.key}>
            <div className={`flex items-center gap-2 px-1 mb-3`}>
              <span className={`w-2.5 h-2.5 rounded-full ${stage.dot}`} />
              <span className="text-sm font-semibold text-gray-700">{stage.label}</span>
              <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${stage.bg} ${stage.color}`}>
                {byStage(stage.key).length}
              </span>
            </div>
            <div className="space-y-2">
              {byStage(stage.key).length === 0 ? (
                <div className={`border-2 border-dashed ${stage.border} rounded-xl p-6 text-center`}>
                  <p className="text-xs text-gray-400">Không có</p>
                </div>
              ) : (
                byStage(stage.key).map(contact => (
                  <ContactCard
                    key={contact.id}
                    contact={contact}
                    stage={stage}
                    client={client}
                    onMoved={handleMoved}
                    onCall={handleCall}
                  />
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {callingId && (
        <div className="fixed bottom-4 right-4 bg-indigo-600 text-white px-4 py-2 rounded-xl shadow-lg text-sm flex items-center gap-2">
          <Phone className="w-4 h-4 animate-pulse" /> Đang kết nối cuộc gọi...
        </div>
      )}
    </AppShell>
  )
}
