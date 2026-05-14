import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)

/**
 * Onboarding Coach Agent — daily cron.
 *
 * Complements the existing 24h "lifecycle" nudge (which handles Day 1 forwarding).
 * Picks up customers at Day 3 and Day 7 post-signup and sends a tailored SMS.
 *
 *  Day 3 / no calls received yet  → "still no calls — let me help personally"
 *  Day 3 / calls received          → "first lead — anything you'd tweak?"
 *  Day 7 / no calls received yet  → "let's hop on a 5-min call" + Peter SMS alert
 *  Day 7 / calls received          → "first week recap" + review nudge
 *
 * Idempotent: writes onboarding_day3_at / onboarding_day7_at timestamps so a
 * customer only gets each nudge once.
 *
 * HELP keyword replies are handled by /api/twilio/sms (conversational mode
 * via Claude for the contractor's owner_phone, static otherwise).
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (cronSecret && auth && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const stats = { day3_nudged: 0, day7_nudged: 0, day7_escalated_to_peter: 0, errors: 0 }
  const now = Date.now()
  const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString()
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()
  const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString()
  const sixDaysAgo = new Date(now - 6 * 24 * 60 * 60 * 1000).toISOString()

  // ── Day 3 candidates ───────────────────────────────────────────────
  // Activated 3+ days ago (welcomed_at < threeDaysAgo) AND no Day 3 nudge yet
  // Sweep window: welcomed 3-7 days ago to avoid weekend backlog issues
  const { data: day3 } = await supabase
    .from('profiles')
    .select('user_id, business_name, owner_first_name, owner_phone, twilio_number, welcomed_at, plan_tier')
    .eq('is_active', true)
    .lt('welcomed_at', threeDaysAgo)
    .gt('welcomed_at', sevenDaysAgo)
    .is('onboarding_day3_at', null)
    .not('owner_phone', 'is', null)
    .not('twilio_number', 'is', null)
    .limit(40)

  for (const p of day3 ?? []) {
    const { count } = await supabase
      .from('call_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', p.user_id)

    const firstName =
      (p as { owner_first_name?: string }).owner_first_name || guessFirstName(p.business_name)
    const hasCalls = (count ?? 0) > 0

    const body = hasCalls
      ? `${firstName}, you've gotten ${count} call${count === 1 ? '' : 's'} so far — nice. Anything you'd want to tweak on the AI? Reply with what you'd change (e.g. "more formal", "always mention free estimates"), or HELP if you want a walkthrough. — Peter`
      : `Hey ${firstName}, day 3 check-in. Your BellAveGo line still hasn't gotten a call. The most common reason is call forwarding got turned off or never finished. Reply HELP and I'll walk you through it personally in under 5 minutes. — Peter`

    try {
      await twilioClient.messages.create({
        body,
        from: p.twilio_number!,
        to: p.owner_phone!,
      })
      await supabase
        .from('profiles')
        .update({ onboarding_day3_at: new Date().toISOString() })
        .eq('user_id', p.user_id)
      stats.day3_nudged++
    } catch (e) {
      console.error('day3 SMS failed for', p.user_id, e)
      stats.errors++
    }
  }

  // ── Day 7 candidates ───────────────────────────────────────────────
  const { data: day7 } = await supabase
    .from('profiles')
    .select('user_id, business_name, owner_first_name, owner_phone, twilio_number, welcomed_at, plan_tier')
    .eq('is_active', true)
    .lt('welcomed_at', sevenDaysAgo)
    .gt('welcomed_at', new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString())
    .is('onboarding_day7_at', null)
    .not('owner_phone', 'is', null)
    .not('twilio_number', 'is', null)
    .limit(40)

  for (const p of day7 ?? []) {
    const { count } = await supabase
      .from('call_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', p.user_id)

    const firstName =
      (p as { owner_first_name?: string }).owner_first_name || guessFirstName(p.business_name)
    const hasCalls = (count ?? 0) > 0

    if (hasCalls) {
      // Day 7 with calls = celebrate + ask for review
      const body =
        `${firstName}, you're 1 week in — ${count} call${count === 1 ? '' : 's'} captured. ` +
        `If BellAveGo's earning its keep, a quick Google review for us means a lot for a small team like ours: ` +
        `https://g.page/r/CdQbellavego (takes 30 seconds). And anything we should tweak, just reply. — Peter`
      try {
        await twilioClient.messages.create({
          body,
          from: p.twilio_number!,
          to: p.owner_phone!,
        })
        await supabase
          .from('profiles')
          .update({ onboarding_day7_at: new Date().toISOString() })
          .eq('user_id', p.user_id)
        stats.day7_nudged++
      } catch (e) {
        console.error('day7 SMS (with-calls) failed:', e)
        stats.errors++
      }
    } else {
      // Day 7 with zero calls = critical churn risk. Personal + Peter alert.
      const body =
        `${firstName}, week 1 and we still haven't picked up a single call for you — that means forwarding isn't routed right. ` +
        `That's on me to fix. Reply with a good time today and I'll personally walk you through it (5 min). ` +
        `If you'd rather not bother, reply REFUND and we'll fully refund your subscription, no questions. — Peter`

      try {
        await twilioClient.messages.create({
          body,
          from: p.twilio_number!,
          to: p.owner_phone!,
        })

        // ALSO alert Peter — this is a churn moment
        if (process.env.FALLBACK_OWNER_PHONE) {
          await twilioClient.messages.create({
            body:
              `⚠️ Day 7 churn risk — ${p.business_name || p.user_id} (${p.plan_tier || '?'}) ` +
              `has $0 captured calls. Just sent them a personal SMS offering walkthrough or refund. ` +
              `Their number: ${p.owner_phone}`,
            from: process.env.TWILIO_PHONE_NUMBER!,
            to: process.env.FALLBACK_OWNER_PHONE,
          })
          stats.day7_escalated_to_peter++
        }

        await supabase
          .from('profiles')
          .update({ onboarding_day7_at: new Date().toISOString() })
          .eq('user_id', p.user_id)
        stats.day7_nudged++
      } catch (e) {
        console.error('day7 SMS (no-calls) failed:', e)
        stats.errors++
      }
    }
  }

  await supabase.from('agent_runs').insert({
    agent: 'onboarding-coach',
    notes: JSON.stringify(stats),
  })

  return NextResponse.json({ ok: true, ...stats })
}

function guessFirstName(businessName: string | null | undefined): string {
  if (!businessName) return 'there'
  const cleaned = businessName.replace(/\b(LLC|Inc|Co|Company|Services?|HVAC|Plumbing|Heating|Cooling|Electric(al)?)\b/gi, '').trim()
  return cleaned.split(/\s+/)[0] || 'there'
}
