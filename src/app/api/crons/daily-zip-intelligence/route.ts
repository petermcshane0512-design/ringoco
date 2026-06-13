import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * GET /api/crons/daily-zip-intelligence — 2026-06-13 per Peter.
 *
 * The brain on top of the 14 enforcement agents. Runs every morning at
 * 5am UTC (after the 4am ingest-enforcement-registry cron) and:
 *
 *   1. Pulls violation density across every US zip we've ever scraped
 *      (enforcement_zip_density view)
 *   2. Cross-references against active customer territories so we
 *      deprioritize zips already fulfilled (don't waste cold email
 *      acquiring a second roofer in a zip we already sold to a roofer
 *      — go find their NEIGHBORING zip instead)
 *   3. Scores each zip on a composite metric:
 *          score = last_7d × 3   (freshness — Hormozi: speed-to-market)
 *                + last_30d × 1   (volume — Hormozi: volume negates luck)
 *                + trade_diversity × 5   (a roof+masonry+HVAC zip can
 *                                          serve THREE shops, not one)
 *                − active_customer_penalty × 50
 *   4. Persists the day's top 50 zips into daily_zip_targets
 *   5. SMSes Peter a one-line summary so he wakes up knowing where
 *      we're hunting today
 *   6. The downstream refill-outreach-queue cron (6am) consumes
 *      daily_zip_targets to pull Apify contractor lists from those zips
 *
 * Elon Algorithm:
 *   - Q every requirement: Do we need to score every zip in the world?
 *     No — only zips where we've ingested violations. Trimmed scope.
 *   - Delete: skip zips with zero last-30d activity (dead supply)
 *   - Simplify: one weighted sum, no ML, no over-engineering
 *   - Accelerate: runs daily, results compound nightly
 *   - Automate: cron + SMS, Peter never has to read a dashboard
 *
 * Hormozi:
 *   - The dream outcome (zips where leads are SITTING) found mechanically
 *   - Specificity: top 50 zips named + ranked + scored
 *   - Speed: yesterday's violations drive today's contractor prospecting
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!,
)

type DensityRow = {
  zip: string
  live_violations: number
  last_7d: number
  last_30d: number
  trades_seen: string[] | null
  most_recent_at: string | null
}

type TerritoryRow = {
  zip: string
  trade: string
  status: string
}

