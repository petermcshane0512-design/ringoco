import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'

/**
 * Diagnose which Vapi key is which. Tells us whether VAPI_API_KEY and
 * VAPI_PRIVATE_KEY are different values, and what each one can access.
 */
export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  const publicKey = process.env.VAPI_API_KEY
  const privateKey = process.env.VAPI_PRIVATE_KEY

  const out: Record<string, unknown> = {
    public_key_present: !!publicKey,
    private_key_present: !!privateKey,
    public_key_prefix: publicKey?.slice(0, 8) ?? null,
    private_key_prefix: privateKey?.slice(0, 8) ?? null,
    keys_identical: publicKey && privateKey ? publicKey === privateKey : null,
  }

  // Try /assistant (call-level) with each key
  for (const [name, key] of [
    ['public', publicKey],
    ['private', privateKey],
  ] as const) {
    if (!key) continue
    try {
      const r = await fetch('https://api.vapi.ai/assistant?limit=1', {
        headers: { Authorization: `Bearer ${key}` },
      })
      out[`${name}_can_list_assistants`] = { status: r.status, ok: r.ok }
    } catch (e) {
      out[`${name}_can_list_assistants`] = { error: (e as Error).message }
    }
  }

  return NextResponse.json(out)
}
