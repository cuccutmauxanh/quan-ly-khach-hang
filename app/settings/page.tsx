'use client'

import { useEffect, useState } from 'react'
import { supabase, type Client } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Nav from '@/components/nav'
import { PageSkeleton } from '@/components/skeleton'
import { useToast } from '@/components/toast'
import { Save, Clock, Zap, Copy, Check, Calendar, Link2, RefreshCw } from 'lucide-react'

type Tab = 'schedule' | 'connection'
type SaveStatus = 'idle' | 'saving' | 'ok' | 'error'

function SaveBtn({ status, onClick, disabled, label = 'Lưu' }: { status: SaveStatus; onClick: () => void; disabled?: boolean; label?: string }) {
  const colors: Record<SaveStatus, string> = { idle: 'bg-indigo-600 hover:bg-indigo-700 text-white', saving: 'bg-indigo-400 text-white cursor-not-allowed', ok: 'bg-green-600 text-white', error: 'bg-red-600 text-white' }
  const icons: Record<SaveStatus, React.ReactNode> = { idle: <Save className="w-4 h-4" />, saving: <RefreshCw className="w-4 h-4 animate-spin" />, ok: <Check className="w-4 h-4" />, error: <span className="text-xs">✗</span> }
  const labels: Record<SaveStatus, string> = { idle: label, saving: 'Đang lưu...', ok: 'Đã lưu!', error: 'Lỗi — thử lại' }
  return (
    <button onClick={onClick} disabled={disabled || status === 'saving' || status === 'ok'}
      className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${colors[status]} disabled:opacity-50`}>
      {icons[status]} {labels[status]}
    </button>
  )
}

export default function SettingsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [client, setClient] = useState<Client | null>(null)
  const [tab, setTab] = useState<Tab>('schedule')

  const [workDays, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [workStart, setWorkStart] = useState('08:00')
  const [workEnd, setWorkEnd] = useState('17:30')
  const [scheduleSave, setScheduleSave] = useState<SaveStatus>('idle')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: cu } = await supabase.from('client_users').select('client_id').eq('user_id', user.id).single()
      if (!cu) { setLoading(false); return }
      const { data: c } = await supabase.from('clients').select('*').eq('id', cu.client_id).single()
      if (c) {
        setClient(c)
        if (c.notes) {
          try {
            const p = JSON.parse(c.notes)
            if (p.work_start) setWorkStart(p.work_start)
            if (p.work_end)   setWorkEnd(p.work_end)
            if (p.work_days)  setWorkDays(p.work_days)
          } catch {}
        }
      }
      setLoading(false)
    }
    load()
  }, [router])

  async function saveSchedule() {
    if (!client) return
    setScheduleSave('saving')
    try {
      const existing = (() => { try { return JSON.parse(client.notes ?? '{}') } catch { return {} } })()
      const notes = JSON.stringify({ ...existing, work_start: workStart, work_end: workEnd, work_days: workDays })
      const { error } = await supabase.from('clients').update({ notes }).eq('id', client.id)
      if (error) throw error
      setScheduleSave('ok')
      toast('Đã lưu lịch làm việc', 'success')
    } catch {
      setScheduleSave('error')
      toast('Lỗi khi lưu', 'error')
    }
    setTimeout(() => setScheduleSave('idle'), 3000)
  }

  function copyWebhook() {
    if (!client?.slug) return
    navigator.clipboard.writeText(`https://letanai.tino.page/webhook/saas-post-call?client=${client.slug}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const DAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'schedule',   label: 'Lịch làm việc', icon: <Clock className="w-4 h-4" /> },
    { key: 'connection', label: 'Kết nối',        icon: <Link2 className="w-4 h-4" /> },
  ]

  if (loading) return <PageSkeleton />

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav clientName={client?.name} />

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Cài đặt</h1>
          <p className="text-sm text-gray-400 mt-0.5">Lịch làm việc và thông tin kết nối hệ thống</p>
        </div>

        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1.5 w-fit">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.key ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Lịch làm việc */}
        {tab === 'schedule' && (
          <div className="space-y-4">
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-600" />
                <h2 className="font-semibold text-gray-800 text-sm">Lịch làm việc</h2>
              </div>

              <div>
                <p className="text-sm text-gray-600 mb-3 font-medium">Ngày làm việc trong tuần</p>
                <div className="flex gap-2">
                  {DAY_LABELS.map((label, i) => (
                    <button key={i}
                      onClick={() => setWorkDays(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i].sort())}
                      className={`w-10 h-10 rounded-xl text-xs font-bold transition-all ${workDays.includes(i) ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-2 font-medium">Giờ bắt đầu</label>
                  <input type="time" value={workStart} onChange={e => setWorkStart(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-2 font-medium">Giờ kết thúc</label>
                  <input type="time" value={workEnd} onChange={e => setWorkEnd(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700">
                <span className="font-semibold">Lưu ý:</span> Hệ thống sẽ tự động gọi lại trong khung giờ và ngày làm việc đã cài đặt.
              </div>
            </div>

            <div className="flex justify-end">
              <SaveBtn status={scheduleSave} onClick={saveSchedule} label="Lưu lịch làm việc" />
            </div>
          </div>
        )}

        {/* Kết nối */}
        {tab === 'connection' && (
          <div className="space-y-4">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Link2 className="w-4 h-4 text-indigo-600" />
                <h2 className="font-semibold text-gray-800 text-sm">Thông tin tài khoản</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { label: 'Tên phòng khám',  value: client?.name ?? '--' },
                  { label: 'Số điện thoại AI', value: client?.retell_phone_number ?? 'Chưa cấu hình' },
                  { label: 'Gói dịch vụ',      value: client?.package ?? 'Standard' },
                  { label: 'Trạng thái',        value: client?.status ?? 'Đang hoạt động' },
                ].map(item => (
                  <div key={item.label} className="bg-gray-50 rounded-xl p-3.5">
                    <p className="text-xs text-gray-400 mb-1">{item.label}</p>
                    <p className="text-sm font-medium text-gray-700 break-all">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-indigo-600" />
                <h2 className="font-semibold text-gray-800 text-sm">Webhook xử lý sau cuộc gọi</h2>
              </div>
              <p className="text-sm text-gray-500 mb-3">
                URL dùng để hệ thống tự động cập nhật kết quả sau mỗi cuộc gọi.
              </p>
              {client?.slug ? (
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                  <code className="text-xs text-indigo-700 flex-1 break-all">
                    {`https://letanai.tino.page/webhook/saas-post-call?client=${client.slug}`}
                  </code>
                  <button onClick={copyWebhook}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${copied ? 'bg-green-100 text-green-700' : 'bg-white border border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600'}`}>
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Đã copy!' : 'Copy'}
                  </button>
                </div>
              ) : (
                <p className="text-sm text-gray-400 bg-gray-50 rounded-xl px-4 py-3">Liên hệ admin để cấu hình.</p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
