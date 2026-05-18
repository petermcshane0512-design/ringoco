import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import twilio from 'twilio'
import { TIER_METADATA, type Tier } from './pricing'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)

/**
 * Referral system.
 *
 * Model: each contractor gets a unique referral code (BAVG-XXXXXX). When they
 * share a link like https://www.bellavego.com/?ref=BAVG-MK7H2X, the middleware
 * captures the code into a 90-day cookie. When the visitor signs up, we save
 * the cookie value to profiles.referred_by.
 *
 * Two-stage credit flow (anti-abuse v2 — built May 2026):
 *   1. PENDING — on first Stripe checkout, recordPendingReferral() inserts a
 *      'pending' referrals row. NO credit fires yet.
 *   2. CREDITED — on any subsequent invoice.payment_succeeded for that
 *      subscription, applyPendingReferralCredit() checks if the referred
 *      customer's subscription is >31 days old. If yes (they survived the
 *      30-day money-back window), the referrer gets a Stripe customer-balance
 *      credit equal to their CURRENT tier monthly price.
 *   3. VOIDED — if the referred customer cancels OR refunds before day 31,
 *      voidPendingReferral() marks the referral 'voided' so it never converts.
 *
 * Why this matters: without the wait, a single bad actor could sign up under
 * their own friend's referral link, take the 30-day refund, and still leave
 * the friend with a free month. The 31-day gate kills that loop.
 *
 * Credit delivery: Stripe customer balance — Stripe automatically deducts
 * the credit from the referrer's next invoice. No manual ops.
 *
 * Anti-abuse v2:
 *   - Can't self-refer (same userId blocked)
 *   - One credit per referred user (UNIQUE constraint on referrals.referred_user_id)
 *   - Referrer must still be an active paying customer when credit fires
 *   - Referred subscription must be >31 days old (past refund window)
 *   - Pending referrals voided on subscription cancellation
 *
 * v3 ideas (not built): max credits/year cap per referrer, pattern-based
 * fraud detection, optional double-sided reward (also discount new customer).
 */
const QUALIFYING_AGE_DAYS = 31

const CODE_PREFIX = 'BAVG-'
const CODE_BODY_LENGTH = 6
// Excludes I, O, 0, 1 to avoid visual ambiguity when shared verbally.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateCode(): string {
  let body = ''
  for (let i = 0; i < CODE_BODY_LENGTH; i++) {
    body += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return CODE_PREFIX + body
}

/**
 * Idempotently return a referral code for the given user.
 * Generates and persists one if missing. Retries on the rare UNIQUE collision.
 */
export async function getOrCreateReferralCode(userId: string): Promise<string | null> {
  const { data: existing } = await supabase
    .from('profiles')
    .select('referral_code')
    .eq('user_id', userId)
    .maybeSingle()

  const current = (existing as { referral_code?: string | null } | null)?.referral_code
  if (current) return current

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode()
    const { error } = await supabase
      .from('profiles')
      .update({ referral_code: code })
      .eq('user_id', userId)
    if (!error) return code
    // 23505 = UNIQUE violation — try a new code
    if (!String(error.code).startsWith('23')) {
      console.error('getOrCreateReferralCode update failed:', error)
      return null
    }
  }
  console.error('getOrCreateReferralCode: exhausted code-generation retries')
  return null
}

/**
 * Save referral attribution to a newly created profile.
 * Called from onboarding when a signed-in user completes profile setup
 * with a bavg_ref cookie present.
 *
 * Skips self-referral, duplicate attribution, and codes that don't resolve
 * to a real account.
 */
export async function attributeReferralOnSignup(args: {
  newUserId: string
  referralCode: string
}): Promise<{ ok: boolean; reason?: string }> {
  const { newUserId, referralCode } = args
  const code = referralCode.toUpperCase().trim()
  if (!/^BAVG-[A-Z0-9]{6}$/.test(code)) return { ok: false, reason: 'invalid code format' }

  // Don't overwrite existing attribution (first-touch wins)
  const { data: profile } = await supabase
    .from('profiles')
    .select('user_id, referred_by')
    .eq('user_id', newUserId)
    .maybeSingle()
  if (!profile) return { ok: false, reason: 'profile not found' }
  if ((profile as { referred_by?: string | null }).referred_by) {
    return { ok: false, reason: 'already attributed' }
  }

  // Resolve code to a referrer user — must exist + not be the new user
  const { data: referrer } = await supabase
    .from('profiles')
    .select('user_id, referral_code')
    .eq('referral_code', code)
    .maybeSingle()
  if (!referrer) return { ok: false, reason: 'code does not resolve to a customer' }
  if ((referrer as { user_id: string }).user_id === newUserId) {
    return { ok: false, reason: 'self-referral blocked' }
  }

  await supabase
    .from('profiles')
    .update({ referred_by: code })
    .eq('user_id', newUserId)

  return { ok: true }
}

