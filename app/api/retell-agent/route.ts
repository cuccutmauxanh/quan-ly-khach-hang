import { NextRequest, NextResponse } from 'next/server'

const RETELL_KEY = process.env.RETELL_API_KEY!
const BASE = 'https://api.retellai.com'

export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get('agentId')
  if (!agentId) return NextResponse.json({ error: 'Missing agentId' }, { status: 400 })

  const agentRes = await fetch(`${BASE}/v2/get-agent/${agentId}`, {
    headers: { Authorization: `Bearer ${RETELL_KEY}` },
  })
  if (!agentRes.ok) return NextResponse.json(await agentRes.json(), { status: agentRes.status })

  const agent = await agentRes.json()

  let general_prompt: string | null = null
  let llm_id: string | null = null

  if (agent.response_engine?.type === 'retell-llm') {
    llm_id = agent.response_engine.llm_id
    const llmRes = await fetch(`${BASE}/v2/get-retell-llm/${llm_id}`, {
      headers: { Authorization: `Bearer ${RETELL_KEY}` },
    })
    if (llmRes.ok) {
      const llm = await llmRes.json()
      general_prompt = llm.general_prompt ?? null
    }
  }

  return NextResponse.json({
    agent_name:            agent.agent_name,
    voice_id:              agent.voice_id,
    begin_message:         agent.begin_message ?? null,
    general_prompt,
    llm_id,
    response_engine_type:  agent.response_engine?.type ?? null,
    responsiveness:        agent.responsiveness ?? 0.8,
    max_call_duration_ms:  agent.max_call_duration_ms ?? null,
    reminder_trigger_ms:   agent.reminder_trigger_ms ?? 3000,
  })
}

export async function PATCH(request: NextRequest) {
  const body = await request.json()
  const {
    agentId, begin_message, general_prompt, llm_id,
    responsiveness, max_call_duration_ms, reminder_trigger_ms,
  } = body
  if (!agentId) return NextResponse.json({ error: 'Missing agentId' }, { status: 400 })

  // Cập nhật agent
  const agentPayload: Record<string, unknown> = {
    begin_message: begin_message ?? null,
  }
  if (responsiveness !== undefined)       agentPayload.responsiveness       = responsiveness
  if (max_call_duration_ms !== undefined) agentPayload.max_call_duration_ms = max_call_duration_ms
  if (reminder_trigger_ms !== undefined)  agentPayload.reminder_trigger_ms  = reminder_trigger_ms

  const agentRes = await fetch(`${BASE}/v2/update-agent/${agentId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${RETELL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(agentPayload),
  })

  // Cập nhật LLM prompt nếu có
  if (llm_id && general_prompt !== undefined) {
    const llmRes = await fetch(`${BASE}/v2/update-retell-llm/${llm_id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${RETELL_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ general_prompt }),
    })
    if (!llmRes.ok) {
      const err = await llmRes.json()
      return NextResponse.json({ error: 'LLM update failed', detail: err }, { status: llmRes.status })
    }
  }

  const data = await agentRes.json()
  return NextResponse.json(data, { status: agentRes.status })
}
