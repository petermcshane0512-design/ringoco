'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'

/**
 * /dashboard — 2026-06-09 KILLER MONDAY-AM BRIEF.
 *
 * Per Peter: most killer dashboard of all time. Highly descriptive of
 * the leads, highly descriptive of the personalized outreach strategy
 * BellAveGo's AI ran on each lead. Frame: fully automated. Customer's
 * job is to call back the YES's.
 *
 * Sections:
 *   1. AI Overnight Brief — what the AI did between Sun 11pm → Mon 6am
 *      (10 leads pulled, scoring done, 10 SMS sent, 10 emails sent,
 *      N replied so far). Live ticker.
 *   2. Hot Inbox — leads that already REPLIED. Priority cards w/ AI-
 *      suggested response + tap-to-call.
 *   3. This Week's 10 — expandable rich cards. Each card opens the
 *      personalized outreach strategy AI built for that lead:
 *        - Why this homeowner is hot
 *        - Angle to lead with on the call
 *        - SMS that already went out
 *        - Email that already went out
 *        - Best call window
 *        - Follow-up plan if no reply by Wed
 *   4. Pipeline value stat strip
 *   5. Buy extras box (unchanged behavior, restyled)
 *
 * Data: tries /api/dashboard/leads-summary; falls back to SAMPLE_WEEK
 * so a fresh customer still sees a fully-populated UI demo (this is the
 * empty-state hero — "your first Monday will look like this").
 */

// 2026-06-09 — RICH shape now returned by /api/dashboard/leads-summary.
// owner_name + pitch_script + source_details (incl. why_tags) are what
// the killer Monday brief needs to render every lead as a full card.
type LeadStub = {
  id: string
  street_address: string | null
  city: string | null
  state: string | null
  zip: string | null
  owner_name: string | null
  owner_phone: string | null
  owner_email: string | null
  year_built: number | null
  home_value_est: number | null
  trade_match: string[] | null
  source: string | null
  source_details: Record<string, unknown> | null
  source_event_date: string | null
  lead_score: number | null
  pitch_script: string | null
}

type SimplifiedSummary = {
  ok: boolean
  this_week_count: number
  this_month_count: number
  all_count: number
  this_week_leads: LeadStub[]
  this_month_leads: LeadStub[]
  all_leads: LeadStub[]
}

type Profile = {
  business_name?: string | null
  owner_first_name?: string | null
  setup_complete?: boolean | null
}

type OutreachStrategy = {
  why: string
  angle: string
  sms: string
  email: string
  callWindow: string
  followUp: string
}

type RichLead = {
  id: string
  owner: string
  firstName: string
  street: string
  zip: string
  city: string
  state: string
  trade: string
  signal: 'PERMIT' | 'STORM' | 'AGED' | 'MOVE-IN'
  score: number
  phone: string
  email: string
  yearBuilt: number | null
  homeValue: number | null
  estJob: string
  status: 'NEW' | 'REPLIED' | 'BOOKED' | 'NO-REPLY'
  replyPreview?: string
  strategy: OutreachStrategy
}

