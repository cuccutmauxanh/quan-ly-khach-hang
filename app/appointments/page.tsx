'use client'

import { useEffect, useState } from 'react'
import { supabase, type Client, type Appointment } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { CalendarCheck, Clock, CheckCircle2, XCircle } from 'lucide-react'
import AppShell from '@/components/ui/app-shell'
import { PageSkeleton } from '@/components/skeleton'

type StatusFilter = 'all' | 'upcoming' | 'today' | 'past'

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  confirmed: { label: 'Đã xác nhận', color: 'bg-green-100 text-green-700', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  pending:   { label: 'Chờ xác nhận', color: 'bg-yellow-100 text-yellow-700', icon: <Clock className="w-3.5 h-3.5" /> },
  cancelled: { label: 'Đã hủy',       color: 'bg-red-100 text-red-700',    icon: <XCircle className="w-3.5 h-3.5" /> },
  completed: { label: 'Đã khám',      color: 'bg-blue-100 text-blue-700',  icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
}

function getTimeStatus(scheduledAt: string | null): 'upcoming' | 'today' | 'past' {
  if (!scheduledAt) return 'upcoming'
  const d = new Date(scheduledAt)
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(todayStart.getTime() + 86400000)
  if (d >= todayStart && d < todayEnd) return 'today'
  if (d > todayEnd) return 'upcoming'
  return 'past'
}

function formatFullDate(s: string | null) {
  if (!s) return '--'
  const d = new Date(s)
  const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
  return `${days[d.getDay()]}, ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} lúc ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

function formatGroupDate(s: string | null) {
  if (!s) return 'Chưa xác định'
  const d = new Date(s)
  const today = new Date()
  const tomorrow = new Date(today.getTime() + 86400000)
  if (d.toDateString() === today.toDateString()) return 'Hôm nay'
  if (d.toDateString() === tomorrow.toDateString()) return 'Ngày mai'
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

export default function AppointmentsPage() {
  const router = useRouter()
  const [client, setClient] = useState<Client | null>(null)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<StatusFilter>('all')

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: cu } = await supabase.from('client_users').select('client_id').eq('user_id', user.id).single()
      if (!cu) { setLoading(false); return }
      const { data: c } = await supabase.from('clients').select('*').eq('id', cu.client_id).single()
      setClient(c)

      // Fetch appointments with contact info
      const { data: appts } = await supabase
        .from('appointments')
        .select('*, contacts(full_name, phone)')
        .eq('tenant_id', cu.client_id)
        .order('scheduled_at', { ascending: true })

      // Also include calls with appointment_booked=true but no entry in appointments yet
      const { data: calls } = await supabase
        .from('calls')
        .select('id, tenant_id, contact_id, appointment_datetime, appointment_notes, contact_name, contact_phone, created_at')
        .eq('tenant_id', cu.client_id)
        .eq('appointment_booked', true)
        .not('appointment_datetime', 'is', null)

      const apptSet = new Set((appts ?? []).map(a => a.call_id).filter(Boolean))

      const callAppts: Appointment[] = (calls ?? [])
        .filter(call => !apptSet.has(call.id))
        .map(call => ({
          id: `call-${call.id}`,
          tenant_id: call.tenant_id,
          contact_id: call.contact_id,
          call_id: call.id,
          scheduled_at: call.appointment_datetime,
          status: 'confirmed',
          appointment_notes: call.appointment_notes,
          created_at: call.created_at,
          contacts: { full_name: call.contact_name, phone: call.contact_phone ?? '' },
        }))

      setAppointments([...(appts ?? []), ...callAppts].sort((a, b) => {
        if (!a.scheduled_at) return 1
        if (!b.scheduled_at) return -1
        return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
      }))
      setLoading(false)
    }
    init()
  }, [router])

  async function updateStatus(id: string, status: string) {
    if (id.startsWith('call-')) return
    await supabase.from('appointments').update({ status }).eq('id', id)
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status } : a))
  }

  const filtered = appointments.filter(a => {
    if (filter === 'all') return true
    return getTimeStatus(a.scheduled_at) === filter
  })

  // Group by date
  const groups = filtered.reduce<Record<string, Appointment[]>>((acc, a) => {
    const key = a.scheduled_at ? new Date(a.scheduled_at).toDateString() : 'none'
    if (!acc[key]) acc[key] = []
    acc[key].push(a)
    return acc
  }, {})

  const todayCount = appointments.filter(a => getTimeStatus(a.scheduled_at) === 'today').length
  const upcomingCount = appointments.filter(a => getTimeStatus(a.scheduled_at) === 'upcoming').length
  const pastCount = appointments.filter(a => getTimeStatus(a.scheduled_at) === 'past').length

  if (loading) return <PageSkeleton />

  const tabs: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'all',      label: 'Tất cả',   count: appointments.length },
    { key: 'today',    label: 'Hôm nay',  count: todayCount },
    { key: 'upcoming', label: 'Sắp tới',  count: upcomingCount },
    { key: 'past',     label: 'Đã qua',   count: pastCount },
  ]

  return (
    <AppShell clientName={client?.name}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Lịch hẹn</h2>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <CalendarCheck className="w-4 h-4 text-indigo-500" />
          <span>{appointments.length} lịch hẹn</span>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-3" style={{ marginBottom: 20 }}>
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
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === t.key ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-50'
              }`}>
              {t.label}
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${filter === t.key ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500'}`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-sm">
            {appointments.length === 0 ? 'Chưa có lịch hẹn nào. Lịch hẹn sẽ tự động xuất hiện sau cuộc gọi thành công.' : 'Không có lịch hẹn trong mục này.'}
          </div>
        ) : (
          <div className="px-4 py-4 space-y-5">
            {Object.entries(groups).map(([dateKey, items]) => {
              const firstItem = items[0]
              const timeStatus = getTimeStatus(firstItem.scheduled_at)
              const groupLabel = formatGroupDate(firstItem.scheduled_at)
              const dotColor = timeStatus === 'today' ? 'bg-indigo-500' : timeStatus === 'upcoming' ? 'bg-green-500' : 'bg-gray-300'

              return (
                <div key={dateKey}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-2 h-2 rounded-full ${dotColor}`} />
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{groupLabel}</span>
                    <div className="flex-1 h-px bg-gray-100" />
                  </div>
                  <div className="space-y-2">
                    {items.map(a => {
                      const sc = STATUS_CONFIG[a.status ?? 'confirmed'] ?? STATUS_CONFIG.confirmed
                      const contact = a.contacts
                      return (
                        <div key={a.id} className="flex items-start gap-4 p-4 rounded-xl border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-colors">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-gray-800 text-sm">
                                {contact?.full_name ?? 'Khách hàng'}
                              </span>
                              <span className="text-gray-400 text-xs">{contact?.phone}</span>
                            </div>
                            <p className="text-xs text-indigo-600 font-medium">{formatFullDate(a.scheduled_at)}</p>
                            {a.appointment_notes && (
                              <p className="text-xs text-gray-500 mt-1">{a.appointment_notes}</p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${sc.color}`}>
                              {sc.icon}{sc.label}
                            </span>
                            {!a.id.startsWith('call-') && a.status !== 'cancelled' && a.status !== 'completed' && (
                              <div className="flex gap-1">
                                <button onClick={() => updateStatus(a.id, 'completed')}
                                  className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100">
                                  Đã khám
                                </button>
                                <button onClick={() => updateStatus(a.id, 'cancelled')}
                                  className="text-xs px-2 py-1 bg-red-50 text-red-500 rounded-lg hover:bg-red-100">
                                  Hủy
                                </button>
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
    </AppShell>
  )
}
