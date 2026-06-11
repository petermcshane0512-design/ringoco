// Founder diagnostic — read-only, uses the public anon key (RLS disabled
// on these tables by design; isolation is enforced in server routes).
import dotenv from 'dotenv'
import fs from 'node:fs'
if (fs.existsSync('.env.local.prod')) dotenv.config({ path: '.env.local.prod', quiet: true })
dotenv.config({ path: '.env.local', quiet: true })
import { createClient } from '@supabase/supabase-js'

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const uid = process.argv[2] || 'user_3EzyNQxe2wLSBM4wT4GcZjGNQ1E'

const { data: p, error: e1 } = await s.from('profiles')
  .select('user_id, plan_tier, is_active, service_zips, business_type, services_offered, business_lat, business_lng, service_radius_mi, last_batchdata_replenish_at, next_lead_drop_at, first_lead_drop_at')
  .eq('user_id', uid).maybeSingle()
console.log('profile:', e1 ? 'ERR ' + e1.message : JSON.stringify(p, null, 1))

const { count: dropCount, error: e2 } = await s.from('lead_drops')
  .select('*', { count: 'exact', head: true }).eq('user_id', uid)
console.log('drops total:', e2 ? 'ERR ' + e2.message : dropCount)

const { data: q, error: e3 } = await s.from('tenant_lead_quota_usage').select('*').eq('user_id', uid).maybeSingle()
console.log('quota row:', e3 ? 'ERR ' + e3.message : JSON.stringify(q))

const { data: log, error: e4 } = await s.from('batchdata_spend_log')
  .select('caller, cost_cents, result_ok, spent_at, context')
  .order('spent_at', { ascending: false }).limit(8)
console.log('spend log (latest 8):', e4 ? 'ERR ' + e4.message : JSON.stringify(log, null, 1))
