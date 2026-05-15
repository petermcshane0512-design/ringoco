import { NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'

const ADMIN_EMAILS = new Set(['pmcshane@fordham.edu', 'peter@bellavego.com'])

/**
 * Admin-only env-var presence check. Returns whether key env vars are set
 * in production, WITHOUT exposing their values. Used to diagnose
 * "env var added but function doesn't see it" issues.
 *
 * GET /api/admin/env-check → { GOOGLE_PLACES_API_KEY_set: true, ... }
 */
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cc = await clerkClient()
  const me = await cc.users.getUser(userId).catch(() => null)
  const email = me?.emailAddresses?.[0]?.emailAddress?.toLowerCase() ?? ''
  if (!ADMIN_EMAILS.has(email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const present = (name: string): boolean => {
    const v = process.env[name]
    return typeof v === 'string' && v.length > 0
  }
  const length = (name: string): number => (process.env[name] ?? '').length
  const startsWith = (name: string, n = 6): string => (process.env[name] ?? '').slice(0, n)

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    runtime: process.env.VERCEL_ENV ?? 'unknown',
    google: {
      GOOGLE_MAPS_API_KEY: { set: present('GOOGLE_MAPS_API_KEY'), len: length('GOOGLE_MAPS_API_KEY'), prefix: startsWith('GOOGLE_MAPS_API_KEY') },
      GOOGLE_PLACES_API_KEY: { set: present('GOOGLE_PLACES_API_KEY'), len: length('GOOGLE_PLACES_API_KEY'), prefix: startsWith('GOOGLE_PLACES_API_KEY') },
      NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: { set: present('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY'), len: length('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY'), prefix: startsWith('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY') },
    },
    vapi: {
      VAPI_API_KEY: { set: present('VAPI_API_KEY'), len: length('VAPI_API_KEY') },
      VAPI_ASSISTANT_ID: { set: present('VAPI_ASSISTANT_ID'), len: length('VAPI_ASSISTANT_ID') },
      VAPI_WEBHOOK_SECRET: { set: present('VAPI_WEBHOOK_SECRET'), len: length('VAPI_WEBHOOK_SECRET') },
    },
    twilio: {
      TWILIO_ACCOUNT_SID: { set: present('TWILIO_ACCOUNT_SID') },
      TWILIO_AUTH_TOKEN: { set: present('TWILIO_AUTH_TOKEN') },
      TWILIO_PHONE_NUMBER: { set: present('TWILIO_PHONE_NUMBER') },
      TWILIO_DEMO_NUMBER: { set: present('TWILIO_DEMO_NUMBER') },
      TWILIO_MESSAGING_SERVICE_SID: { set: present('TWILIO_MESSAGING_SERVICE_SID') },
      FALLBACK_OWNER_PHONE: { set: present('FALLBACK_OWNER_PHONE') },
    },
    stripe: {
      STRIPE_SECRET_KEY: { set: present('STRIPE_SECRET_KEY') },
      STRIPE_WEBHOOK_SECRET: { set: present('STRIPE_WEBHOOK_SECRET') },
    },
    anthropic: {
      ANTHROPIC_API_KEY: { set: present('ANTHROPIC_API_KEY') },
    },
    other: {
      NEXT_PUBLIC_APP_URL: { set: present('NEXT_PUBLIC_APP_URL'), value: process.env.NEXT_PUBLIC_APP_URL ?? null },
      NEXT_PUBLIC_SUPABASE_URL: { set: present('NEXT_PUBLIC_SUPABASE_URL') },
      SUPABASE_SERVICE_ROLE_KEY: { set: present('SUPABASE_SERVICE_ROLE_KEY') },
      CRON_SECRET: { set: present('CRON_SECRET') },
    },
  })
}
