import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * GET /api/crons/creator-nudge
 *
 * Daily 16:00 UTC. Finds creators who:
 *   - Are status='active_creator' (said yes, codes minted)
 *   - Have a personal_promo_code (mint complete)
 *   - Have NOT generated any paid_referrals yet
 *   - Are 3, 7, or 14 days past their updated_at (proxy for "code given but
 *     no signups happening")
 *
 * Sends them a graduated nudge sequence so 3-month-free creators who
 * never put the code in their bio don't quietly ghost.
 *
 * day 3:  gentle reminder + post template
 * day 7:  "need help with the content?"
 * day 14: "still want to do this? if not all good, just let me know"
 *
 * Stores nudge_count + last_nudge_at on the creator row (added cols below).
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
const FROM = process.env.TWILIO_PHONE_NUMBER!

function authorized(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron') === '1') return true
  const got = req.headers.get('x-admin-secret')
  const expected = process.env.ADMIN_API_SECRET
  return !!expected && got === expected
}

function buildNudge(nudgeNumber: number, handle: string, personalCode: string, publicCode: string): string {
  if (nudgeNumber === 1) {
    return `Hey @${handle} — just checking, did your code ${publicCode} make it into your bio yet? Drop it + one story and you start earning $200/ref the moment they pay month 2. Need a post template? Hit me up. — Peter`
  }
  if (nudgeNumber === 2) {
    return `@${handle} — round 2 on the BellAveGo code. Your personal code ${personalCode} is still active (3 months Pro free). If you want me to write the IG story / reel script for you, I'll draft it tonight. Just say the word. — Peter`
  }
  return `@${handle} — last check-in. Still want to do BellAveGo? If you're slammed and want to pass, totally cool — just hit me back so I can free the code up. If you're in, drop ${publicCode} in your bio + I'll send the post template. — Peter`
}

async function handler(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const now = Date.now()
  const day = 24 * 60 * 60 * 1000

  // Pull active_creator rows with both codes minted + zero refs + at least 3 days old.
  const { data: candidates, error } = await supabase
    .from('ig_creator_outreach')
    .select('id, handle, personal_promo_code, promo_code, paid_referrals_count, updated_at, last_nudge_at, nudge_count')
    .eq('status', 'active_creator')
    .not('personal_promo_code', 'is', null)
    .not('promo_code', 'is', null)
    .or('paid_referrals_count.is.null,paid_referrals_count.eq.0')
    .limit(200)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  type Row = {
    id: string
    handle: string
    personal_promo_code: string
    promo_code: string
    paid_referrals_count: number | null
    updated_at: string
    last_nudge_at: string | null
    nudge_count: number | null
  }

  let nudged = 0
  let skipped = 0

  for (const c of (candidates ?? []) as Row[]) {
    const lastTouch = c.last_nudge_at ? new Date(c.last_nudge_at).getTime() : new Date(c.updated_at).getTime()
    const daysSinceTouch = (now - lastTouch) / day
    const nudgeCount = c.nudge_count ?? 0

    let dueNudge = 0
    if (nudgeCount === 0 && daysSinceTouch >= 3)      dueNudge = 1
    else if (nudgeCount === 1 && daysSinceTouch >= 4) dueNudge = 2
    else if (nudgeCount === 2 && daysSinceTouch >= 7) dueNudge = 3

    if (dueNudge === 0) { skipped++; continue }

    // Look up creator's own phone (if they signed up themselves with their personal code)
    const { data: creatorProfile } = await supabase
      .from('profiles')
      .select('owner_phone')
      .eq('referred_by_promo_code', c.handle)
      .maybeSingle()
    const phone = (creatorProfile as { owner_phone?: string } | null)?.owner_phone
    if (!phone) {
      // No phone — can't SMS them. Skip but DON'T burn the nudge counter.
      skipped++
      continue
    }

    try {
      await twilioClient.messages.create({
        body: buildNudge(dueNudge, c.handle, c.personal_promo_code, c.promo_code),
        from: FROM,
        to: phone,
      })
      await supabase
        .from('ig_creator_outreach')
        .update({
          nudge_count: dueNudge,
          last_nudge_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', c.id)
      nudged++
    } catch (e) {
      console.warn(`[creator-nudge] SMS failed for @${c.handle}:`, (e as Error).message)
      skipped++
    }
  }

  return NextResponse.json({
    ok: true,
    checked: candidates?.length ?? 0,
    nudged,
    skipped,
  })
}

export async function GET(req: NextRequest) { return handler(req) }
export async function POST(req: NextRequest) { return handler(req) }