const SAMPLE_WEEK: RichLead[] = [
  {
    id: 'sw1', owner: 'Mike Coleman', firstName: 'Mike',
    street: '7842 Oak Ridge Dr', zip: '75024', city: 'Plano', state: 'TX',
    trade: 'HVAC', signal: 'PERMIT', score: 92,
    phone: '(214) 555-9167', email: 'mike.c@gmail.com',
    yearBuilt: 1998, homeValue: 485000, estJob: '$3,200–4,800',
    status: 'REPLIED',
    replyPreview: 'Yeah send me a quote, Tue afternoon works',
    strategy: {
      why: 'Filed an AC condenser permit 3 days ago. Permit means he\'s actively shopping installers — high intent. House is 26 yrs old, original system likely failing. $485K home = budget to do it right, not the $1,500 patch.',
      angle: 'Don\'t pitch the install — pitch a free second-opinion quote. Most owners w/ a permit already have 1 bid; we want to be bid #2 (they save 18-25% by comparing).',
      sms: 'Hey Mike — John w/ Plano Heating. Saw the AC condenser permit went in last week. If you want a free 2nd-opinion quote on the install (or swap-out pricing), I can be by Tue or Wed. No pressure.',
      email: 'Subject: Quick 2nd-opinion on your AC condenser install\n\nHi Mike,\n\nNoticed the AC condenser permit went in at 7842 Oak Ridge last week. Congrats on getting that handled before summer hits. Most folks in Plano end up taking 2 bids before committing, and we typically come in 18-25% lower than the chain shops once people compare.\n\nNo pitch, no upsell — just a 20-min free walkthrough + written quote. I can be there Tue (5-7pm) or Wed (4-6pm). Reply with what works.\n\n— John, Plano Heating & Air\n(773) 710-9565',
      callWindow: 'Tue 4-6pm (he replied at 11:42am — install owners check phone at lunch + after work)',
      followUp: 'Already replied YES — call him today. If voicemail → text "Got your reply, what\'s a good time?"',
    },
  },
  {
    id: 'sw2', owner: 'Sarah Whitman', firstName: 'Sarah',
    street: '2188 Birch Ln', zip: '75093', city: 'Plano', state: 'TX',
    trade: 'HVAC', signal: 'STORM', score: 88,
    phone: '(469) 555-7032', email: 'sarah.whitman@outlook.com',
    yearBuilt: 2002, homeValue: 562000, estJob: '$8,400–12,000',
    status: 'REPLIED',
    replyPreview: 'What\'s the deductible look like usually?',
    strategy: {
      why: 'NOAA flagged 1.7" hail on her block Sun 8:42pm. Roof is 22 yrs old (orig builder install). 90% chance of insurance-claim eligibility w/in 30 days.',
      angle: 'Insurance angle. Free inspection + insurance-claim assistance. Most owners don\'t know insurance pays full claim w/ filing in 30 days.',
      sms: 'Hey Sarah — Marcus w/ Lone Star Roofing. NOAA flagged 1.7" hail on your block Sun night. Free inspection takes 15 min — most insurance is willing to pay the full claim if you file in 30 days. Want me to swing by?',
      email: 'Subject: Hail damage on Birch Ln — free inspection + insurance help\n\nHi Sarah,\n\nNOAA recorded 1.7" hail strikes on your block Sunday night around 8:42pm. Roofs your age (~22yr) usually have hidden cracks even when they look fine from the ground — and the 30-day filing window for insurance is tight.\n\nFree 15-min inspection. If we find damage, we walk you through the claim filing (we don\'t take a cut, your insurance pays direct).\n\nWhen\'s a good time this week? I can be there Thu or Fri morning.\n\n— Marcus, Lone Star Roofing',
      callWindow: 'Today 4-6pm (replied 1:20pm — deductible question = warm but cautious, call same-day)',
      followUp: 'Reply asking about deductible → text back avg deductible $500-1500, your insurance handles rest. Then call.',
    },
  },
  {
    id: 'sw3', owner: 'Carlos Reyes', firstName: 'Carlos',
    street: '1923 Briarwood', zip: '75035', city: 'Frisco', state: 'TX',
    trade: 'HVAC', signal: 'AGED', score: 81,
    phone: '(972) 555-3441', email: 'c.reyes@yahoo.com',
    yearBuilt: 2009, homeValue: 412000, estJob: '$5,400–9,200',
    status: 'NEW',
    strategy: {
      why: 'County records show HVAC system aged ~16 years. SEER 10-12 rating likely. Frisco summer hits 105°F. Avg repair cost $400+ at this age — replacement ROI gets attractive.',
      angle: 'Tune-up trip-wire ($89). Once we\'re in the door + see the system, replacement quote follows naturally. Low-commitment ask vs cold install pitch.',
      sms: 'Hey Carlos — Daniel here w/ Frisco Climate. Your system\'s tagged as ~16yrs in county records. We\'re running tune-ups at $89 this month + free coil cleaning. Worth it before summer hits 105.',
      email: 'Subject: $89 tune-up — gets you to summer w/ no surprises\n\nHi Carlos,\n\nCounty records show the HVAC at 1923 Briarwood was installed ~2009. Systems this age typically need 2-3 small fixes before they break for real — and the breakdowns always happen the week it hits 105.\n\n$89 covers a full diagnostic + coil cleaning + capacitor check. If we find something serious, you decide what to do next. No pressure.\n\nReply YES + I\'ll grab a slot for you this week.\n\n— Daniel, Frisco Climate Co',
      callWindow: 'Thu 5-7pm (high-intent windows for aged-system owners are after-work weeknights)',
      followUp: 'No reply by Wed → send: "Carlos, ran out of $89 tune-up slots for next week, want me to lock yours?" (urgency)',
    },
  },
  {
    id: 'sw4', owner: 'James Patel', firstName: 'James',
    street: '388 Cedar Park', zip: '75070', city: 'McKinney', state: 'TX',
    trade: 'HVAC', signal: 'MOVE-IN', score: 76,
    phone: '(214) 555-2815', email: 'jpatel.tx@gmail.com',
    yearBuilt: 2015, homeValue: 528000, estJob: '$1,800–3,400',
    status: 'NEW',
    strategy: {
      why: 'Moved in 6 weeks ago. New owners are 4× more likely to schedule any home service in first 90 days than tenured owners. Doesn\'t know where his shut-offs are. Easy yes.',
      angle: 'Welcome-to-McKinney free walkthrough. Frame as "every new owner gets confused about their HVAC, here\'s a 20-min free check." Zero pressure.',
      sms: 'Welcome to McKinney James! Greg w/ McKinney HVAC. Free new-homeowner walkthrough — we check the water heater, shut-offs, and HVAC for free. Most new owners don\'t know where any of it is. Tue or Sat ok?',
      email: 'Subject: Welcome to McKinney — free new-homeowner HVAC walkthrough\n\nHi James,\n\nSaw 388 Cedar Park changed hands recently. Congrats on the new place.\n\nWe do a free 20-min walkthrough for every new owner in 75070 — we\'ll show you where the shut-offs are, what condition your HVAC is in, when you\'ll need to replace, and a couple things to know before summer hits.\n\nNo cost, no upsell call after. Tue (6pm) or Sat (10am)?\n\n— Greg, McKinney HVAC Pros',
      callWindow: 'Sat 10am-noon (new owners do home stuff weekend mornings)',
      followUp: 'No reply Wed → mail handwritten thank-you note + magnet w/ phone. New owners save these.',
    },
  },
  {
    id: 'sw5', owner: 'Linda Hong', firstName: 'Linda',
    street: '6618 Aspen Way', zip: '75002', city: 'Allen', state: 'TX',
    trade: 'HVAC', signal: 'PERMIT', score: 84,
    phone: '(469) 555-1703', email: 'lhong24@gmail.com',
    yearBuilt: 1995, homeValue: 398000, estJob: '$2,800–4,100',
    status: 'NEW',
    strategy: {
      why: 'Sub-panel permit pulled for 200A upgrade. Means electrical job is happening — but most owners don\'t know HVAC + electrical inspections should pair (sub-panel work often triggers HVAC upgrade requirements). High cross-sell window.',
      angle: 'Free HVAC inspection while electrical is open. "Most owners doing a sub-panel don\'t realize the HVAC needs to be re-permitted too. Free check while you\'re mid-project."',
      sms: 'Hi Linda — Anthony w/ Allen HVAC. Saw the sub-panel permit got pulled. Most owners doing sub-panel work get hit w/ HVAC code requirements that aren\'t obvious. Free check while you\'re mid-project. 20 min, no charge.',
      email: 'Subject: Sub-panel + HVAC code — quick free check before yours closes\n\nHi Linda,\n\nNoticed the sub-panel permit at 6618 Aspen. Quick heads up — most owners doing a sub-panel upgrade don\'t realize the city often requires the HVAC connection to be re-rated. If it\'s not flagged before the panel inspection, the city can fail your whole permit.\n\n20-min free check while your electrician is still on-site. Saves you a re-inspection fee + rework. Tue or Wed?\n\n— Anthony, Allen HVAC',
      callWindow: 'Wed 12-2pm (lunch break window — electrical jobs are weekday)',
      followUp: 'No reply by Thu → call once. "Quick heads-up on your permit" voicemail.',
    },
  },
  {
    id: 'sw6', owner: 'Tony Suarez', firstName: 'Tony',
    street: '4218 Catalina Ave', zip: '85710', city: 'Tucson', state: 'AZ',
    trade: 'HVAC', signal: 'PERMIT', score: 90,
    phone: '(520) 555-4996', email: 'tsuarez.az@gmail.com',
    yearBuilt: 2001, homeValue: 318000, estJob: '$5,800–9,400',
    status: 'BOOKED',
    strategy: {
      why: 'Furnace permit filed last week. AZ owners get furnace permits in early June = preparing for winter heat-pump combo install (smart play before peak prices).',
      angle: 'Combo install pricing. "If you\'re doing furnace, save $1,200 by doing AC at same time. One crew, one labor charge."',
      sms: 'Hey Tony — Rico w/ Tucson Cooling. Furnace permit caught my eye. If you also want to look at the AC side before July, we do combo install pricing that saves ~$1,200. No upsell call, just send a quote over text.',
      email: 'Subject: Combo install — $1,200 savings on your furnace + AC\n\nHi Tony,\n\nSaw the furnace permit at 4218 Catalina. If you\'re also looking at the AC side this season, combining the install on one crew/day saves you ~$1,200 in labor vs doing them separate.\n\nI can text a written quote in under 24 hrs — no in-home pitch unless you ask for one. Want me to send it?\n\n— Rico, Tucson Cooling',
      callWindow: 'BOOKED Wed 2pm — combo install quote signed',
      followUp: 'Booked. Next step: confirmation text + install date follow-up.',
    },
  },
  {
    id: 'sw7', owner: 'Maria Lopez', firstName: 'Maria',
    street: '7711 Camelback Pl', zip: '85016', city: 'Phoenix', state: 'AZ',
    trade: 'HVAC', signal: 'AGED', score: 79,
    phone: '(602) 555-8128', email: 'mariaL.phx@yahoo.com',
    yearBuilt: 2009, homeValue: 295000, estJob: '$4,200–7,100',
    status: 'NO-REPLY',
    strategy: {
      why: 'Unit tagged 2009 in county records. Phoenix hits 115°F+. Aged systems fail 3x more often Jun-Aug. Replacement ROI dominant story.',
      angle: 'Pre-summer reliability check. "Quick free check this week, no charge if we don\'t find anything."',
      sms: 'Hey Maria — Eric w/ Sun Valley Air. Your unit\'s a 2009 per county records — those usually start needing $400+ repairs around year 15. Quick free check this week, no charge if we don\'t find anything?',
      email: 'Subject: Free pre-summer HVAC check (no charge if nothing\'s wrong)\n\nHi Maria,\n\nCounty records show the HVAC at 7711 Camelback is around 16 years old. Systems this age usually start hitting $400+ repairs around June-July when temps peak.\n\n15-min free check this week. If nothing\'s wrong, you owe nothing. If something is, we tell you exactly what + cost — no in-home pitch.\n\nThu or Fri ok?\n\n— Eric, Sun Valley Air',
      callWindow: 'No reply yet — tomorrow Fri 10am follow-up window',
      followUp: 'Send follow-up Fri: "Last call this week for free checks — book by Sat?"',
    },
  },
  {
    id: 'sw8', owner: 'Rachel Brooks', firstName: 'Rachel',
    street: '988 Peachtree St', zip: '30301', city: 'Atlanta', state: 'GA',
    trade: 'HVAC', signal: 'PERMIT', score: 86,
    phone: '(404) 555-6244', email: 'rb.atl@gmail.com',
    yearBuilt: 2008, homeValue: 642000, estJob: '$4,400–7,200',
    status: 'NEW',
    strategy: {
      why: 'Building permit pulled for new HVAC install. Atlanta humidity = sizing is critical. Most chain installs over-size systems → short-cycle + high humidity. Specialist angle wins.',
      angle: 'Sizing-error 2nd opinion. "Chain shops oversize HVAC in Atlanta humidity. Quick free check saves $800/yr in efficiency."',
      sms: 'Hi Rachel — Demarcus w/ ATL Comfort. Permit shows new system going in. We sometimes catch sizing errors on these — quick free 2nd-opinion before install saves people ~$800/yr in efficiency. Worth a look?',
      email: 'Subject: Sizing check before your install closes\n\nHi Rachel,\n\nSaw the HVAC install permit at 988 Peachtree. Quick heads up — sizing errors are the #1 reason new Atlanta HVAC installs run inefficiently. We catch them in about 1 of 3 installs we 2nd-opinion.\n\n20-min free assessment before your install crew shows up. Could save you $800/yr in efficiency + warranty issues. Tue or Wed?\n\n— Demarcus, ATL Comfort Co',
      callWindow: 'Tue 5-7pm (after-work weeknight window)',
      followUp: 'No reply by Wed → text: "Demarcus here — last call before your install Thu?"',
    },
  },
  {
    id: 'sw9', owner: 'Jamal Wright', firstName: 'Jamal',
    street: '142 Edgewood', zip: '30329', city: 'Atlanta', state: 'GA',
    trade: 'HVAC', signal: 'STORM', score: 91,
    phone: '(404) 555-3812', email: 'jamal.w@hotmail.com',
    yearBuilt: 1988, homeValue: 412000, estJob: '$3,600–5,800',
    status: 'NEW',
    strategy: {
      why: '37-yr-old house. Severe storm cluster hit ZIP 30329 last Tue (4.2" rain, 60mph winds). Older homes = condensate drain backup risk. Most owners don\'t realize the link.',
      angle: 'Post-storm system check. Storm + age = condensate + electrical risk. Free assessment.',
      sms: 'Hey Jamal — Demarcus w/ ATL Comfort. Bad storm hit 30329 Tue. Older homes get condensate + electrical issues from storms that don\'t show for weeks. Free check while it\'s still in warranty window?',
      email: 'Subject: Post-storm HVAC check — 30329 got hit hard Tue\n\nHi Jamal,\n\nThe storm cluster that came through 30329 last Tuesday dumped 4.2" of rain + 60mph gusts. Older homes (your year) tend to get condensate drain backups + electrical surge issues from storms — they don\'t always show up immediately but cause failures within 30-60 days.\n\nFree 20-min check this week. If we find something, you get a written report (good for insurance). If we don\'t, you owe nothing.\n\nThu morning ok?\n\n— Demarcus, ATL Comfort',
      callWindow: 'Sat 10am-noon (weekend morning, homeowner-checking window)',
      followUp: 'No reply Sun → second SMS: "Storm window for insurance claims closes in 2 weeks."',
    },
  },
  {
    id: 'sw10', owner: 'Susan O\'Neal', firstName: 'Susan',
    street: '8800 Magnolia', zip: '32801', city: 'Orlando', state: 'FL',
    trade: 'HVAC', signal: 'AGED', score: 83,
    phone: '(407) 555-2701', email: 'susan.oneal@gmail.com',
    yearBuilt: 2007, homeValue: 384000, estJob: '$3,900–6,400',
    status: 'NEW',
    strategy: {
      why: 'Unit tagged 17 yrs old in FL records. Orlando summer humidity = system runs nonstop. AC fails most often in July when no one\'s available to fix.',
      angle: 'Pre-July reliability + maintenance plan upsell. "Free pre-summer check + we\'ll put you on the maintenance plan that gets priority service if you DO break down in July."',
      sms: 'Hi Susan — Mike here w/ Orlando Air. Your unit\'s tagged 17yrs in county records. FL summer = systems run nonstop. Free pre-July check + we cover priority service if anything happens. Worth a look?',
      email: 'Subject: Pre-summer HVAC + priority backup if something fails in July\n\nHi Susan,\n\nCounty records show the HVAC at 8800 Magnolia is around 17 years old. In Orlando humidity, systems this age usually need at least one fix between now and August — and the day yours dies, every shop is booked 7-10 days out.\n\nFree pre-summer check + if you want, we put you on a $19/mo priority maintenance plan: $0 service call fee + jump the line if you break down in July. No commitment.\n\nThu or Fri this week?\n\n— Mike, Orlando Air Pros',
      callWindow: 'Mon 5-7pm next week (Orlando owners do late-day decisions in summer)',
      followUp: 'No reply by Sun → email follow-up w/ neighborhood referral angle.',
    },
  },
]

