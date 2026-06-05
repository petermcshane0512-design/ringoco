#!/usr/bin/env node
/**
 * RDAP domain-age enrichment for outreach_leads.
 *
 * Domain registration date is the strongest free proxy for "how old is
 * this business". Domain registered post-2020 = young founder almost
 * always. Pre-2010 = legacy shop.
 *
 * Source: rdap.org (free, no key, IETF standard).
 * Rate: ~5 req/sec polite. 383 leads = ~80sec total.
 *
 * Idempotent — only updates rows where domain_enriched_at IS NULL.
 */
import dotenv from 'dotenv'
import pg from 'pg'

dotenv.config({ path: 'C:\\Users\\peter\\ringoco\\.env.local' })

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})
await client.connect()
console.log('  ✓ connected')

// Extract registrable domain from URL (no subdomain).
function extractDomain(url) {
  if (!url) return null
  try {
    const u = new URL(url.startsWith('http') ? url : `http://${url}`)
    const host = u.hostname.toLowerCase().replace(/^www\./, '')
    // Strip multi-part TLDs naively — for our HVAC ICP mostly .com / .net
    return host
  } catch { return null }
}

function urlFromNotes(notes) {
  if (!notes) return null
  const m = String(notes).match(/web:(https?:\/\/[^\s,]+|[^\s,]+\.[a-z]{2,}[^\s,]*)/i)
  return m ? m[1] : null
}

async function rdapLookup(domain) {
  try {
    const r = await fetch(`https://rdap.org/domain/${domain}`, {
      headers: { Accept: 'application/rdap+json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return { ok: false, status: r.status }
    const j = await r.json()
    const events = Array.isArray(j.events) ? j.events : []
    const reg = events.find((e) => e.eventAction === 'registration')
    if (reg && reg.eventDate) return { ok: true, registeredAt: reg.eventDate }
    return { ok: false, status: 200, reason: 'no registration event' }
  } catch (e) {
    return { ok: false, status: 0, reason: e.message.slice(0, 60) }
  }
}

const { rows: leads } = await client.query(
  `select id, notes
   from outreach_leads
   where notes ~ 'web:http' and domain_enriched_at is null`,
)
console.log(`  ✓ enriching ${leads.length} leads...`)

let enriched = 0
let nodate = 0
let errors = 0
let processed = 0

for (const lead of leads) {
  processed++
  const url = urlFromNotes(lead.notes)
  const domain = extractDomain(url)
  if (!domain) {
    await client.query(
      `update outreach_leads set domain_enriched_at = now() where id = $1`,
      [lead.id],
    )
    errors++
    continue
  }

  const res = await rdapLookup(domain)
  if (res.ok && res.registeredAt) {
    await client.query(
      `update outreach_leads
       set website_domain = $1,
           domain_registered_at = $2,
           domain_enriched_at = now()
       where id = $3`,
      [domain, res.registeredAt, lead.id],
    )
    enriched++
  } else {
    await client.query(
      `update outreach_leads
       set website_domain = $1,
           domain_enriched_at = now()
       where id = $2`,
      [domain, lead.id],
    )
    nodate++
  }

  if (processed % 50 === 0) {
    console.log(`    ${processed}/${leads.length} (enriched ${enriched}, no-date ${nodate}, errors ${errors})`)
  }
  // Throttle 200ms = ~5 req/sec polite to rdap.org
  await new Promise((r) => setTimeout(r, 200))
}

console.log(`\n  ✓ Done:`)
console.log(`    enriched (got date): ${enriched}`)
console.log(`    no-date (RDAP returned no event): ${nodate}`)
console.log(`    errors: ${errors}`)

// Distribution
const { rows: dist } = await client.query(`
  select
    count(*) filter (where domain_registered_at >= '2021-01-01')::int post_2021,
    count(*) filter (where domain_registered_at >= '2018-01-01' and domain_registered_at < '2021-01-01')::int between_2018_2020,
    count(*) filter (where domain_registered_at >= '2010-01-01' and domain_registered_at < '2018-01-01')::int between_2010_2017,
    count(*) filter (where domain_registered_at < '2010-01-01')::int pre_2010
  from outreach_leads
  where domain_registered_at is not null
`)
console.log(`\n  Domain age distribution:`)
console.log(`    🔥 Post-2021 (very young): ${dist[0].post_2021}`)
console.log(`    🟡 2018-2020 (young): ${dist[0].between_2018_2020}`)
console.log(`    🟠 2010-2017 (established): ${dist[0].between_2010_2017}`)
console.log(`    ❄️ Pre-2010 (legacy): ${dist[0].pre_2010}`)

await client.end()
console.log('\nDONE')