/**
 * STAGE 1 — Called from Stripe webhook after checkout.session.completed.
 *
 * Records a PENDING referral row. NO Stripe credit fires yet. The actual
 * credit waits until applyPendingReferralCredit() sees the referred
 * customer's subscription survive past day 31 (so they can't refund + leave
 * the referrer with a free month).
 *
 * Sends a "thanks for the referral, credit applies after their second month"
 * SMS to the referrer so they know it's tracked without overpromising.
 */
export async function recordPendingReferral(args: {
  newUserId: string
  subscriptionId: string
  subscriptionCreatedISO: string
}): Promise<{ ok: boolean; reason?: string }> {
  const { newUserId, subscriptionId, subscriptionCreatedISO } = args

  const { data: newProfile } = await supabase
    .from('profiles')
    .select('user_id, business_name, referred_by, plan_tier')
    .eq('user_id', newUserId)
    .maybeSingle()
  if (!newProfile) return { ok: false, reason: 'new customer profile not found' }

  const referralCode = (newProfile as { referred_by?: string | null }).referred_by
  if (!referralCode) return { ok: false, reason: 'no referral attribution' }

  const { data: referrer } = await supabase
    .from('profiles')
    .select('user_id, business_name, owner_phone, plan_tier, stripe_customer_id, is_active')
    .eq('referral_code', referralCode)
    .maybeSingle()
  if (!referrer) return { ok: false, reason: 'referrer profile not found' }

  const ref = referrer as {
    user_id: string
    business_name?: string | null
    owner_phone?: string | null
    plan_tier?: string | null
    stripe_customer_id?: string | null
    is_active?: boolean | null
  }

  if (ref.user_id === newUserId) return { ok: false, reason: 'self-referral blocked' }

  // Idempotency — UNIQUE on referred_user_id means re-insert will throw 23505
  const { data: existing } = await supabase
    .from('referrals')
    .select('id, status')
    .eq('referred_user_id', newUserId)
    .maybeSingle()
  if (existing) return { ok: false, reason: 'referral already recorded' }

  // Quote what the credit WILL be at qualifying time (referrer's current tier).
  // Real amount is recomputed at credit-fire time in case their tier changes.
  const tier = (ref.plan_tier ?? 'receptionist') as Tier
  const meta = TIER_METADATA[tier]
  const projectedAmount = meta?.monthly ?? 0

  try {
    await supabase.from('referrals').insert({
      referrer_user_id: ref.user_id,
      referred_user_id: newUserId,
      referral_code: referralCode,
      status: 'pending',
      referred_subscription_id: subscriptionId,
      referred_subscription_started_at: subscriptionCreatedISO,
    })
  } catch (e) {
    console.error('recordPendingReferral: insert failed:', e)
    return { ok: false, reason: 'db insert failed' }
  }

  // Heads-up SMS to referrer (honest framing: "credit applies after they stick")
  if (ref.owner_phone && projectedAmount > 0) {
    try {
      await twilioClient.messages.create({
        body:
          `🎉 ${newProfile.business_name ?? 'A new contractor'} just signed up using your BellAveGo referral link! ` +
          `Once they complete their second month (past the 30-day money-back window), your next bill ($${projectedAmount}) is on us.`,
        from: process.env.TWILIO_PHONE_NUMBER!,
        to: ref.owner_phone,
      })
    } catch (e) {
      console.error('recordPendingReferral: SMS to referrer failed:', e)
    }
  }

  return { ok: true }
}

/**
 * STAGE 2 — Called from Stripe webhook on invoice.payment_succeeded.
 *
 * For each invoice payment, checks if a pending referral exists for this
 * subscription AND the subscription is at least QUALIFYING_AGE_DAYS old.
 * If both, grants the Stripe credit to the referrer and flips status to
 * 'credited'.
 *
 * Runs on EVERY invoice payment but is a no-op when:
 *   - No pending referral exists (already credited or none ever)
 *   - Subscription is too young (still inside refund window)
 *   - Referrer is no longer active or has no Stripe customer
 */
