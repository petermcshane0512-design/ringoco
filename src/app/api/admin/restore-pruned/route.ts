import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * POST /api/admin/restore-pruned — reverse the FL/TX prune (2026-06-13 per
 * Peter: "add them back, it's a volume game — they still get 10 real leads").
 * Removes the paused_geo contractors from the Instantly block list (so they
 * receive again) and resets their outreach_leads status. Dry-run default;
 * ?confirm=1 executes. Admin-gated.
 */

const BASE = 'https://api.instantly.ai/api/v2'
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

  // The paused_geo set = what the prune cut.
  const { data: paused } = await supabase
    .from('outreach_leads')
    .select('email')
    .eq('status', 'paused_geo')
    .limit(2000)
  const emails = new Set(((paused ?? []) as Array<{ email: string }>).map((r) => r.email.toLowerCase()))

  if (!confirm) {
    return NextResponse.json({ ok: true, dry_run: true, would_restore: emails.size, sample: [...emails].slice(0, 8) })
  }

  // 1. pull the block list, find entries matching our emails, delete them.
  let unblocked = 0
  const errors: string[] = []
  let cursor: string | undefined
  for (let p = 0; p < 30; p++) {
    const url = new URL(`${BASE}/block-lists-entries`)
    url.searchParams.set('limit', '100')
    if (cursor) url.searchParams.set('starting_after', cursor)
    const r = await fetch(url.toString(), { headers: H() })
    if (!r.ok) { errors.push(`list HTTP ${r.status}`); break }
    const j = await r.json()
    const items = (j.items ?? j.data ?? []) as Array<{ id: string; bl_value?: string; value?: string }>
    for (const it of items) {
      const val = (it.bl_value ?? it.value ?? '').toLowerCase()
      if (emails.has(val)) {
        const dr = await fetch(`${BASE}/block-lists-entries/${it.id}`, { method: 'DELETE', headers: H() })
        if (dr.ok) unblocked++
        else if (errors.length < 8) errors.push(`del ${val}: HTTP ${dr.status}`)
      }
    }
    cursor = j.next_starting_after
    if (!cursor || items.length === 0) break
  }

  // 2. reset DB status so they're live again.
  const { error: upErr } = await supabase
    .from('outreach_leads')
    .update({ status: 'in_instantly_queue' })
    .eq('status', 'paused_geo')
  if (upErr) errors.push(`status reset: ${upErr.message}`)

  return NextResponse.json({
    ok: true,
    restored_db: emails.size,
    unblocked_in_instantly: unblocked,
    errors,
    note: unblocked < emails.size ? 'some block-list entries not found via API — they may need manual removal in Instantly UI, OR were already removed' : 'all matched entries removed',
  })
}
