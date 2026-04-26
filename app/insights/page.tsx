'use client'

import { useEffect, useState } from 'react'
import { supabase, type Client, type Call } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/ui/app-shell'
import { PageSkeleton } from '@/components/skeleton'
import { TrendingUp, TrendingDown, AlertCircle, CheckCircle, Clock, Phone, Lightbulb, BarChart2 } from 'lucide-react'

type Insight = { type: 'success' | 'warning' | 'info' | 'tip'; title: string; desc: string; value?: string }

function calcInsights(calls: Call[]): Insight[] {
  if (calls.length === 0) return [{ type: 'info', title: 'Chưa có dữ liệu', desc: 'Hãy thực hiện một số cuộc gọi để xem phân tích.' }]

  const insights: Insight[] = []
  const total = calls.length
  const completed = calls.filter(c => c.status === 'completed').length
  const noAnswer  = calls.filter(c => c.status === 'no_answer').length
  const booked    = calls.filter(c => c.appointment_booked).length
  const connectRate = Math.round((completed / total) * 100)
  const bookRate    = completed > 0 ? Math.round((booked / completed) * 100) : 0
  const avgDur      = completed > 0 ? Math.round(calls.filter(c => c.status === 'completed').reduce((a, c) => a + (c.duration_seconds ?? 0), 0) / completed) : 0

  // Tỷ lệ kết nối
  if (connectRate >= 40) insights.push({ type: 'success', title: 'Tỷ lệ kết nối tốt', desc: `${connectRate}% cuộc gọi được nghe máy. Trên mức trung bình ngành (30-40%).`, value: `${connectRate}%` })
  else insights.push({ type: 'warning', title: 'Tỷ lệ kết nối thấp', desc: `Chỉ ${connectRate}% cuộc gọi được nghe. Thử gọi vào khung 9-11h hoặc 14-17h.`, value: `${connectRate}%` })

  // Tỷ lệ đặt lịch
  if (bookRate >= 20) insights.push({ type: 'success', title: 'Tỷ lệ đặt lịch xuất sắc', desc: `${bookRate}% người nghe máy đặt lịch hẹn. AI đang hoạt động rất hiệu quả.`, value: `${bookRate}%` })
  else if (bookRate >= 10) insights.push({ type: 'info', title: 'Tỷ lệ đặt lịch khá', desc: `${bookRate}% chuyển đổi. Thử cải thiện câu chào hỏi và kịch bản AI.`, value: `${bookRate}%` })
  else if (completed > 0) insights.push({ type: 'warning', title: 'Tỷ lệ đặt lịch cần cải thiện', desc: `Chỉ ${bookRate}% chuyển đổi. Hãy vào Trợ lý AI để điều chỉnh kịch bản.`, value: `${bookRate}%` })

  // Thời lượng trung bình
  if (avgDur >= 90) insights.push({ type: 'success', title: 'Cuộc gọi có chiều sâu', desc: `Trung bình ${Math.floor(avgDur/60)}p${avgDur%60}s — khách đang tương tác tốt với AI.`, value: `${Math.floor(avgDur/60)}p${avgDur%60}s` })
  else if (avgDur >= 30) insights.push({ type: 'info', title: 'Thời lượng trung bình', desc: `${Math.floor(avgDur/60)}p${avgDur%60}s mỗi cuộc. Tốt, nhưng có thể cải thiện thêm.`, value: `${Math.floor(avgDur/60)}p${avgDur%60}s` })
  else if (avgDur > 0) insights.push({ type: 'warning', title: 'Cuộc gọi quá ngắn', desc: `Trung bình chỉ ${avgDur}s — khách cúp máy sớm. Kiểm tra câu mở đầu của AI.`, value: `${avgDur}s` })

  // No-answer rate
  const noAnswerRate = Math.round((noAnswer / total) * 100)
  if (noAnswerRate > 70) insights.push({ type: 'warning', title: 'Quá nhiều cuộc gọi không nghe', desc: `${noAnswerRate}% không bắt máy. Data có thể chưa chất lượng hoặc sai khung giờ.` })

  // Gợi ý cụ thể
  if (booked === 0 && completed > 5) insights.push({ type: 'tip', title: 'Gợi ý: Kiểm tra kịch bản AI', desc: 'Đã có cuộc gọi kết nối nhưng chưa có lịch hẹn. Thử thêm "lợi ích khám miễn phí" vào kịch bản.' })
  if (noAnswer > 20) insights.push({ type: 'tip', title: 'Gợi ý: Bật retry tự động', desc: `${noAnswer} số chưa nghe máy. WF4 retry scheduler đang tự động gọi lại sau 2h.` })
  if (total > 50 && bookRate > 15) insights.push({ type: 'tip', title: 'Gợi ý: Mở rộng data', desc: 'Tỷ lệ chuyển đổi tốt! Hãy upload thêm data để tăng lịch hẹn.' })

  return insights
}

