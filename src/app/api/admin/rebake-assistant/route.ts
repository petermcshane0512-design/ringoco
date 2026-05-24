import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { repatchPerTenantAssistant } from '@/lib/provisionNumber'

/**
 * Re-PATCH an existing per-tenant Vapi assistant with the latest baked
 * config from baseConfig + renderSystemPrompt(). Use this after any
 * change to vapi.ts (system prompt, take_message schema, voice flags,
 * tools) to push it to assistants created before the change.
 *
 * Idempotent — re-running is a no-op for the AI's behavior, costs one
 * Vapi API call.
 *
 * Optional ?user_id= scopes to one tenant. Omit to rebake every profile
 * that has a vapi_assistant_id.
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

  const userId = new URL(req.url).searchParams.get('user_id')

  let query = supabase
    .from('profiles')
    .select('user_id, business_name')
    .not('vapi_assistant_id', 'is', null)
  if (userId) query = query.eq('user_id', userId)
  const { data: profiles, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results: Array<{
    user_id: string
    business_name: string | null
    ok: boolean
    detail: string
  }> = []

  for (const p of profiles ?? []) {
    const r = await repatchPerTenantAssistant(p.user_id)
    results.push({
      user_id: p.user_id,
      business_name: p.business_name,
      ok: r.ok,
      detail: r.ok ? `assistant ${r.assistantId}` : r.reason,
    })
  }

  return NextResponse.json({
    scope: userId ? `single user_id=${userId}` : 'all profiles with vapi_assistant_id',
    total: results.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  })
}
