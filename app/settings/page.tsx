'use client'

import { useEffect, useState } from 'react'
import { supabase, type Client } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/ui/app-shell'
import { PageSkeleton } from '@/components/skeleton'
import { useToast } from '@/components/toast'
import {
  Building2, User, Phone, Mail, MessageCircle, Send,
  Bot, PhoneCall, Copy, Check, RefreshCw, Save, Lock,
  Stethoscope,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(s: string | null) {
  if (!s) return '--'
  const d = new Date(s)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

function fmtMoney(n: number | null) {
  if (!n) return '--'
  return n.toLocaleString('vi-VN') + 'đ/tháng'
}

function statusCfg(s: string | null) {
  switch (s) {
    case 'active':    return { label: 'Đang hoạt động', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    case 'trial':     return { label: 'Dùng thử',        cls: 'bg-blue-50 text-blue-700 border-blue-200'         }
    case 'suspended': return { label: 'Tạm ngưng',       cls: 'bg-red-50 text-red-700 border-red-200'            }
    case 'expired':   return { label: 'Hết hạn',         cls: 'bg-orange-50 text-orange-700 border-orange-200'   }
    default:          return { label: s ?? '--',          cls: 'bg-gray-100 text-gray-500 border-gray-200'        }
  }
}

function packageLabel(p: string | null) {
  switch (p) {
    case 'basic':      return { label: 'Basic',     cls: 'bg-gray-100 text-gray-600 border-gray-200'        }
    case 'pro':        return { label: 'Pro',        cls: 'bg-indigo-50 text-indigo-700 border-indigo-200'   }
    case 'enterprise': return { label: 'Enterprise', cls: 'bg-violet-50 text-violet-700 border-violet-200'  }
    default:           return { label: p ?? '--',    cls: 'bg-gray-100 text-gray-500 border-gray-200'        }
  }
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section({ icon, title, subtitle, children }: {
  icon: React.ReactNode; title: string; subtitle?: string; children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
        <div className="w-8 h-8 bg-indigo-50 rounded-xl flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div>
          <h2 className="text-sm font-bold text-gray-800">{title}</h2>
          {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  )
}

// ── InfoRow (read-only) ───────────────────────────────────────────────────────

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <div className="text-sm font-medium text-gray-800">{children}</div>
    </div>
  )
}

// ── EditField ─────────────────────────────────────────────────────────────────

function EditField({ label, value, onChange, placeholder, icon, hint }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; icon?: React.ReactNode; hint?: string
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 block mb-1.5">{label}</label>
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">{icon}</div>
        )}
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full border border-gray-200 rounded-xl py-2.5 text-sm text-gray-700 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 transition-shadow ${icon ? 'pl-9 pr-3' : 'px-3'}`}
        />
      </div>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

// ── CopyField ─────────────────────────────────────────────────────────────────

function CopyField({ value, placeholder = 'Chưa cấu hình' }: { value: string | null; placeholder?: string }) {
  const [copied, setCopied] = useState(false)
  if (!value) return <span className="text-sm text-gray-300 italic">{placeholder}</span>

  function handleCopy() {
    navigator.clipboard.writeText(value!)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center gap-2">
      <code className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1.5 rounded-lg max-w-xs truncate block font-mono">
        {value}
      </code>
      <button onClick={handleCopy}
        className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
          copied ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
        }`}>
        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [client, setClient]   = useState<Client | null>(null)
  const [saving, setSaving]   = useState(false)

  // Tất cả field tự điền
  const [bizName,      setBizName]      = useState('')
  const [industry,     setIndustry]     = useState('')
  const [ownerName,    setOwnerName]    = useState('')
  const [ownerPhone,   setOwnerPhone]   = useState('')
  const [ownerZalo,    setOwnerZalo]    = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [telegramId,   setTelegramId]   = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: cu } = await supabase.from('client_users').select('client_id').eq('user_id', user.id).single()
      if (!cu) { setLoading(false); return }
      const { data: c } = await supabase.from('clients').select('*').eq('id', cu.client_id).single()
      if (c) {
        setClient(c)
        setBizName(c.name ?? '')
        setIndustry(c.industry ?? '')
        setOwnerName(c.owner_name ?? '')
        setOwnerPhone(c.owner_phone ?? '')
        setOwnerZalo(c.owner_zalo ?? '')
        setContactEmail(c.contact_email ?? '')
        setTelegramId(c.telegram_chat_id ?? '')
      }
      setLoading(false)
    }
    load()
  }, [router])

  async function saveProfile() {
    if (!client) return
    if (!bizName.trim()) { toast('Vui lòng nhập tên doanh nghiệp', 'error'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('clients').update({
        name:             bizName.trim(),
        industry:         industry.trim() || null,
        owner_name:       ownerName.trim() || null,
        owner_phone:      ownerPhone.trim() || null,
        owner_zalo:       ownerZalo.trim() || null,
        contact_email:    contactEmail.trim() || null,
        telegram_chat_id: telegramId.trim() || null,
      }).eq('id', client.id)
      if (error) throw error
      setClient(c => c ? { ...c, name: bizName.trim(), industry: industry.trim() || null } : c)
      toast('Đã lưu thông tin', 'success')
    } catch {
      toast('Lỗi khi lưu', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageSkeleton />
  if (!client) return <AppShell><p className="text-gray-400 text-sm p-6">Không tìm thấy dữ liệu.</p></AppShell>

  const sts = statusCfg(client.status)
  const pkg = packageLabel(client.package)
  const freeswitch = client.zapbx_ip
    ? `${client.zapbx_ip}${client.zapbx_port ? `:${client.zapbx_port}` : ''}`
    : null

  return (
    <AppShell clientName={client.name}>
      <div className="mb-6">
        <h1 className="text-[22px] font-bold text-gray-800 tracking-tight">Cài đặt</h1>
        <p className="text-xs text-gray-400 mt-1">Điền đầy đủ thông tin để hệ thống hoạt động chính xác</p>
      </div>

      <div className="space-y-5">

        {/* ── 1. Hồ Sơ Doanh Nghiệp ─────────────────────────────────────────── */}
        <Section
          icon={<Building2 className="w-4 h-4 text-indigo-600" />}
          title="Hồ Sơ Doanh Nghiệp"
          subtitle="Bạn tự điền — cập nhật ngay vào hệ thống"
        >
          <div className="grid grid-cols-2 gap-4">
            <EditField
              label="Tên doanh nghiệp *"
              value={bizName} onChange={setBizName}
              placeholder="VD: Nha Khoa Smile Plus"
              icon={<Building2 className="w-3.5 h-3.5" />}
              hint="Tên hiển thị trong giao diện và kịch bản AI"
            />
            <EditField
              label="Ngành"
              value={industry} onChange={setIndustry}
              placeholder="VD: Nha khoa, Y tế, Thẩm mỹ..."
              icon={<Stethoscope className="w-3.5 h-3.5" />}
            />
          </div>

          <div className="mt-4 pt-4 border-t border-gray-50">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Thông tin liên hệ</p>
            <div className="grid grid-cols-2 gap-4">
              <EditField
                label="Người phụ trách"
                value={ownerName} onChange={setOwnerName}
                placeholder="Nguyễn Văn A"
                icon={<User className="w-3.5 h-3.5" />}
              />
              <EditField
                label="Điện thoại"
                value={ownerPhone} onChange={setOwnerPhone}
                placeholder="0901 234 567"
                icon={<Phone className="w-3.5 h-3.5" />}
              />
              <EditField
                label="Zalo"
                value={ownerZalo} onChange={setOwnerZalo}
                placeholder="Số Zalo (thường là SĐT)"
                icon={<MessageCircle className="w-3.5 h-3.5" />}
              />
              <EditField
                label="Email"
                value={contactEmail} onChange={setContactEmail}
                placeholder="email@example.com"
                icon={<Mail className="w-3.5 h-3.5" />}
              />
              <EditField
                label="Telegram Chat ID"
                value={telegramId} onChange={setTelegramId}
                placeholder="VD: -1001234567890"
                icon={<Send className="w-3.5 h-3.5" />}
                hint="Để nhận thông báo tự động qua Telegram"
              />
            </div>
          </div>

          <div className="flex justify-end mt-5">
            <button onClick={saveProfile} disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-40 shadow-sm">
              {saving
                ? <RefreshCw className="w-4 h-4 animate-spin" />
                : <Save className="w-4 h-4" />}
              Lưu thông tin
            </button>
          </div>
        </Section>

        {/* ── 2. Gói Dịch Vụ ─────────────────────────────────────────────────── */}
        <Section
          icon={<PhoneCall className="w-4 h-4 text-indigo-600" />}
          title="Gói Dịch Vụ"
          subtitle="Do admin cấu hình"
        >
          <div className="grid grid-cols-2 gap-x-12">
            <div>
              <InfoRow label="Gói dịch vụ">
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${pkg.cls}`}>{pkg.label}</span>
              </InfoRow>
              <InfoRow label="Trạng thái">
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${sts.cls}`}>{sts.label}</span>
              </InfoRow>
            </div>
            <div>
              <InfoRow label="Ngày bắt đầu">
                <span>{fmtDate(client.package_started_at ?? client.contract_start)}</span>
              </InfoRow>
              <InfoRow label="Hết trial">
                <span className={client.trial_ends_at && new Date(client.trial_ends_at) < new Date() ? 'text-red-500 font-semibold' : ''}>
                  {fmtDate(client.trial_ends_at)}
                </span>
              </InfoRow>
            </div>
          </div>
          <div className="pt-2 border-t border-gray-50 mt-1">
            <InfoRow label="Phí hàng tháng">
              <span className="text-base font-bold text-indigo-600">{fmtMoney(client.monthly_fee)}</span>
            </InfoRow>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
            <Lock className="w-3 h-3 shrink-0" />
            Liên hệ hỗ trợ để nâng cấp hoặc thay đổi gói.
          </div>
        </Section>

        {/* ── 3. Cấu Hình AI & Kỹ Thuật ─────────────────────────────────────── */}
        <Section
          icon={<Bot className="w-4 h-4 text-indigo-600" />}
          title="Cấu Hình AI & Kỹ Thuật"
          subtitle="Do admin cấu hình — chỉ đọc"
        >
          <InfoRow label="Agent Gọi Lạnh">
            <CopyField value={client.agent_cold_id} />
          </InfoRow>
          <InfoRow label="Agent Khách Hàng Cũ">
            <CopyField value={client.agent_cskh_id} />
          </InfoRow>
          <InfoRow label="Agent Facebook Ads">
            <CopyField value={client.agent_warm_id} />
          </InfoRow>
          <InfoRow label="Agent Lễ Tân">
            <CopyField value={client.agent_receptionist_id} />
          </InfoRow>
          <div className="pt-3 mt-1 border-t border-gray-50">
            <InfoRow label="Số điện thoại AI">
              <span className="text-sm font-semibold text-indigo-600">{client.retell_phone_number ?? '--'}</span>
            </InfoRow>
            <InfoRow label="FreeSWITCH">
              <CopyField value={freeswitch} />
            </InfoRow>
            <InfoRow label="Cal.com Event ID">
              <CopyField value={client.calcom_event_type_id} />
            </InfoRow>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
            <Lock className="w-3 h-3 shrink-0" />
            Liên hệ hỗ trợ nếu cần thay đổi cấu hình kỹ thuật.
          </div>
        </Section>

      </div>
    </AppShell>
  )
}
