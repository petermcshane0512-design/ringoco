import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { sendPushToUser } from '@/lib/push'

/**
 * Self-test: fires a single push notification to the logged-in user.
 * Used by the dashboard "Test Notification" button to confirm setup works.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'not authenticated' }, { status: 401 })
  }

  const r = await sendPushToUser(userId, {
    title: '🎉 BellAveGo notifications are on',
    body: 'You\'ll get a push like this every time a customer calls — even with the dashboard closed.',
    url: '/dashboard',
    tag: 'bellavego-test',
    urgency: 'soon',
  })

  return NextResponse.json(r, { status: r.ok ? 200 : 500 })
}
