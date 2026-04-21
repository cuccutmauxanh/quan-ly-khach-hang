import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true }
})

export type Client = {
  id: string
  name: string
  slug: string
  industry: string | null
  package: string | null
  status: string | null
  owner_name: string | null
  owner_phone: string | null
  owner_zalo: string | null
  contact_email: string | null
  retell_agent_id: string | null
  retell_phone_number: string | null
  supabase_schema: string | null
  zapbx_ip: string | null
  zapbx_port: number | null
  calcom_event_type_id: string | null
  telegram_chat_id: string | null
  monthly_fee: number | null
  contract_start: string | null
  trial_ends_at: string | null
  package_started_at: string | null
  notes: string | null
  created_at: string
}

export type Call = {
  id: string
  tenant_id: string
  contact_id: string | null
  direction: string | null
  duration_seconds: number | null
  appointment_booked: boolean
  summary: string | null
  status: string | null
  created_at: string
}