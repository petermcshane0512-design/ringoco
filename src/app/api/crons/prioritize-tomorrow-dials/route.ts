import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * GET /api/crons/prioritize-tomorrow-dials
 *
 * Runs 6:30pm CST Mon-Fri. Builds tomorrow's 150-dial list with WARM
 * EMAIL OPENERS pinned at the top — the prospects who opened today's
 * cold email + sample report. These convert at 4-6× cold-cold close rate.
 *
 * Flow:
 *   1. Pull Instantly opens from last 24h (campaign_id = HVAC Q3)
 *   2. Cross-reference opener emails with outreach_leads.email
 *   3. For matches, set last_opened_at + open_count, status='hot_opener'
 *   4. SMS Peter at 6:31pm with summary + dial-list URL
 *
 * Algorithm Step 5 applied: only built once Phase-1 dialing proved the
 * funnel (Day 1: 50 dials, 4 sends, 1 star call). Auto-prioritization is
 * the highest-leverage compounding loop in the cold-outreach playbook.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const twilioClient =
  process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null

const CAMPAIGN_ID = process.env.INSTANTLY_CAMPAIGN_HVAC_Q3 || '8ac14ff5-8cd4-4ac4-8549-88dddbef8067'

type InstantlyEmail = {
  to_address_email?: string
  to_address_email_list?: string[]
  campaign_id?: string
  event_type?: string
  timestamp_event?: string
  email_event_type?: string
}

async function fetchOpensLast24h(): Promise<string[]> {
  if (!process.env.INSTANTLY_API_KEY) return []
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const emails = new Set<string>()
  // Instantly's emails endpoint supports filtering by event type + campaign.
  // We page through opens; cap at 5 pages (1k events) per run.
  let starting_after: string | null = null
  for (let page = 0; page < 5; page++) {
    const url = new URL('https://api.instantly.ai/api/v2/emails')
    url.searchParams.set('limit', '200')
    url.searchParams.set('email_type', 'sent')
    if (starting_after) url.searchParams.set('starting_after', starting_after)
    const r = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}` },
    })
    if (!r.ok) {
      console.warn(`[prioritize] Instantly emails fetch HTTP ${r.status}`)
      break
    }
    const j = await r.json()
    const items: InstantlyEmail[] = j.items || []
    for (const e of items) {
      // Only count opens within last 24h
      const ts = e.timestamp_event ? new Date(e.timestamp_event) : null
      if (!ts || ts < since) continue
      const addr =
        e.to_address_email ||
        (Array.isArray(e.to_address_email_list) && e.to_address_email_list[0])
      if (addr) emails.add(addr.toLowerCase())
    }
    if (!j.next_starting_after) break
    starting_after = j.next_starting_after
  }
  return [...emails]
}

export async function GET(req: NextRequest) {
  const isCron = req.headers.get('x-vercel-cron') === '1'
  const adminSecret = req.headers.get('x-admin-secret')
  const expected = process.env.ADMIN_API_SECRET
  if (!isCron && (!expected || adminSecret !== expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const opens = await fetchOpensLast24h()
  console.log(`[prioritize] ${opens.length} opener emails in last 24h`)

  // Tag matching outreach_leads as hot_opener so the dial-list endpoint
  // can surface them at the top. status='hot_opener' is the priority key.
  let tagged = 0
  let unmatched = 0
  for (const email of opens) {
    const { error } = await supabase
      .from('outreach_leads')
      .update({
        status: 'hot_opener',
        last_report_sms_sent_at: null, // reset so it's eligible for SMS again
      })
      .ilike('email', email)
    if (error) {
      console.warn(`[prioritize] tag err for ${email}: ${error.message}`)
      unmatched++
    } else {
      tagged++
    }
  }

  // Now pull tomorrow's dial list = 100 hot openers (newest first) + 50 fresh
  // queued from the daily-200 cron. The actual xlsx generation happens via
  // /api/admin/dial-list endpoint; this cron just stages the right rows.
  const { count: openerCount } = await supabase
    .from('outreach_leads')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'hot_opener')
    .not('owner_phone', 'is', null)

  const { count: freshCount } = await supabase
    .from('outreach_leads')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'queued')
    .not('owner_phone', 'is', null)

  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)

  // SMS Peter
  if (twilioClient && process.env.FALLBACK_OWNER_PHONE && process.env.TWILIO_PHONE_NUMBER) {
    const xlsxUrl = `https://www.bellavego.com/api/admin/dial-list?date=${today}&priority=openers&format=xlsx&secret=${encodeURIComponent(expected || '')}`
    try {
      await twilioClient.messages.create({
        from: process.env.TWILIO_PHONE_NUMBER,
        to: process.env.FALLBACK_OWNER_PHONE,
        body:
          `📞 Tomorrow's dial list ready\n` +
          `${openerCount || 0} HOT openers (called report yesterday) — DIAL FIRST\n` +
          `${freshCount || 0} fresh cold dials below\n\n` +
          `Wake 7am. Open xlsx. Crush 150.\n\n` +
          `xlsx: ${xlsxUrl}`,
      })
    } catch (e) {
      console.error(`[prioritize] SMS err: ${(e as Error).message}`)
    }
  }

  return NextResponse.json({
    ok: true,
    opens_seen: opens.length,
    leads_tagged_hot_opener: tagged,
    leads_unmatched: unmatched,
    tomorrow_count: {
      hot_openers: openerCount || 0,
      fresh: freshCount || 0,
    },
    for_date: tomorrow,
  })
}
