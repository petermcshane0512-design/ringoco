import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'

/**
 * Backfill call_logs from Vapi truth-source.
 *
 * Why this exists: until 2026-05-24 ~17:00 UTC, the per-tenant assistant
 * serverUrl was baked in as bellavego.com (no www). Vercel 307-redirects
 * to www, Vapi doesn't follow POST redirects, so every webhook from those
 * assistants was silently dropped. Vapi answered the calls, ran
 * take_message, but our call_logs table never saw a single row.
 *
 * After the www fix, FUTURE calls write to call_logs normally. This
 * endpoint reaches into Vapi's call history and rebuilds the rows that
 * were lost during the outage window so the contractor's dashboard
 * reflects reality.
 *
 * Idempotent — upsert on call_sid means re-running is safe (same row gets
 * overwritten with same data). Only writes call_logs; does NOT create
 * jobs (those need clean tool-call arg parsing that the live webhook
 * already does — backfilling them risks dupes if the original webhook
 * later replays from Vapi's retry queue).
 *
 * Usage:
 *   POST /api/admin/backfill-vapi-calls?user_id=user_xxxxx
 *   POST /api/admin/backfill-vapi-calls (loops all profiles with vapi_assistant_id)
 *
 * Auth: requireAdmin().
 */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  if (!process.env.VAPI_API_KEY) {
    return NextResponse.json({ error: 'VAPI_API_KEY not set' }, { status: 500 })
  }

  const userId = new URL(req.url).searchParams.get('user_id')

  let query = supabase
    .from('profiles')
    .select('user_id, business_name, vapi_assistant_id')
    .not('vapi_assistant_id', 'is', null)
  if (userId) query = query.eq('user_id', userId)
  const { data: profiles, error: pErr } = await query
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })

  const tenantResults: Array<{
    user_id: string
    assistant_id: string
    vapi_calls_seen: number
    inserted: number
    already_present: number
    failed: number
    errors?: string[]
  }> = []

  for (const p of profiles ?? []) {
    const assistantId = (p as { vapi_assistant_id: string }).vapi_assistant_id
    const errors: string[] = []
    let vapiCalls: Array<Record<string, unknown>> = []
    try {
      const r = await fetch(
        `https://api.vapi.ai/call?assistantId=${assistantId}&limit=50`,
        { headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` } },
      )
      if (!r.ok) {
        tenantResults.push({
          user_id: p.user_id,
          assistant_id: assistantId,
          vapi_calls_seen: 0,
          inserted: 0,
          already_present: 0,
          failed: 0,
          errors: [`Vapi list HTTP ${r.status}`],
        })
        continue
      }
      vapiCalls = (await r.json()) as Array<Record<string, unknown>>
    } catch (e) {
      tenantResults.push({
        user_id: p.user_id,
        assistant_id: assistantId,
        vapi_calls_seen: 0,
        inserted: 0,
        already_present: 0,
        failed: 0,
        errors: [`fetch threw: ${(e as Error).message}`],
      })
      continue
    }

    let inserted = 0
    let alreadyPresent = 0
    let failed = 0

    for (const c of vapiCalls) {
      const callSid = c.id as string
      if (!callSid) continue

      // Check if we already have this row (idempotency safety).
      const { data: existing } = await supabase
        .from('call_logs')
        .select('id')
        .eq('call_sid', callSid)
        .maybeSingle()
      if (existing) {
        alreadyPresent++
        continue
      }

      // Pull useful fields from the Vapi call. Tool calls in messages array
      // tell us whether take_message ran (used as the "lead captured" signal).
      const callerPhone = (c.customer as { number?: string } | undefined)?.number ?? null
      const summary = (c.summary as string | undefined) ?? null
      const transcript =
        typeof c.transcript === 'string'
          ? c.transcript
          : c.messages
          ? JSON.stringify(c.messages).slice(0, 50_000)
          : null
      const messages = (c.messages as Array<Record<string, unknown>> | undefined) ?? []
      const tookMessage = messages.some(
        (m) =>
          Array.isArray((m as { toolCalls?: unknown[] }).toolCalls) &&
          ((m as { toolCalls: Array<{ function?: { name?: string } }> }).toolCalls).some(
            (tc) => tc.function?.name === 'take_message',
          ),
      )
      const createdAt = (c.createdAt as string) ?? new Date().toISOString()

      // Use a minimal row — call_logs schema in production doesn't include
      // every column the live webhook writes (some were never migrated).
      // Counts + flags are what the dashboard reads; transcript/summary
      // are nice-to-haves that we drop here for backfill resilience.
      void transcript
      void summary
      const { error: insErr } = await supabase.from('call_logs').insert({
        user_id: p.user_id,
        profile_id: p.user_id,
        call_sid: callSid,
        caller_phone: callerPhone,
        job_created: tookMessage,
        booking_completed: tookMessage,
        created_at: createdAt,
      })
      if (insErr) {
        failed++
        errors.push(`${callSid}: ${insErr.message}`)
      } else {
        inserted++
      }
    }

    tenantResults.push({
      user_id: p.user_id,
      assistant_id: assistantId,
      vapi_calls_seen: vapiCalls.length,
      inserted,
      already_present: alreadyPresent,
      failed,
      ...(errors.length > 0 ? { errors } : {}),
    })
  }

  return NextResponse.json({
    scope: userId ? `single user_id=${userId}` : 'all profiles with vapi_assistant_id',
    profiles_processed: tenantResults.length,
    total_inserted: tenantResults.reduce((s, t) => s + t.inserted, 0),
    total_already_present: tenantResults.reduce((s, t) => s + t.already_present, 0),
    total_failed: tenantResults.reduce((s, t) => s + t.failed, 0),
    results: tenantResults,
  })
}
