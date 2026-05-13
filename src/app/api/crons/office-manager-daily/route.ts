import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import Anthropic from '@anthropic-ai/sdk'
import { OFFICE_MGR_TIERS } from '@/lib/pricing'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
const anthropic = new Anthropic()

/**
 * AI Office Manager daily orchestrator.
 *
 * Runs ONCE per day (Vercel Hobby plan = 1 cron/day, so all three Office Mgr
 * agents share this single hook). Runs:
 *
 *   1. Quote Hunter follow-ups — SMS prospects who got a quote 2/7/14 days ago
 *   2. Collections chases — SMS customers with past-due invoices
 *   3. Reviews-reply drafts — poll Google Places for new reviews, draft replies via Claude
 *
 * Each module is tier-gated (only Office Manager + Concierge customers run).
 * Errors in one don't stop the others. Returns per-module stats.
 */

export async function GET(req: NextRequest) {
  // Vercel cron sends Authorization: Bearer ${CRON_SECRET} when CRON_SECRET is set.
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  if (cronSecret && authHeader && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const stats = {
    quote_followups_sent: 0,
    quote_followups_errors: 0,
    collections_chases_sent: 0,
    collections_chases_errors: 0,
    reviews_drafted: 0,
    reviews_errors: 0,
  }

  // ── 1. Quote Hunter follow-ups ─────────────────────────────
  try {
    const { data: quotes } = await supabase
      .from('quote_followups')
      .select('*')
      .eq('status', 'pending')
      .lte('next_followup_at', new Date().toISOString())
      .limit(100)

    for (const q of quotes ?? []) {
      const result = await sendQuoteFollowup(q)
      if (result === 'sent') stats.quote_followups_sent++
      else stats.quote_followups_errors++
    }
  } catch (e) {
    console.error('quote-hunter loop failed', e)
  }

  // ── 2. Collections chases ──────────────────────────────────
  try {
    const { data: invoices } = await supabase
      .from('invoice_followups')
      .select('*')
      .eq('status', 'pending')
      .lte('next_chase_at', new Date().toISOString())
      .limit(100)

    for (const inv of invoices ?? []) {
      const result = await sendCollectionChase(inv)
      if (result === 'sent') stats.collections_chases_sent++
      else stats.collections_chases_errors++
    }
  } catch (e) {
    console.error('collections loop failed', e)
  }

  // ── 3. Reviews-reply drafts ────────────────────────────────
  // Only runs if GOOGLE_PLACES_API_KEY is configured.
  if (process.env.GOOGLE_PLACES_API_KEY) {
    try {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, business_name, owner_phone, twilio_number, google_place_id, plan_tier, is_active, ai_tone')
        .not('google_place_id', 'is', null)
        .eq('is_active', true)
        .limit(100)

      for (const p of profiles ?? []) {
        if (!OFFICE_MGR_TIERS.has(p.plan_tier ?? '')) continue
        const result = await draftReviewRepliesForProfile(p)
        stats.reviews_drafted += result.drafted
        stats.reviews_errors += result.errors
      }
    } catch (e) {
      console.error('reviews-draft loop failed', e)
    }
  }

  // Log the run
  await supabase.from('agent_runs').insert({
    agent: 'office-manager-daily',
    notes: JSON.stringify(stats),
  })

  return NextResponse.json({ ok: true, ...stats })
}

// ── Module 1: Quote Hunter ──────────────────────────────────

type QuoteRow = {
  id: string
  user_id: string
  customer_name: string | null
  customer_phone: string
  quote_amount: number | null
  quote_description: string | null
  followup_count: number | null
}

async function sendQuoteFollowup(q: QuoteRow): Promise<'sent' | 'error'> {
  // Get the customer's profile (business_name, twilio_number, plan_tier)
  const { data: profile } = await supabase
    .from('profiles')
    .select('business_name, twilio_number, plan_tier, is_active')
    .eq('user_id', q.user_id)
    .maybeSingle()

  if (!profile?.is_active || !OFFICE_MGR_TIERS.has(profile.plan_tier ?? '')) {
    // Customer downgraded or cancelled — stop chasing
    await supabase.from('quote_followups').update({ status: 'expired' }).eq('id', q.id)
    return 'error'
  }

  const fromNumber = profile.twilio_number || process.env.TWILIO_PHONE_NUMBER!
  const count = q.followup_count ?? 0

  // Progressive messaging — softer to firmer
  const messages = [
    // Day 2 — gentle
    `Hi ${q.customer_name?.split(' ')[0] || 'there'}, ${profile.business_name || 'our team'} here. Just checking in on the ${q.quote_description || 'service'} quote we sent. Happy to answer any questions — reply here or call us anytime.`,
    // Day 7 — value reinforcement
    `Hi ${q.customer_name?.split(' ')[0] || 'there'}, wanted to follow up on the ${q.quote_description || 'quote'}${q.quote_amount ? ` ($${q.quote_amount.toFixed(0)})` : ''} from ${profile.business_name || 'us'}. We've got availability next week if you'd like to lock in a date. Reply YES to schedule.`,
    // Day 14 — last touch
    `Hi ${q.customer_name?.split(' ')[0] || 'there'}, last check-in from ${profile.business_name || 'us'} on the ${q.quote_description || 'quote'}. If the timing isn't right, totally fair — just let us know so we can stop reaching out. Otherwise we're ready when you are.`,
  ]

  const messageBody = messages[Math.min(count, messages.length - 1)]
  const nextDays = [5, 7, 0][Math.min(count, 2)] // day 2 → +5 to day 7 → +7 to day 14 → done
  const newCount = count + 1
  const nextFollowupAt = nextDays > 0 ? new Date(Date.now() + nextDays * 24 * 60 * 60 * 1000).toISOString() : null

  try {
    await twilioClient.messages.create({
      body: messageBody,
      from: fromNumber,
      to: q.customer_phone,
    })
    await supabase.from('quote_followups').update({
      followup_count: newCount,
      last_followup_at: new Date().toISOString(),
      next_followup_at: nextFollowupAt,
      status: nextFollowupAt ? 'pending' : 'expired',
    }).eq('id', q.id)
    return 'sent'
  } catch (e) {
    console.error('quote-hunter SMS failed', q.id, e)
    return 'error'
  }
}

// ── Module 2: Collections ───────────────────────────────────

type InvoiceRow = {
  id: string
  user_id: string
  customer_name: string | null
  customer_phone: string
  invoice_amount: number
  invoice_description: string | null
  stripe_payment_link: string | null
  chase_count: number | null
}

async function sendCollectionChase(inv: InvoiceRow): Promise<'sent' | 'error'> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('business_name, twilio_number, plan_tier, is_active')
    .eq('user_id', inv.user_id)
    .maybeSingle()

  if (!profile?.is_active || !OFFICE_MGR_TIERS.has(profile.plan_tier ?? '')) {
    await supabase.from('invoice_followups').update({ status: 'written_off' }).eq('id', inv.id)
    return 'error'
  }

  const fromNumber = profile.twilio_number || process.env.TWILIO_PHONE_NUMBER!
  const count = inv.chase_count ?? 0
  const payLink = inv.stripe_payment_link || `mailto:${profile.business_name?.toLowerCase().replace(/\W+/g, '') || 'us'}`

  const messages = [
    // Day 2 after due
    `Hi ${inv.customer_name?.split(' ')[0] || 'there'}, friendly nudge — your invoice from ${profile.business_name || 'us'} for $${inv.invoice_amount.toFixed(0)} is past due. Pay in 30 seconds: ${payLink}`,
    // Day 7
    `Hi ${inv.customer_name?.split(' ')[0] || 'there'}, second reminder on your $${inv.invoice_amount.toFixed(0)} invoice from ${profile.business_name || 'us'}. Need to set up a payment plan? Reply here. Otherwise pay now: ${payLink}`,
    // Day 14
    `${inv.customer_name?.split(' ')[0] || 'Hi'} — your $${inv.invoice_amount.toFixed(0)} invoice from ${profile.business_name || 'us'} is now 2 weeks past due. Pay before it goes to collections: ${payLink}. Or reply to set up a plan.`,
    // Day 30
    `Final notice from ${profile.business_name || 'us'}: $${inv.invoice_amount.toFixed(0)} invoice is 30 days overdue. Pay today to avoid further action: ${payLink}`,
  ]

  const messageBody = messages[Math.min(count, messages.length - 1)]
  const nextDays = [5, 7, 16, 0][Math.min(count, 3)]
  const newCount = count + 1
  const nextChaseAt = nextDays > 0 ? new Date(Date.now() + nextDays * 24 * 60 * 60 * 1000).toISOString() : null

  try {
    await twilioClient.messages.create({
      body: messageBody,
      from: fromNumber,
      to: inv.customer_phone,
    })
    await supabase.from('invoice_followups').update({
      chase_count: newCount,
      last_chase_at: new Date().toISOString(),
      next_chase_at: nextChaseAt,
      status: nextChaseAt ? 'pending' : 'written_off',
    }).eq('id', inv.id)
    return 'sent'
  } catch (e) {
    console.error('collections SMS failed', inv.id, e)
    return 'error'
  }
}

