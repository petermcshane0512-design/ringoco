import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'

/**
 * Admin-only env-var presence check. Returns whether key env vars are set
 * in production, WITHOUT exposing their values. Used to diagnose
 * "env var added but function doesn't see it" issues.
 *
 * GET /api/admin/env-check → { GOOGLE_PLACES_API_KEY_set: true, ... }
 */
export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  const present = (name: string): boolean => {
    const v = process.env[name]
    return typeof v === 'string' && v.length > 0
  }
  const length = (name: string): number => (process.env[name] ?? '').length
  const startsWith = (name: string, n = 6): string => (process.env[name] ?? '').slice(0, n)

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    runtime: process.env.VERCEL_ENV ?? 'unknown',
    // Identity of the Vercel project actually serving this response.
    // Compare this to the Vercel dashboard URL you're editing to confirm
    // you're editing the SAME project that serves bellavego.com.
    vercel_project_identity: {
      project_production_url: process.env.VERCEL_PROJECT_PRODUCTION_URL ?? null,
      git_repo_owner: process.env.VERCEL_GIT_REPO_OWNER ?? null,
      git_repo_slug: process.env.VERCEL_GIT_REPO_SLUG ?? null,
      git_commit_sha: (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7),
      deployment_id: process.env.VERCEL_DEPLOYMENT_ID ?? null,
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    },
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
    clerk: {
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: { set: present('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY') },
      CLERK_SECRET_KEY: { set: present('CLERK_SECRET_KEY') },
      NEXT_PUBLIC_CLERK_SIGN_IN_URL: { set: present('NEXT_PUBLIC_CLERK_SIGN_IN_URL') },
      NEXT_PUBLIC_CLERK_SIGN_UP_URL: { set: present('NEXT_PUBLIC_CLERK_SIGN_UP_URL') },
      NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: { set: present('NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL') },
      NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL: { set: present('NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL') },
    },
    supabase: {
      NEXT_PUBLIC_SUPABASE_URL: { set: present('NEXT_PUBLIC_SUPABASE_URL') },
      NEXT_PUBLIC_SUPABASE_ANON_KEY: { set: present('NEXT_PUBLIC_SUPABASE_ANON_KEY') },
      SUPABASE_SERVICE_ROLE_KEY: { set: present('SUPABASE_SERVICE_ROLE_KEY') },
    },
    stripe_extras: {
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: { set: present('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY') },
    },
    // ─── Optional / feature-flagged env vars ─────────────────────
    // These aren't strictly required for the core product to work, but
    // certain features (cold email automation, Concierge marketing ops,
    // admin endpoints) won't function without them.
    cold_email_stack: {
      INSTANTLY_API_KEY: { set: present('INSTANTLY_API_KEY') },
      INSTANTLY_DEFAULT_CAMPAIGN_ID: { set: present('INSTANTLY_DEFAULT_CAMPAIGN_ID') },
      INSTANTLY_WEBHOOK_SECRET: { set: present('INSTANTLY_WEBHOOK_SECRET') },
      APOLLO_API_KEY: { set: present('APOLLO_API_KEY') },
      RESEND_API_KEY: { set: present('RESEND_API_KEY') },
    },
    concierge_marketing_ops: {
      GOOGLE_ADS_DEVELOPER_TOKEN: { set: present('GOOGLE_ADS_DEVELOPER_TOKEN') },
      GOOGLE_ADS_MCC_ID: { set: present('GOOGLE_ADS_MCC_ID') },
      META_SYSTEM_USER_TOKEN: { set: present('META_SYSTEM_USER_TOKEN') },
      PROPSTREAM_API_KEY: { set: present('PROPSTREAM_API_KEY') },
      BATCHDATA_API_KEY: { set: present('BATCHDATA_API_KEY') },
      BATCHLEADS_API_KEY: { set: present('BATCHLEADS_API_KEY') },
    },
    admin_or_webhooks: {
      ADMIN_API_SECRET: { set: present('ADMIN_API_SECRET') },
      CLERK_WEBHOOK_SECRET: { set: present('CLERK_WEBHOOK_SECRET') },
    },
    voice_alt: {
      VAPI_VOICE_ID: { set: present('VAPI_VOICE_ID') },
    },
    other: {
      NEXT_PUBLIC_APP_URL: { set: present('NEXT_PUBLIC_APP_URL'), value: process.env.NEXT_PUBLIC_APP_URL ?? null },
      CRON_SECRET: { set: present('CRON_SECRET') },
    },
  })
}