function HourlyChart({ calls }: { calls: Call[] }) {
  const hourCounts = Array(24).fill(0)
  calls.filter(c => c.status === 'completed').forEach(c => {
    const h = new Date(c.created_at).getHours()
    hourCounts[h]++
  })
  const max = Math.max(...hourCounts, 1)
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts))
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-500">Phân bổ cuộc gọi theo giờ</p>
        <p className="text-xs text-indigo-600 font-medium">Giờ vàng: {peakHour}:00 – {peakHour + 1}:00</p>
      </div>
      <div className="flex items-end gap-0.5 h-16">
        {hourCounts.map((cnt, h) => (
          <div key={h} className="flex-1 flex flex-col items-center gap-0.5">
            <div className={`w-full rounded-sm transition-all ${cnt > 0 ? 'bg-indigo-400' : 'bg-gray-100'}`}
              style={{ height: `${(cnt / max) * 56}px`, minHeight: cnt > 0 ? 4 : 2 }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs text-gray-300 mt-1">
        <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span>
      </div>
    </div>
  )
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  success: <CheckCircle className="w-4 h-4 text-green-500" />,
  warning: <AlertCircle className="w-4 h-4 text-amber-500" />,
  info:    <BarChart2  className="w-4 h-4 text-blue-500" />,
  tip:     <Lightbulb className="w-4 h-4 text-violet-500" />,
}
const TYPE_BG: Record<string, string> = {
  success: 'bg-green-50 border-green-100',
  warning: 'bg-amber-50 border-amber-100',
  info:    'bg-blue-50 border-blue-100',
  tip:     'bg-violet-50 border-violet-100',
}

export default function InsightsPage() {
  const router = useRouter()
  const [client, setClient] = useState<Client | null>(null)
  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)

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

  const insights = calcInsights(calls)
  const total     = calls.length
  const completed = calls.filter(c => c.status === 'completed').length
  const booked    = calls.filter(c => c.appointment_booked).length
  const bookRate  = completed > 0 ? Math.round((booked / completed) * 100) : 0
  const avgDur    = completed > 0 ? Math.round(calls.filter(c => c.status === 'completed').reduce((a, c) => a + (c.duration_seconds ?? 0), 0) / completed) : 0

  if (loading) return <PageSkeleton />

  return (
    <AppShell clientName={client?.name}>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-800">Gợi ý AI</h1>
        <p className="text-sm text-gray-400 mt-0.5">Phân tích hiệu suất cuộc gọi và đề xuất cải thiện</p>
      </div>

      {/* KPI nhanh */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Tổng cuộc gọi', value: total, icon: Phone, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'Kết nối thành công', value: completed, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Đặt lịch', value: booked, icon: TrendingUp, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Thời lượng TB', value: avgDur > 0 ? `${Math.floor(avgDur/60)}p${avgDur%60}s` : '--', icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50' },
        ].map(item => {
          const Icon = item.icon
          return (
            <div key={item.label} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <div className={`w-9 h-9 ${item.bg} rounded-xl flex items-center justify-center mb-3`}>
                <Icon className={`w-4.5 h-4.5 ${item.color}`} />
              </div>
              <p className="text-2xl font-bold text-gray-800">{item.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{item.label}</p>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-3 gap-5" style={{ alignItems: 'start' }}>
        {/* Insights */}
        <div className="col-span-2 space-y-3">
          <p className="text-sm font-semibold text-gray-700 mb-1">Phân tích & Gợi ý (30 ngày gần nhất)</p>
          {insights.map((ins, i) => (
            <div key={i} className={`border rounded-2xl p-4 ${TYPE_BG[ins.type]}`}>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">{TYPE_ICON[ins.type]}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-800">{ins.title}</p>
                    {ins.value && <span className="text-lg font-bold text-gray-700 shrink-0">{ins.value}</span>}
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{ins.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Chart + Quick stats */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <HourlyChart calls={calls} />
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 mb-3">Tỷ lệ chuyển đổi</p>
            <div className="space-y-3">
              {[
                { label: 'Kết nối', value: total > 0 ? Math.round(completed/total*100) : 0, color: 'bg-indigo-400' },
                { label: 'Đặt lịch', value: bookRate, color: 'bg-green-400' },
              ].map(item => (
                <div key={item.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-500">{item.label}</span>
                    <span className="font-semibold text-gray-700">{item.value}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full ${item.color} rounded-full transition-all`} style={{ width: `${item.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
