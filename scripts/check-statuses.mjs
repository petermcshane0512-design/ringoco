import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data } = await s.from('outreach_leads').select('status').not('email', 'is', null)
const counts = {}
for (const r of data ?? []) counts[r.status ?? '(null)'] = (counts[r.status ?? '(null)'] ?? 0) + 1
console.log('outreach_leads (with email):')
for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(20)} ${v}`)
}
