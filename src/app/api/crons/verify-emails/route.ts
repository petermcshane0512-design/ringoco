import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyEmail, isSendable } from '@/lib/hunter/verify'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * GET /api/crons/verify-emails
 *
 * Nightly batch — verify queued leads' emails via Hunter.io before they
 * enter the send pipeline. Marks undeliverable rows status='invalid_email'
 * so the sender skips them. Saves Gmail/Zoho reputation by avoiding
 * pre-bounce sends.
 *
 * Auth: x-vercel-cron OR x-admin-secret.
 *
 * Cost: ~$0.05/verification. At 900/day = $27/mo + the $49 Hunter sub.
 */
export async function GET(req: NextRequest) {
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  const adminSecret = req.headers.get('x-admin-secret')
  const expected = process.env.ADMIN_API_SECRET
  if (!isVercelCron && (!expected || adminSecret !== expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  if (!process.env.HUNTER_API_KEY) {
    return NextResponse.json(
      { ok: false, disabled: true, reason: 'HUNTER_API_KEY not set. Add to Vercel env to activate.' },
      { status: 410 },
    )
  }

  const url = new URL(req.url)
  const limit = parseInt(url.searchParams.get('limit') ?? '200', 10)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  // Pull queued + unverified (no hunter_verified_at column yet — using notes/marker)
  const { data: leads } = await supabase
    .from('outreach_leads')
    .select('id, email, business_name')
    .eq('status', 'queued')
    .is('hunter_verified_at', null)
    .not('email', 'is', null)
    .limit(limit)

  if (!leads || leads.length === 0) {
    return NextResponse.json({ ok: true, verified: 0, message: 'queue all verified' })
  }

  let verified = 0
  let killed = 0
  for (const l of leads) {
    try {
      const r = await verifyEmail(l.email)
      const sendable = isSendable(r)
      await supabase
        .from('outreach_leads')
        .update({
          hunter_verified_at: new Date().toISOString(),
          hunter_status: r.status,
          hunter_score: r.score,
          ...(sendable ? {} : { status: 'invalid_email' }),
        })
        .eq('id', l.id)
      verified++
      if (!sendable) killed++
    } catch (e) {
      // Pause this lead's verify; retry next run
      console.error(`hunter verify failed for ${l.email}:`, e)
    }
  }

  return NextResponse.json({ ok: true, verified, killed_as_invalid: killed })
}
