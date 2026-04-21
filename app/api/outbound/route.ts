import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const { phones, agentId, fromNumber } = await request.json()

  if (!phones?.length || !agentId || !fromNumber) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const apiKey = process.env.RETELL_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Retell API key not configured' }, { status: 500 })
  }

  const results = []
  for (const item of phones) {
    try {
      const res = await fetch('https://api.retellai.com/v2/create-phone-call', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from_number: fromNumber,
          to_number: item.phone.startsWith('+') ? item.phone : `+84${item.phone.replace(/^0/, '')}`,
          agent_id: agentId,
          retell_llm_dynamic_variables: {
            customer_name: item.name || '',
          },
        }),
      })
      const data = await res.json()
      const errorMsg = data.error || data.message || data.detail || JSON.stringify(data)
      results.push({ phone: item.phone, success: res.ok, call_id: data.call_id, error: res.ok ? null : errorMsg })
    } catch (e) {
      results.push({ phone: item.phone, success: false, error: String(e) })
    }
  }

  return NextResponse.json({ results })
}