// ── Module 3: Reviews-reply drafts ──────────────────────────

type ReviewableProfile = {
  user_id: string
  business_name: string | null
  owner_phone: string | null
  twilio_number: string | null
  google_place_id: string | null
  ai_tone: string | null
}

type GoogleReview = {
  name?: string
  rating: number
  text?: { text: string }
  authorAttribution?: { displayName: string }
  publishTime?: string
}

async function draftReviewRepliesForProfile(p: ReviewableProfile): Promise<{ drafted: number; errors: number }> {
  if (!p.google_place_id || !p.user_id) return { drafted: 0, errors: 0 }

  let reviews: GoogleReview[] = []
  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${p.google_place_id}`, {
      headers: {
        'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY!,
        'X-Goog-FieldMask': 'reviews',
      },
    })
    if (!res.ok) return { drafted: 0, errors: 1 }
    const data = (await res.json()) as { reviews?: GoogleReview[] }
    reviews = data.reviews ?? []
  } catch (e) {
    console.error('places fetch failed for', p.user_id, e)
    return { drafted: 0, errors: 1 }
  }

  let drafted = 0
  let errors = 0

  for (const r of reviews.slice(0, 5)) {
    if (!r.name) continue
    const reviewId = r.name // unique Google review resource name

    // De-dup check
    const { data: existing } = await supabase
      .from('review_drafts')
      .select('id')
      .eq('user_id', p.user_id)
      .eq('google_review_id', reviewId)
      .maybeSingle()
    if (existing) continue

    // Draft via Claude
    let draftedReply = ''
    try {
      const tone = p.ai_tone === 'professional' ? 'polished and formal' : 'warm and personable'
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 220,
        system:
          `Draft a reply from ${p.business_name || 'a home-service business'} to the customer's Google review. ` +
          `Tone: ${tone}. Length: 2-3 short sentences, max 80 words. Address them by first name if available. ` +
          `For 5-star reviews: thank them, reference something specific they mentioned, invite them back. ` +
          `For 1-3 star reviews: acknowledge the issue, apologize briefly, offer a direct phone number to make it right. Don't be defensive. ` +
          `Never say "leverage" "synergy" or "we strive" — sound like a real shop owner, not corporate.`,
        messages: [
          {
            role: 'user',
            content: `Customer: ${r.authorAttribution?.displayName ?? 'a customer'}\nRating: ${r.rating}/5\nReview: ${r.text?.text ?? '(no text)'}`,
          },
        ],
      })
      draftedReply = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    } catch (e) {
      console.error('claude review-draft failed', e)
      errors++
      continue
    }

    if (!draftedReply) continue

    await supabase.from('review_drafts').insert({
      user_id: p.user_id,
      google_review_id: reviewId,
      review_author: r.authorAttribution?.displayName,
      review_text: r.text?.text,
      review_rating: r.rating,
      drafted_reply: draftedReply,
      status: 'drafted',
    })

    // SMS the contractor with the draft
    if (p.owner_phone) {
      try {
        const ratingEmoji = r.rating >= 4 ? '⭐⭐⭐⭐⭐' : '⚠️'
        await twilioClient.messages.create({
          body:
            `${ratingEmoji} New Google review for ${p.business_name || 'your business'} (${r.rating}/5):\n\n` +
            `"${(r.text?.text ?? '').slice(0, 200)}${(r.text?.text?.length ?? 0) > 200 ? '…' : ''}"\n\n` +
            `📝 Draft reply:\n${draftedReply}\n\n` +
            `Copy + paste this into Google My Business if you like it. Reply EDIT for a different draft.`,
          from: p.twilio_number || process.env.TWILIO_PHONE_NUMBER!,
          to: p.owner_phone,
        })
      } catch (e) {
        console.error('review-draft SMS failed', e)
      }
    }
    drafted++
  }

  return { drafted, errors }
}