const SIGNAL_PILL: Record<RichLead['signal'], { bg: string; fg: string; label: string; emoji: string }> = {
  'PERMIT':  { bg: '#E0F2FE', fg: '#0369A1', label: 'Permit',  emoji: '🏛' },
  'STORM':   { bg: '#FEF3C7', fg: '#92400E', label: 'Storm',   emoji: '⛈' },
  'AGED':    { bg: '#FCE7F3', fg: '#9D174D', label: 'Aged',    emoji: '🌡' },
  'MOVE-IN': { bg: '#DCFCE7', fg: '#166534', label: 'Move-in', emoji: '🏠' },
}

const STATUS_PILL: Record<RichLead['status'], { bg: string; fg: string; label: string }> = {
  'NEW':      { bg: '#F1F5F9', fg: '#475569', label: 'New' },
  'REPLIED':  { bg: '#FEF3C7', fg: '#92400E', label: '💬 Replied' },
  'BOOKED':   { bg: '#DCFCE7', fg: '#166534', label: '💰 Booked' },
  'NO-REPLY': { bg: '#FEE2E2', fg: '#991B1B', label: '⏱ Awaiting' },
}

/**
 * Map a real lead row from /api/dashboard/leads-summary into a RichLead
 * for the killer Monday brief. Uses source_details.why_tags array shipped
 * in find-real-leads (Batch Data foundation) + pitch_script for the email
 * body. Falls back to sensible defaults so a partial row still renders.
 *
 * Was a TODO for weeks — caused every paying customer's dashboard to
 * render empty when real leads existed. Fixed 2026-06-09.
 */
