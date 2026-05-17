import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Returns the connection status for every calendar provider, so the settings
 * page can render the right Connect / Connected button per row.
 *
 * Shape:
 *   { connections: [{ provider, email, name, enabled, connected_at }, ...] }
 */
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data, error } = await supabase
    .from('calendar_connections')
    .select('provider, provider_account_email, provider_account_name, enabled, created_at, last_error, last_synced_at')
    .eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    connections: (data ?? []).map((c) => ({
      provider: c.provider,
      email: c.provider_account_email,
      name: c.provider_account_name,
      enabled: c.enabled,
      connectedAt: c.created_at,
      lastSyncedAt: c.last_synced_at,
      lastError: c.last_error,
    })),
  })
}
