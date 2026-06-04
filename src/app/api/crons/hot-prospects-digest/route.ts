import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/crons/hot-prospects-digest
 *
 * Daily 8am CST digest emailed to Peter's 3 inboxes. Lists every prospect
 * who opened their personalized report in the last 24h, ranked by open
 * count + recency. This is the "who do I dial today" cheat sheet that
 * ships to his phone every morning.
 *
 * Skips silently when 0 opens overnight — no noise.
 *
 * Auth: x-vercel-cron OR x-admin-secret.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

// Peter's 3 inboxes — keep in sync with vapi/end-of-call-report fan-out.
const PETER_INBOXES = [
  'bellavegollc@gmail.com',
  'pmcshane@fordham.edu',
  'pmcshane@512edgeemail.com',
]

type Hot = {
  id: string
  business_name: string | null
  owner_first_name: string | null
  owner_phone: string | null
  city: string | null
  state: string | null
  trade: string | null
  open_count: number | null
  last_opened_at: string | null
  buyer_score: number | null
}

function reportUrl(p: Hot): string {
  const params = new URLSearchParams({
    for: p.business_name || '',
    type: p.trade || 'HVAC',
    l: p.id,
  })
  if (p.city) params.set('city', p.city)
  return `https://www.bellavego.com/sample-report?${params.toString()}`
}

function relTime(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export async function GET(req: NextRequest) {
  const isCron = req.headers.get('x-vercel-cron') === '1'
  const adminSecret = req.headers.get('x-admin-secret')
  const expected = process.env.ADMIN_API_SECRET
  if (!isCron && (!expected || adminSecret !== expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: prospects, error } = await supabase
    .from('outreach_leads')
    .select(
      'id, business_name, owner_first_name, owner_phone, city, state, trade, ' +
      'open_count, last_opened_at, buyer_score',
    )
    .not('report_visit_at', 'is', null)
    .gte('last_opened_at', sinceIso)
    .is('call_attempted_at', null)
    .order('open_count', { ascending: false, nullsFirst: false })
    .order('last_opened_at', { ascending: false })
    .limit(25)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const list: Hot[] = (prospects ?? []) as unknown as Hot[]
  if (list.length === 0) {
    return NextResponse.json({ ok: true, sent: false, reason: 'no overnight opens' })
  }

  const blazing = list.filter((p) => (p.open_count ?? 0) >= 5).length
  const hot = list.filter((p) => (p.open_count ?? 0) >= 3 && (p.open_count ?? 0) < 5).length
  const warm = list.filter((p) => (p.open_count ?? 0) === 2).length
  const opened = list.filter((p) => (p.open_count ?? 0) === 1).length

  const subject = `🔥 ${list.length} prospects opened your report overnight (${blazing} blazing · ${hot} hot)`

  const rows = list.map((p, i) => {
    const oc = p.open_count ?? 0
    const heat = oc >= 5 ? '🔥🔥🔥' : oc >= 3 ? '🔥🔥' : oc >= 2 ? '🔥' : '👁'
    const dialLink = p.owner_phone ? `tel:${p.owner_phone}` : ''
    return `
      <tr>
        <td style="padding:8px 6px;font-size:11px;color:#7AAAB2;">${i + 1}.</td>
        <td style="padding:8px 6px;font-size:14px;">${heat}</td>
        <td style="padding:8px 6px;">
          <div style="font-size:14px;font-weight:700;color:#0B1F3A;">${p.business_name || '(no name)'}</div>
          <div style="font-size:11px;color:#7AAAB2;">${p.trade || 'HVAC'} · ${p.city || '?'}${p.state ? `, ${p.state}` : ''} · ${oc} open${oc === 1 ? '' : 's'} · ${relTime(p.last_opened_at)}</div>
        </td>
        <td style="padding:8px 6px;text-align:right;">
          ${dialLink ? `<a href="${dialLink}" style="display:inline-block;padding:6px 12px;background:#22C55E;color:#fff;text-decoration:none;border-radius:6px;font-size:12px;font-weight:700;">📞 ${p.owner_phone}</a>` : '<span style="font-size:11px;color:#A0BCC2;">no phone</span>'}
        </td>
        <td style="padding:8px 6px;text-align:right;">
          <a href="${reportUrl(p)}" style="font-size:11px;color:#0AA89F;text-decoration:none;font-weight:700;">View report →</a>
        </td>
      </tr>`
  }).join('')

  const html = `
    <div style="font-family:'Inter',system-ui,sans-serif;background:#F5FCFA;padding:24px;">
      <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;border:1px solid rgba(10,168,159,0.14);">
        <div style="font-size:11px;font-weight:800;letter-spacing:0.14em;color:#0AA89F;text-transform:uppercase;margin-bottom:6px;">Daily dial list · BellAveGo</div>
        <h1 style="font-size:22px;font-weight:900;color:#0B1F3A;margin:0 0 12px;">${list.length} opened overnight</h1>
        <p style="font-size:13px;color:#4A7A80;margin:0 0 18px;line-height:1.5;">
          ${blazing} blazing (5+ opens) · ${hot} hot (3-4) · ${warm} warm (2) · ${opened} first-open
          <br><span style="color:#7AAAB2;">Dial top of list first. Each tap-to-call also logs the dial automatically when opened from the live dashboard.</span>
        </p>
        <table style="width:100%;border-collapse:collapse;">${rows}</table>
        <div style="margin-top:24px;padding-top:18px;border-top:1px solid rgba(10,168,159,0.14);text-align:center;">
          <a href="https://www.bellavego.com/admin/hot-prospects" style="display:inline-block;padding:10px 18px;background:#0AA89F;color:#fff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:700;">Full dashboard →</a>
        </div>
      </div>
    </div>`

  const text = `${list.length} prospects opened overnight (${blazing} blazing, ${hot} hot, ${warm} warm)\n\n` +
    list.map((p, i) => {
      const oc = p.open_count ?? 0
      return `${i + 1}. ${p.business_name || '?'} — ${p.trade || 'HVAC'} · ${p.city || '?'} · ${oc} opens · ${relTime(p.last_opened_at)}` +
        (p.owner_phone ? `\n   📞 ${p.owner_phone}` : '\n   (no phone)')
    }).join('\n\n') +
    '\n\nFull list: https://www.bellavego.com/admin/hot-prospects'

  const result = await sendEmail({
    to: PETER_INBOXES,
    subject,
    html,
    text,
  })

  return NextResponse.json({
    ok: true,
    sent: result.ok,
    error: result.error,
    prospect_count: list.length,
    breakdown: { blazing, hot, warm, opened },
  })
}
