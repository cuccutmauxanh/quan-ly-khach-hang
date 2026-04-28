import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function serverSupabase(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  if (token) {
    await sb.auth.setSession({ access_token: token, refresh_token: '' })
  }
  return sb
}

// GET /api/campaigns?tenant_id=...
export async function GET(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get('tenant_id')
  if (!tenantId) return NextResponse.json({ error: 'tenant_id required' }, { status: 400 })

  const sb = await serverSupabase(request)
  const { data, error } = await sb
    .from('campaigns')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ campaigns: data })
}

// POST /api/campaigns — create
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { tenant_id, name, description, agent_key, agent_label, delay_ms, contacts, retry_config } = body

  if (!tenant_id || !name || !agent_key) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const sb = await serverSupabase(request)
  const { data, error } = await sb
    .from('campaigns')
    .insert({
      tenant_id,
      name,
      description: description || null,
      agent_key,
      agent_label: agent_label || null,
      delay_ms: delay_ms ?? 3000,
      total_count: contacts?.length ?? 0,
      contacts: contacts ?? [],
      status: 'draft',
      retry_config: retry_config ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ campaign: data })
}

// PATCH /api/campaigns — update status / progress
export async function PATCH(request: NextRequest) {
  const body = await request.json()
  const { id, ...updates } = body

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const sb = await serverSupabase(request)
  const { data, error } = await sb
    .from('campaigns')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ campaign: data })
}

// DELETE /api/campaigns?id=...
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const sb = await serverSupabase(request)
  const { error } = await sb.from('campaigns').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
