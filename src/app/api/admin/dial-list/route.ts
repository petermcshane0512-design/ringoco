import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/admin/dial-list?date=YYYY-MM-DD&format=xlsx
 *
 * Returns Peter's daily 200-lead dial list as an xlsx download. Reads
 * outreach_leads where source='daily-200-{date}', sorted phone-having first
 * + smallest review count first. Includes a REPORT_URL column Peter taps
 * during a call to send the personalized BellAveGo report to the prospect.
 *
 * Dual-auth: x-admin-secret header OR ?secret=ADMIN_API_SECRET query param
 * (so SMS link from cron is one-click clickable on mobile without auth dance).
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const expected = process.env.ADMIN_API_SECRET
  if (!expected) return NextResponse.json({ error: 'ADMIN_API_SECRET not set' }, { status: 500 })

  // Auth: header OR query param (SMS deep-link convenience)
  const hdr = req.headers.get('x-admin-secret') || ''
  const qry = url.searchParams.get('secret') || ''
  const authed = (hdr && timingSafeEqual(hdr, expected)) || (qry && timingSafeEqual(qry, expected))
  if (!authed) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const dateStr = url.searchParams.get('date') || new Date().toISOString().slice(0, 10)
  const format = url.searchParams.get('format') || 'xlsx'
  const source = `daily-200-${dateStr}`

  const { data, error } = await supabase
    .from('outreach_leads')
    .select('id, business_name, owner_phone, owner_first_name, email, city, state, trade, review_count, website, source')
    .eq('source', source)
    .order('owner_phone', { ascending: false, nullsFirst: false })
    .order('review_count', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, message: `no leads for source=${source}` }, { status: 404 })
  }

  if (format === 'json') {
    return NextResponse.json({ ok: true, date: dateStr, count: data.length, leads: data })
  }

  // Build xlsx
  const wb = new ExcelJS.Workbook()
  wb.creator = 'BellAveGo daily-200'
  wb.created = new Date()
  const ws = wb.addWorksheet(`Dial List ${dateStr}`, {
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  ws.columns = [
    { header: '#', key: 'idx', width: 4 },
    { header: 'Business', key: 'business_name', width: 36 },
    { header: 'Phone (TAP TO CALL)', key: 'phone_link', width: 22 },
    { header: 'City', key: 'city', width: 14 },
    { header: 'State', key: 'state', width: 6 },
    { header: '# Reviews', key: 'review_count', width: 10 },
    { header: 'REPORT URL (send to prospect)', key: 'report_url', width: 60 },
    { header: 'SEND-REPORT-SMS (one tap)', key: 'send_report_link', width: 40 },
    { header: 'Email', key: 'email', width: 32 },
    { header: 'Website', key: 'website', width: 32 },
  ]
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0AA89F' } }
  ws.getRow(1).height = 28

  const APP = process.env.NEXT_PUBLIC_APP_URL || 'https://www.bellavego.com'

  let idx = 1
  for (const l of data) {
    const reportQs = new URLSearchParams({
      for: l.business_name,
      ...(l.city && { city: l.city }),
      ...(l.trade && { type: l.trade }),
    })
    const reportUrl = `${APP}/sample-report?${reportQs.toString()}`
    const sendReportUrl = `${APP}/api/admin/send-report-sms?lead=${l.id}&phone=${encodeURIComponent(l.owner_phone || '')}&secret=${encodeURIComponent(expected)}`

    const row = ws.addRow({
      idx,
      business_name: l.business_name,
      phone_link: l.owner_phone || '',
      city: l.city,
      state: l.state,
      review_count: l.review_count,
      report_url: reportUrl,
      send_report_link: 'Tap to SMS',
      email: l.email,
      website: l.website,
    })
    // Phone tel: link for mobile tap-to-call
    if (l.owner_phone) {
      const phoneCell = row.getCell('phone_link')
      phoneCell.value = { text: l.owner_phone, hyperlink: `tel:${l.owner_phone}` }
      phoneCell.font = { color: { argb: 'FF0066CC' }, underline: true }
    }
    // Report URL as hyperlink
    const reportCell = row.getCell('report_url')
    reportCell.value = { text: reportUrl, hyperlink: reportUrl }
    reportCell.font = { color: { argb: 'FF0066CC' }, underline: true }

    // Send-report-SMS one-tap hyperlink — opens browser → fires endpoint → done
    const sendCell = row.getCell('send_report_link')
    sendCell.value = { text: '📲 Tap to SMS report', hyperlink: sendReportUrl }
    sendCell.font = { color: { argb: 'FFE8742B' }, underline: true, bold: true }

    idx++
  }

  const buf = await wb.xlsx.writeBuffer()
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="dial-list-${dateStr}.xlsx"`,
    },
  })
}
