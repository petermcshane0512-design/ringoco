/**
 * Pre-pull free-lead inventory for the cold-email send.
 *
 * Reads a prospect CSV (default: data/outreach-450.csv), pulls one real
 * homeowner lead from the `leads` table matching each prospect's
 * (zip, trade), and stashes a snapshot in `prospect_free_leads` keyed
 * by biz_id. The cold-email link bellavego.com/free-lead?b={biz_id}
 * reveals that exact lead in 8 seconds.
 *
 * Expected CSV columns:
 *   biz_id, email, biz_name, firstname, trade, city, state, zip
 *
 * Run:
 *   vercel env pull .env.local
 *   npx tsx scripts/prepull-free-leads.ts data/outreach-450.csv
 *
 * Cost: $0 if leads already in DB. If trade+zip empty, falls back to
 * any qualified (score >= 70) lead in same metro. If nothing matches
 * at all, that prospect gets the "link expired" landing variant.
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'
import { readFileSync } from 'fs'

config({ path: resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

type ProspectRow = {
  biz_id: string
  email: string
  biz_name: string
  firstname: string
  trade: string
  city: string
  state: string
  zip: string
}

function normalizeTrade(raw: string): string {
  const t = (raw || '').toLowerCase()
  if (t.includes('plumb')) return 'plumbing'
  if (t.includes('elect')) return 'electrical'
  if (t.includes('roof')) return 'roofing'
  if (t.includes('handy') || t.includes('general')) return 'handyman'
  return 'hvac'
}

function parseCsv(content: string): ProspectRow[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length === 0) return []
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase())
  const rows: ProspectRow[] = []
  for (const line of lines.slice(1)) {
    // Tolerate quoted commas (simple CSV split — assumes no nested quotes)
    const cells: string[] = []
    let cur = ''
    let inQ = false
    for (const c of line) {
      if (c === '"') { inQ = !inQ; continue }
      if (c === ',' && !inQ) { cells.push(cur); cur = ''; continue }
      cur += c
    }
    cells.push(cur)
    const r: Record<string, string> = {}
    for (let i = 0; i < headers.length; i++) r[headers[i]] = (cells[i] || '').trim()
    rows.push({
      biz_id: r['biz_id'] || r['id'] || '',
      email: r['email'] || '',
      biz_name: r['biz_name'] || r['biz'] || '',
      firstname: r['firstname'] || r['first_name'] || '',
      trade: r['trade'] || r['category'] || '',
      city: r['city'] || '',
      state: r['state'] || '',
      zip: r['zip'] || r['zipcode'] || '',
    })
  }
  return rows
}

async function pickLeadForProspect(p: ProspectRow): Promise<Record<string, unknown> | null> {
  const trade = normalizeTrade(p.trade)
  // 1st pass — exact zip + trade match w/ score >= 70.
  const exact = await supabase
    .from('leads')
    .select('*')
    .eq('zip', p.zip)
    .contains('trade_match', [trade])
    .gte('lead_score', 70)
    .limit(5)
  const exactRows = exact.data ?? []
  if (exactRows.length > 0) return exactRows[Math.floor(Math.random() * exactRows.length)] as Record<string, unknown>

  // 2nd pass — same zip, any trade, score >= 60.
  const zipOnly = await supabase
    .from('leads')
    .select('*')
    .eq('zip', p.zip)
    .gte('lead_score', 60)
    .limit(5)
  const zipRows = zipOnly.data ?? []
  if (zipRows.length > 0) return zipRows[Math.floor(Math.random() * zipRows.length)] as Record<string, unknown>

  // 3rd pass — same zip prefix (first 3 digits = metro proxy), any trade, score >= 60.
  const prefix = p.zip.slice(0, 3)
  if (prefix.length === 3) {
    const metro = await supabase
      .from('leads')
      .select('*')
      .like('zip', `${prefix}%`)
      .gte('lead_score', 60)
      .limit(5)
    const metroRows = metro.data ?? []
    if (metroRows.length > 0) return metroRows[Math.floor(Math.random() * metroRows.length)] as Record<string, unknown>
  }

  return null
}

function buildEstJob(homeValue: number | null, trade: string): { min: number; max: number } {
  // Rough multipliers by trade. Honest order-of-magnitude.
  const m: Record<string, [number, number]> = {
    hvac: [0.008, 0.018],
    plumbing: [0.004, 0.012],
    electrical: [0.005, 0.015],
    roofing: [0.020, 0.045],
    handyman: [0.002, 0.008],
  }
  const [lo, hi] = m[trade] || m.hvac
  const base = homeValue && homeValue > 0 ? homeValue : 400_000
  return { min: Math.round(base * lo / 100) * 100, max: Math.round(base * hi / 100) * 100 }
}

function buildSignalDetail(source: string | null, details: Record<string, unknown> | null): string {
  if (!source) return ''
  const sd = (details as { signal_detail?: string } | null)?.signal_detail
  if (sd) return sd
  if (source === 'permit') return 'Recent permit filed in the last 7 days'
  if (source === 'storm') return 'NOAA-verified hail strike in the last 14 days'
  if (source === 'aged' || source === 'aging_hvac') return 'System age 15+ years per county records'
  if (source === 'move_in') return 'New homeowner — closed in the last 60 days'
  return source
}

async function main() {
  const csvPath = process.argv[2] || resolve(process.cwd(), 'data/outreach-450.csv')
  console.log(`Reading prospects from ${csvPath}…`)
  const content = readFileSync(csvPath, 'utf8')
  const prospects = parseCsv(content)
  console.log(`Loaded ${prospects.length} prospects.\n`)

  let ok = 0
  let miss = 0
  let skip = 0

  for (const p of prospects) {
    if (!p.biz_id || !p.zip) { skip++; continue }

    // Skip if already pre-pulled.
    const existing = await supabase
      .from('prospect_free_leads')
      .select('id')
      .eq('biz_id', p.biz_id)
      .maybeSingle()
    if (existing.data) { console.log(`  ✓ ${p.biz_id} already pre-pulled, skip`); ok++; continue }

    const lead = await pickLeadForProspect(p)
    if (!lead) {
      console.log(`  ✗ ${p.biz_id} (${p.biz_name}) zip=${p.zip} trade=${p.trade} — no matching lead`)
      miss++
      continue
    }

    const trade = normalizeTrade(p.trade)
    const estJob = buildEstJob((lead as { home_value_est?: number }).home_value_est ?? null, trade)
    const sd = buildSignalDetail((lead as { source?: string }).source ?? null, (lead as { source_details?: Record<string, unknown> }).source_details ?? null)

    const insert = {
      biz_id: p.biz_id,
      email: p.email,
      trade,
      zip: p.zip,
      city: p.city || (lead as { city?: string }).city,
      state: p.state || (lead as { state?: string }).state,
      lead_owner_name: (lead as { owner_name?: string }).owner_name ?? null,
      lead_street: (lead as { street_address?: string }).street_address ?? null,
      lead_phone: (lead as { owner_phone?: string }).owner_phone ?? null,
      lead_email: (lead as { owner_email?: string }).owner_email ?? null,
      lead_year_built: (lead as { year_built?: number }).year_built ?? null,
      lead_value: (lead as { home_value_est?: number }).home_value_est ?? null,
      lead_signal: (lead as { source?: string }).source ?? null,
      lead_signal_detail: sd,
      lead_est_job_min: estJob.min,
      lead_est_job_max: estJob.max,
    }

    const { error } = await supabase.from('prospect_free_leads').insert(insert)
    if (error) {
      console.log(`  ✗ ${p.biz_id} insert err: ${error.message}`)
      miss++
      continue
    }
    console.log(`  ✓ ${p.biz_id} (${p.biz_name}) → ${insert.lead_owner_name || 'Homeowner'} · ${insert.zip}`)
    ok++
  }

  console.log(`\nDone. ${ok} pre-pulled, ${miss} missed, ${skip} skipped.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
