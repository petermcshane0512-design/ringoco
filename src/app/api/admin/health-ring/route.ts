import { NextResponse } from 'next/server'
import twilio from 'twilio'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'

/**
 * Infrastructure health ring — pings each vendor we depend on and
 * returns a green/yellow/red health verdict + latency for the nucleus.
 *
 * Vendors covered:
 *   - Twilio (auth + balance)
 *   - Vapi (auth via /assistant)
 *   - Supabase (DB ping)
 *   - Stripe (auth)
 *   - Anthropic (auth — minimal token call)
 *   - Resend (no public health endpoint — assume green if API key set)
 *   - Cronofy (no public health endpoint — assume green if env set)
 *   - Clerk (auth via /me with secret)
 *
 * Each probe has its own try/catch + 5s timeout so a single slow
 * vendor doesn't block the whole dashboard.
 */

type Health = 'green' | 'yellow' | 'red' | 'unknown'

type ProbeResult = {
  name: string
  health: Health
  latency_ms: number | null
  note: string
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race<T | null>([
    p,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ])
}

async function probeTwilio(): Promise<ProbeResult> {
  const t0 = Date.now()
  try {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      return { name: 'Twilio', health: 'red', latency_ms: null, note: 'creds missing' }
    }
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    const bal = await withTimeout(client.balance.fetch(), 5000)
    if (!bal) return { name: 'Twilio', health: 'red', latency_ms: null, note: 'timeout' }
    const balance = parseFloat(bal.balance)
    const latency = Date.now() - t0
    return {
      name: 'Twilio',
      health: balance < 5 ? 'red' : balance < 20 ? 'yellow' : 'green',
      latency_ms: latency,
      note: `$${balance.toFixed(2)} · ${latency}ms`,
    }
  } catch (e) {
    return { name: 'Twilio', health: 'red', latency_ms: Date.now() - t0, note: (e as Error).message.slice(0, 60) }
  }
}

