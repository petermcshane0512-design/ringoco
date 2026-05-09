import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { provisionNumberForUser } from '@/lib/provisionNumber'

export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await provisionNumberForUser(userId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json(result)
}
