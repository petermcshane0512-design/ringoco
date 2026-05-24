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

  const candidates = [
    '/billing',
    '/billing/balance',
    '/billing/usage',
    '/credit',
    '/credit-balance',
    '/credits',
    '/payment',
    '/payment/balance',
    '/account',
    '/account/balance',
    '/org',
    '/organization',
    '/me',
    '/user',
    '/subscription',
    '/invoice',
    '/balance',
  ]

  const results: Array<{ path: string; status: number; bodyPreview: string }> = []
  for (const p of candidates) {
    try {
      const r = await fetch(`https://api.vapi.ai${p}`, {
        headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` },
      })
      const text = (await r.text()).slice(0, 400)
      results.push({ path: p, status: r.status, bodyPreview: text })
    } catch (e) {
      results.push({ path: p, status: 0, bodyPreview: `THREW: ${(e as Error).message}` })
    }
  }

  return NextResponse.json({
    probed: results.length,
    results,
  })
}
