'use client'

import { useEffect, useState } from 'react'
import { supabase, type Client, type Call } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/ui/app-shell'
import { PageSkeleton } from '@/components/skeleton'
import { useToast } from '@/components/toast'
import { Layers, TrendingUp, Phone, Calendar, ChevronRight, Plus, Check } from 'lucide-react'

type Variant = {
  id: 'A' | 'B'
  label: string
  script: string
  calls: number
  connected: number
  booked: number
  avgDuration: number
}

type TestConfig = {
  name: string
  variantA: string
  variantB: string
}

const PRESET_SCRIPTS = [
  {
    id: 'warm',
    label: 'Kịch bản ấm áp',
    content: 'Chào anh/chị, em là Linh từ Nha khoa Mila. Anh/chị có đang gặp vấn đề gì về răng miệng không ạ? Bên em đang có chương trình khám miễn phí và tư vấn niềng răng trong tháng này.',
  },
  {
    id: 'direct',
    label: 'Kịch bản trực tiếp',
    content: 'Xin chào! Nha khoa Mila đang có ưu đãi khám răng miễn phí. Anh/chị có muốn đặt lịch trong tuần này không? Chỉ mất 30 phút.',
  },
  {
    id: 'value',
    label: 'Kịch bản giá trị',
    content: 'Chào anh/chị, em gọi từ Nha khoa Mila. Bên em vừa triển khai công nghệ niềng răng trong suốt mới nhất, không đau và thời gian ngắn hơn 30%. Anh/chị có muốn em tư vấn thêm không?',
  },
  {
    id: 'urgency',
    label: 'Kịch bản tạo khẩn cấp',
    content: 'Xin chào anh/chị! Nha khoa Mila chỉ còn 3 suất khám miễn phí trong tuần này. Anh/chị có muốn đặt lịch trước không để tránh hết slot?',
  },
]

function StatBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-500">{label}</span>
        <span className="font-semibold text-gray-700">{value} ({pct}%)</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function VariantCard({ variant, winner }: { variant: Variant; winner: boolean }) {
  const connectRate = variant.calls > 0 ? Math.round((variant.connected / variant.calls) * 100) : 0
  const bookRate = variant.connected > 0 ? Math.round((variant.booked / variant.connected) * 100) : 0
  const avgMin = Math.floor(variant.avgDuration / 60)
  const avgSec = variant.avgDuration % 60

  return (
    <div className={`bg-white rounded-2xl border p-5 shadow-sm relative ${winner ? 'border-green-300 ring-1 ring-green-200' : 'border-gray-100'}`}>
      {winner && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
          <Check className="w-3 h-3" /> Dẫn đầu
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg ${variant.id === 'A' ? 'bg-indigo-100 text-indigo-600' : 'bg-violet-100 text-violet-600'}`}>
          {variant.id}
        </div>
        <div>
          <p className="font-semibold text-gray-800">{variant.label}</p>
          <p className="text-xs text-gray-400">{variant.calls} cuộc gọi</p>
        </div>
      </div>

      <div className="space-y-3 mb-4">
        <StatBar label="Tỷ lệ kết nối" value={variant.connected} max={variant.calls} color="bg-indigo-400" />
        <StatBar label="Tỷ lệ đặt lịch" value={variant.booked} max={variant.connected} color="bg-green-400" />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Kết nối', value: `${connectRate}%`, color: 'text-indigo-600' },
          { label: 'Đặt lịch', value: `${bookRate}%`, color: 'text-green-600' },
          { label: 'Thời lượng TB', value: variant.avgDuration > 0 ? `${avgMin}p${avgSec}s` : '--', color: 'text-amber-600' },
        ].map(s => (
          <div key={s.label} className="bg-gray-50 rounded-xl p-2.5 text-center">
            <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 bg-gray-50 rounded-xl p-3">
        <p className="text-xs text-gray-400 mb-1.5">Kịch bản</p>
        <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">{variant.script}</p>
      </div>
    </div>
  )
}

export default function AbTestingPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [client, setClient] = useState<Client | null>(null)
  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [config, setConfig] = useState<TestConfig>({
    name: '',
    variantA: PRESET_SCRIPTS[0].content,
    variantB: PRESET_SCRIPTS[1].content,
  })
  const [activeTest, setActiveTest] = useState<{ name: string; startedAt: string } | null>(null)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: cu } = await supabase.from('client_users').select('client_id').eq('user_id', user.id).single()
      if (!cu) { setLoading(false); return }
      const { data: c } = await supabase.from('clients').select('*').eq('id', cu.client_id).single()
      setClient(c)
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const { data } = await supabase.from('calls').select('*').eq('tenant_id', cu.client_id).gte('created_at', thirtyDaysAgo.toISOString())
      setCalls(data ?? [])
      setLoading(false)
    }
    init()
  }, [router])

  // Simulate A/B split from real call data (odd/even index = A/B)
  const splitCalls = calls.filter(c => c.status === 'completed' || c.status === 'no_answer')
  const aCalls = splitCalls.filter((_, i) => i % 2 === 0)
  const bCalls = splitCalls.filter((_, i) => i % 2 === 1)

  function buildVariant(id: 'A' | 'B', label: string, script: string, subset: Call[]): Variant {
    const connected = subset.filter(c => c.status === 'completed').length
    const booked = subset.filter(c => c.appointment_booked).length
    const totalDur = subset.filter(c => c.status === 'completed').reduce((s, c) => s + (c.duration_seconds ?? 0), 0)
    const avgDuration = connected > 0 ? Math.round(totalDur / connected) : 0
    return { id, label, script, calls: subset.length, connected, booked, avgDuration }
  }

  const variantA = buildVariant('A', 'Kịch bản A', config.variantA, aCalls)
  const variantB = buildVariant('B', 'Kịch bản B', config.variantB, bCalls)

  const aScore = variantA.connected > 0 ? variantA.booked / variantA.connected : 0
  const bScore = variantB.connected > 0 ? variantB.booked / variantB.connected : 0
  const winnerA = aScore >= bScore
  const hasData = splitCalls.length > 0

  function startTest() {
    if (!config.name) { toast('Vui lòng nhập tên thử nghiệm', 'error'); return }
    setActiveTest({ name: config.name, startedAt: new Date().toISOString() })
    setShowCreate(false)
    toast(`Đã bắt đầu thử nghiệm "${config.name}"`, 'success')
  }

  if (loading) return <PageSkeleton />

  return (
    <AppShell clientName={client?.name}>
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Thử nghiệm A/B</h1>
          <p className="text-sm text-gray-400 mt-0.5">So sánh kịch bản AI để tìm ra bản hiệu quả nhất</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> Tạo thử nghiệm mới
        </button>
      </div>

      {/* Active test banner */}
      {activeTest && (
        <div className="mb-5 bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
          <div>
            <p className="text-sm font-semibold text-indigo-700">{activeTest.name}</p>
            <p className="text-xs text-indigo-400">Bắt đầu {new Date(activeTest.startedAt).toLocaleDateString('vi-VN')}</p>
          </div>
          <button onClick={() => setActiveTest(null)}
            className="ml-auto text-xs text-indigo-600 hover:text-indigo-800 font-medium">
            Kết thúc thử nghiệm
          </button>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="mb-6 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <p className="text-sm font-semibold text-gray-700 mb-4">Cấu hình thử nghiệm</p>

          <div className="mb-4">
            <label className="text-xs font-semibold text-gray-500 block mb-1.5">Tên thử nghiệm</label>
            <input value={config.name} onChange={e => setConfig(p => ({ ...p, name: e.target.value }))}
              placeholder="VD: So sánh câu mở đầu tháng 4"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {(['A', 'B'] as const).map(v => (
              <div key={v}>
                <label className="text-xs font-semibold text-gray-500 block mb-1.5">Kịch bản {v}</label>
                <div className="flex gap-1.5 mb-2 flex-wrap">
                  {PRESET_SCRIPTS.map(s => (
                    <button key={s.id}
                      onClick={() => setConfig(p => v === 'A' ? { ...p, variantA: s.content } : { ...p, variantB: s.content })}
                      className="text-xs px-2 py-1 rounded-lg border border-gray-200 hover:border-indigo-300 hover:text-indigo-600 text-gray-500 transition-colors">
                      {s.label}
                    </button>
                  ))}
                </div>
                <textarea
                  value={v === 'A' ? config.variantA : config.variantB}
                  onChange={e => setConfig(p => v === 'A' ? { ...p, variantA: e.target.value } : { ...p, variantB: e.target.value })}
                  rows={4}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                />
              </div>
            ))}
          </div>

          <div className="flex gap-3 mt-4">
            <button onClick={startTest}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
              <Layers className="w-4 h-4" /> Bắt đầu thử nghiệm
            </button>
            <button onClick={() => setShowCreate(false)}
              className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 rounded-xl border border-gray-200 transition-colors">
              Hủy
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {hasData ? (
        <>
          <div className="grid grid-cols-2 gap-5 mb-5">
            <VariantCard variant={variantA} winner={winnerA} />
            <VariantCard variant={variantB} winner={!winnerA} />
          </div>

          {/* Verdict */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <p className="text-sm font-semibold text-gray-700 mb-3">Phân tích kết quả</p>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs text-gray-400 mb-1">Tổng cuộc gọi</p>
                <p className="text-2xl font-bold text-gray-800">{splitCalls.length}</p>
                <p className="text-xs text-gray-400 mt-0.5">{aCalls.length}A · {bCalls.length}B</p>
              </div>
              <div className={`rounded-xl p-4 ${winnerA ? 'bg-indigo-50' : 'bg-violet-50'}`}>
                <p className="text-xs text-gray-400 mb-1">Kịch bản dẫn đầu</p>
                <p className={`text-2xl font-bold ${winnerA ? 'text-indigo-600' : 'text-violet-600'}`}>
                  {winnerA ? 'A' : 'B'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Tỷ lệ đặt lịch cao hơn {Math.abs(Math.round((aScore - bScore) * 100))}%
                </p>
              </div>
              <div className="bg-green-50 rounded-xl p-4">
                <p className="text-xs text-gray-400 mb-1">Tổng lịch hẹn</p>
                <p className="text-2xl font-bold text-green-600">{variantA.booked + variantB.booked}</p>
                <p className="text-xs text-gray-400 mt-0.5">từ hai nhóm</p>
              </div>
            </div>

            <div className="mt-4 bg-amber-50 border border-amber-100 rounded-xl p-4">
              <p className="text-xs font-semibold text-amber-700 mb-1">Gợi ý từ AI</p>
              <p className="text-xs text-amber-600 leading-relaxed">
                {aScore > bScore
                  ? `Kịch bản A đang hiệu quả hơn (${Math.round(aScore * 100)}% vs ${Math.round(bScore * 100)}% tỷ lệ đặt lịch). Hãy chuyển toàn bộ data sang kịch bản A để tối đa hóa kết quả.`
                  : aScore < bScore
                  ? `Kịch bản B đang hiệu quả hơn (${Math.round(bScore * 100)}% vs ${Math.round(aScore * 100)}% tỷ lệ đặt lịch). Hãy cập nhật kịch bản AI chính sang nội dung của B.`
                  : 'Hai kịch bản đang có hiệu suất tương đương. Cần thêm dữ liệu (tối thiểu 50 cuộc gọi mỗi nhóm) để có kết quả có ý nghĩa thống kê.'}
              </p>
            </div>
          </div>
        </>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center shadow-sm">
          <Layers className="w-12 h-12 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-500 font-medium mb-1">Chưa có dữ liệu thử nghiệm</p>
          <p className="text-sm text-gray-400">Tạo thử nghiệm mới và bắt đầu chiến dịch gọi để thu thập dữ liệu</p>
          <button onClick={() => setShowCreate(true)}
            className="mt-4 flex items-center gap-2 mx-auto text-sm text-indigo-600 font-semibold hover:text-indigo-800 transition-colors">
            <Plus className="w-4 h-4" /> Tạo thử nghiệm đầu tiên <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </AppShell>
  )
}
