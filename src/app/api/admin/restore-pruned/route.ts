import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * POST /api/admin/restore-pruned — reverse the FL/TX prune (per Peter:
 * volume game). Drives off the Instantly BLOCK LIST directly (the
 * paused_geo DB status was already reset, so we can't key off it): for each
 * block-list entry whose email is a contractor OUTSIDE the enforcement
 * states (IL/NY/PA), delete the entry so they receive again.
 *
 * ?confirm=1 executes. Captures full delete error bodies. Admin-gated.
 */

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

  // 1. pull the whole block list
  const entries: Array<{ id: string; bl_value: string }> = []
  let cursor: string | undefined
  for (let p = 0; p < 40; p++) {
    const url = new URL(`${BASE}/block-lists-entries`)
    url.searchParams.set('limit', '100')
    if (cursor) url.searchParams.set('starting_after', cursor)
    const r = await fetch(url.toString(), { headers: H() })
    if (!r.ok) return NextResponse.json({ ok: false, error: `list HTTP ${r.status}` }, { status: 502 })
    const j = await r.json()
    const items = (j.items ?? j.data ?? []) as Array<{ id: string; bl_value?: string; is_domain?: boolean }>
    for (const it of items) if (it.bl_value && !it.is_domain) entries.push({ id: it.id, bl_value: it.bl_value.toLowerCase() })
    cursor = j.next_starting_after
    if (!cursor || items.length === 0) break
  }

  // 2. which of those emails are non-enforcement contractors (FL/TX/etc) we pruned
  const emails = entries.map((e) => e.bl_value)
  const stateByEmail = new Map<string, string>()
  for (let i = 0; i < emails.length; i += 200) {
    const { data } = await supabase.from('outreach_leads').select('email, state').in('email', emails.slice(i, i + 200))
    for (const r of (data ?? []) as Array<{ email: string; state: string | null }>) {
      stateByEmail.set(r.email.toLowerCase(), (r.state || '').toLowerCase().trim())
    }
  }
  const toRestore = entries.filter((e) => stateByEmail.has(e.bl_value) && !KEEP_STATES.has(stateByEmail.get(e.bl_value)!))

  if (!confirm) {
    return NextResponse.json({
      ok: true, dry_run: true,
      blocklist_size: entries.length,
      would_restore: toRestore.length,
      sample: toRestore.slice(0, 6).map((e) => ({ email: e.bl_value, state: stateByEmail.get(e.bl_value) })),
    })
  }

  let removed = 0
  const errors: string[] = []
  for (const e of toRestore) {
    // Instantly's Fastify DELETE wants NO content-type + NO body (with JSON
    // header it demands a body; with a body it demands null). Auth header
    // only, no body.
    const dr = await fetch(`${BASE}/block-lists-entries/${e.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}` },
    })
    if (dr.ok) {
      removed++
      await supabase.from('outreach_leads').update({ status: 'in_instantly_queue' }).eq('email', e.bl_value)
    } else if (errors.length < 6) {
      errors.push(`${e.bl_value}: HTTP ${dr.status} ${(await dr.text().catch(() => '')).slice(0, 120)}`)
    }
  }

  return NextResponse.json({ ok: true, blocklist_size: entries.length, candidates: toRestore.length, removed, errors })
}
