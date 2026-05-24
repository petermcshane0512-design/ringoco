import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'

/**
 * Probe Vapi's API for any balance/credit/billing endpoint that returns
 * remaining funds. Vapi's public docs don't mention one, but their
 * dashboard clearly shows a balance — so some endpoint exists.
 *
 * This hits a list of candidate paths and returns whichever responds 200
 * with useful data. Throwaway debugging — once we find the right path,
 * inline the call directly into founder-summary.
 */
export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  if (!process.env.VAPI_API_KEY) {
    return NextResponse.json({ error: 'VAPI_API_KEY not set' }, { status: 500 })
  }

  // The /org returning 401 earlier means it exists — auth was wrong. Try
  // more org-scoped paths + alternative header formats.
  const candidates = [
    '/org',
    '/org/me',
    '/org/current',
    '/org/credit',
    '/org/balance',
    '/org/billing',
    '/v1/org',
    '/v1/org/credit',
    '/v1/billing',
    '/v1/credit',
    '/v1/balance',
    '/workspace',
    '/workspaces',
    '/workspaces/credit',
    '/usage',
    '/usage-summary',
    '/dashboard/credit',
    '/dashboard/balance',
    '/team',
    '/teams',
  ]

  const results: Array<{ path: string; auth: string; status: number; bodyPreview: string }> = []
  for (const p of candidates) {
    // Try with Bearer first
    try {
      const r = await fetch(`https://api.vapi.ai${p}`, {
        headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` },
      })
      const text = (await r.text()).slice(0, 300)
      results.push({ path: p, auth: 'Bearer', status: r.status, bodyPreview: text })
    } catch (e) {
      results.push({ path: p, auth: 'Bearer', status: 0, bodyPreview: `THREW: ${(e as Error).message}` })
    }
    // For 401s, try with x-api-key as fallback
    const last = results[results.length - 1]
    if (last.status === 401) {
      try {
        const r2 = await fetch(`https://api.vapi.ai${p}`, {
          headers: { 'x-api-key': process.env.VAPI_API_KEY! },
        })
        const text2 = (await r2.text()).slice(0, 300)
        results.push({ path: p, auth: 'x-api-key', status: r2.status, bodyPreview: text2 })
      } catch {}
    }
  }

  return NextResponse.json({
    probed: results.length,
    results,
  })
}
