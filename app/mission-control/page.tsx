'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase, type Client, type Call } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import {
  Zap, Target, CalendarCheck, Upload, Square,
  ChevronDown, Eye, MessageSquare, Radio, ArrowLeft,
  TrendingUp, PhoneOff, Phone,
} from 'lucide-react'
import * as XLSX from 'xlsx'

// ── Types ──────────────────────────────────────────────────────────────────────

type MissionStatus = 'standby' | 'active'

type Campaign = {
  id: string
  name: string
  agentField: keyof Client
  target: string
}

const CAMPAIGNS: Campaign[] = [
  { id: 'voucher',   name: '🦷 Voucher lấy cao răng 0đ', agentField: 'agent_cold_id', target: 'Data lạnh khu vực' },
  { id: 'implant',   name: '🔩 Implant tháng 4 ưu đãi',  agentField: 'agent_warm_id', target: 'Khách từng hỏi mất răng' },
  { id: 'tay_trang', name: '✨ Tẩy trắng răng ưu đãi',   agentField: 'agent_cold_id', target: 'Nữ 25–45 tuổi' },
  { id: 'kham',      name: '🩺 Khám sức khỏe miễn phí',  agentField: 'agent_cold_id', target: 'Data tổng hợp' },
]

// ── Helpers ────────────────────────────────────────────────────────────────────

function calcScore(call: Call): number {
  let s = 0
  if (call.appointment_booked) s += 50
  const d = call.duration_seconds ?? 0
  if (d >= 120) s += 30; else if (d >= 60) s += 20; else if (d >= 30) s += 10
  if (call.status === 'completed') s += 20
  return Math.min(s, 100)
}

function extractKeyword(summary: string | null): string | null {
  if (!summary) return null
  const s = summary.toLowerCase()
  if (s.includes('implant'))    return 'Implant'
  if (s.includes('niềng'))      return 'Niềng răng'
  if (s.includes('tẩy trắng')) return 'Tẩy trắng'
  if (s.includes('nhổ'))        return 'Nhổ răng'
  if (s.includes('đau'))        return 'Đau răng'
  if (s.includes('lấy cao'))    return 'Lấy cao răng'
  if (s.includes('hỏi giá') || s.includes('bao nhiêu')) return 'Hỏi giá'
  return null
}

function extractSentiment(summary: string | null): 'hot' | 'busy' | 'negative' | 'neutral' {
  if (!summary) return 'neutral'
  const s = summary.toLowerCase()
  if (s.includes('không hài lòng') || s.includes('tức') || s.includes('khiếu nại')) return 'negative'
  if (s.includes('đặt lịch') || s.includes('sẵn sàng') || s.includes('đồng ý') || s.includes('hỏi giá')) return 'hot'
  if (s.includes('bận') || s.includes('gọi lại')) return 'busy'
  return 'neutral'
}

const SENTIMENT_MAP = {
  hot:      { emoji: '🔥', label: 'Quan tâm',  color: 'text-cyan-400' },
  busy:     { emoji: '⏰', label: 'Đang bận',  color: 'text-amber-400' },
  negative: { emoji: '😤', label: 'Khó chịu', color: 'text-red-400' },
  neutral:  { emoji: '😐', label: 'Trung lập', color: 'text-slate-500' },
}

function fmtTime(s: string): string {
  const d = new Date(s)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

function nextRetry(): string {
  return new Date().getHours() < 13 ? '14:00 hôm nay' : '09:00 mai'
}

// ── Micro Components ───────────────────────────────────────────────────────────

function PulseCore({ active }: { active: boolean }) {
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0">
      {active && (
        <motion.span
          className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"
          animate={{ scale: [1, 2.2, 1], opacity: [0.75, 0, 0.75] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${active ? 'bg-cyan-400 shadow-[0_0_8px_#00f2ff]' : 'bg-slate-600'}`} />
    </span>
  )
}

function ScoreBar({ score }: { score: number }) {
  const gradient = score >= 70 ? 'from-cyan-400 to-teal-300' : score >= 40 ? 'from-amber-400 to-yellow-300' : 'from-slate-600 to-slate-500'
  const textColor = score >= 70 ? 'text-cyan-400' : score >= 40 ? 'text-amber-400' : 'text-slate-500'
  const sentiment = score >= 70 ? 'hot' : score >= 40 ? 'busy' : 'neutral'
  const { emoji } = SENTIMENT_MAP[sentiment]

  return (
    <div className="flex items-center gap-2 w-full">
      <span className="text-sm leading-none">{emoji}</span>
      <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
        <motion.div
          className={`h-full rounded-full bg-gradient-to-r ${gradient}`}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
        />
      </div>
      <span className={`text-xs font-black tabular-nums w-6 text-right ${textColor}`}>{score}</span>
    </div>
  )
}

function RetryDots({ call }: { call: Call }) {
  const n = call.retry_count ?? 0
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map(i => (
        <div key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${i < n ? 'bg-red-500' : 'bg-white/15'}`} />
      ))}
      <span className="text-xs text-white/30 ml-1">
        {n < 3 ? `→ ${nextRetry()}` : '✕ Hết lần gọi'}
      </span>
    </div>
  )
}

