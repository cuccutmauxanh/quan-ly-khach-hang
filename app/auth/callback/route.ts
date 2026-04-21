import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data: { session } } = await supabase.auth.exchangeCodeForSession(code)

    if (session?.user) {
      const userId = session.user.id
      const email = session.user.email

      // Kiểm tra đã link chưa
      const { data: existing } = await supabase
        .from('client_users')
        .select('id')
        .eq('user_id', userId)
        .single()

      // Nếu chưa link → tìm client theo contact_email và tự link
      if (!existing && email) {
        const { data: matchedClient } = await supabase
          .from('clients')
          .select('id')
          .eq('contact_email', email)
          .single()

        if (matchedClient) {
          await supabase
            .from('client_users')
            .insert({ user_id: userId, client_id: matchedClient.id })
        }
      }
    }
  }

  return NextResponse.redirect(`${origin}/dashboard`)
}