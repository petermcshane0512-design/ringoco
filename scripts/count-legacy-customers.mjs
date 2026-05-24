import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    })
)

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const { data, count, error } = await sb
  .from('profiles')
  .select('user_id,plan_tier,stripe_subscription_id,is_active,created_at', { count: 'exact' })
  .in('plan_tier', ['receptionist', 'foundation', 'officemgr', 'concierge'])
  .eq('is_active', true)

if (error) {
  console.error('ERR:', error.message)
  process.exit(1)
}

const byTier = {}
for (const p of data || []) byTier[p.plan_tier] = (byTier[p.plan_tier] || 0) + 1
console.log('Active paying customers by tier:', byTier)
console.log('Total active:', count)
console.log('---')

const cutoff = new Date('2026-05-23T00:00:00Z')
const legacyCandidates = (data || []).filter(p => new Date(p.created_at) < cutoff)
console.log('Created before v2 launch (2026-05-23):', legacyCandidates.length)

const legacyReceptionist = legacyCandidates.filter(p => ['receptionist', 'foundation'].includes(p.plan_tier))
console.log('Legacy receptionist-tier (would lose 250-cap → 60):', legacyReceptionist.length)
if (legacyReceptionist.length) {
  console.log(legacyReceptionist.map(p => ({
    tier: p.plan_tier,
    created: p.created_at,
    sub: (p.stripe_subscription_id || '').slice(0, 18),
  })))
}