// ── Intelligence Hub ────────────────────────────────────────────────────────────

function IntelligenceHub({
  calls, activeFilter, onFilter,
}: {
  calls: Call[]
  activeFilter: string
  onFilter: (f: string) => void
}) {
  const outbound   = calls.filter(c => c.direction === 'outbound')
  const activeCnt  = outbound.filter(c => c.status === 'in_progress').length
  const hotCnt     = calls.filter(c => calcScore(c) >= 70 && c.status !== 'no_answer').length
  const bookedCnt  = calls.filter(c => c.appointment_booked).length

  const cards = [
    {
      id: 'radar',
      label: 'Radar Mode',
      sub: 'AI đang thực hiện',
      value: activeCnt,
      unit: 'cuộc gọi',
      Icon: Radio,
      ring: 'hover:border-cyan-500/50',
      activeRing: 'border-cyan-500/40 shadow-[0_0_40px_rgba(0,242,255,0.12)]',
      valueCls: 'text-cyan-400',
      glowBg: 'radial-gradient(ellipse at 50% 0%,rgba(0,242,255,0.12),transparent 70%)',
      pulse: activeCnt > 0,
    },
    {
      id: 'hot',
      label: 'Hot Leads',
      sub: 'Score ≥ 70 điểm',
      value: hotCnt,
      unit: 'leads nóng',
      Icon: TrendingUp,
      ring: 'hover:border-amber-500/50',
      activeRing: 'border-amber-500/40 shadow-[0_0_40px_rgba(245,158,11,0.12)]',
      valueCls: 'text-amber-400',
      glowBg: 'radial-gradient(ellipse at 50% 0%,rgba(245,158,11,0.12),transparent 70%)',
      pulse: false,
    },
    {
      id: 'success',
      label: 'Đã chốt lịch',
      sub: 'Lịch hẹn hôm nay',
      value: bookedCnt,
      unit: 'lịch hẹn',
      Icon: CalendarCheck,
      ring: 'hover:border-emerald-500/50',
      activeRing: 'border-emerald-500/40 shadow-[0_0_40px_rgba(16,185,129,0.12)]',
      valueCls: 'text-emerald-400',
      glowBg: 'radial-gradient(ellipse at 50% 0%,rgba(16,185,129,0.12),transparent 70%)',
      pulse: false,
    },
  ]

  return (
    <div className="grid grid-cols-3 gap-4 mb-5">
      {cards.map((card, i) => {
        const on = activeFilter === card.id
        const Icon = card.Icon
        return (
          <motion.button
            key={card.id}
            onClick={() => onFilter(on ? 'all' : card.id)}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, duration: 0.4 }}
            whileTap={{ scale: 0.97 }}
            className={`relative overflow-hidden rounded-2xl border p-5 text-left transition-all duration-300
              bg-white/[0.03] backdrop-blur-xl
              ${on ? card.activeRing : `border-white/[0.07] ${card.ring}`}`}
          >
            {/* Glow bg */}
            <div className="absolute inset-0 pointer-events-none" style={{ background: on ? card.glowBg : 'transparent', transition: 'background 0.3s' }} />

            {/* Pulse rings for active */}
            {card.pulse && (
              <>
                <motion.div className="absolute inset-0 rounded-2xl border border-cyan-400/30 pointer-events-none"
                  animate={{ opacity: [0.4, 0, 0.4] }} transition={{ duration: 2, repeat: Infinity }} />
                <motion.div className="absolute -inset-px rounded-2xl border border-cyan-400/15 pointer-events-none"
                  animate={{ opacity: [0, 0.6, 0] }} transition={{ duration: 2, repeat: Infinity, delay: 0.6 }} />
              </>
            )}

            <div className="relative z-10 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <Icon className={`w-4 h-4 ${card.valueCls} opacity-80`} />
                {on && (
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
                    Filter ON
                  </span>
                )}
              </div>

              <div>
                <motion.p
                  key={card.value}
                  initial={{ opacity: 0.4, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`text-5xl font-black tabular-nums leading-none ${card.valueCls}`}
                  style={{ textShadow: on ? `0 0 30px currentColor` : 'none' }}
                >
                  {card.value}
                </motion.p>
                <p className="text-[11px] text-white/35 mt-1.5 font-medium">{card.unit}</p>
              </div>

              <div className="border-t border-white/[0.06] pt-3">
                <p className="text-xs font-semibold text-white/60">{card.label}</p>
                <p className="text-[11px] text-white/25 mt-0.5">{card.sub}</p>
              </div>
            </div>
          </motion.button>
        )
      })}
    </div>
  )
}

