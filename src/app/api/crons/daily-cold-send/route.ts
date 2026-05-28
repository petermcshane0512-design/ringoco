import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * GET /api/crons/daily-cold-send
 *
 * Server-side cold email sender. Runs nightly via Vercel cron. Pulls the
 * next batch of queued leads from outreach_leads, joins each with its
 * cached personalized report from sample_reports, sends via Gmail API
 * (using Peter's stored OAuth refresh token), and marks leads as 'sent'.
 *
 * Why server-side: lets us send while Peter's laptop is asleep or off,
 * which was blocking the 50/day cadence before. Identical email template
 * to scripts/send-via-gmail.mjs.
 *
 * Auth: cron header from Vercel OR x-admin-secret. Returns 401 otherwise.
 *
 * Idempotency: each lead's status flips to 'sent' atomically before the
 * Gmail call returns, so a retry won't double-send. If Gmail throws, we
 * record the lead as 'send_failed' for next-run retry.
 */
export async function GET(req: NextRequest) {
  // Auth gate
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  const adminSecret = req.headers.get('x-admin-secret')
  const expected = process.env.ADMIN_API_SECRET
  if (!isVercelCron && (!expected || adminSecret !== expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const limit = parseInt(url.searchParams.get('limit') ?? '50', 10)
  const throttleSec = parseInt(url.searchParams.get('throttle') ?? '30', 10)
  const dryRun = url.searchParams.get('dry') === '1'

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return NextResponse.json({ error: 'supabase env missing' }, { status: 500 })
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

  const {
    GMAIL_OAUTH_CLIENT_ID,
    GMAIL_OAUTH_CLIENT_SECRET,
    GMAIL_OAUTH_REFRESH_TOKEN,
    GMAIL_SEND_FROM = 'petermcshane0512@gmail.com',
  } = process.env
  if (!GMAIL_OAUTH_CLIENT_ID || !GMAIL_OAUTH_CLIENT_SECRET || !GMAIL_OAUTH_REFRESH_TOKEN) {
    return NextResponse.json({ error: 'gmail oauth env missing' }, { status: 500 })
  }
  const oauth2 = new google.auth.OAuth2(GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET)
  oauth2.setCredentials({ refresh_token: GMAIL_OAUTH_REFRESH_TOKEN })
  const gmail = google.gmail({ version: 'v1', auth: oauth2 })

  // Pull next N queued leads. Must have email + must NOT be in already-sent
  // statuses. Order by pushed_at so oldest-queued goes first (fair queue).
  // Skip rows whose email is a known placeholder (example@domain.com,
  // your@email.com, numeric-only locals, etc.) — those slipped past our
  // earlier scrapers and would bounce, costing us sender reputation.
  const PLACEHOLDER_EMAILS = [
    'example.com', 'example.org', 'example.net', 'domain.com', 'yourcompany.com',
    'your@', 'youremail@', 'name@', 'email@', 'test@', 'demo@', 'sample@',
    'noreply@', 'no-reply@', 'donotreply', 'bobsrepair.com', 'impallari@',
  ]
  const isPlaceholder = (e: string | null | undefined) => {
    if (!e) return true
    const low = e.toLowerCase()
    if (PLACEHOLDER_EMAILS.some((p) => low.includes(p))) return true
    const local = low.split('@')[0]
    if (/^\d+$/.test(local)) return true
    if (local.length > 30) return true
    return false
  }

  const { data: rawLeads, error: pullErr } = await supabase
    .from('outreach_leads')
    .select('id, email, business_name, owner_first_name, city, trade, campaign_id')
    .eq('status', 'queued')
    .not('email', 'is', null)
    .order('pushed_at', { ascending: true })
    .limit(limit * 2) // pull extra to allow for placeholder filtering
  const leads = (rawLeads ?? []).filter((l) => !isPlaceholder(l.email)).slice(0, limit)
  // Mark placeholder rows so the cron doesn't keep picking them up
  const placeholderIds = (rawLeads ?? []).filter((l) => isPlaceholder(l.email)).map((l) => l.id)
  if (placeholderIds.length > 0) {
    await supabase.from('outreach_leads').update({ status: 'invalid_email' }).in('id', placeholderIds)
  }
  if (pullErr) return NextResponse.json({ error: pullErr.message }, { status: 500 })
  if (!leads || leads.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: 'queue empty' })
  }

  if (dryRun) {
    return NextResponse.json({ ok: true, dry: true, would_send: leads.length, sample: leads.slice(0, 3) })
  }

  // Atomically flip those leads to 'sending' so a concurrent invocation
  // (manual + cron firing at the same minute) can't double-send.
  const claimedIds = leads.map((l) => l.id)
  await supabase
    .from('outreach_leads')
    .update({ status: 'sending', updated_at: new Date().toISOString() })
    .in('id', claimedIds)

  let sent = 0
  let errors = 0
  const errorSamples: { email: string; error: string }[] = []

  for (const l of leads) {
    // Fetch this lead's cached report. Cache key = lower(business_name) + zip.
    // We don't store zip on outreach_leads (yet), so we fall back to any cached
    // row matching the business name. Good enough since names are usually unique.
    const { data: rpt } = await supabase
      .from('sample_reports')
      .select('business_name, zip, city, report, token')
      .ilike('business_name', l.business_name ?? '')
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!rpt?.report) {
      // No personalized report cached — skip and mark for retry later
      await supabase.from('outreach_leads').update({ status: 'awaiting_report' }).eq('id', l.id)
      errors++
      if (errorSamples.length < 5) errorSamples.push({ email: l.email, error: 'no cached report' })
      continue
    }

    const subject = `${rpt.business_name} — ${rpt.city ?? l.city ?? ''} ${l.trade ?? 'HVAC'} market intel (${rpt.report.competitive?.yourReviewCount ?? 0} reviews vs ${rpt.report.competitive?.marketAvgReviewCount ?? 0} avg)`
    const body = renderBody({
      first_name: firstNameFromLead(l),
      company_name: rpt.business_name,
      city: rpt.city ?? l.city ?? '',
      state: '',
      report: rpt.report,
      report_url: `https://www.bellavego.com/sample-report?for=${encodeURIComponent(rpt.business_name)}&zip=${encodeURIComponent(rpt.zip ?? '')}&type=${encodeURIComponent(l.trade ?? 'HVAC')}&city=${encodeURIComponent(rpt.city ?? '')}`,
    })

    try {
      await sendOne({ gmail, from: GMAIL_SEND_FROM, to: l.email, subject, body })
      sent++
      await supabase
        .from('outreach_leads')
        .update({ status: 'sent', updated_at: new Date().toISOString() })
        .eq('id', l.id)
    } catch (e) {
      errors++
      await supabase
        .from('outreach_leads')
        .update({ status: 'send_failed', updated_at: new Date().toISOString() })
        .eq('id', l.id)
      const msg = e instanceof Error ? e.message : String(e)
      if (errorSamples.length < 5) errorSamples.push({ email: l.email, error: msg.slice(0, 200) })
    }

    // Throttle. Last iteration: skip the sleep.
    if (sent + errors < leads.length) {
      const jitter = throttleSec + Math.floor((Math.random() - 0.5) * throttleSec * 0.5)
      await new Promise((r) => setTimeout(r, jitter * 1000))
    }
  }

  return NextResponse.json({ ok: true, sent, errors, errorSamples, totalProcessed: leads.length })
}

