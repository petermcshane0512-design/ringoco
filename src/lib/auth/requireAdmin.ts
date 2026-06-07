import { NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { headers } from 'next/headers'
import { timingSafeEqual } from 'crypto'

/**
 * Centralized admin authorization for every /api/admin/* and /api/agents/* route.
 *
 * Two auth paths, header-first:
 *   1. `x-admin-secret: $ADMIN_API_SECRET` — for cron, scripts, curl, CI.
 *      Compared timing-safe. Fails closed if ADMIN_API_SECRET is unset (no fail-open).
 *   2. Clerk session whose email is in ADMIN_EMAIL_SET — for the browser admin UI.
 *
 * Admin allowlist is read from process.env.ADMIN_EMAILS (comma-separated, lowercased).
 * Falls back to a built-in default if the env var is unset so deploys without the
 * env var don't lock Peter out — but a console.warn fires so it's visible in logs.
 *
 * Returns a discriminated union: callers do
 *   const gate = await requireAdmin()
 *   if (!gate.ok) return gate.res
 *   // gate.mode === 'admin_secret' | 'clerk_session', gate.userId/email available on session path
 *
 * Every successful auth logs which path was used so usage can be audited from Vercel logs.
 */

// Fallback list if ADMIN_EMAILS env var is unset on Vercel. Real source of
// truth lives in Vercel → Settings → Environment Variables → ADMIN_EMAILS.
// 2026-06-07: pmcshane@fordham.edu deleted from Clerk — primary admin now
// bellavegollc@gmail.com. Keeping the old fordham entry in the fallback
// is harmless (account no longer exists in Clerk, so verification fails).
const DEFAULT_ADMIN_EMAILS = ['bellavegollc@gmail.com', 'pmcshane@fordham.edu', 'peter@bellavego.com']

function loadAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? ''
  const fromEnv = raw
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
  if (fromEnv.length === 0) {
    console.warn('[requireAdmin] ADMIN_EMAILS env var unset — using built-in default list')
    return new Set(DEFAULT_ADMIN_EMAILS)
  }
  return new Set(fromEnv)
}

export const ADMIN_EMAIL_SET = loadAdminEmails()

export type AdminAuthMode = 'admin_secret' | 'clerk_session'

export type RequireAdminResult =
  | { ok: true; mode: AdminAuthMode; userId: string | null; email: string | null }
  | { ok: false; res: NextResponse }

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8')
  const bBuf = Buffer.from(b, 'utf8')
  if (aBuf.length !== bBuf.length) {
    // Compare against self to keep timing roughly constant regardless of length mismatch
    timingSafeEqual(aBuf, aBuf)
    return false
  }
  return timingSafeEqual(aBuf, bBuf)
}

export async function requireAdmin(): Promise<RequireAdminResult> {
  // Path 1 — x-admin-secret header (programmatic callers)
  const hdrs = await headers()
  const headerSecret = hdrs.get('x-admin-secret')
  if (headerSecret !== null) {
    const envSecret = process.env.ADMIN_API_SECRET
    if (!envSecret) {
      console.warn('[requireAdmin] x-admin-secret presented but ADMIN_API_SECRET unset — denying')
      return { ok: false, res: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
    }
    if (safeEqual(headerSecret, envSecret)) {
      console.log('[requireAdmin] authorized mode=admin_secret')
      return { ok: true, mode: 'admin_secret', userId: null, email: null }
    }
    console.warn('[requireAdmin] x-admin-secret mismatch — denying')
    return { ok: false, res: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  }

  // Path 2 — Clerk session (browser admin UI)
  const { userId } = await auth()
  if (!userId) {
    return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const cc = await clerkClient()
  const me = await cc.users.getUser(userId).catch(() => null)
  // Match against EVERY verified email on the user, not just emailAddresses[0].
  // Clerk's array order is not contractually primary-first, so [0] indexing is
  // a footgun: a user with two verified emails could pass or fail based on
  // ordering you don't control. Checking the full verified set removes that risk
  // and lets one Clerk user attach multiple admin-mapped addresses.
  const verifiedEmails = (me?.emailAddresses ?? [])
    .filter(e => e.verification?.status === 'verified')
    .map(e => e.emailAddress.toLowerCase())
  const matchedEmail = verifiedEmails.find(e => ADMIN_EMAIL_SET.has(e))
  if (!matchedEmail) {
    return { ok: false, res: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) }
  }
  console.log(`[requireAdmin] authorized mode=clerk_session email=${matchedEmail}`)
  return { ok: true, mode: 'clerk_session', userId, email: matchedEmail }
}
