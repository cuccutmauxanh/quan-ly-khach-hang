import { NextRequest, NextResponse } from 'next/server'

const RETELL_KEY = process.env.RETELL_API_KEY!

export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get('agentId')
  if (!agentId) return NextResponse.json({ error: 'Missing agentId' }, { status: 400 })

  const res = await fetch(`https://api.retellai.com/v2/get-agent/${agentId}`, {
    headers: { Authorization: `Bearer ${RETELL_KEY}` },
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

export async function PATCH(request: NextRequest) {
  const { agentId, begin_message } = await request.json()
  if (!agentId) return NextResponse.json({ error: 'Missing agentId' }, { status: 400 })

  const res = await fetch(`https://api.retellai.com/v2/update-agent/${agentId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${RETELL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ begin_message: begin_message ?? null }),
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
