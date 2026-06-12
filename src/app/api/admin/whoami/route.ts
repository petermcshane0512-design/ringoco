import { NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { ADMIN_EMAIL_SET } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'

/**
 * GET /api/admin/whoami — admin-access self-diagnostic (2026-06-12).
 *
 * Returns ONLY the caller's own session facts: their Clerk userId, their
 * email addresses + verification status, and whether any verified email
 * is in the admin allowlist. No tenant data, no secrets — safe to expose
 * to any signed-in user; anonymous callers get signed_in:false.
 *
 * Exists because "Not authorized" on /admin/master can mean three
 * different things (no session on this domain / email not verified /
 * email not in allowlist) and they're indistinguishable from the UI.
 */
export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({
      signed_in: false,
      hint: 'No Clerk session reached the server on this domain. Sign in at this exact domain (www vs apex matters).',
    })
  }
  const cc = await clerkClient()
  const me = await cc.users.getUser(userId).catch(() => null)
  const emails = (me?.emailAddresses ?? []).map((e) => ({
    email: e.emailAddress,
    verified: e.verification?.status === 'verified',
  }))
  const matched = emails.find((e) => e.verified && ADMIN_EMAIL_SET.has(e.email.toLowerCase()))
  return NextResponse.json({
    signed_in: true,
    user_id: userId,
    emails,
    admin_allowlist: [...ADMIN_EMAIL_SET],
    is_admin: !!matched,
    matched_email: matched?.email ?? null,
    hint: matched
      ? 'You ARE admin — if /admin/master still blocks, hard-refresh it.'
      : 'No VERIFIED email on this account is in the allowlist above. Add + verify one of those emails on THIS account (avatar → Manage account).',
  })
}
