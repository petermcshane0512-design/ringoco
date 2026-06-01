import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!,
)

function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = String(raw).replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.length === 10) return `+1${digits}`
  if (raw.startsWith('+')) return raw
  return null
}

function isReserved(num: string, friendlyName: string | null | undefined): boolean {
  const reservedEnvs = [
    process.env.TWILIO_PHONE_NUMBER,
    process.env.TWILIO_DEMO_NUMBER,
    process.env.FALLBACK_OWNER_PHONE,
  ]
    .map(toE164)
    .filter(Boolean) as string[]
  if (reservedEnvs.includes(toE164(num)!)) return true
  const fn = (friendlyName || '').toLowerCase()
  if (fn.startsWith('bellavego demo')) return true
  if (fn.includes('demo')) return true
  if (fn.includes('office')) return true
  return false
}

/**
 * GET  /api/admin/release-orphan-twilio          → dry run, returns audit
 * POST /api/admin/release-orphan-twilio?apply=1  → releases orphans
 *
 * Audits every IncomingPhoneNumber on the Twilio account against
 * profiles.twilio_number. Releases any that no profile claims so Peter
 * stops paying ~$1.15/mo on numbers stranded by deleted test accounts.
 *
 * Reserved numbers (TWILIO_PHONE_NUMBER, TWILIO_DEMO_NUMBER,
 * FALLBACK_OWNER_PHONE, anything with friendlyName matching "demo" or
 * "office") are never touched.
 */
async function audit(apply: boolean) {
  const allTwilio = await twilioClient.incomingPhoneNumbers.list({ limit: 1000 })

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('user_id, twilio_number, business_name')
  if (error) throw new Error(`profiles pull failed: ${error.message}`)

  const claimed = new Set(
    (profiles || [])
      .map(p => toE164((p as { twilio_number?: string }).twilio_number))
      .filter(Boolean) as string[],
  )

  type Bucket = { phoneNumber: string; sid: string; friendlyName: string | null; dateCreated: string | null }
  const orphans: Bucket[] = []
  const reserved: Bucket[] = []
  const live: Bucket[] = []
  for (const t of allTwilio) {
    const bucket: Bucket = {
      phoneNumber: t.phoneNumber,
      sid: t.sid,
      friendlyName: t.friendlyName ?? null,
      dateCreated: t.dateCreated?.toISOString?.() ?? null,
    }
    if (isReserved(t.phoneNumber, t.friendlyName)) reserved.push(bucket)
    else if (claimed.has(t.phoneNumber)) live.push(bucket)
    else orphans.push(bucket)
  }

  if (!apply) {
    return {
      mode: 'dry_run',
      twilio_total: allTwilio.length,
      live: live.length,
      reserved: reserved.length,
      orphans: orphans.length,
      orphan_details: orphans,
      estimated_monthly_savings_usd: Number((orphans.length * 1.15).toFixed(2)),
    }
  }

  let released = 0
  let failed = 0
  const errors: Array<{ phoneNumber: string; error: string }> = []
  for (const o of orphans) {
    try {
      await twilioClient.incomingPhoneNumbers(o.sid).remove()
      released++
    } catch (e) {
      failed++
      errors.push({ phoneNumber: o.phoneNumber, error: (e as Error).message })
    }
  }

  return {
    mode: 'applied',
    released,
    failed,
    errors,
    monthly_savings_usd: Number((released * 1.15).toFixed(2)),
  }
}

export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  try {
    const result = await audit(false)
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  const apply = req.nextUrl.searchParams.get('apply') === '1'
  try {
    const result = await audit(apply)
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