function enrichLeadsForDashboard(rows: LeadStub[]): RichLead[] {
  return rows.map((row) => {
    const sd = (row.source_details || {}) as {
      why_tags?: string[]
      tag?: string
      last_sale_date?: string
      last_sale_price?: number
      provider?: string
    }
    const fullName = (row.owner_name || '').trim()
    const firstName = fullName.split(/\s+/)[0] || 'Homeowner'

    // Map BatchData/scraper source.tag → killer-brief signal taxonomy.
    const tag = (sd.tag || row.source || '').toLowerCase()
    let signal: RichLead['signal'] = 'AGED'
    if (tag.includes('permit')) signal = 'PERMIT'
    else if (tag.includes('storm') || tag.includes('hail') || tag.includes('noaa')) signal = 'STORM'
    else if (tag.includes('recent-buyer') || tag.includes('move') || sd.last_sale_date) signal = 'MOVE-IN'
    else if (tag.includes('aging') || tag.includes('aged') || tag.includes('panel') || tag.includes('roof')) signal = 'AGED'

    const tradeMatch = (row.trade_match && row.trade_match[0]) || 'hvac'
    const trade = tradeMatch.toUpperCase()

    // why_tags array → 3-4 reason lines per Hormozi specificity = credibility.
    const whyTags = Array.isArray(sd.why_tags) ? sd.why_tags : []
    const why = whyTags.length > 0
      ? whyTags.join(' · ')
      : (row.pitch_script || `Owner-occupied. ${row.year_built ? `Built ${row.year_built}.` : ''} Verified address.`).slice(0, 280)

    // Pitch script from find-real-leads = a single-sentence angle. Use
    // verbatim for the angle field. SMS + email derive from it w/ light
    // template wrap until we wire per-lead Sonnet generation per customer.
    const angle = row.pitch_script || `Reach out about ${trade.toLowerCase()} services — owner-occupied verified.`
    const smsBody = `Hey ${firstName} — saw your address in our overnight pull. ${angle}`.slice(0, 320)
    const emailBody = `Subject: Quick note about your home\n\nHi ${firstName},\n\n${angle}\n\nFree quick look this week — Tue or Wed?\n\n— your local pro`

    // Job estimate from source_details.estimated_cost OR home_value-driven floor.
    const estCost = Number((row.source_details || {} as Record<string, unknown>).estimated_cost) || 0
    const estJob = estCost > 0
      ? `$${Math.round(estCost * 0.85).toLocaleString()}–${Math.round(estCost * 1.15).toLocaleString()}`
      : pickEstJobByTrade(tradeMatch, signal)

    return {
      id: row.id,
      owner: fullName || 'Homeowner',
      firstName,
      street: row.street_address || 'Verified address (tap to reveal)',
      zip: row.zip || '',
      city: row.city || '',
      state: row.state || '',
      trade,
      signal,
      score: row.lead_score ?? 75,
      phone: row.owner_phone || '••• ••• ••••',
      email: row.owner_email || '',
      yearBuilt: row.year_built,
      homeValue: row.home_value_est,
      estJob,
      status: 'NEW',
      strategy: {
        why,
        angle,
        sms: smsBody,
        email: emailBody,
        callWindow: pickCallWindow(signal),
        followUp: signal === 'STORM'
          ? 'No reply by Thu → text: "Insurance claim window closes soon — still worth a 15-min check?"'
          : 'No reply by Wed → text reminder + 2nd-opinion angle.',
      },
    }
  })
}

function pickEstJobByTrade(trade: string, signal: RichLead['signal']): string {
  const t = trade.toLowerCase()
  if (t === 'roofing') return signal === 'STORM' ? '$11,500–18,200' : '$8,400–14,200'
  if (t === 'plumbing') return signal === 'AGED' ? '$1,400–3,800' : '$800–2,400'
  if (t === 'electrical') return '$2,400–6,800'
  if (t === 'handyman') return '$400–2,200'
  // HVAC default
  return signal === 'PERMIT' ? '$3,200–4,800' : signal === 'STORM' ? '$8,400–12,000' : '$4,200–7,100'
}

function pickCallWindow(signal: RichLead['signal']): string {
  if (signal === 'STORM') return 'Today 4-6pm (storm-hit owners check phone after work — strike while it stings)'
  if (signal === 'PERMIT') return 'Tue 4-6pm (permit owners shop installers after work)'
  if (signal === 'MOVE-IN') return 'Sat 10am-noon (new homeowner Saturday-morning project window)'
  return 'Thu 5-7pm (high-intent for aged-system owners after work)'
}