async function probeVapi(): Promise<ProbeResult> {
  const t0 = Date.now()
  try {
    if (!process.env.VAPI_API_KEY) return { name: 'Vapi', health: 'red', latency_ms: null, note: 'key missing' }
    const r = await withTimeout(
      fetch('https://api.vapi.ai/assistant?limit=1', {
        headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` },
      }),
      5000,
    )
    if (!r) return { name: 'Vapi', health: 'red', latency_ms: null, note: 'timeout' }
    const latency = Date.now() - t0
    return {
      name: 'Vapi',
      health: r.ok ? 'green' : 'red',
      latency_ms: latency,
      note: r.ok ? `${latency}ms` : `HTTP ${r.status}`,
    }
  } catch (e) {
    return { name: 'Vapi', health: 'red', latency_ms: Date.now() - t0, note: (e as Error).message.slice(0, 60) }
  }
}

async function probeSupabase(): Promise<ProbeResult> {
  const t0 = Date.now()
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return { name: 'Supabase', health: 'red', latency_ms: null, note: 'creds missing' }
    }
    const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    // Supabase queries are thenables but not real Promises until awaited.
    // Wrap in an explicit Promise so withTimeout's race works.
    const r = await withTimeout(
      (async () => supa.from('profiles').select('user_id', { count: 'exact', head: true }))(),
      5000,
    )
    if (!r) return { name: 'Supabase', health: 'red', latency_ms: null, note: 'timeout' }
    const latency = Date.now() - t0
    const err = (r as { error?: { message?: string } | null }).error
    return {
      name: 'Supabase',
      health: err ? 'red' : latency > 1000 ? 'yellow' : 'green',
      latency_ms: latency,
      note: err ? (err.message ?? 'error').slice(0, 50) : `${latency}ms`,
    }
  } catch (e) {
    return { name: 'Supabase', health: 'red', latency_ms: Date.now() - t0, note: (e as Error).message.slice(0, 60) }
  }
}

async function probeStripe(): Promise<ProbeResult> {
  const t0 = Date.now()
  try {
    if (!process.env.STRIPE_SECRET_KEY) return { name: 'Stripe', health: 'red', latency_ms: null, note: 'key missing' }
    const r = await withTimeout(
      fetch('https://api.stripe.com/v1/balance', {
        headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
      }),
      5000,
    )
    if (!r) return { name: 'Stripe', health: 'red', latency_ms: null, note: 'timeout' }
    const latency = Date.now() - t0
    return {
      name: 'Stripe',
      health: r.ok ? 'green' : 'red',
      latency_ms: latency,
      note: r.ok ? `${latency}ms` : `HTTP ${r.status}`,
    }
  } catch (e) {
    return { name: 'Stripe', health: 'red', latency_ms: Date.now() - t0, note: (e as Error).message.slice(0, 60) }
  }
}

async function probeAnthropic(): Promise<ProbeResult> {
  const t0 = Date.now()
  try {
    if (!process.env.ANTHROPIC_API_KEY) return { name: 'Anthropic', health: 'red', latency_ms: null, note: 'key missing' }
    // Hit /v1/models which is cheap (no token spend).
    const r = await withTimeout(
      fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
      }),
      5000,
    )
    if (!r) return { name: 'Anthropic', health: 'red', latency_ms: null, note: 'timeout' }
    const latency = Date.now() - t0
    return {
      name: 'Anthropic',
      health: r.ok ? 'green' : 'red',
      latency_ms: latency,
      note: r.ok ? `${latency}ms` : `HTTP ${r.status}`,
    }
  } catch (e) {
    return { name: 'Anthropic', health: 'red', latency_ms: Date.now() - t0, note: (e as Error).message.slice(0, 60) }
  }
}

async function probeResend(): Promise<ProbeResult> {
  const t0 = Date.now()
  try {
    if (!process.env.RESEND_API_KEY) return { name: 'Resend', health: 'red', latency_ms: null, note: 'key missing' }
    const r = await withTimeout(
      fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      }),
      5000,
    )
    if (!r) return { name: 'Resend', health: 'red', latency_ms: null, note: 'timeout' }
    const latency = Date.now() - t0
    return {
      name: 'Resend',
      health: r.ok ? 'green' : 'red',
      latency_ms: latency,
      note: r.ok ? `${latency}ms` : `HTTP ${r.status}`,
    }
  } catch (e) {
    return { name: 'Resend', health: 'red', latency_ms: Date.now() - t0, note: (e as Error).message.slice(0, 60) }
  }
}

async function probeClerk(): Promise<ProbeResult> {
  const t0 = Date.now()
  try {
    if (!process.env.CLERK_SECRET_KEY) return { name: 'Clerk', health: 'red', latency_ms: null, note: 'key missing' }
    // Hit /v1/jwks which works for any backend API key without needing a user id.
    const r = await withTimeout(
      fetch('https://api.clerk.com/v1/jwks', {
        headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` },
      }),
      5000,
    )
    if (!r) return { name: 'Clerk', health: 'red', latency_ms: null, note: 'timeout' }
    const latency = Date.now() - t0
    return {
      name: 'Clerk',
      health: r.ok ? 'green' : 'red',
      latency_ms: latency,
      note: r.ok ? `${latency}ms` : `HTTP ${r.status}`,
    }
  } catch (e) {
    return { name: 'Clerk', health: 'red', latency_ms: Date.now() - t0, note: (e as Error).message.slice(0, 60) }
  }
}

export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  // Run all probes in parallel — total time ~max of any one probe (~5s)
  const probes = await Promise.all([
    probeTwilio(),
    probeVapi(),
    probeSupabase(),
    probeStripe(),
    probeAnthropic(),
    probeResend(),
    probeClerk(),
  ])

  const counts = {
    green: probes.filter((p) => p.health === 'green').length,
    yellow: probes.filter((p) => p.health === 'yellow').length,
    red: probes.filter((p) => p.health === 'red').length,
  }
  const overall: Health = counts.red > 0 ? 'red' : counts.yellow > 0 ? 'yellow' : 'green'

  return NextResponse.json({
    asOf: new Date().toISOString(),
    overall,
    counts,
    vendors: probes,
  })
}
