import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// Match dump-50 exactly
const q1 = await s
  .from('outreach_leads')
  .select('id, email, business_name, owner_first_name, city, trade, campaign_id')
  .eq('status', 'queued')
  .not('email', 'is', null)
  .order('pushed_at', { ascending: true })
  .limit(100)
console.log('Q1 (dump-50 exact):', q1.data?.length, 'err:', q1.error?.message)

// Drop order
const q2 = await s
  .from('outreach_leads')
  .select('id, email, business_name, owner_first_name, city, trade, campaign_id')
  .eq('status', 'queued')
  .not('email', 'is', null)
  .limit(100)
console.log('Q2 (no order):', q2.data?.length, 'err:', q2.error?.message)

// Just email + status
const q3 = await s
  .from('outreach_leads')
  .select('email, status')
  .eq('status', 'queued')
  .not('email', 'is', null)
  .limit(5)
console.log('Q3 (minimal):', q3.data?.length, 'err:', q3.error?.message)
if (q3.data) for (const r of q3.data) console.log(' ', r.email)

// Single row sample
const q4 = await s.from('outreach_leads').select('*').eq('status', 'queued').limit(1).maybeSingle()
console.log('\nQ4 (full row sample):')
if (q4.data) console.log(JSON.stringify(q4.data, null, 2))
console.log('err:', q4.error?.message)
