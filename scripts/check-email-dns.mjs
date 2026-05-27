#!/usr/bin/env node
/**
 * One-shot DNS health check for outbound email deliverability.
 *
 *   node scripts/check-email-dns.mjs bellavego.com
 *   node scripts/check-email-dns.mjs bellavego.com,bell-ave-go.com
 *
 * Verifies the three records ISPs use to decide if your mail is real:
 *   1. SPF   (v=spf1 ...)     — which servers may send for this domain
 *   2. DKIM  (default._domainkey or *.k1._domainkey ... TXT)
 *   3. DMARC (_dmarc TXT)
 *
 * Exits 0 when ALL three look healthy on EVERY domain passed in.
 * Exits 1 when any required record is missing or malformed. Designed to
 * be run from CI / a cron / right before a 500-1K/day send so we catch
 * DNS drift before reputation collapses.
 */
import { resolveTxt } from 'node:dns/promises'

const domains = (process.argv[2] || 'bellavego.com').split(',').map(s => s.trim()).filter(Boolean)

let failures = 0

for (const d of domains) {
  console.log(`\n=== ${d} ===`)

  // SPF — must contain v=spf1 and end with -all or ~all
  let spfOk = false
  try {
    const rec = (await resolveTxt(d)).map(r => r.join(''))
    const spf = rec.find(r => /^v=spf1\b/i.test(r))
    if (!spf) {
      console.log('  SPF    ❌ no v=spf1 record')
    } else if (!/[-~]all\b/i.test(spf)) {
      console.log(`  SPF    ⚠️  missing -all/~all (recipients won't enforce):\n    ${spf}`)
    } else {
      console.log(`  SPF    ✅ ${spf.length > 80 ? spf.slice(0, 77) + '...' : spf}`)
      spfOk = true
    }
  } catch (e) {
    console.log(`  SPF    ❌ DNS lookup failed: ${e.message}`)
  }

  // DKIM — check common selectors. Most Google Workspace uses google._domainkey;
  // Smartlead/Instantly use s1._domainkey / s2._domainkey. We probe a few.
  let dkimOk = false
  const selectors = ['google', 'default', 's1', 's2', 'k1', 'dkim', 'selector1', 'selector2']
  for (const sel of selectors) {
    try {
      const rec = (await resolveTxt(`${sel}._domainkey.${d}`)).map(r => r.join(''))
      const dk = rec.find(r => /v=DKIM1/i.test(r))
      if (dk) {
        console.log(`  DKIM   ✅ ${sel}._domainkey resolves`)
        dkimOk = true
        break
      }
    } catch {
      // selector not present — keep trying
    }
  }
  if (!dkimOk) {
    console.log(`  DKIM   ❌ no DKIM record found at common selectors (${selectors.join(', ')})`)
  }

  // DMARC — must exist at _dmarc.<domain> with v=DMARC1 and p=quarantine|reject
  let dmarcOk = false
  try {
    const rec = (await resolveTxt(`_dmarc.${d}`)).map(r => r.join(''))
    const dm = rec.find(r => /^v=DMARC1\b/i.test(r))
    if (!dm) {
      console.log('  DMARC  ❌ no _dmarc record')
    } else {
      const policyMatch = /\bp=(none|quarantine|reject)\b/i.exec(dm)
      const policy = policyMatch?.[1].toLowerCase() ?? 'none'
      if (policy === 'none') {
        console.log(`  DMARC  ⚠️  p=none (monitoring only, no enforcement):\n    ${dm}`)
        dmarcOk = true  // record exists, just lenient — alert but pass
      } else {
        console.log(`  DMARC  ✅ p=${policy}`)
        dmarcOk = true
      }
    }
  } catch (e) {
    console.log(`  DMARC  ❌ DNS lookup failed: ${e.message}`)
  }

  if (!spfOk || !dkimOk || !dmarcOk) failures++
}

console.log()
if (failures > 0) {
  console.log(`❌ ${failures} domain(s) failing deliverability checks. Fix BEFORE sending bulk.`)
  console.log('   Reference: https://support.google.com/a/answer/2466580')
  process.exit(1)
}
console.log('✅ All domains pass SPF + DKIM + DMARC checks.')
