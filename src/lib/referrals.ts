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
 * the cookie value to profiles.referred_by. When that new customer's first
 * Stripe checkout succeeds, applyReferralCredit() looks up the referrer and
 * grants them a one-month-free credit equal to their CURRENT tier's monthly
 * price (so a Mission Control referrer earns $397, an Operator referrer $797).
 *
 * Credit is delivered via Stripe customer balance — Stripe automatically
 * deducts it from the referrer's next invoice. No manual ops.
 *
 * Anti-abuse v1:
 *   - Can't self-refer (same userId blocked)
 *   - One credit per referred user (UNIQUE constraint on referrals.referred_user_id)
 *   - Referrer must still be an active paying customer when credit fires
 *
 * v2 ideas (not built): 30-day refund-protection wait, max credits/year cap,
 * fraud-detection on patterns, optional double-sided reward.
 */

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
 * Called from the Stripe webhook after checkout.session.completed.
 * Grants the referrer a free month if:
 *   1. The new customer has profiles.referred_by set
 *   2. The code resolves to a real referrer profile
 *   3. The referrer is an active paying customer with a Stripe customer ID
 *   4. We haven't already credited this referral
 *
 * The credit amount = the REFERRER's current tier monthly price (so a
 * Mission Control referrer earns $397, an Operator referrer $797). Stripe
 * applies it to the referrer's next invoice automatically.
 *
 * Also fires an SMS celebration to the referrer.
 */
export async function applyReferralCredit(args: {
  newUserId: string
}): Promise<{ ok: boolean; credited?: number; reason?: string }> {
  const { newUserId } = args

  const { data: newProfile } = await supabase
    .from('profiles')
    .select('user_id, business_name, referred_by, plan_tier')
    .eq('user_id', newUserId)
    .maybeSingle()
  if (!newProfile) return { ok: false, reason: 'new customer profile not found' }

  const referralCode = (newProfile as { referred_by?: string | null }).referred_by
  if (!referralCode) return { ok: false, reason: 'no referral attribution' }

  // Find the referrer
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
  if (!ref.stripe_customer_id) return { ok: false, reason: 'referrer has no Stripe customer' }
  if (ref.is_active === false) return { ok: false, reason: 'referrer is not active' }

  // Idempotency check — don't double-credit if webhook retries
  const { data: existingCredit } = await supabase
    .from('referrals')
    .select('id')
    .eq('referred_user_id', newUserId)
    .maybeSingle()
  if (existingCredit) return { ok: false, reason: 'already credited' }

  // Credit = referrer's current monthly price
  const tier = (ref.plan_tier ?? 'receptionist') as Tier
  const meta = TIER_METADATA[tier]
  if (!meta) return { ok: false, reason: `unknown referrer tier: ${ref.plan_tier}` }
  const amountCents = meta.monthly * 100

  // Grant Stripe customer balance credit (negative = credit toward future invoices)
  let stripeBalanceTxnId: string | undefined
  try {
    const txn = await stripe.customers.createBalanceTransaction(ref.stripe_customer_id, {
      amount: -amountCents,
      currency: 'usd',
      description: `BellAveGo referral credit — ${newProfile.business_name ?? 'new customer'} signed up via ${referralCode}`,
    })
    stripeBalanceTxnId = txn.id
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('applyReferralCredit: Stripe credit failed:', msg)
    return { ok: false, reason: `Stripe credit failed: ${msg}` }
  }

  // Record the referral row (UNIQUE on referred_user_id prevents duplicates)
  try {
    await supabase.from('referrals').insert({
      referrer_user_id: ref.user_id,
      referred_user_id: newUserId,
      referral_code: referralCode,
      credit_amount_cents: amountCents,
      stripe_balance_txn_id: stripeBalanceTxnId,
      credit_applied_at: new Date().toISOString(),
    })
  } catch (e) {
    // Non-fatal — the Stripe credit already landed. Log and move on.
    console.error('applyReferralCredit: referrals row insert failed (Stripe credit still applied):', e)
  }

  // SMS the referrer to celebrate
  if (ref.owner_phone) {
    try {
      await twilioClient.messages.create({
        body:
          `🎉 ${newProfile.business_name ?? 'A new customer'} just signed up using your referral link — ` +
          `your next BellAveGo bill ($${meta.monthly}) is on us. Thanks for spreading the word!`,
        from: process.env.TWILIO_PHONE_NUMBER!,
        to: ref.owner_phone,
      })
    } catch (e) {
      console.error('applyReferralCredit: SMS to referrer failed:', e)
    }
  }

  return { ok: true, credited: meta.monthly }
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
 */
export async function getReferralStats(userId: string): Promise<{
  count: number
  totalCreditCents: number
}> {
  const { data: rows } = await supabase
    .from('referrals')
    .select('credit_amount_cents')
    .eq('referrer_user_id', userId)

  const list = (rows ?? []) as Array<{ credit_amount_cents: number | null }>
  return {
    count: list.length,
    totalCreditCents: list.reduce((sum, r) => sum + (r.credit_amount_cents ?? 0), 0),
  }
}
