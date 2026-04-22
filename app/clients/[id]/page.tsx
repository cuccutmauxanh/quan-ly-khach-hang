'use client'

import { useEffect, useState } from 'react'
import { supabase, type Client, type Call } from '@/lib/supabase'
import { ArrowLeft, Phone, Mail, MessageCircle, Pencil } from 'lucide-react'
import Link from 'next/link'
import { use } from 'react'
import ClientModal from '@/components/ClientModal'
import { PageSkeleton } from '@/components/skeleton'

function formatDate(s: string | null) {
  if (!s) return '--'
  const d = new Date(s)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

function formatDateTime(s: string) {
  const d = new Date(s)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

function formatDuration(s: number | null) {
  if (!s) return '--'
  return `${Math.floor(s/60)}p ${s%60}s`
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-500 shrink-0 w-36">{label}</span>
      <span className="text-sm text-gray-800 text-right break-all">{value ?? '--'}</span>
    </div>
  )
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active:  { label: 'Hoạt động', color: 'bg-green-100 text-green-700' },
  trial:   { label: 'Dùng thử',  color: 'bg-purple-100 text-purple-700' },
  paused:  { label: 'Tạm dừng',  color: 'bg-yellow-100 text-yellow-700' },
  churned: { label: 'Đã nghỉ',   color: 'bg-red-100 text-red-700' },
}

const DIRECTION_MAP: Record<string, { label: string; color: string }> = {
  inbound:  { label: 'Gọi đến', color: 'bg-blue-100 text-blue-700' },
  outbound: { label: 'Gọi đi',  color: 'bg-green-100 text-green-700' },
}

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [client, setClient] = useState<Client | null>(null)
  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  async function fetchData() {
    setLoading(true)
    const [{ data: c }, { data: cl }] = await Promise.all([
      supabase.from('clients').select('*').eq('id', id).single(),
      supabase.from('calls').select('*').eq('tenant_id', id).order('created_at', { ascending: false }).limit(20),
    ])
    setClient(c)
    setCalls(cl ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [id])

  if (loading) return <PageSkeleton />
  if (!client) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Không tìm thấy khách hàng.</div>

  const sta = STATUS_MAP[client.status ?? ''] ?? { label: client.status ?? '--', color: 'bg-gray-100 text-gray-600' }
  const totalCalls = calls.length
  const inbound = calls.filter(c => c.direction === 'inbound').length
  const outbound = calls.filter(c => c.direction === 'outbound').length
  const booked = calls.filter(c => c.appointment_booked).length

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-xl font-bold text-indigo-600">AutoVoice Pro — Admin</h1>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/" className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft className="w-5 h-5 text-gray-500" /></Link>
          <h2 className="text-2xl font-bold text-gray-800">{client.name}</h2>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sta.color}`}>{sta.label}</span>
          <button onClick={() => setModalOpen(true)} className="ml-auto flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
            <Pencil className="w-4 h-4" /> Chỉnh Sửa
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Tổng Cuộc Gọi', value: totalCalls, color: 'text-indigo-600', bg: 'bg-indigo-50' },
            { label: 'Gọi Đến', value: inbound, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Gọi Đi', value: outbound, color: 'text-green-600', bg: 'bg-green-50' },
            { label: 'Đặt Lịch', value: booked, color: 'text-purple-600', bg: 'bg-purple-50' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl p-4`}>
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Left column */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-700 mb-3 text-sm">Thông Tin Cơ Bản</h3>
              <InfoRow label="Tên doanh nghiệp" value={client.name} />
              <InfoRow label="Ngành" value={client.industry} />
              <InfoRow label="Gói dịch vụ" value={client.package} />
              <InfoRow label="Trạng thái" value={<span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sta.color}`}>{sta.label}</span>} />
              <InfoRow label="Ngày bắt đầu" value={formatDate(client.contract_start)} />
              <InfoRow label="Hết trial" value={formatDate(client.trial_ends_at)} />
              <InfoRow label="Phí hàng tháng" value={client.monthly_fee ? client.monthly_fee.toLocaleString('vi-VN') + ' đ' : '--'} />
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-700 mb-3 text-sm">Liên Hệ</h3>
              <InfoRow label="Người liên hệ" value={client.owner_name} />
              <InfoRow label="Điện thoại" value={client.owner_phone ? <a href={`tel:${client.owner_phone}`} className="text-indigo-600 flex items-center gap-1 justify-end"><Phone className="w-3 h-3" />{client.owner_phone}</a> : '--'} />
              <InfoRow label="Zalo" value={client.owner_zalo} />
              <InfoRow label="Email" value={client.contact_email ? <a href={`mailto:${client.contact_email}`} className="text-indigo-600 flex items-center gap-1 justify-end"><Mail className="w-3 h-3" />{client.contact_email}</a> : '--'} />
              <InfoRow label="Telegram Chat ID" value={client.telegram_chat_id ? <span className="flex items-center gap-1 justify-end"><MessageCircle className="w-3 h-3" />{client.telegram_chat_id}</span> : '--'} />
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-700 mb-3 text-sm">Cấu Hình AI & Kỹ Thuật</h3>
              <InfoRow label="Retell Agent ID" value={<code className="text-xs bg-gray-100 px-1 rounded">{client.retell_agent_id ?? '--'}</code>} />
              <InfoRow label="Số điện thoại AI" value={client.retell_phone_number} />
              <InfoRow label="Schema Supabase" value={<code className="text-xs bg-gray-100 px-1 rounded">{client.supabase_schema ?? '--'}</code>} />
              <InfoRow label="FreeSWITCH" value={client.zapbx_ip ? `${client.zapbx_ip}:${client.zapbx_port ?? 5060}` : '--'} />
              <InfoRow label="Cal.com Event ID" value={client.calcom_event_type_id} />
            </div>

            {client.notes && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="font-semibold text-gray-700 mb-2 text-sm">Ghi Chú Nội Bộ</h3>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{client.notes}</p>
              </div>
            )}
          </div>

          {/* Right column — call history */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden h-fit">
            <div className="px-4 py-3 border-b border-gray-100 font-semibold text-gray-700 text-sm">
              Lịch Sử Cuộc Gọi (20 gần nhất)
            </div>
            {calls.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">Chưa có cuộc gọi nào.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Thời gian</th>
                      <th className="px-3 py-2 text-left">Loại</th>
                      <th className="px-3 py-2 text-right">Thời lượng</th>
                      <th className="px-3 py-2 text-center">Đặt lịch</th>
                      <th className="px-3 py-2 text-left">Tóm tắt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {calls.map(c => {
                      const dir = DIRECTION_MAP[c.direction ?? ''] ?? { label: c.direction ?? '--', color: 'bg-gray-100 text-gray-600' }
                      return (
                        <tr key={c.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap text-xs">{formatDateTime(c.created_at)}</td>
                          <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${dir.color}`}>{dir.label}</span></td>
                          <td className="px-3 py-2 text-right text-gray-600 text-xs">{formatDuration(c.duration_seconds)}</td>
                          <td className="px-3 py-2 text-center">{c.appointment_booked ? '✓' : '✗'}</td>
                          <td className="px-3 py-2 text-gray-500 text-xs max-w-xs truncate">{c.summary ?? '--'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {modalOpen && (
        <ClientModal client={client} onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); fetchData() }} />
      )}
    </div>
  )
}