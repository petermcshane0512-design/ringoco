#!/usr/bin/env node
/**
 * create-instantly-campaign.mjs
 *
 * Creates the universal HVAC cold-email campaign in Instantly via API.
 * Algorithm step 2: ONE template, 3 subject variants, NO per-prospect copy
 * generation. Lean for first 1,000 sends until copy is proven.
 *
 * Sequence:
 *   Day 1  — initial outreach
 *   Day 4  — soft follow-up
 *   Day 8  — break-up
 *
 * Schedule: Mon-Fri, 9am-5pm America/Chicago, 30/day per mailbox.
 * Sender: rotates across all 16 connected Zoho mailboxes.
 */
import dotenv from 'dotenv'
dotenv.config({ path: 'C:\\Users\\peter\\ringoco\\.env.local' })

const KEY = process.env.INSTANTLY_API_KEY

const STEP1_SUBJECTS = [
  '{{firstName}}, quick question about {{companyName}}',
  '{{companyName}} — missed-call cost in {{city}}?',
  '{{firstName}} — 24/7 receptionist for {{companyName}}',
]

const STEP1_BODY = `Hi {{firstName}},

Quick one — saw {{companyName}} servicing {{city}}.

Average HVAC shop in {{city}} misses ~6 calls/wk after 5pm. At ~$450/job that's $11K/mo gone before payroll runs.

We built an AI receptionist (Emma) that picks up in 1 ring, qualifies the lead, and texts the captured job to your phone in 10 seconds. Works on your existing number — no carrier change.

7-day free trial, no card. $147/mo after if you keep it.

Worth a 60-sec demo?

— Peter
BellAveGo
https://www.bellavego.com/pricing?utm_source=cold-email&utm_campaign=hvac-q3
P.S. We answer the demo line ourselves: (651) 467-7829`

const STEP2_SUBJECT = 're: {{companyName}}'
const STEP2_BODY = `{{firstName}} — just bumping this in case it got buried.

Did the math: if {{companyName}} misses even 4 calls/wk in {{city}}, that's $1,800/wk in lost jobs at industry-average close rates.

7-day trial, $0 setup, your number stays the same:
https://www.bellavego.com/pricing?utm_source=cold-email&utm_campaign=hvac-q3-fu1

Peter`

const STEP3_SUBJECT = 'closing the loop'
const STEP3_BODY = `{{firstName}} — last one from me. Either you've got after-hours covered already (👍) or you're losing leads in silence.

If it's the second, demo line is (651) 467-7829. Hear Emma answer in 1 ring.

Peter
BellAveGo`

const body = {
  name: 'HVAC Q3 — Universal Cold (v1)',
  campaign_schedule: {
    schedules: [
      {
        name: 'Weekdays 9-5 CST',
        timing: { from: '09:00', to: '17:00' },
        days: { '1': true, '2': true, '3': true, '4': true, '5': true, '0': false, '6': false },
        timezone: 'America/Chicago',
      },
    ],
  },
  sequences: [
    {
      steps: [
        {
          type: 'email',
          delay: 0,
          variants: STEP1_SUBJECTS.map((subject) => ({
            subject,
            body: STEP1_BODY,
            v_disabled: false,
          })),
        },
        {
          type: 'email',
          delay: 3,
          variants: [{ subject: STEP2_SUBJECT, body: STEP2_BODY }],
        },
        {
          type: 'email',
          delay: 4,
          variants: [{ subject: STEP3_SUBJECT, body: STEP3_BODY }],
        },
      ],
    },
  ],
  email_gap: 10,
  random_wait_max: 10,
  text_only: false,
  daily_limit: 480,
  stop_on_reply: true,
  stop_on_auto_reply: true,
  link_tracking: true,
  open_tracking: true,
  prioritize_new_leads: false,
  match_lead_esp: false,
  pl_value: 147, // $147 starter tier = potential lead value
}

const r = await fetch('https://api.instantly.ai/api/v2/campaigns', {
  method: 'POST',
  headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
const j = await r.json()
console.log(`Create campaign: status=${r.status}`)
if (r.status === 200 || r.status === 201) {
  console.log(`  ✅ campaign created`)
  console.log(`  id:    ${j.id}`)
  console.log(`  name:  ${j.name}`)
  console.log(`  status: ${j.status}`)
} else {
  console.error(JSON.stringify(j, null, 2))
  process.exit(1)
}

// Attach all 16 connected mailboxes to this campaign
console.log('\nAttaching all 16 mailboxes as sending accounts...')
const ra = await fetch('https://api.instantly.ai/api/v2/accounts?limit=100', {
  headers: { Authorization: `Bearer ${KEY}` },
})
const ja = await ra.json()
const allEmails = (ja.items || []).map((a) => a.email)
console.log(`  Found ${allEmails.length} accounts: ${allEmails.join(', ')}`)

const ras = await fetch(`https://api.instantly.ai/api/v2/campaigns/${j.id}/sending-accounts`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ emails: allEmails }),
})
const jas = await ras.json()
console.log(`  attach result: status=${ras.status}`)
if (ras.status !== 200 && ras.status !== 201) {
  console.log(`  ${JSON.stringify(jas).slice(0, 400)}`)
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(`  ✅ Campaign ID: ${j.id}`)
console.log(`  ✅ Status: DRAFT (does NOT send yet — Peter activates when ready)`)
console.log(`  📅 First send target: Mon Jun 15, 2026 (post-warmup)`)
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
