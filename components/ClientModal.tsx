'use client'

import { useState, useEffect } from 'react'
import { supabase, type Client } from '@/lib/supabase'
import { X } from 'lucide-react'

type Props = { client: Client | null; onClose: () => void; onSaved: () => void }

const empty: Partial<Client> = {
  name: '', slug: '', industry: 'dental', package: 'basic', status: 'trial',
  owner_name: '', owner_phone: '', owner_zalo: '', contact_email: '',
  telegram_chat_id: '', retell_agent_id: '', retell_phone_number: '',
  supabase_schema: '', zapbx_ip: '', calcom_event_type_id: '',
  monthly_fee: 0, contract_start: '', trial_ends_at: '', notes: '',
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">{label}{hint && <span className="text-gray-400 font-normal ml-1">— {hint}</span>}</label>
      {children}
    </div>
  )
}

const inputCls = "px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 w-full"
const selectCls = "px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 w-full bg-white"

export default function ClientModal({ client, onClose, onSaved }: Props) {
  const [form, setForm] = useState<Partial<Client>>({ ...empty, ...(client ?? {}) })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isEdit = !!client

  useEffect(() => {
    setForm({ ...empty, ...(client ?? {}) })
  }, [client])

  function set(key: keyof Client, value: string | number | null) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleSave() {
    if (!form.name?.trim()) { setError('Vui lòng nhập tên doanh nghiệp.'); return }
    setSaving(true); setError('')

    const payload: Partial<Client> = { ...form }
    if (!payload.contract_start) delete payload.contract_start
    if (!payload.trial_ends_at) delete payload.trial_ends_at
    if (!payload.slug?.trim()) payload.slug = form.name!.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now()

    let err
    if (isEdit) {
      const { error: e } = await supabase.from('clients').update(payload).eq('id', client!.id)
      err = e
    } else {
      const { error: e } = await supabase.from('clients').insert(payload)
      err = e
    }

    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-800">{isEdit ? 'Chỉnh Sửa Khách Hàng' : 'Thêm Khách Hàng Mới'}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-4 space-y-5 flex-1">
          {error && <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</div>}

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Thông Tin Cơ Bản</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <Field label="Tên doanh nghiệp *">
                  <input className={inputCls} value={form.name ?? ''} onChange={e => set('name', e.target.value)} placeholder="VD: Nha Khoa An Tâm" />
                </Field>
              </div>
              <Field label="Ngành nghề *">
                <select className={selectCls} value={form.industry ?? 'dental'} onChange={e => set('industry', e.target.value)}>
                  <option value="dental">Nha Khoa</option>
                  <option value="spa">Spa</option>
                  <option value="legal">Luật</option>
                  <option value="realestate">Bất Động Sản</option>
                  <option value="other">Khác</option>
                </select>
              </Field>
              <Field label="Gói dịch vụ *">
                <select className={selectCls} value={form.package ?? 'basic'} onChange={e => set('package', e.target.value)}>
                  <option value="basic">Cơ Bản</option>
                  <option value="pro">Pro</option>
                </select>
              </Field>
              <Field label="Trạng thái *">
                <select className={selectCls} value={form.status ?? 'trial'} onChange={e => set('status', e.target.value)}>
                  <option value="trial">Dùng thử</option>
                  <option value="active">Hoạt động</option>
                  <option value="paused">Tạm dừng</option>
                  <option value="churned">Đã nghỉ</option>
                </select>
              </Field>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Thông Tin Liên Hệ</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Tên người liên hệ">
                <input className={inputCls} value={form.owner_name ?? ''} onChange={e => set('owner_name', e.target.value)} placeholder="Nguyễn Văn A" />
              </Field>
              <Field label="Số điện thoại">
                <input className={inputCls} value={form.owner_phone ?? ''} onChange={e => set('owner_phone', e.target.value)} placeholder="0901234567" />
              </Field>
              <Field label="Zalo">
                <input className={inputCls} value={form.owner_zalo ?? ''} onChange={e => set('owner_zalo', e.target.value)} placeholder="0901234567" />
              </Field>
              <Field label="Email">
                <input className={inputCls} value={form.contact_email ?? ''} onChange={e => set('contact_email', e.target.value)} placeholder="contact@congty.vn" />
              </Field>
              <Field label="Telegram Chat ID" hint="để gửi thông báo">
                <input className={inputCls} value={form.telegram_chat_id ?? ''} onChange={e => set('telegram_chat_id', e.target.value)} placeholder="123456789" />
              </Field>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Cấu Hình AI & Kỹ Thuật</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Retell Agent ID" hint="agent_xxxxx">
                <input className={inputCls} value={form.retell_agent_id ?? ''} onChange={e => set('retell_agent_id', e.target.value)} placeholder="agent_xxxxx" />
              </Field>
              <Field label="Số điện thoại AI">
                <input className={inputCls} value={form.retell_phone_number ?? ''} onChange={e => set('retell_phone_number', e.target.value)} placeholder="+84901234567" />
              </Field>
              <Field label="Schema Supabase" hint="client_nhakhoa_abc">
                <input className={inputCls} value={form.supabase_schema ?? ''} onChange={e => set('supabase_schema', e.target.value)} placeholder="client_nhakhoa_abc" />
              </Field>
              <Field label="IP FreeSWITCH">
                <input className={inputCls} value={form.zapbx_ip ?? ''} onChange={e => set('zapbx_ip', e.target.value)} placeholder="103.x.x.x" />
              </Field>
              <Field label="Cal.com Event Type ID">
                <input className={inputCls} value={form.calcom_event_type_id ?? ''} onChange={e => set('calcom_event_type_id', e.target.value)} placeholder="4356024" />
              </Field>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Hợp Đồng</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Phí hàng tháng (VND)">
                <input type="number" className={inputCls} value={form.monthly_fee ?? 0} onChange={e => set('monthly_fee', Number(e.target.value))} placeholder="1500000" />
              </Field>
              <Field label="Ngày bắt đầu hợp đồng">
                <input type="date" className={inputCls} value={form.contract_start ?? ''} onChange={e => set('contract_start', e.target.value)} />
              </Field>
              <Field label="Ngày hết trial">
                <input type="date" className={inputCls} value={form.trial_ends_at?.slice(0,10) ?? ''} onChange={e => set('trial_ends_at', e.target.value)} />
              </Field>
              <div className="md:col-span-2">
                <Field label="Ghi chú nội bộ">
                  <textarea className={inputCls + ' resize-none'} rows={3} value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} placeholder="Ghi chú về khách hàng..." />
                </Field>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Hủy</button>
          <button onClick={handleSave} disabled={saving} className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60">
            {saving ? 'Đang lưu...' : 'Lưu Lại'}
          </button>
        </div>
      </div>
    </div>
  )
}