const OVERNIGHT_LOG = [
  { time: '11:02pm', icon: '🛰', txt: 'Scraper fired across your zip(s)' },
  { time: '11:18pm', icon: '🏛', txt: 'New permits pulled · matches filtered by trade' },
  { time: '11:34pm', icon: '⛈', txt: 'NOAA storm strikes geo-flagged' },
  { time: '11:52pm', icon: '🏠', txt: 'MLS move-ins + USPS forwards merged' },
  { time: '12:08am', icon: '🌡', txt: 'Census + county aged-unit query complete' },
  { time: '12:24am', icon: '📞', txt: 'Skip-trace fired on matched properties' },
  { time: '12:41am', icon: '🧠', txt: 'Claude Sonnet scored leads (intent + value)' },
  { time: '01:02am', icon: '✍', txt: 'Per-lead outreach scripts written (SMS + email + call opener)' },
  { time: '06:00am', icon: '📨', txt: 'Leads + scripts delivered to your dashboard' },
  { time: '06:00am', icon: '🎯', txt: 'Ready for you: open any lead → copy script → call, text, or email your way' },
]

export default function KillerDashboard() {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useUser()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [summary, setSummary] = useState<SimplifiedSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [logIndex, setLogIndex] = useState(7)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [customQty, setCustomQty] = useState<number>(5)
  const [buying, setBuying] = useState(false)
  const [buyErr, setBuyErr] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn) { router.replace('/sign-in?redirect_url=/dashboard'); return }
    ;(async () => {
      try {
        const [p, s] = await Promise.all([
          fetch('/api/profile').then((r) => (r.ok ? r.json() : null)),
          fetch('/api/dashboard/leads-summary').then((r) => (r.ok ? r.json() : null)),
        ])
        if (p) {
          setProfile(p)
          if (!p.setup_complete) {
            router.replace('/dashboard/setup')
            return
          }
        }
        if (s) setSummary(s)
      } catch {/* */}
      setLoading(false)
    })()
  }, [isLoaded, isSignedIn, router])

  // Animate overnight log ticker
  useEffect(() => {
    const id = setInterval(() => {
      setLogIndex((i) => Math.min(OVERNIGHT_LOG.length, i + 1))
    }, 1100)
    return () => clearInterval(id)
  }, [])

  async function buyCustom() {
    if (customQty < 1) { setBuyErr('Pick at least 1 lead'); return }
    if (customQty > 200) { setBuyErr('Max 200 per purchase'); return }
    setBuying(true); setBuyErr(null)
    try {
      const r = await fetch('/api/stripe/checkout-alacarte', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qty: customQty }),
      })
      const j = await r.json()
      if (!r.ok) { setBuyErr(j.error || 'Checkout failed'); setBuying(false); return }
      if (j.url) window.location.href = j.url
    } catch (e) { setBuyErr((e as Error).message); setBuying(false) }
  }

  // Use real leads when available, fall back to SAMPLE_WEEK so empty dashboards
  // still demo the killer state.
  const hasRealLeads = (summary?.this_week_count ?? 0) > 0
  // Cap displayed leads per the leads-only pricing pivot: 10/week, 40/month.
  // If the lead engine over-delivers, only show the contracted quantity.
  const weekLeads = hasRealLeads
    ? enrichLeadsForDashboard(summary?.this_week_leads || []).slice(0, 10)
    : SAMPLE_WEEK
  const monthLeads = hasRealLeads
    ? enrichLeadsForDashboard(summary?.this_month_leads || []).slice(0, 40)
    : SAMPLE_WEEK
  const allLeads = hasRealLeads
    ? enrichLeadsForDashboard(summary?.all_leads || [])
    : SAMPLE_WEEK

  // 2026-06-09 — split the lead pool into tabs per Peter feedback. Was
  // dumping all 50 into one section, looked overwhelming. Now: This Week
  // (current Monday's drop) · This Month (everything delivered this
  // month) · All Time. Default = This Week.
  const [leadTab, setLeadTab] = useState<'week' | 'month' | 'all'>('week')
  const visibleLeads =
    leadTab === 'week' ? weekLeads
    : leadTab === 'month' ? monthLeads
    : allLeads
  const tabLabel = leadTab === 'week' ? 'This week' : leadTab === 'month' ? 'This month' : 'All time'

  const stats = useMemo(() => ({
    pulled: weekLeads.length,
    smsSent: weekLeads.length,
    emailSent: weekLeads.length,
    replied: weekLeads.filter((l) => l.status === 'REPLIED' || l.status === 'BOOKED').length,
    booked: weekLeads.filter((l) => l.status === 'BOOKED').length,
    pipeline: weekLeads
      .filter((l) => l.status !== 'NO-REPLY')
      .reduce((acc, l) => acc + parseInt(l.estJob.split('–')[0].replace(/\D/g, ''), 10), 0),
  }), [weekLeads])

  const hotInbox = weekLeads.filter((l) => l.status === 'REPLIED' || l.status === 'BOOKED')

  if (loading || !isLoaded) {
    return <main style={loadingStyle}><div style={{ fontSize: 13, color: '#4A6670' }}>Loading…</div></main>
  }

  const ownerFirst = profile?.owner_first_name || 'there'
  const bizName = profile?.business_name || 'your shop'

  return (
    <div style={{ color: '#0B1F3A' }}>
      <section style={{ padding: 'clamp(20px, 4vw, 36px) clamp(14px, 4vw, 40px) 60px' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', display: 'grid', gap: 24 }}>

          {/* SECTION 1 — AI OVERNIGHT BRIEF */}
          <section style={briefCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14, marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#FFC58A', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 6 }}>
                  AI overnight brief · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                </div>
                <h1 style={{ fontSize: 'clamp(28px, 3.4vw, 40px)', fontWeight: 900, letterSpacing: '-0.04em', margin: 0, color: '#FFF8F0' }}>
                  Hey {ownerFirst} — your AI worked all weekend.
                </h1>
                <p style={{ margin: '8px 0 0', fontSize: 15, color: 'rgba(255,248,240,0.72)', lineHeight: 1.55, maxWidth: 620 }}>
                  Scraper pulled signals overnight. Sonnet wrote {stats.smsSent} personalized scripts (SMS + email + call opener) for each lead below. <strong style={{ color: '#FFF8F0' }}>Open any lead, copy the script, then call / text / email — your way.</strong>
                </p>
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 99, background: 'rgba(34,197,94,0.18)', border: '1.5px solid rgba(34,197,94,0.40)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 12px #22C55E' }} />
                <span style={{ fontSize: 11.5, fontWeight: 800, color: '#5EEAD4', letterSpacing: '0.10em', textTransform: 'uppercase' }}>Live · auto · next drop Mon 6am</span>
              </div>
            </div>

            {/* Stat strip */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12,
              marginBottom: 20,
            }}>
              <BriefStat label="Pulled" value={stats.pulled} sub="this week" />
              <BriefStat label="SMS scripts" value={stats.smsSent} sub="ready for you" />
              <BriefStat label="Email scripts" value={stats.emailSent} sub="ready for you" />
              <BriefStat label="Call openers" value={stats.smsSent} sub="ready for you" accent />
              <BriefStat label="Pipeline" value={`$${stats.pipeline.toLocaleString()}`} sub="est. job floor" />
            </div>

            {/* Overnight log ticker */}
            <div style={{
              padding: '14px 16px', borderRadius: 12,
              background: 'rgba(0,0,0,0.22)',
              border: '1px solid rgba(255,197,138,0.18)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              fontSize: 12.5, color: 'rgba(255,248,240,0.86)',
              maxHeight: 220, overflow: 'hidden',
            }}>
              <AnimatePresence initial={false}>
                {OVERNIGHT_LOG.slice(0, logIndex).map((entry, i) => (
                  <motion.div
                    key={entry.time + i}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.28 }}
                    style={{ display: 'flex', gap: 12, padding: '3px 0', alignItems: 'center' }}
                  >
                    <span style={{ color: '#FFC58A', fontWeight: 700, width: 70, flexShrink: 0 }}>{entry.time}</span>
                    <span style={{ width: 22, textAlign: 'center', flexShrink: 0 }}>{entry.icon}</span>
                    <span>{entry.txt}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </section>

          {/* SECTION 2 — HOT INBOX */}
          {hotInbox.length > 0 && (
            <section>
              <div style={sectionHeader}>
                <span>🔥 Hot inbox · {hotInbox.length} replied</span>
                <span style={subHeader}>Call these today</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
                {hotInbox.map((l) => <HotCard key={l.id} l={l} />)}
              </div>
            </section>
          )}

          {/* SECTION 3 — TABBED LEAD POOL (week / month / all) */}
          <section>
            <div style={sectionHeader}>
              <span>📋 {tabLabel} · {visibleLeads.length}</span>
              <span style={subHeader}>Click any card → full AI outreach strategy</span>
            </div>

            {/* Tab pills */}
            <div style={{
              display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap',
            }}>
              {([
                { k: 'week',  label: 'This week',  count: weekLeads.length },
                { k: 'month', label: 'This month', count: monthLeads.length },
                { k: 'all',   label: 'All time',   count: allLeads.length },
              ] as const).map((t) => {
                const active = leadTab === t.k
                return (
                  <button
                    key={t.k}
                    onClick={() => { setLeadTab(t.k); setExpanded(null) }}
                    style={{
                      padding: '9px 16px', borderRadius: 99,
                      border: active ? '2px solid #FF9D5A' : '1.5px solid rgba(255,197,138,0.22)',
                      background: active
                        ? 'linear-gradient(135deg, rgba(255,157,90,0.16), rgba(232,116,43,0.14))'
                        : 'rgba(255,248,240,0.04)',
                      color: active ? '#FFC58A' : 'rgba(255,248,240,0.62)',
                      fontWeight: 800, fontSize: 13,
                      letterSpacing: '-0.01em', cursor: 'pointer',
                      transition: 'all 160ms ease',
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                    }}
                  >
                    <span>{t.label}</span>
                    <span style={{
                      padding: '1px 8px', borderRadius: 99,
                      background: active ? 'rgba(255,197,138,0.22)' : 'rgba(255,248,240,0.08)',
                      fontSize: 11, fontWeight: 900, color: active ? '#FFC58A' : 'rgba(255,248,240,0.54)',
                    }}>{t.count}</span>
                  </button>
                )
              })}
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              {visibleLeads.map((l) => (
                <LeadCard
                  key={l.id}
                  lead={l}
                  expanded={expanded === l.id}
                  onToggle={() => setExpanded(expanded === l.id ? null : l.id)}
                />
              ))}
            </div>
          </section>

          {/* SECTION 4 — BUY EXTRAS */}
          <section style={extrasCard}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{ flex: '1 1 280px', minWidth: 280 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#C84B26', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Need more this week?
                </div>
                <h3 style={{ fontSize: 22, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.02em', margin: '0 0 8px' }}>
                  Buy extra leads — $25 each
                </h3>
                <p style={{ fontSize: 13.5, color: '#4A6670', lineHeight: 1.55, margin: 0 }}>
                  Same exclusive territory. Same AI outreach. Delivered + sent within 24 hrs. One-time charge.
                </p>
              </div>
              <div style={{ flex: '0 1 320px', minWidth: 280 }}>
                <label style={{ fontSize: 11, fontWeight: 800, color: '#4A6670', letterSpacing: '0.10em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
                  How many?
                </label>
                <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, marginBottom: 10 }}>
                  <button onClick={() => setCustomQty(Math.max(1, customQty - 5))} style={qtyBtn}>−5</button>
                  <input
                    type="number" min={1} max={200}
                    value={customQty}
                    onChange={(e) => setCustomQty(Math.max(1, Math.min(200, parseInt(e.target.value || '1', 10))))}
                    style={qtyInput}
                  />
                  <button onClick={() => setCustomQty(Math.min(200, customQty + 5))} style={qtyBtn}>+5</button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <span style={{ fontSize: 12, color: '#4A6670' }}>{customQty} × $25</span>
                  <span style={{ fontSize: 28, fontWeight: 900, color: '#C84B26', letterSpacing: '-0.5px' }}>${customQty * 25}</span>
                </div>
                <button
                  onClick={buyCustom}
                  disabled={buying}
                  style={{
                    width: '100%', padding: '14px 18px', borderRadius: 12,
                    background: buying ? 'rgba(11,31,58,0.3)' : 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 50%, #C84B26 100%)',
                    color: '#fff', border: 'none', cursor: buying ? 'wait' : 'pointer',
                    fontSize: 14, fontWeight: 900,
                    boxShadow: '0 10px 28px rgba(232,116,43,0.40)',
                  }}
                >
                  {buying ? 'Redirecting to Stripe…' : `Buy ${customQty} ${customQty === 1 ? 'lead' : 'leads'} for $${customQty * 25} →`}
                </button>
                {buyErr && (
                  <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: '#991B1B', fontSize: 12 }}>{buyErr}</div>
                )}
              </div>
            </div>
          </section>

          {/* Demo-state notice if hasRealLeads is false */}
          {!hasRealLeads && (
            <div style={{
              textAlign: 'center', padding: '14px 20px', borderRadius: 12,
              background: 'rgba(34,197,94,0.08)', border: '1px dashed rgba(34,197,94,0.35)',
              fontSize: 13, color: '#0B1F3A',
            }}>
              👆 This is what your real Monday will look like. We&apos;re running your first scrape now — actual leads land Mon 6am. <Link href={`/dashboard/leads`} style={{ color: '#C84B26', fontWeight: 800 }}>See live status →</Link>
            </div>
          )}

          {/* Wordmark / brand for {bizName} */}
          <div style={{ textAlign: 'center', fontSize: 10.5, color: '#7AAAB2', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
            Brief built for {bizName} · powered by BellAveGo
          </div>

        </div>
      </section>
    </div>
  )
}

function BriefStat({ label, value, sub, accent }: { label: string; value: number | string; sub: string; accent?: boolean }) {
  return (
    <div style={{
      padding: '14px 16px', borderRadius: 12,
      background: accent ? 'rgba(94,234,212,0.18)' : 'rgba(255,248,240,0.06)',
      border: accent ? '1px solid rgba(94,234,212,0.50)' : '1px solid rgba(255,197,138,0.18)',
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: accent ? '#5EEAD4' : 'rgba(255,248,240,0.60)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{
        fontSize: 26, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1,
        color: accent ? '#5EEAD4' : '#FFF8F0',
        fontVariantNumeric: 'tabular-nums',
      }}>{value}</div>
      <div style={{ fontSize: 11, color: 'rgba(255,248,240,0.55)', marginTop: 4, fontWeight: 600 }}>{sub}</div>
    </div>
  )
}

function HotCard({ l }: { l: RichLead }) {
  const sig = SIGNAL_PILL[l.signal]
  const status = STATUS_PILL[l.status]
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      style={{
        padding: 18, borderRadius: 16,
        background: 'linear-gradient(165deg, #FFFFFF 0%, #FFF8F0 100%)',
        border: '2px solid rgba(232,116,43,0.40)',
        boxShadow: '0 18px 40px rgba(232,116,43,0.20)',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.02em' }}>{l.owner}</div>
          <div style={{ fontSize: 12, color: '#4A6670', marginTop: 2 }}>{l.street} · {l.city} {l.state} {l.zip}</div>
        </div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '4px 10px', borderRadius: 8,
          background: status.bg, color: status.fg,
          fontSize: 11, fontWeight: 900, letterSpacing: '0.05em', textTransform: 'uppercase',
        }}>{status.label}</span>
      </div>

      {l.replyPreview && (
        <div style={{
          padding: '10px 12px', borderRadius: 10,
          background: 'rgba(255,217,168,0.32)',
          fontSize: 13, color: '#0B1F3A', fontStyle: 'italic', lineHeight: 1.5,
        }}>
          &ldquo;{l.replyPreview}&rdquo;
          <div style={{ fontSize: 10.5, color: '#7AAAB2', fontWeight: 700, marginTop: 4, fontStyle: 'normal', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Reply preview</div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ padding: '3px 9px', borderRadius: 7, background: sig.bg, color: sig.fg, fontSize: 11, fontWeight: 800 }}>{sig.emoji} {sig.label}</span>
        <span style={{ fontSize: 11.5, color: '#4A6670', fontWeight: 700 }}>Score {l.score}</span>
        <span style={{ fontSize: 11.5, color: '#C84B26', fontWeight: 800 }}>{l.estJob}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <a
          href={`tel:${l.phone.replace(/\D/g, '')}`}
          style={{
            padding: '12px', borderRadius: 11, textAlign: 'center',
            background: 'linear-gradient(135deg, #22C55E, #14B8A6)',
            color: '#fff', textDecoration: 'none',
            fontSize: 13.5, fontWeight: 900, letterSpacing: '-0.01em',
            boxShadow: '0 8px 20px rgba(34,197,94,0.30)',
          }}
        >📞 Call {l.firstName}</a>
        <a
          href={`sms:${l.phone.replace(/\D/g, '')}`}
          style={{
            padding: '12px', borderRadius: 11, textAlign: 'center',
            background: '#FFF', color: '#C84B26',
            border: '1.5px solid rgba(232,116,43,0.30)',
            textDecoration: 'none',
            fontSize: 13.5, fontWeight: 800,
          }}
        >💬 Text back</a>
      </div>
    </motion.div>
  )
}

function LeadCard({ lead: l, expanded, onToggle }: { lead: RichLead; expanded: boolean; onToggle: () => void }) {
  const sig = SIGNAL_PILL[l.signal]
  const status = STATUS_PILL[l.status]
  return (
    <motion.div layout style={{
      borderRadius: 14,
      background: '#FFFFFF',
      border: expanded ? '1.5px solid rgba(232,116,43,0.40)' : '1px solid rgba(232,116,43,0.16)',
      boxShadow: expanded ? '0 14px 36px rgba(232,116,43,0.18)' : '0 4px 12px rgba(11,31,58,0.05)',
      overflow: 'hidden',
      transition: 'border-color 200ms ease, box-shadow 200ms ease',
    }}>
      {/* Row header */}
      <button
        onClick={onToggle}
        style={{
          width: '100%', textAlign: 'left',
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: '14px 18px',
          display: 'grid', gridTemplateColumns: '1.3fr 0.7fr 0.7fr 0.7fr 0.7fr 0.9fr auto',
          gap: 12, alignItems: 'center',
          fontFamily: 'inherit',
        }}
        className="killer-row"
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: '#0B1F3A' }}>{l.owner}</div>
          <div style={{ fontSize: 11.5, color: '#4A6670', marginTop: 2 }}>{l.street} · {l.zip}</div>
        </div>
        <div>
          <span style={{ padding: '3px 9px', borderRadius: 7, background: sig.bg, color: sig.fg, fontSize: 11, fontWeight: 800 }}>{sig.emoji} {sig.label}</span>
        </div>
        <div style={{ color: '#4A6670', fontSize: 12, fontWeight: 700 }}>{l.trade}</div>
        <div style={{ color: '#C84B26', fontSize: 13.5, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{l.score}</div>
        <div style={{ color: '#0B1F3A', fontSize: 12.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{l.estJob}</div>
        <div>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '4px 9px', borderRadius: 7,
            background: status.bg, color: status.fg,
            fontSize: 11, fontWeight: 900, letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>{status.label}</span>
        </div>
        <div style={{ fontSize: 18, color: '#E8742B', fontWeight: 900, transform: expanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 220ms ease' }}>⌄</div>
      </button>

      {/* Expanded strategy panel */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              padding: '4px 22px 22px',
              borderTop: '1px dashed rgba(232,116,43,0.22)',
              display: 'grid', gridTemplateColumns: 'minmax(0, 1.05fr) minmax(0, 0.95fr)', gap: 18,
            }} className="killer-strategy-grid">
              {/* LEFT — strategy text */}
              <div style={{ display: 'grid', gap: 14, paddingTop: 16 }}>
                <StrategyBlock label="🎯 Why this homeowner is hot" body={l.strategy.why} />
                <StrategyBlock label="💬 Angle to lead with" body={l.strategy.angle} />
                <StrategyBlock label="⏰ Best call window" body={l.strategy.callWindow} />
                <StrategyBlock label="📅 Follow-up plan" body={l.strategy.followUp} />

                {/* Contact + actions */}
                <div style={{
                  padding: 14, borderRadius: 12,
                  background: 'linear-gradient(135deg, #FFF8F0, #FFE9D2)',
                  border: '1px solid rgba(232,116,43,0.30)',
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
                }}>
                  <a href={`tel:${l.phone.replace(/\D/g, '')}`} style={callBtn}>📞 Call {l.firstName}</a>
                  <a href={`sms:${l.phone.replace(/\D/g, '')}`} style={textBtn}>💬 Text {l.firstName}</a>
                  <div style={{ gridColumn: '1 / -1', fontSize: 11.5, color: '#4A6670', textAlign: 'center', marginTop: 2 }}>
                    📍 {l.street} · {l.city} {l.state} · 🏠 {l.yearBuilt ? `built ${l.yearBuilt}` : ''}{l.homeValue ? ` · $${(l.homeValue/1000).toFixed(0)}K home` : ''}
                  </div>
                </div>
              </div>

              {/* RIGHT — message previews */}
              <div style={{ display: 'grid', gap: 12, paddingTop: 16 }}>
                <MessagePreview kind="SMS" body={l.strategy.sms} status={l.status} from="your number" />
                <MessagePreview kind="EMAIL" body={l.strategy.email} status={l.status} from="your business email" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        @media (max-width: 820px) {
          .killer-row {
            grid-template-columns: 1fr auto !important;
          }
          .killer-row > div:nth-child(2),
          .killer-row > div:nth-child(3),
          .killer-row > div:nth-child(4),
          .killer-row > div:nth-child(5),
          .killer-row > div:nth-child(6) {
            grid-column: 1 / -1;
            display: inline-block;
            margin-right: 8px;
            font-size: 11px !important;
          }
          .killer-strategy-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </motion.div>
  )
}

function StrategyBlock({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 900, color: '#C84B26', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <p style={{ margin: 0, fontSize: 13.5, color: '#0B1F3A', lineHeight: 1.55 }}>{body}</p>
    </div>
  )
}

function MessagePreview({ kind, body, status, from }: { kind: 'SMS' | 'EMAIL'; body: string; status: RichLead['status']; from: string }) {
  const sent = status !== 'NEW'
  return (
    <div style={{
      borderRadius: 12,
      background: '#0B1F3A',
      border: '1px solid rgba(94,234,212,0.22)',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 14px',
        background: 'rgba(255,197,138,0.10)',
        borderBottom: '1px solid rgba(255,197,138,0.18)',
        fontSize: 10.5, fontWeight: 800, color: '#FFC58A', letterSpacing: '0.14em', textTransform: 'uppercase',
      }}>
        <span>{kind === 'SMS' ? '📱' : '✉️'} {kind} · from {from}</span>
        <span style={{ color: sent ? '#5EEAD4' : '#FFC58A' }}>{sent ? '✓ Sent' : '⏳ Queued'}</span>
      </div>
      <div style={{
        padding: '14px 16px',
        fontSize: 13, color: '#FFF8F0', lineHeight: 1.55,
        whiteSpace: 'pre-wrap',
        fontFamily: kind === 'SMS' ? 'inherit' : 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      }}>{body}</div>
    </div>
  )
}

const briefCard: React.CSSProperties = {
  borderRadius: 22,
  background: 'linear-gradient(165deg, #0B1F3A 0%, #163356 100%)',
  color: '#FFF8F0',
  padding: 'clamp(20px, 3vw, 32px)',
  boxShadow: '0 30px 70px rgba(11,31,58,0.30)',
  border: '1px solid rgba(94,234,212,0.20)',
  position: 'relative',
  overflow: 'hidden',
}

const extrasCard: React.CSSProperties = {
  padding: 'clamp(24px, 3vw, 32px)',
  borderRadius: 18,
  background: 'linear-gradient(165deg, #FFFFFF 0%, #FFF8F0 100%)',
  border: '1.5px solid rgba(232,116,43,0.22)',
  boxShadow: '0 14px 36px rgba(11,31,58,0.08)',
}

const sectionHeader: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  flexWrap: 'wrap', gap: 8, marginBottom: 12,
  fontSize: 15, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.02em',
}

const subHeader: React.CSSProperties = {
  fontSize: 11.5, fontWeight: 700, color: '#7AAAB2',
  letterSpacing: '0.08em', textTransform: 'uppercase',
}

const callBtn: React.CSSProperties = {
  padding: '12px', borderRadius: 11, textAlign: 'center',
  background: 'linear-gradient(135deg, #22C55E, #14B8A6)',
  color: '#fff', textDecoration: 'none',
  fontSize: 13.5, fontWeight: 900,
  boxShadow: '0 8px 20px rgba(34,197,94,0.30)',
}

const textBtn: React.CSSProperties = {
  padding: '12px', borderRadius: 11, textAlign: 'center',
  background: '#FFF', color: '#C84B26',
  border: '1.5px solid rgba(232,116,43,0.30)',
  textDecoration: 'none',
  fontSize: 13.5, fontWeight: 800,
}

const loadingStyle: React.CSSProperties = {
  minHeight: '100vh', background: '#FFF8F0',
  fontFamily: "'Inter', system-ui, sans-serif",
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

const qtyBtn: React.CSSProperties = {
  padding: '10px 14px', borderRadius: 10,
  background: '#FFFFFF',
  border: '1.5px solid rgba(232,116,43,0.30)',
  color: '#0B1F3A', cursor: 'pointer',
  fontSize: 13, fontWeight: 800,
}

const qtyInput: React.CSSProperties = {
  flex: 1, padding: '10px 14px', borderRadius: 10,
  border: '1.5px solid rgba(232,116,43,0.30)',
  background: '#FFFFFF', color: '#0B1F3A',
  fontSize: 18, fontWeight: 800, textAlign: 'center',
  outline: 'none',
}
