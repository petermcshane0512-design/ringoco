import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

export const runtime = 'nodejs'

/**
 * GET /api/admin/debug-refill
 *
 * Diagnostic for refill-outreach-queue cron. Verifies:
 *   - APIFY_TOKEN env present
 *   - data/scrape-schedule.json loadable + today's entry exists
 *   - supabase reachable + queue depth + recent inserts
 *
 * Use to diagnose why refill didn't fire / yield without burning Apify spend.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(_req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  const APIFY_TOKEN = process.env.APIFY_TOKEN || process.env.APIFY_API_KEY
  const today = new Date().toISOString().slice(0, 10)

  // Load schedule
  let schedule: { schedule?: Array<{ date: string; send_target: number; scrape_target: number; cities: string[] }> } = {}
  let schedulePath = ''
  try {
    schedulePath = path.join(process.cwd(), 'data', 'scrape-schedule.json')
    schedule = JSON.parse(fs.readFileSync(schedulePath, 'utf8'))
  } catch (e) {
    schedule = { schedule: undefined }
  }
  const todayEntry = (schedule.schedule || []).find((d) => d.date === today)

  // Queue depth + recent inserts
  const queued = await supabase
    .from('outreach_leads')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'queued')
    .not('email', 'is', null)

  const recent24h = await supabase
    .from('outreach_leads')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', new Date(Date.now() - 86_400_000).toISOString())

  const recent2h = await supabase
    .from('outreach_leads')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', new Date(Date.now() - 7_200_000).toISOString())

  // Probe Apify w/ a tiny no-cost token validation
  let apifyReachable = false
  let apifyError: string | null = null
  if (APIFY_TOKEN) {
    try {
      const r = await fetch(`https://api.apify.com/v2/users/me?token=${APIFY_TOKEN}`)
      apifyReachable = r.ok
      if (!r.ok) apifyError = `HTTP ${r.status}: ${(await r.text()).slice(0, 100)}`
    } catch (e) {
      apifyError = (e as Error).message
    }
  }

  return NextResponse.json({
    ok: true,
    apify: {
      token_set: !!APIFY_TOKEN,
      token_env_var: APIFY_TOKEN ? (process.env.APIFY_TOKEN ? 'APIFY_TOKEN' : 'APIFY_API_KEY') : null,
      reachable: apifyReachable,
      error: apifyError,
    },
    schedule: {
      file_path: schedulePath,
      loaded: !!schedule.schedule,
      total_entries: schedule.schedule?.length ?? 0,
      today_date: today,
      today_entry: todayEntry || null,
    },
    queue: {
      sendable_queued: queued.count ?? 0,
      inserted_last_24h: recent24h.count ?? 0,
      inserted_last_2h: recent2h.count ?? 0,
    },
    next_actions: [
      !APIFY_TOKEN ? 'ADD APIFY_TOKEN env var in Vercel → Settings → Environment Variables' : null,
      !todayEntry ? `ADD today's entry (${today}) to data/scrape-schedule.json` : null,
      apifyReachable === false && APIFY_TOKEN ? 'CHECK Apify token validity (revoked / expired)' : null,
    ].filter(Boolean),
    checked_at: new Date().toISOString(),
  })
}
