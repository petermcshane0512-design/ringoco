import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getDeviceCount } from '@/lib/push'

/**
 * GET /api/push/device-count
 *
 * Returns how many devices the signed-in contractor has registered for
 * push notifications. Drives the onboarding "is push enabled?" check
 * and the dashboard's per-device list.
 */
export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const count = await getDeviceCount(userId)
  return NextResponse.json({ count, hasPush: count > 0 })
}
