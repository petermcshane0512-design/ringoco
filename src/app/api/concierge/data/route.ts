import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { effectiveAuth } from '@/lib/effectiveAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET() {
  const { userId } = await effectiveAuth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan_tier, is_active, business_name')
    .eq('user_id', userId)
    .maybeSingle()
  if (profile?.plan_tier !== 'concierge') {
    return NextResponse.json({ error: 'Concierge tier required' }, { status: 403 })
  }

  const [reports, campaigns, creatives, leads, competitors, wallet, seo, settings] = await Promise.all([
    supabase.from('concierge_reports').select('id, report_type, week_start, opened_at, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(12),
    supabase.from('marketing_campaigns').select('*').eq('user_id', userId).order('updated_at', { ascending: false }).limit(20),
    supabase.from('ad_creatives').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
    supabase.from('lead_lists').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
    supabase.from('competitor_intel').select('*').eq('user_id', userId).order('snapshot_date', { ascending: false }).limit(50),
    supabase.from('growth_wallet_ledger').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(25),
    supabase.from('seo_blog_posts').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(12),
    supabase.from('concierge_settings').select('*').eq('user_id', userId).maybeSingle(),
  ])

  // Most-recent competitor row per competitor
  const competitorMap = new Map<string, unknown>()
  for (const c of (competitors.data ?? []) as Array<{ competitor_place_id?: string }>) {
    const pid = c.competitor_place_id ?? ''
    if (!competitorMap.has(pid)) competitorMap.set(pid, c)
  }

  return NextResponse.json({
    businessName: profile.business_name ?? '',
    reports: reports.data ?? [],
    campaigns: campaigns.data ?? [],
    creatives: creatives.data ?? [],
    leads: leads.data ?? [],
    competitors: Array.from(competitorMap.values()),
    walletLedger: wallet.data ?? [],
    walletBalanceCents: settings.data?.growth_wallet_balance_cents ?? 0,
    seoPosts: seo.data ?? [],
    settings: settings.data ?? null,
  })
}