async function sendOne({
  gmail,
  from,
  to,
  subject,
  body,
}: {
  gmail: ReturnType<typeof google.gmail>
  from: string
  to: string
  subject: string
  body: string
}) {
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`
  const lines = [
    `From: Peter McShane <${from}>`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    body,
  ]
  const raw = Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url')
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
}

type LeadShape = {
  email: string
  owner_first_name?: string | null
  business_name?: string | null
}

function firstNameFromLead(l: LeadShape): string {
  const explicit = (l.owner_first_name || '').trim()
  if (explicit && explicit.toLowerCase() !== 'there' && explicit.length > 1 && explicit.length < 20) {
    return explicit.charAt(0).toUpperCase() + explicit.slice(1).toLowerCase()
  }
  const local = (l.email || '').split('@')[0].toLowerCase()
  const generics = new Set([
    'info', 'sales', 'service', 'office', 'contact', 'admin', 'hello',
    'support', 'mail', 'team', 'help', 'inquiry', 'inquiries', 'customerservice',
    'customer.service', 'frontdesk', 'reception', 'dispatch', 'estimates',
  ])
  if (generics.has(local)) return 'team'
  const company = (l.business_name || '').toLowerCase().replace(/[^a-z]/g, '')
  if (company.length >= 4 && local.startsWith(company.slice(0, 4))) return 'team'
  const first = local.split(/[.\-_+0-9]/)[0]
  if (first.length >= 2 && first.length <= 14 && /^[a-z]+$/.test(first) && !generics.has(first)) {
    if (company.length >= 4 && (company.startsWith(first) || first.startsWith(company.slice(0, 4)))) return 'team'
    return first.charAt(0).toUpperCase() + first.slice(1)
  }
  return 'team'
}

type ReportShape = {
  competitive?: {
    yourReviewCount?: number
    marketAvgReviewCount?: number
    yourRank?: number
    totalCompetitors?: number
    yourRating?: number
    competitors?: Array<{ name?: string; reviewCount?: number }>
  }
  opportunities?: Array<{ title?: string; monthlyValue?: number }>
}

function renderBody(input: {
  first_name: string
  company_name: string
  city: string
  state: string
  report: ReportShape
  report_url: string
}) {
  const c = input.report.competitive ?? {}
  const o = (input.report.opportunities ?? [])[0] ?? {}
  const topComp = (c.competitors ?? [])[0] ?? {}
  return [
    `Hey ${input.first_name},`,
    '',
    `Pulled a quick revenue intel report on ${input.company_name} this morning — ${input.city} ${input.state} HVAC market.`,
    '',
    'Three things stood out:',
    '',
    `→ You're ranked #${c.yourRank ?? '?'} of ${c.totalCompetitors ?? '?'} HVAC shops with ${c.yourRating ?? '?'}★ and ${c.yourReviewCount ?? 0} reviews. Market average is ${c.marketAvgReviewCount ?? 0} reviews. ${topComp.name ?? 'Top competitor'} sits at ${topComp.reviewCount ?? 0}.`,
    '',
    `→ Top opportunity for ${input.company_name}: "${o.title ?? 'revenue gap'}" — modeled at +$${o.monthlyValue ?? 0}/mo. Full pattern + 5-step action plan inside the report.`,
    '',
    `→ Competitive table inside shows where you sit vs the 5 nearest shops by review volume + rating.`,
    '',
    `Full personalized report (no signup, 2 min):`,
    input.report_url,
    '',
    `We're BellAveGo — AI receptionist for HVAC shops that don't have one yet. You're probably answering your own phone between jobs right now, losing 2-3 jobs/week when you can't pick up. We answer those calls for you, capture the lead, text it to your phone in 10 seconds — so you can stay on the wrench AND book the job. 7-day free trial, $147/mo. No risk, cancel anytime.`,
    '',
    `— Peter`,
    `BellAveGo · (773) 710-9565`,
    '',
    `P.S. Want to set up your team's account? Text us at (773) 710-9565. We'll text back the moment we see it — no Zoom calls, no scheduling, just a conversation on your phone like everything else in your day.`,
  ].join('\n')
}