export async function applyPendingReferralCredit(args: {
  subscriptionId: string
}): Promise<{ ok: boolean; credited?: number; reason?: string }> {
  const { subscriptionId } = args

  // Find any pending referral tied to this subscription
  const { data: pendingRow } = await supabase
    .from('referrals')
    .select('id, referrer_user_id, referred_user_id, referral_code, referred_subscription_started_at, status')
    .eq('referred_subscription_id', subscriptionId)
    .eq('status', 'pending')
    .maybeSingle()

  if (!pendingRow) return { ok: false, reason: 'no pending referral for this subscription' }

  const pending = pendingRow as {
    id: string
    referrer_user_id: string
    referred_user_id: string
    referral_code: string
    referred_subscription_started_at: string | null
    status: string
  }

  // Qualifying age check — referred sub must be older than the refund window
  const startedAt = pending.referred_subscription_started_at
    ? new Date(pending.referred_subscription_started_at).getTime()
    : 0
  const ageDays = startedAt > 0 ? (Date.now() - startedAt) / (1000 * 60 * 60 * 24) : 0
  if (ageDays < QUALIFYING_AGE_DAYS) {
    return { ok: false, reason: `subscription only ${Math.floor(ageDays)} days old — needs ${QUALIFYING_AGE_DAYS}+` }
  }

  // Load referrer current state
  const { data: referrer } = await supabase
    .from('profiles')
    .select('user_id, business_name, owner_phone, plan_tier, stripe_customer_id, is_active')
    .eq('user_id', pending.referrer_user_id)
    .maybeSingle()
  if (!referrer) return { ok: false, reason: 'referrer profile gone' }

  const ref = referrer as {
    user_id: string
    business_name?: string | null
    owner_phone?: string | null
    plan_tier?: string | null
    stripe_customer_id?: string | null
    is_active?: boolean | null
  }
  if (!ref.stripe_customer_id) return { ok: false, reason: 'referrer has no Stripe customer' }
  if (ref.is_active === false) return { ok: false, reason: 'referrer is not active' }

  // Load referred customer for the SMS message
  const { data: refdProfile } = await supabase
    .from('profiles')
    .select('business_name')
    .eq('user_id', pending.referred_user_id)
    .maybeSingle()
  const refdName = (refdProfile as { business_name?: string | null } | null)?.business_name ?? 'A contractor'

  const tier = (ref.plan_tier ?? 'receptionist') as Tier
  const meta = TIER_METADATA[tier]
  if (!meta) return { ok: false, reason: `unknown referrer tier: ${ref.plan_tier}` }
  const amountCents = meta.monthly * 100

  // Grant the Stripe customer-balance credit
  let stripeBalanceTxnId: string | undefined
  try {
    const txn = await stripe.customers.createBalanceTransaction(ref.stripe_customer_id, {
      amount: -amountCents,
      currency: 'usd',
      description: `BellAveGo referral credit — ${refdName} (signed up via ${pending.referral_code}) completed month 2`,
    })
    stripeBalanceTxnId = txn.id
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('applyPendingReferralCredit: Stripe credit failed:', msg)
    return { ok: false, reason: `Stripe credit failed: ${msg}` }
  }

  // Flip status to 'credited'
  try {
    await supabase.from('referrals').update({
      status: 'credited',
      credit_amount_cents: amountCents,
      stripe_balance_txn_id: stripeBalanceTxnId,
      credit_applied_at: new Date().toISOString(),
    }).eq('id', pending.id)
  } catch (e) {
    console.error('applyPendingReferralCredit: status flip failed (credit still applied):', e)
  }

  // Celebration SMS
  if (ref.owner_phone) {
    try {
      await twilioClient.messages.create({
        body:
          `🎁 Boom — ${refdName} stuck with BellAveGo past their second month, so your next bill ($${meta.monthly}) is on us. ` +
          `Credit auto-applied to your account. Thanks for the referral!`,
        from: process.env.TWILIO_PHONE_NUMBER!,
        to: ref.owner_phone,
      })
    } catch (e) {
      console.error('applyPendingReferralCredit: SMS to referrer failed:', e)
    }
  }

  return { ok: true, credited: meta.monthly }
}

/**
 * Mark a pending referral as voided when the referred customer cancels or
 * fully refunds before reaching the qualifying age. Idempotent — only acts
 * on rows in 'pending' status; already-credited referrals are untouched.
 */
export async function voidPendingReferral(args: {
  subscriptionId: string
  reason: string
}): Promise<{ ok: boolean; voided: boolean }> {
  const { subscriptionId, reason } = args
  const { data } = await supabase
    .from('referrals')
    .update({ status: 'voided', voided_at: new Date().toISOString(), voided_reason: reason })
    .eq('referred_subscription_id', subscriptionId)
    .eq('status', 'pending')
    .select('id')
  return { ok: true, voided: (data?.length ?? 0) > 0 }
}

/**
 * Build the share URL for a contractor's referral page.
 */
export function buildShareUrl(code: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost'))
    ? process.env.NEXT_PUBLIC_APP_URL
    : 'https://www.bellavego.com'
  return `${base}/?ref=${code}`
}

/**
 * Count + earnings summary for a contractor's referral dashboard widget.
 * Breaks out pending vs credited so the referrer can see in-flight referrals
 * (signed up but still inside the 30-day refund window).
 */
export async function getReferralStats(userId: string): Promise<{
  pendingCount: number
  creditedCount: number
  totalCount: number
  totalCreditCents: number
}> {
  const { data: rows } = await supabase
    .from('referrals')
    .select('credit_amount_cents, status')
    .eq('referrer_user_id', userId)

  const list = (rows ?? []) as Array<{ credit_amount_cents: number | null; status: string | null }>
  let pending = 0
  let credited = 0
  let total = 0
  for (const r of list) {
    if (r.status === 'pending') pending++
    else if (r.status === 'credited') credited++
    total += r.credit_amount_cents ?? 0
  }
  return {
    pendingCount: pending,
    creditedCount: credited,
    totalCount: list.filter(r => r.status !== 'voided').length,
    totalCreditCents: total,
  }
}
