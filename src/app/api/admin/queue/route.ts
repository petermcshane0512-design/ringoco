import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ADMIN_EMAILS = new Set(['pmcshane@fordham.edu', 'peter@bellavego.com'])

/**
 * GET /api/admin/queue — returns everything Peter needs to act on:
 *   - prompt_suggestions (pending: applied=false AND dismissed_at IS NULL)
 *   - review_drafts (pending: status='drafted' AND approved_at IS NULL AND dismissed_at IS NULL)
 *   - provisioning_failures (manual_review)
 *
 * Single payload so the page does one fetch and stays snappy. Profile names
 * are joined client-side from a small profiles batch lookup.
 */
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { clerkClient } = await import('@clerk/nextjs/server')
  const client = await clerkClient()
  const me = await client.users.getUser(userId)
  const email = me.emailAddresses?.[0]?.emailAddress?.toLowerCase()
  if (!email || !ADMIN_EMAILS.has(email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [prompts, reviews, provFailures] = await Promise.all([
    supabase
      .from('prompt_suggestions')
      .select('id, profile_id, suggestion, based_on_call_count, created_at')
      .eq('applied', false)
      .is('dismissed_at', null)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('review_drafts')
      .select('id, user_id, review_author, review_text, review_rating, drafted_reply, created_at')
      .eq('status', 'drafted')
      .is('approved_at', null)
      .is('dismissed_at', null)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('provisioning_failures')
      .select('id, user_id, business_name, owner_phone, last_error, attempts, status, next_retry_at, created_at')
      .in('status', ['pending', 'manual_review'])
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  // Resolve business names for the profile_ids referenced
  const userIds = new Set<string>()
  ;(prompts.data ?? []).forEach((r) => r.profile_id && userIds.add(r.profile_id))
  ;(reviews.data ?? []).forEach((r) => r.user_id && userIds.add(r.user_id))

  let nameLookup: Record<string, string> = {}
  if (userIds.size > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, business_name')
      .in('user_id', Array.from(userIds))
    nameLookup = (profiles ?? []).reduce<Record<string, string>>((acc, p) => {
      if (p.user_id && p.business_name) acc[p.user_id] = p.business_name
      return acc
    }, {})
  }

  return NextResponse.json({
    ok: true,
    prompts: (prompts.data ?? []).map((r) => ({ ...r, business_name: nameLookup[r.profile_id ?? ''] ?? null })),
    reviews: (reviews.data ?? []).map((r) => ({ ...r, business_name: nameLookup[r.user_id ?? ''] ?? null })),
    provisioning_failures: provFailures.data ?? [],
  })
}
