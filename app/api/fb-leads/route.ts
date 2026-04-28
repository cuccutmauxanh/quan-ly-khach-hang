import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      tenant_id,
      commenter_name,
      commenter_fb_id,
      phone,
      post_id,
      fb_campaign_id,
      raw_comment,
      comment_id,
    } = body

    if (!tenant_id) {
      return NextResponse.json({ error: 'tenant_id is required' }, { status: 400 })
    }

    const record: Record<string, unknown> = {
      tenant_id,
      commenter_name: commenter_name ?? null,
      commenter_fb_id: commenter_fb_id ?? null,
      phone: phone ?? null,
      post_id: post_id ?? null,
      fb_campaign_id: fb_campaign_id ?? null,
      raw_comment: raw_comment ?? null,
      lead_status: 'new',
      priority: 'WARM',
    }

    // comment_id là unique key trong DB — dùng upsert nếu có
    if (comment_id) {
      record.comment_id = comment_id
      const { data, error } = await supabase
        .from('facebook_leads')
        .upsert(record, { onConflict: 'comment_id', ignoreDuplicates: true })
        .select('id')
        .single()

      if (error && error.code !== '23505') {
        console.error('fb-leads upsert error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ ok: true, id: data?.id ?? null })
    }

    // Không có comment_id → insert thường
    const { data, error } = await supabase
      .from('facebook_leads')
      .insert(record)
      .select('id')
      .single()

    if (error) {
      console.error('fb-leads insert error:', error)
      if (error.code === '23505') {
        return NextResponse.json({ ok: true, duplicate: true })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, id: data?.id })
  } catch (e) {
    console.error('fb-leads route error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