export async function GET(req: NextRequest) {
  // Triple auth — same pattern as the ingest cron
  const isCron = req.headers.get('x-vercel-cron') === '1'
  const adminSecret = req.headers.get('x-admin-secret')
  const expected = process.env.ADMIN_API_SECRET
  const hasSecret = !!expected && adminSecret === expected
  if (!isCron && !hasSecret) {
    const gate = await requireAdmin()
    if (!gate.ok) return gate.res
  }

  const url = new URL(req.url)
  const dry = url.searchParams.get('dry') === '1'
  const topN = Math.min(200, Math.max(10, parseInt(url.searchParams.get('top') ?? '50', 10)))
  const noSms = url.searchParams.get('sms') === '0'

  // 1) Pull current violation density
  const { data: density, error: dErr } = await supabase
    .from('enforcement_zip_density')
    .select('*')
    .gt('last_30d', 0)
    .limit(2000)

  if (dErr) return NextResponse.json({ ok: false, error: dErr.message }, { status: 500 })
  if (!density || density.length === 0) {
    return NextResponse.json({ ok: true, scored: 0, message: 'enforcement_zip_density view returned 0 rows — run the ingest cron first' })
  }

  // 2) Pull active customer territories so we deprioritize filled zips
  const { data: territories } = await supabase
    .from('territories')
    .select('zip, trade, status')
    .in('status', ['claimed', 'grace'])
    .limit(5000)

  const claimsByZip = new Map<string, Set<string>>()
  for (const t of (territories || []) as TerritoryRow[]) {
    if (!claimsByZip.has(t.zip)) claimsByZip.set(t.zip, new Set())
    claimsByZip.get(t.zip)!.add(t.trade.toLowerCase())
  }

  // 3) Pull city/state metadata for each zip (best-effort — use a recent
  // `leads` row as the source of truth)
  const zipsToLookup = (density as DensityRow[]).map((d) => d.zip)
  const { data: leadCityRows } = await supabase
    .from('leads')
    .select('zip, city, state')
    .in('zip', zipsToLookup)
    .eq('source', 'enforcement')
    .limit(2000)

  const cityByZip = new Map<string, { city: string | null; state: string | null }>()
  for (const r of (leadCityRows || []) as Array<{ zip: string; city: string | null; state: string | null }>) {
    if (!cityByZip.has(r.zip)) cityByZip.set(r.zip, { city: r.city, state: r.state })
  }

  // 4) Score each zip
  type Scored = {
    zip: string
    city: string | null
    state: string | null
    last_7d: number
    last_30d: number
    trades: string[]
    trade_count: number
    active_customers: number
    has_open_territory: boolean
    score: number
  }

  const scored: Scored[] = (density as DensityRow[]).map((d) => {
    const trades = (d.trades_seen || []).filter((t): t is string => !!t)
    const claims = claimsByZip.get(d.zip) || new Set<string>()
    const activeCustomers = claims.size
    // Has at least one tradeable opening = at least one of the trades we
    // surface in this zip isn't already claimed
    const hasOpenTerritory = trades.some((t) => !claims.has(t.toLowerCase())) || trades.length > activeCustomers
    const meta = cityByZip.get(d.zip) || { city: null, state: null }

    const score =
      d.last_7d * 3
      + d.last_30d * 1
      + trades.length * 5
      - activeCustomers * 50

    return {
      zip: d.zip,
      city: meta.city,
      state: meta.state,
      last_7d: d.last_7d,
      last_30d: d.last_30d,
      trades,
      trade_count: trades.length,
      active_customers: activeCustomers,
      has_open_territory: hasOpenTerritory,
      score,
    }
  })

  // Sort + take top N
  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, topN)

  // 5) Persist
  if (!dry) {
    const today = new Date().toISOString().slice(0, 10)
    const rows = top.map((s, i) => ({
      run_date: today,
      zip: s.zip,
      city: s.city,
      state: s.state,
      rank: i + 1,
      score: s.score,
      last_7d_count: s.last_7d,
      last_30d_count: s.last_30d,
      trade_count: s.trade_count,
      trades: s.trades,
      has_open_territory: s.has_open_territory,
      active_customers: s.active_customers,
    }))

    const { error: insErr } = await supabase
      .from('daily_zip_targets')
      .upsert(rows, { onConflict: 'run_date,zip' })
    if (insErr) {
      return NextResponse.json({ ok: false, error: `target upsert: ${insErr.message}`, scored: scored.length }, { status: 500 })
    }
  }

  // 6) Wake Peter with a one-liner
  let smsResult: { sent: boolean; error?: string; from?: string; to?: string } = { sent: false }
  if (!dry && !noSms && top.length > 0) {
    const t1 = top[0]
    const t2 = top[1]
    const t3 = top[2]
    // 2026-06-13 — stripped emoji + en-dashes after Peter reported no SMS
    // arrived. Twilio occasionally drops messages with high-codepoint
    // characters silently on certain carriers. ASCII-only body is bullet-
    // proof. Errors now surface in the response JSON so we never debug
    // blind again.
    const sms =
      `BellAveGo prospecting orders - ${top.length} zips scored\n\n` +
      `1. ${t1.zip}${t1.city ? ` ${t1.city}` : ''}: ${t1.last_7d}/wk - ${t1.trades.slice(0, 3).join('/') || '-'}\n` +
      (t2 ? `2. ${t2.zip}${t2.city ? ` ${t2.city}` : ''}: ${t2.last_7d}/wk - ${t2.trades.slice(0, 3).join('/') || '-'}\n` : '') +
      (t3 ? `3. ${t3.zip}${t3.city ? ` ${t3.city}` : ''}: ${t3.last_7d}/wk - ${t3.trades.slice(0, 3).join('/') || '-'}\n` : '') +
      `\nFull list: bellavego.com/admin/zip-targets`

    const fromNumber = process.env.TWILIO_PHONE_NUMBER || ''
    const toNumber = process.env.FOUNDER_ALERT_PHONE ?? '+17737109565'
    smsResult.from = fromNumber ? `${fromNumber.slice(0, 6)}...` : 'UNSET'
    smsResult.to = toNumber

    if (!fromNumber) {
      smsResult.error = 'TWILIO_PHONE_NUMBER env var not set'
    } else {
      try {
        const m = await twilioClient.messages.create({
          body: sms,
          from: fromNumber,
          to: toNumber,
        })
        smsResult.sent = true
        ;(smsResult as { sid?: string }).sid = m.sid
      } catch (e) {
        smsResult.error = (e as Error).message.slice(0, 300)
      }
    }
  }

  return NextResponse.json({
    ok: true,
    dry,
    scored_count: scored.length,
    persisted_count: dry ? 0 : top.length,
    sms: smsResult,
    top_10: top.slice(0, 10).map((s) => ({
      zip: s.zip,
      city: s.city,
      state: s.state,
      score: Number(s.score.toFixed(1)),
      last_7d: s.last_7d,
      last_30d: s.last_30d,
      trades: s.trades,
      open: s.has_open_territory,
    })),
  })
}

