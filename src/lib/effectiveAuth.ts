import { auth, clerkClient } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { ADMIN_EMAIL_SET as CENTRAL_ADMIN_EMAIL_SET } from '@/lib/auth/requireAdmin'

const IMPERSONATE_COOKIE = 'bav_impersonate_uid'

export type EffectiveAuth = {
  /** The user_id to scope reads by. If admin is impersonating, this is the target. Otherwise the real Clerk userId. */
  userId: string | null
  /** Always the real Clerk userId of the caller. Use this for writes / billing / SMS — never the impersonated id. */
  realUserId: string | null
  /** True if caller is an admin email and an impersonation cookie is set. */
  isImpersonating: boolean
  /** True if caller is an admin email (regardless of impersonation). */
  isAdmin: boolean
  /** Email used for the admin check (lowercased). Empty if unauthed. */
  email: string
}

/**
 * Resolve the effective user for tenant-scoped reads.
 *
 * Rules:
 *  - If not signed in → everything null.
 *  - If signed in and admin email + impersonate cookie set → userId is the target, realUserId is Peter.
 *  - Otherwise → userId === realUserId.
 *
 * Use this in GET routes that read user-scoped data so admin impersonation works.
 * NEVER use the returned `userId` for writes, billing, or outbound SMS — those must
 * use `realUserId` (or, more simply, the unmodified `auth()` call).
 */
export async function effectiveAuth(): Promise<EffectiveAuth> {
  const { userId: realUserId } = await auth()
  if (!realUserId) {
    return { userId: null, realUserId: null, isImpersonating: false, isAdmin: false, email: '' }
  }

  // Match against every VERIFIED email on the user — see requireAdmin.ts for
  // why [0]-indexing into emailAddresses is unsafe. Keeps this file consistent
  // with the central admin gate so a multi-email Clerk user behaves identically
  // here and in /api/admin/* routes.
  let verifiedEmails: string[] = []
  try {
    const cc = await clerkClient()
    const user = await cc.users.getUser(realUserId)
    verifiedEmails = (user?.emailAddresses ?? [])
      .filter(e => e.verification?.status === 'verified')
      .map(e => e.emailAddress.toLowerCase())
  } catch {
    // If Clerk lookup fails, fall back to non-admin path — safer than granting impersonation
    return { userId: realUserId, realUserId, isImpersonating: false, isAdmin: false, email: '' }
  }

  const matchedAdminEmail = verifiedEmails.find(e => CENTRAL_ADMIN_EMAIL_SET.has(e))
  const isAdmin = !!matchedAdminEmail
  // Surface the matched admin email when admin, else the first verified one for diagnostics.
  const email = matchedAdminEmail ?? verifiedEmails[0] ?? ''

  if (!isAdmin) {
    return { userId: realUserId, realUserId, isImpersonating: false, isAdmin: false, email }
  }

  const cookieStore = await cookies()
  const impersonatedId = cookieStore.get(IMPERSONATE_COOKIE)?.value
  if (!impersonatedId) {
    return { userId: realUserId, realUserId, isImpersonating: false, isAdmin: true, email }
  }

  return { userId: impersonatedId, realUserId, isImpersonating: true, isAdmin: true, email }
}

export const IMPERSONATE_COOKIE_NAME = IMPERSONATE_COOKIE
// Re-exported for callers that already import ADMIN_EMAIL_SET from this file.
// Source of truth lives in src/lib/auth/requireAdmin.ts.
export const ADMIN_EMAIL_SET = CENTRAL_ADMIN_EMAIL_SET
