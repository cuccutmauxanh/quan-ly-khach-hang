'use client'

import { useEffect, useState } from 'react'
import { supabase, type Client } from '@/lib/supabase'
import { Users, CheckCircle, Clock, DollarSign, Plus, Search, Eye, Pencil, RefreshCw } from 'lucide-react'
import ClientModal from '@/components/ClientModal'
import Link from 'next/link'

const INDUSTRY_MAP: Record<string, { label: string; color: string }> = {
  dental:     { label: 'Nha Khoa',     color: 'bg-blue-100 text-blue-700' },
  spa:        { label: 'Spa',          color: 'bg-pink-100 text-pink-700' },
  legal:      { label: 'Luật',         color: 'bg-gray-100 text-gray-700' },
  realestate: { label: 'Bất Động Sản', color: 'bg-green-100 text-green-700' },
  other:      { label: 'Khác',         color: 'bg-orange-100 text-orange-700' },
  demo:       { label: 'Demo',         color: 'bg-indigo-100 text-indigo-700' },
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active:  { label: 'Hoạt động', color: 'bg-green-100 text-green-700' },
  trial:   { label: 'Dùng thử',  color: 'bg-purple-100 text-purple-700' },
  paused:  { label: 'Tạm dừng',  color: 'bg-yellow-100 text-yellow-700' },
  churned: { label: 'Đã nghỉ',   color: 'bg-red-100 text-red-700' },
}

const PACKAGE_MAP: Record<string, { label: string; color: string }> = {
  basic: { label: 'Cơ Bản', color: 'bg-gray-100 text-gray-600' },
  pro:   { label: 'Pro',    color: 'bg-yellow-100 text-yellow-700' },
}

function formatVND(n: number | null) {
  if (!n) return '--'
  return n.toLocaleString('vi-VN') + ' đ'
}

function formatDate(s: string | null) {
  if (!s) return '--'
  const d = new Date(s)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

function Badge({ value, map }: { value: string | null; map: Record<string, { label: string; color: string }> }) {
  const meta = map[value ?? ''] ?? { label: value ?? '--', color: 'bg-gray-100 text-gray-600' }
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${meta.color}`}>{meta.label}</span>
}

export default function HomePage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [industryFilter, setIndustryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editClient, setEditClient] = useState<Client | null>(null)

  async function fetchClients() {
    setLoading(true)
    const { data } = await supabase.from('clients').select('*').order('created_at', { ascending: false })
    setClients(data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchClients() }, [])

  const filtered = clients.filter(c => {
    const q = search.toLowerCase()
    const matchSearch = !q || c.name.toLowerCase().includes(q) ||
      (c.owner_name ?? '').toLowerCase().includes(q) ||
      (c.owner_phone ?? '').includes(q)
    const matchIndustry = industryFilter === 'all' || c.industry === industryFilter
    const matchStatus = statusFilter === 'all' || c.status === statusFilter
    return matchSearch && matchIndustry && matchStatus
  })

  const totalRevenue = clients.filter(c => c.status === 'active').reduce((s, c) => s + (c.monthly_fee ?? 0), 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-xl font-bold text-indigo-600">AutoVoice Pro — Admin</h1>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-5">
        <h2 className="text-2xl font-bold text-gray-800">Quản Lý Khách Hàng</h2>

        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Tổng Khách Hàng', value: clients.length, icon: <Users className="w-5 h-5 text-indigo-600" />, bg: 'bg-indigo-50' },
            { label: 'Đang Hoạt Động', value: clients.filter(c => c.status === 'active').length, icon: <CheckCircle className="w-5 h-5 text-green-600" />, bg: 'bg-green-50' },
            { label: 'Dùng Thử', value: clients.filter(c => c.status === 'trial').length, icon: <Clock className="w-5 h-5 text-purple-600" />, bg: 'bg-purple-50' },
            { label: 'Doanh Thu Tháng', value: formatVND(totalRevenue), icon: <DollarSign className="w-5 h-5 text-yellow-600" />, bg: 'bg-yellow-50' },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-lg ${k.bg}`}>{k.icon}</div>
              <div>
                <p className="text-xs text-gray-500">{k.label}</p>
                <p className="text-xl font-bold text-gray-800">{k.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-52">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text" placeholder="Tìm theo tên hoặc người liên hệ..."
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              value={search} onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" value={industryFilter} onChange={e => setIndustryFilter(e.target.value)}>
            <option value="all">Tất cả ngành</option>
            <option value="dental">Nha Khoa</option>
            <option value="spa">Spa</option>
            <option value="legal">Luật</option>
            <option value="realestate">Bất Động Sản</option>
            <option value="other">Khác</option>
          </select>
          <select className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">Tất cả trạng thái</option>
            <option value="active">Hoạt động</option>
            <option value="trial">Dùng thử</option>
            <option value="paused">Tạm dừng</option>
            <option value="churned">Đã nghỉ</option>
          </select>
          <button onClick={fetchClients} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50">
            <RefreshCw className="w-4 h-4 text-gray-500" />
          </button>
          <button
            onClick={() => { setEditClient(null); setModalOpen(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4" /> Thêm Khách Hàng
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 font-semibold text-gray-700 text-sm">
            Bảng Khách Hàng ({filtered.length})
          </div>
          {loading ? (
            <div className="p-12 text-center text-gray-400 text-sm">Đang tải dữ liệu...</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-gray-400 text-sm">
              {clients.length === 0 ? "Chưa có khách hàng nào. Nhấn '+ Thêm Khách Hàng' để bắt đầu." : "Không tìm thấy kết quả."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs">
                  <tr>
                    {['Tên Doanh Nghiệp','Ngành','Gói','Trạng Thái','Người Liên Hệ','Số Điện Thoại','Phí/Tháng','Ngày Bắt Đầu','Thao Tác'].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-semibold text-gray-800 whitespace-nowrap">{c.name}</td>
                      <td className="px-4 py-3"><Badge value={c.industry} map={INDUSTRY_MAP} /></td>
                      <td className="px-4 py-3"><Badge value={c.package} map={PACKAGE_MAP} /></td>
                      <td className="px-4 py-3"><Badge value={c.status} map={STATUS_MAP} /></td>
                      <td className="px-4 py-3 text-gray-600">{c.owner_name ?? '--'}</td>
                      <td className="px-4 py-3 text-gray-600">{c.owner_phone ?? '--'}</td>
                      <td className="px-4 py-3 text-right text-gray-700 font-medium whitespace-nowrap">{formatVND(c.monthly_fee)}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(c.contract_start)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link href={`/clients/${c.id}`} className="flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-600 rounded text-xs font-medium hover:bg-indigo-100">
                            <Eye className="w-3 h-3" /> Xem
                          </Link>
                          <button onClick={() => { setEditClient(c); setModalOpen(true) }} className="flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-medium hover:bg-gray-200">
                            <Pencil className="w-3 h-3" /> Sửa
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {modalOpen && (
        <ClientModal client={editClient} onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); fetchClients() }} />
      )}
    </div>
  )
}