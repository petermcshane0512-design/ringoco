import { NextRequest, NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { ADMIN_EMAIL_SET, IMPERSONATE_COOKIE_NAME } from '@/lib/effectiveAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const COOKIE_MAX_AGE_SECONDS = 4 * 60 * 60 // 4 hours

async function requireAdmin(): Promise<{ ok: true; email: string } | { ok: false; res: NextResponse }> {
  const { userId } = await auth()
  if (!userId) return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const cc = await clerkClient()
  const me = await cc.users.getUser(userId).catch(() => null)
  const email = me?.emailAddresses?.[0]?.emailAddress?.toLowerCase() ?? ''
  if (!ADMIN_EMAIL_SET.has(email)) {
    return { ok: false, res: NextResponse.json({ error: 'Admin only' }, { status: 403 }) }
  }
  return { ok: true, email }
}

// POST /api/admin/impersonate  body: { userId: string }
// Sets the impersonation cookie. Admin only. Verifies the target user actually exists in profiles.
export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.res

  const body = await req.json().catch(() => ({})) as { userId?: string }
  const target = body.userId?.trim()
  if (!target) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_id, business_name, plan_tier')
    .eq('user_id', target)
    .maybeSingle()
  if (!profile) return NextResponse.json({ error: 'No such customer' }, { status: 404 })

  const jar = await cookies()
  jar.set(IMPERSONATE_COOKIE_NAME, target, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  })

  return NextResponse.json({
    ok: true,
    impersonating: { userId: target, businessName: profile.business_name, planTier: profile.plan_tier },
  })
}

// DELETE /api/admin/impersonate — clears the cookie.
export async function DELETE() {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.res
  const jar = await cookies()
  jar.delete(IMPERSONATE_COOKIE_NAME)
  return NextResponse.json({ ok: true })
}

// GET /api/admin/impersonate — returns current impersonation state for the banner.
// Non-admins get { isAdmin: false, isImpersonating: false } (not 403) so the banner can be silent.
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ isAdmin: false, isImpersonating: false })

  const cc = await clerkClient()
  const me = await cc.users.getUser(userId).catch(() => null)
  const email = me?.emailAddresses?.[0]?.emailAddress?.toLowerCase() ?? ''
  const isAdmin = ADMIN_EMAIL_SET.has(email)
  if (!isAdmin) return NextResponse.json({ isAdmin: false, isImpersonating: false })

  const jar = await cookies()
  const target = jar.get(IMPERSONATE_COOKIE_NAME)?.value
  if (!target) return NextResponse.json({ isAdmin: true, isImpersonating: false })

  const { data: profile } = await supabase
    .from('profiles')
    .select('business_name, plan_tier, twilio_number')
    .eq('user_id', target)
    .maybeSingle()

  return NextResponse.json({
    isAdmin: true,
    isImpersonating: true,
    target: {
      userId: target,
      businessName: profile?.business_name ?? null,
      planTier: profile?.plan_tier ?? null,
      twilioNumber: profile?.twilio_number ?? null,
    },
  })
}