// ── Call Feed Item ─────────────────────────────────────────────────────────────

function CallFeedItem({
  call, idx, onView,
}: {
  call: Call
  idx: number
  onView: (c: Call) => void
}) {
  const score     = calcScore(call)
  const keyword   = extractKeyword(call.summary)
  const sentiment = extractSentiment(call.summary)
  const isHot     = score >= 70
  const isLive    = call.status === 'in_progress'
  const isNoAns   = call.status === 'no_answer'
  const justDone  = call.status === 'completed' && !call.summary
  const zaloHref  = `https://zalo.me/${(call.contact_phone ?? '').replace(/^0/, '84')}`

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.25, delay: Math.min(idx * 0.03, 0.3) }}
      className={`group relative rounded-xl border transition-all duration-300
        ${isHot  ? 'border-cyan-500/25 bg-[linear-gradient(to_right,rgba(0,242,255,0.06),transparent)]'
        : isLive ? 'border-cyan-500/40 bg-cyan-500/5'
        :          'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10'}`}
    >
      {/* Hot left bar */}
      {isHot && (
        <motion.div
          className="absolute left-0 top-3 bottom-3 w-[2px] rounded-full bg-cyan-400"
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}

      <div className="flex items-center gap-3 px-4 py-3.5">

        {/* Avatar */}
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0
          ${isHot ? 'bg-cyan-500/20 text-cyan-300' : 'bg-white/5 text-white/40'}`}>
          {(call.contact_name || call.contact_phone || '?')[0].toUpperCase()}
        </div>

        {/* Col 1: Name + Context */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className={`text-sm font-semibold truncate ${isHot ? 'text-white' : 'text-white/80'}`}>
              {call.contact_name || call.contact_phone || '—'}
            </span>
            {keyword && (
              <span className="shrink-0 text-[10px] font-bold px-1.5 py-px rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/20">
                {keyword}
              </span>
            )}
            {/* Golden hour tag */}
            {isNoAns && (call.retry_count ?? 0) === 0 && (
              <span className="shrink-0 text-[10px] font-semibold px-1.5 py-px rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/20">
                ⏰ Giờ vàng
              </span>
            )}
          </div>

          {/* Ghost writing — AI analyzing */}
          {justDone ? (
            <motion.p className="text-[11px] text-cyan-400/70 font-mono"
              animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.4, repeat: Infinity }}>
              ✦ AI đang phân tích...
            </motion.p>
          ) : (
            <p className="text-[11px] text-white/25 truncate">
              {call.summary?.slice(0, 60) || `${fmtTime(call.created_at)} · ${call.direction === 'inbound' ? 'Gọi đến' : 'Gọi đi'}`}
            </p>
          )}
        </div>

        {/* Col 2: AI Status */}
        <div className="w-44 shrink-0">
          {isLive ? (
            <div className="flex items-center gap-2">
              <motion.div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#00f2ff]"
                animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 0.7, repeat: Infinity }} />
              <span className="text-xs text-cyan-400 font-medium">AI đang gọi...</span>
            </div>
          ) : isNoAns ? (
            <RetryDots call={call} />
          ) : call.appointment_booked ? (
            <span className="text-xs text-emerald-400 font-semibold">✓ Đã chốt lịch</span>
          ) : (
            <span className="text-[11px] text-white/20">{call.status === 'completed' ? 'Hoàn thành' : call.status ?? '—'}</span>
          )}
        </div>

        {/* Col 3: Score Bar */}
        <div className="w-28 shrink-0">
          <ScoreBar score={score} />
        </div>

        {/* Col 4: Quick Actions — appear on hover */}
        <div className="flex gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-2 group-hover:translate-x-0">
          <button
            onClick={() => onView(call)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/8 hover:bg-white/12 text-white/60 hover:text-white text-[11px] font-medium transition-all border border-white/8 hover:border-white/15"
          >
            <Eye className="w-3 h-3" />
            Transcript
          </button>
          <a
            href={zaloHref} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 text-[11px] font-medium transition-all border border-cyan-500/20 hover:border-cyan-500/40 no-underline"
          >
            <MessageSquare className="w-3 h-3" />
            Zalo
          </a>
        </div>
      </div>
    </motion.div>
  )
}

// ── Transcript Modal ───────────────────────────────────────────────────────────

function TranscriptModal({ call, onClose }: { call: Call; onClose: () => void }) {
  const score = calcScore(call)
  const sentiment = extractSentiment(call.summary)
  const sm = SENTIMENT_MAP[sentiment]

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(3,6,16,0.85)', backdropFilter: 'blur(12px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 16 }}
        animate={{ scale: 1,    opacity: 1, y: 0  }}
        exit   ={{ scale: 0.92, opacity: 0, y: 16 }}
        transition={{ type: 'spring', damping: 20, stiffness: 260 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-white/10 overflow-hidden"
        style={{ background: 'linear-gradient(135deg,#0d1527,#080f1c)' }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.07] flex items-start justify-between">
          <div>
            <p className="font-bold text-white text-sm">{call.contact_name || call.contact_phone || '—'}</p>
            <div className="flex items-center gap-3 mt-1">
              <span className={`text-xs font-semibold ${sm.color}`}>{sm.emoji} {sm.label}</span>
              <span className="text-xs text-white/30">Score: {score}/100</span>
              {call.duration_seconds && (
                <span className="text-xs text-white/30">{Math.floor(call.duration_seconds/60)}p{call.duration_seconds%60}s</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white text-lg leading-none transition-colors">✕</button>
        </div>

        {/* Body */}
        <div className="p-5 max-h-[60vh] overflow-y-auto space-y-4">
          {call.appointment_booked && (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3">
              <p className="text-xs font-bold text-emerald-400 mb-0.5">🗓 Đã chốt lịch hẹn</p>
              <p className="text-sm text-emerald-300">{call.appointment_datetime || 'Thời gian chưa xác định'}</p>
            </div>
          )}

          {call.summary && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-400/70 mb-2">AI Summary</p>
              <p className="text-sm text-white/70 leading-relaxed bg-white/[0.03] rounded-xl p-3 border border-white/[0.06]">
                {call.summary}
              </p>
            </div>
          )}

          {call.transcript && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-400/70 mb-2">Transcript</p>
              <div className="space-y-1.5 bg-white/[0.03] rounded-xl p-3 border border-white/[0.06]">
                {call.transcript.split('\n').filter(l => l.trim()).map((line, i) => (
                  <p key={i} className={`text-xs leading-relaxed ${line.startsWith('Agent:') ? 'text-cyan-300/80' : 'text-white/50'}`}>
                    {line}
                  </p>
                ))}
              </div>
            </div>
          )}

          {!call.summary && !call.transcript && (
            <div className="py-8 text-center">
              <motion.p className="text-sm text-cyan-400/50 font-mono"
                animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.5, repeat: Infinity }}>
                ✦ AI đang phân tích cuộc gọi...
              </motion.p>
            </div>
          )}
        </div>

        {call.recording_url && (
          <div className="px-5 pb-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2">Ghi âm</p>
            <audio controls src={call.recording_url} className="w-full h-8 rounded-lg" />
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function MissionControlPage() {
  const router = useRouter()
  const [client, setClient]   = useState<Client | null>(null)
  const [calls, setCalls]     = useState<Call[]>([])
  const [loading, setLoading] = useState(true)

  const [status, setStatus]               = useState<MissionStatus>('standby')
  const [selectedCampaign, setCampaign]   = useState<Campaign | null>(null)
  const [activeFilter, setActiveFilter]   = useState('all')
  const [transcriptCall, setTranscript]   = useState<Call | null>(null)
  const [uploadList, setUploadList]       = useState<{ name: string; phone: string }[]>([])
  const [isRunning, setIsRunning]         = useState(false)
  const [showDropdown, setShowDropdown]   = useState(false)
  const [tick, setTick]                   = useState(0)

  const fileRef    = useRef<HTMLInputElement>(null)
  const abortRef   = useRef(false)
  const clientRef  = useRef<string | null>(null)

  // ── Auth + data load ──────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: cu } = await supabase.from('client_users').select('client_id').eq('user_id', user.id).single()
      if (!cu) { setLoading(false); return }
      clientRef.current = cu.client_id
      const [{ data: c }, { data: cl }] = await Promise.all([
        supabase.from('clients').select('*').eq('id', cu.client_id).single(),
        supabase.from('calls').select('*').eq('tenant_id', cu.client_id).order('created_at', { ascending: false }).limit(80),
      ])
      setClient(c); setCalls(cl ?? [])
      setLoading(false)
    }
    init()
  }, [router])

  // ── Live refresh every 15 s ───────────────────────────────────────────────
  const fetchCalls = useCallback(async () => {
    if (!clientRef.current) return
    const { data } = await supabase.from('calls').select('*').eq('tenant_id', clientRef.current).order('created_at', { ascending: false }).limit(80)
    setCalls(data ?? [])
    setTick(t => t + 1)
  }, [])

  useEffect(() => {
    const iv = setInterval(fetchCalls, 15000)
    return () => clearInterval(iv)
  }, [fetchCalls])

  // ── File import ───────────────────────────────────────────────────────────
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = evt => {
      const wb   = XLSX.read(evt.target?.result, { type: 'array' })
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets[wb.SheetNames[0]])
      setUploadList(rows.map(r => ({
        name:  String(r['Tên'] ?? r['ten'] ?? r['name'] ?? ''),
        phone: String(r['Số điện thoại'] ?? r['sdt'] ?? r['phone'] ?? '').replace(/\D/g, ''),
      })).filter(r => r.phone.length >= 9))
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  // ── Mission launch / stop ─────────────────────────────────────────────────
  async function launchMission() {
    if (!client || !selectedCampaign || uploadList.length === 0) return
    const agentId    = client[selectedCampaign.agentField] as string | null
    const fromNumber = client.retell_phone_number
    if (!agentId || !fromNumber) return

    abortRef.current = false
    setIsRunning(true); setStatus('active')

    for (let i = 0; i < uploadList.length; i++) {
      if (abortRef.current) break
      try {
        await fetch('/api/outbound', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phones: [uploadList[i]], agentId, fromNumber }),
        })
      } catch { /* ignore individual errors */ }
      if (i < uploadList.length - 1 && !abortRef.current) await new Promise(r => setTimeout(r, 3000))
    }
    setIsRunning(false); setStatus('standby')
  }

  function stopMission() {
    abortRef.current = true
    setIsRunning(false); setStatus('standby')
  }

  // ── Filtered feed ─────────────────────────────────────────────────────────
  const feed = calls.filter(c => {
    if (activeFilter === 'radar')   return c.status === 'in_progress'
    if (activeFilter === 'hot')     return calcScore(c) >= 70 && c.status !== 'no_answer'
    if (activeFilter === 'success') return c.appointment_booked
    return true
  })

  const canLaunch = !!selectedCampaign && uploadList.length > 0

  // ── Loading screen ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#050b14' }}>
        <div className="text-center">
          <motion.div className="text-cyan-400 font-mono text-lg tracking-widest"
            animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.6, repeat: Infinity }}>
            INITIALIZING MISSION CONTROL
          </motion.div>
          <div className="mt-3 h-px w-48 mx-auto bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-60" />
        </div>
      </div>
    )
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen text-white font-sans" style={{ background: 'linear-gradient(135deg,#050b14 0%,#060c16 50%,#04080f 100%)' }}>

      {/* Scanline texture */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-40"
        style={{ backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,242,255,0.015) 3px,rgba(0,242,255,0.015) 4px)' }} />

      {/* Vignette */}
      <div className="fixed inset-0 pointer-events-none z-0"
        style={{ background: 'radial-gradient(ellipse at 50% 50%,transparent 50%,rgba(0,0,0,0.5) 100%)' }} />

      <div className="relative z-10 max-w-6xl mx-auto px-5 py-6">

        {/* ── Top Bar ── */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-7"
        >
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-2 text-white/30 hover:text-white/80 transition-colors text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2.5 mb-px">
                <PulseCore active={status === 'active'} />
                <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-white/30">
                  AutoVoice Pro
                </span>
              </div>
              <h1 className="text-2xl font-black tracking-tight text-white leading-none">
                Mission Control
              </h1>
            </div>
          </div>

          {/* Live indicator */}
          <div className="flex items-center gap-2 text-xs text-white/25 font-mono">
            <motion.div className="w-1.5 h-1.5 rounded-full bg-cyan-400 opacity-60"
              animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 2, repeat: Infinity }} />
            LIVE · {client?.name ?? '—'}
          </div>
        </motion.div>

        {/* ── Command Center ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-2xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-2xl p-5 mb-5"
        >
          <div className="flex items-end gap-4 flex-wrap">

            {/* Campaign picker */}
            <div className="flex-1 min-w-[220px]">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/25 mb-2">Chiến dịch</p>
              <div className="relative">
                <button
                  onClick={() => setShowDropdown(v => !v)}
                  className={`w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all
                    ${selectedCampaign
                      ? 'border-cyan-500/30 bg-cyan-500/8 text-white'
                      : 'border-white/10 bg-white/[0.04] text-white/40 hover:border-white/20'}`}
                >
                  <span className="truncate">{selectedCampaign?.name ?? '— Chọn chiến dịch —'}</span>
                  <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${showDropdown ? 'rotate-180' : ''} text-white/30`} />
                </button>

                <AnimatePresence>
                  {showDropdown && (
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0,  scale: 1    }}
                      exit   ={{ opacity: 0, y: -8, scale: 0.97 }}
                      transition={{ duration: 0.15 }}
                      className="absolute top-full left-0 right-0 mt-1 rounded-xl border border-white/10 overflow-hidden z-20"
                      style={{ background: '#0b1220', backdropFilter: 'blur(20px)' }}
                    >
                      {CAMPAIGNS.map(c => (
                        <button
                          key={c.id}
                          onClick={() => { setCampaign(c); setShowDropdown(false) }}
                          className={`w-full text-left px-4 py-3 text-sm transition-colors hover:bg-white/[0.06]
                            ${selectedCampaign?.id === c.id ? 'text-cyan-300 bg-cyan-500/10' : 'text-white/70'}`}
                        >
                          <p className="font-medium">{c.name}</p>
                          <p className="text-[11px] text-white/25 mt-0.5">{c.target}</p>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Data import */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/25 mb-2">Data</p>
              <button
                onClick={() => fileRef.current?.click()}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all
                  ${uploadList.length > 0
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-white/10 bg-white/[0.04] text-white/40 hover:border-white/20 hover:text-white/60'}`}
              >
                <Upload className="w-4 h-4" />
                {uploadList.length > 0 ? `${uploadList.length} số đã tải` : 'Import Excel'}
              </button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
            </div>

            <div className="flex-1" />

            {/* ── AI MODE TOGGLE — Hero CTA ── */}
            <div className="flex flex-col items-center gap-2">
              <p className={`text-[10px] font-bold uppercase tracking-[0.15em] transition-colors ${status === 'active' ? 'text-cyan-400/80' : 'text-white/25'}`}>
                {status === 'active' ? `⬤  AI đang hoạt động` : 'Chế độ chờ'}
              </p>

              <motion.button
                onClick={() => status === 'standby' ? launchMission() : stopMission()}
                disabled={status === 'standby' && !canLaunch}
                whileTap={{ scale: 0.96 }}
                className={`relative flex items-center gap-3 px-7 py-3.5 rounded-2xl font-bold text-sm tracking-wide transition-all duration-300 overflow-hidden disabled:opacity-25 disabled:cursor-not-allowed
                  ${status === 'active'
                    ? 'border border-red-500/40 text-red-300'
                    : 'border text-cyan-300'
                  }`}
                style={status === 'active'
                  ? { background: 'linear-gradient(135deg,rgba(239,68,68,0.15),rgba(220,38,38,0.08))' }
                  : { background: 'linear-gradient(135deg,rgba(0,242,255,0.15),rgba(0,180,216,0.08))', borderColor: 'rgba(0,242,255,0.35)' }
                }
              >
                {/* Animated glow sweep */}
                {status === 'active' && (
                  <motion.div
                    className="absolute inset-0 pointer-events-none"
                    style={{ background: 'linear-gradient(90deg,transparent,rgba(0,242,255,0.08),transparent)' }}
                    animate={{ x: ['-100%', '100%'] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  />
                )}

                {/* Outer pulse ring */}
                {status === 'active' && (
                  <motion.div
                    className="absolute -inset-0.5 rounded-2xl border border-cyan-400/20 pointer-events-none"
                    animate={{ opacity: [0.3, 0.8, 0.3] }}
                    transition={{ duration: 1.6, repeat: Infinity }}
                  />
                )}

                <PulseCore active={status === 'active'} />
                <span className="relative z-10 font-mono tracking-widest text-xs">
                  {status === 'active'
                    ? isRunning ? `STOP MISSION` : 'SYSTEM ACTIVE'
                    : 'START AUTONOMOUS MODE'}
                </span>
                {status === 'active'
                  ? <Square className="w-3.5 h-3.5 relative z-10" />
                  : <Zap className="w-3.5 h-3.5 relative z-10" />}
              </motion.button>
            </div>

          </div>
        </motion.div>

        {/* ── Intelligence Hub ── */}
        <IntelligenceHub calls={calls} activeFilter={activeFilter} onFilter={setActiveFilter} />

        {/* ── Live Radar Feed ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
          className="rounded-2xl border border-white/[0.07] bg-white/[0.02] backdrop-blur-xl overflow-hidden"
        >
          {/* Table header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
            <div className="flex items-center gap-3">
              <PulseCore active={status === 'active'} />
              <span className="text-sm font-semibold text-white/80">Live Radar</span>
              <span className="text-xs text-white/20 font-mono">{feed.length} records</span>
            </div>

            <div className="flex items-center gap-2">
              {activeFilter !== 'all' && (
                <button
                  onClick={() => setActiveFilter('all')}
                  className="flex items-center gap-1 text-[11px] text-white/40 hover:text-white/70 bg-white/[0.04] hover:bg-white/[0.08] px-3 py-1 rounded-lg border border-white/[0.06] transition-all"
                >
                  ✕ Xóa filter
                </button>
              )}
              <div className="hidden text-[11px] text-white/20 font-mono">
                Cập nhật lúc {new Date().getHours()}:{String(new Date().getMinutes()).padStart(2,'0')}
              </div>
            </div>
          </div>

          {/* Column labels */}
          <div className="hidden sm:flex items-center gap-3 px-5 py-2 border-b border-white/[0.04]">
            <div className="w-8" />
            <p className="flex-1 text-[10px] font-bold uppercase tracking-widest text-white/20">Khách hàng & Nhu cầu</p>
            <p className="w-44 text-[10px] font-bold uppercase tracking-widest text-white/20">AI Status</p>
            <p className="w-28 text-[10px] font-bold uppercase tracking-widest text-white/20">Score</p>
            <p className="w-40 text-[10px] font-bold uppercase tracking-widest text-white/20">Thao tác</p>
          </div>

          {/* Feed */}
          <div className="p-3 space-y-1.5 max-h-[calc(100vh-500px)] min-h-[240px] overflow-y-auto custom-scrollbar">
            <AnimatePresence mode="popLayout">
              {feed.length === 0 ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center py-16 text-center"
                >
                  <Radio className="w-8 h-8 text-white/10 mb-3" />
                  <p className="text-sm text-white/20">Không có dữ liệu trong bộ lọc này</p>
                  <p className="text-xs text-white/10 mt-1">Import data và bật Autonomous Mode để bắt đầu</p>
                </motion.div>
              ) : (
                feed.slice(0, 30).map((call, idx) => (
                  <CallFeedItem key={call.id} call={call} idx={idx} onView={setTranscript} />
                ))
              )}
            </AnimatePresence>
          </div>
        </motion.div>

      </div>{/* /container */}

      {/* ── Transcript Modal ── */}
      <AnimatePresence>
        {transcriptCall && (
          <TranscriptModal call={transcriptCall} onClose={() => setTranscript(null)} />
        )}
      </AnimatePresence>

      {/* Custom scrollbar style */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,242,255,0.15); border-radius: 99px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(0,242,255,0.3); }
      `}</style>
    </div>
  )
}