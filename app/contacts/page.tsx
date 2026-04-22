'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase, type Client, type Contact } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { UserPlus, Upload, X, Phone } from 'lucide-react'
import * as XLSX from 'xlsx'
import Nav from '@/components/nav'

type Filter = 'all' | 'uncalled' | 'called' | 'booked'

const INTEREST_LABELS: Record<string, { label: string; color: string }> = {
  high:   { label: 'Quan tâm cao', color: 'bg-green-100 text-green-700' },
  medium: { label: 'Trung bình',   color: 'bg-yellow-100 text-yellow-700' },
  low:    { label: 'Thấp',         color: 'bg-gray-100 text-gray-500' },
}

function formatDate(s: string | null) {
  if (!s) return '--'
  const d = new Date(s)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

type AddForm = { full_name: string; phone: string; email: string; notes: string; interest_level: string }

export default function ContactsPage() {
  const router = useRouter()
  const [client, setClient] = useState<Client | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [bookedIds, setBookedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState<AddForm>({ full_name: '', phone: '', email: '', notes: '', interest_level: '' })
  const [saving, setSaving] = useState(false)
  const [callingId, setCallingId] = useState<string | null>(null)
  const clientIdRef = useRef<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchContacts = useCallback(async (clientId: string) => {
    const [{ data: contacts }, { data: appts }] = await Promise.all([
      supabase.from('contacts').select('*').eq('tenant_id', clientId).order('created_at', { ascending: false }),
      supabase.from('appointments').select('contact_id').eq('tenant_id', clientId),
    ])
    setContacts(contacts ?? [])
    setBookedIds(new Set((appts ?? []).map(a => a.contact_id).filter(Boolean)))
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: cu } = await supabase.from('client_users').select('client_id').eq('user_id', user.id).single()
      if (!cu) { setLoading(false); return }
      clientIdRef.current = cu.client_id
      const { data: c } = await supabase.from('clients').select('*').eq('id', cu.client_id).single()
      setClient(c)
      await fetchContacts(cu.client_id)
      setLoading(false)
    }
    init()
  }, [router, fetchContacts])

  async function handleSaveContact() {
    if (!addForm.phone || !clientIdRef.current) return
    setSaving(true)
    await supabase.from('contacts').insert({
      tenant_id: clientIdRef.current,
      full_name: addForm.full_name || null,
      phone: addForm.phone.replace(/\D/g, ''),
      email: addForm.email || null,
      notes: addForm.notes || null,
      interest_level: addForm.interest_level || null,
    })
    await fetchContacts(clientIdRef.current)
    setAddForm({ full_name: '', phone: '', email: '', notes: '', interest_level: '' })
    setShowAdd(false)
    setSaving(false)
  }

  async function handleCallContact(contact: Contact) {
    if (!client?.retell_agent_id || !client?.retell_phone_number) {
      alert('Chưa cấu hình Retell Agent. Liên hệ admin.')
      return
    }
    setCallingId(contact.id)
    const res = await fetch('/api/outbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phones: [{ name: contact.full_name ?? '', phone: contact.phone }],
        agentId: client.retell_agent_id,
        fromNumber: client.retell_phone_number,
      }),
    })
    const data = await res.json()
    const ok = data.results?.[0]?.success
    if (ok && clientIdRef.current) {
      await supabase.from('contacts').update({
        last_called_at: new Date().toISOString(),
        call_count: (contact.call_count ?? 0) + 1,
      }).eq('id', contact.id)
      await fetchContacts(clientIdRef.current)
    } else {
      alert('Lỗi: ' + (data.results?.[0]?.error ?? 'Không thể gọi'))
    }
    setCallingId(null)
  }

  function handleImportExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !clientIdRef.current) return
    const reader = new FileReader()
    reader.onload = async (evt) => {
      const wb = XLSX.read(evt.target?.result, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws)
      const records = rows.map(r => ({
        tenant_id: clientIdRef.current!,
        full_name: String(r['Tên'] ?? r['ten'] ?? r['name'] ?? '') || null,
        phone: String(r['Số điện thoại'] ?? r['sdt'] ?? r['phone'] ?? '').replace(/\D/g, ''),
        email: String(r['Email'] ?? r['email'] ?? '') || null,
        notes: String(r['Ghi chú'] ?? r['notes'] ?? '') || null,
      })).filter(r => r.phone.length >= 9)
      if (records.length > 0) {
        await supabase.from('contacts').upsert(records, { onConflict: 'phone,tenant_id', ignoreDuplicates: true })
        await fetchContacts(clientIdRef.current!)
        alert(`Đã import ${records.length} liên hệ`)
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  const filtered = contacts.filter(c => {
    const matchSearch = !search || (c.full_name ?? '').toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
    if (!matchSearch) return false
    if (filter === 'uncalled') return (c.call_count ?? 0) === 0
    if (filter === 'called') return (c.call_count ?? 0) > 0
    if (filter === 'booked') return bookedIds.has(c.id)
    return true
  })

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Đang tải...</div>

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: 'all',      label: 'Tất cả',    count: contacts.length },
    { key: 'uncalled', label: 'Chưa gọi',  count: contacts.filter(c => (c.call_count ?? 0) === 0).length },
    { key: 'called',   label: 'Đã gọi',    count: contacts.filter(c => (c.call_count ?? 0) > 0).length },
    { key: 'booked',   label: 'Đặt lịch',  count: contacts.filter(c => bookedIds.has(c.id)).length },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav clientName={client?.name} />

      {showAdd && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">Thêm liên hệ</h3>
              <button onClick={() => setShowAdd(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Họ tên</label>
                <input value={addForm.full_name} onChange={e => setAddForm(f => ({ ...f, full_name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="Nguyễn Văn A" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Số điện thoại *</label>
                <input value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="0901234567" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Email</label>
                <input value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="email@example.com" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Mức độ quan tâm</label>
                <select value={addForm.interest_level} onChange={e => setAddForm(f => ({ ...f, interest_level: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                  <option value="">-- Chọn --</option>
                  <option value="high">Quan tâm cao</option>
                  <option value="medium">Trung bình</option>
                  <option value="low">Thấp</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Ghi chú</label>
                <textarea value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" rows={2} />
              </div>
              <button onClick={handleSaveContact} disabled={!addForm.phone || saving}
                className="w-full py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                {saving ? 'Đang lưu...' : 'Lưu liên hệ'}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">Danh bạ</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              <Upload className="w-4 h-4" /> Import Excel
            </button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportExcel} />
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
              <UserPlus className="w-4 h-4" /> Thêm liên hệ
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 pt-4 pb-0 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-1">
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
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Tìm tên, số điện thoại..."
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 w-56" />
          </div>

          {filtered.length === 0 ? (
            <div className="p-10 text-center text-gray-400 text-sm">
              {contacts.length === 0 ? 'Chưa có liên hệ. Thêm mới hoặc import từ Excel.' : 'Không tìm thấy liên hệ phù hợp.'}
            </div>
          ) : (
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Họ tên</th>
                    <th className="px-4 py-2.5 text-left">Số điện thoại</th>
                    <th className="px-4 py-2.5 text-left">Quan tâm</th>
                    <th className="px-4 py-2.5 text-center">Số lần gọi</th>
                    <th className="px-4 py-2.5 text-left">Gọi lần cuối</th>
                    <th className="px-4 py-2.5 text-center">Lịch hẹn</th>
                    <th className="px-4 py-2.5 text-center">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(c => {
                    const interest = c.interest_level ? INTEREST_LABELS[c.interest_level] : null
                    const hasBooking = bookedIds.has(c.id)
                    return (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-800">{c.full_name || '--'}</td>
                        <td className="px-4 py-3 text-gray-600 font-mono text-xs">{c.phone}</td>
                        <td className="px-4 py-3">
                          {interest ? (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${interest.color}`}>{interest.label}</span>
                          ) : '--'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-semibold ${(c.call_count ?? 0) > 0 ? 'text-indigo-600' : 'text-gray-400'}`}>
                            {c.call_count ?? 0}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(c.last_called_at)}</td>
                        <td className="px-4 py-3 text-center text-xs">
                          {hasBooking ? <span className="text-green-600 font-medium">✅ Đặt lịch</span> : <span className="text-gray-300">--</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => handleCallContact(c)} disabled={callingId === c.id}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50">
                            <Phone className="w-3 h-3" />
                            {callingId === c.id ? '...' : 'Gọi'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}