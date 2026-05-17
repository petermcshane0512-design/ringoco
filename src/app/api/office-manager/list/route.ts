import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { OFFICE_MGR_TIERS } from '@/lib/pricing'
import { effectiveAuth } from '@/lib/effectiveAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Returns the calling user's active quote follow-ups, invoice chases, and review drafts.
// Tier-gated to Office Manager + Concierge.
export async function GET() {
  const { userId } = await effectiveAuth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan_tier, is_active')
    .eq('user_id', userId)
    .maybeSingle()

  if (!profile?.is_active || !OFFICE_MGR_TIERS.has(profile.plan_tier ?? '')) {
    return NextResponse.json({ error: 'Operator tier required' }, { status: 403 })
  }

  // All three tables may be missing if migration 008 hasn't been run.
  // Treat that as empty rather than 500, so the UI renders the empty state.
  const safeQuery = async <T>(table: string, orderCol: string) => {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .order(orderCol, { ascending: false })
      .limit(50)
    if (error) {
      if (/relation.*does not exist|schema cache/i.test(error.message)) {
        return { rows: [] as T[], missing: true }
      }
      throw new Error(`${table}: ${error.message}`)
    }
    return { rows: (data ?? []) as T[], missing: false }
  }

  try {
    const [quotes, invoices, reviews] = await Promise.all([
      safeQuery<Record<string, unknown>>('quote_followups', 'created_at'),
      safeQuery<Record<string, unknown>>('invoice_followups', 'created_at'),
      safeQuery<Record<string, unknown>>('review_drafts', 'created_at'),
    ])
    const tablesMissing = quotes.missing || invoices.missing || reviews.missing
    return NextResponse.json({
      quotes: quotes.rows,
      invoices: invoices.rows,
      reviews: reviews.rows,
      tablesMissing,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
