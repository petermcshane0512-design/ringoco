import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'

/**
 * One-shot repair: PATCH every per-tenant Vapi assistant so its serverUrl
 * points at https://www.bellavego.com (not bellavego.com). Vapi POSTs to
 * the apex domain returned a 307 to www; Vapi (like most webhook senders)
 * doesn't follow POST redirects, so every tool-call + end-of-call-report
 * webhook was silently dropped. Symptom: contractors get no SMS/email
 * even though Emma answered the call and ran take_message.
 *
 * Safe to re-run — it's idempotent. PATCH a serverUrl that's already
 * correct is a no-op + 1 Vapi API call. Run once after the fix is
 * deployed, then never again unless a new outage shows up.
 *
 * Optional ?user_id= scopes to one tenant (the test profile). Omit to
 * iterate every profile that has a vapi_assistant_id (every paying
 * customer).
 *
 * Auth: requireAdmin().
 */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const CORRECT_SERVER_URL = 'https://www.bellavego.com/api/vapi/end-of-call-report'

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
  if (userId) {
    query = query.eq('user_id', userId)
  }
  const { data: profiles, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const results: Array<{
    user_id: string
    business_name: string | null
    vapi_assistant_id: string
    previous_server_url: string | null
    new_server_url: string
    status: 'updated' | 'already-correct' | 'failed'
    error?: string
  }> = []

  for (const p of profiles ?? []) {
    const assistantId = (p as { vapi_assistant_id: string }).vapi_assistant_id
    try {
      const getRes = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
        headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` },
      })
      if (!getRes.ok) {
        results.push({
          user_id: p.user_id,
          business_name: p.business_name,
          vapi_assistant_id: assistantId,
          previous_server_url: null,
          new_server_url: CORRECT_SERVER_URL,
          status: 'failed',
          error: `GET ${getRes.status}: ${(await getRes.text()).slice(0, 120)}`,
        })
        continue
      }
      const a = (await getRes.json()) as { serverUrl?: string }
      const previousServerUrl = a.serverUrl ?? null

      if (previousServerUrl === CORRECT_SERVER_URL) {
        results.push({
          user_id: p.user_id,
          business_name: p.business_name,
          vapi_assistant_id: assistantId,
          previous_server_url: previousServerUrl,
          new_server_url: CORRECT_SERVER_URL,
          status: 'already-correct',
        })
        continue
      }

      const patchRes = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ serverUrl: CORRECT_SERVER_URL }),
      })
      if (!patchRes.ok) {
        results.push({
          user_id: p.user_id,
          business_name: p.business_name,
          vapi_assistant_id: assistantId,
          previous_server_url: previousServerUrl,
          new_server_url: CORRECT_SERVER_URL,
          status: 'failed',
          error: `PATCH ${patchRes.status}: ${(await patchRes.text()).slice(0, 120)}`,
        })
        continue
      }

      results.push({
        user_id: p.user_id,
        business_name: p.business_name,
        vapi_assistant_id: assistantId,
        previous_server_url: previousServerUrl,
        new_server_url: CORRECT_SERVER_URL,
        status: 'updated',
      })
    } catch (e) {
      results.push({
        user_id: p.user_id,
        business_name: p.business_name,
        vapi_assistant_id: assistantId,
        previous_server_url: null,
        new_server_url: CORRECT_SERVER_URL,
        status: 'failed',
        error: (e as Error).message,
      })
    }
  }

  return NextResponse.json({
    scope: userId ? `single user_id=${userId}` : 'all profiles with vapi_assistant_id',
    total: results.length,
    updated: results.filter((r) => r.status === 'updated').length,
    already_correct: results.filter((r) => r.status === 'already-correct').length,
    failed: results.filter((r) => r.status === 'failed').length,
    results,
  })
}
