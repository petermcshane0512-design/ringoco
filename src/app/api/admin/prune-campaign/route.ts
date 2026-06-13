import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * POST /api/admin/prune-campaign — remove contractors OUTSIDE the
 * enforcement metros from the live Instantly campaign (2026-06-13 per
 * Peter, "whatever gets us to $10M").
 *
 * Why: the campaign is loaded with ~300 legacy FL/TX contractors from the
 * pre-pivot Sun Belt scrape. We have ZERO enforcement (city-cited) data for
 * those metros, so the email's "a {city} homeowner the city just cited"
 * promise is false for them — and they bounce more. Emailing them is
 * negative progress (brand + deliverability). We only keep IL / NY / PA
 * (Chicago / NYC / Philadelphia), the metros where the promise is real.
 *
 * Stop method, in order of reliability:
 *   1. DELETE /leads/{id}  (remove from campaign)
 *   2. if that 400s, add the email to the workspace BLOCK LIST (sends stop
 *      regardless of campaign membership)
 *   3. always mark outreach_leads.status='paused_geo' so no future load
 *      re-adds them.
 *
 * Dry-run by default; ?confirm=1 to execute. Admin-gated.
 */

const CAMPAIGN = process.env.INSTANTLY_CAMPAIGN_HVAC_Q3 || '8ac14ff5-8cd4-4ac4-8549-88dddbef8067'
const BASE = 'https://api.instantly.ai/api/v2'
const KEEP_STATES = new Set(['il', 'illinois', 'ny', 'new york', 'pa', 'pennsylvania'])

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
function H() { return { Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}`, 'Content-Type': 'application/json' } }

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  if (!process.env.INSTANTLY_API_KEY) return NextResponse.json({ ok: false, error: 'no key' }, { status: 503 })
  const confirm = req.nextUrl.searchParams.get('confirm') === '1'

  // 1. all campaign leads
  const leads: Array<{ id: string; email: string }> = []
  let cursor: string | undefined
  for (let p = 0; p < 12; p++) {
    const r = await fetch(`${BASE}/leads/list`, { method: 'POST', headers: H(), body: JSON.stringify({ campaign: CAMPAIGN, limit: 100, ...(cursor ? { starting_after: cursor } : {}) }) })
    if (!r.ok) return NextResponse.json({ ok: false, error: `leads/list HTTP ${r.status}` }, { status: 502 })
    const j = await r.json()
    for (const it of j.items ?? []) if (it.email) leads.push({ id: it.id, email: it.email.toLowerCase() })
    cursor = j.next_starting_after
    if (!cursor) break
  }

  // 2. resolve each email's state from outreach_leads
  const emails = leads.map((l) => l.email)
  const stateByEmail = new Map<string, string>()
  for (let i = 0; i < emails.length; i += 200) {
    const { data } = await supabase.from('outreach_leads').select('email, state').in('email', emails.slice(i, i + 200))
    for (const r of (data ?? []) as Array<{ email: string; state: string | null }>) {
      stateByEmail.set(r.email.toLowerCase(), (r.state || '').toLowerCase().trim())
    }
  }

  // 3. classify keep vs prune
  const toPrune = leads.filter((l) => {
    const st = stateByEmail.get(l.email) ?? ''
    return !KEEP_STATES.has(st)   // unknown state → prune (can't verify it's enforcement metro)
  })
  const kept = leads.length - toPrune.length

  if (!confirm) {
    return NextResponse.json({
      ok: true, dry_run: true,
      campaign_leads: leads.length,
      would_keep: kept,
      would_prune: toPrune.length,
      sample_prune: toPrune.slice(0, 8).map((l) => ({ email: l.email, state: stateByEmail.get(l.email) || '?' })),
      to_execute: 'POST again with ?confirm=1',
    })
  }

  let deleted = 0, blocked = 0, marked = 0
  const errors: string[] = []
  for (const l of toPrune) {
    // mark in our DB first (so no future load re-adds them)
    await supabase.from('outreach_leads').update({ status: 'paused_geo' }).eq('email', l.email)
    marked++
    // try delete from campaign
    const dr = await fetch(`${BASE}/leads/${l.id}`, { method: 'DELETE', headers: H() })
    if (dr.ok) { deleted++; continue }
    // fallback: block list (stops sends regardless)
    const br = await fetch(`${BASE}/block-lists-entries`, { method: 'POST', headers: H(), body: JSON.stringify({ bl_value: l.email }) })
    if (br.ok) { blocked++; continue }
    if (errors.length < 8) errors.push(`${l.email}: del ${dr.status} / block ${br.status} ${(await br.text().catch(() => '')).slice(0, 80)}`)
  }

  return NextResponse.json({
    ok: true,
    campaign_leads: leads.length,
    kept,
    pruned_total: toPrune.length,
    deleted_from_campaign: deleted,
    blocklisted: blocked,
    db_marked: marked,
    errors,
  })
}
