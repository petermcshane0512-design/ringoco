/**
 * Notification fan-out. Customer gets an SMS + email when an AI artifact is ready
 * (weekly strategy report, new ad creatives queued for approval, new lead drip
 * results, etc.).
 *
 * SMS via Twilio (already integrated). Email via Resend — only sends if
 * RESEND_API_KEY is set. Email is non-blocking: if it fails, SMS still goes.
 */

import twilio from 'twilio'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from './email'

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)

export type NotifyChannel = 'sms' | 'email'

export async function notifyArtifactReady(args: {
  supabase: SupabaseClient
  userId: string
  artifactType: 'weekly_report' | 'ad_creatives' | 'leads_drip' | 'permit_alert' | 'weather_alert'
  title: string
  shortBody: string
  publicUrl: string
}): Promise<{ sms: boolean; email: boolean }> {
  const { data: profile } = await args.supabase
    .from('profiles')
    .select('owner_phone, business_name, twilio_number')
    .eq('user_id', args.userId)
    .maybeSingle()

  if (!profile?.owner_phone) {
    console.warn('[notify] no owner_phone for', args.userId)
    return { sms: false, email: false }
  }

  const fromNumber = (profile as { twilio_number?: string }).twilio_number || process.env.TWILIO_PHONE_NUMBER!

  // SMS
  let smsOk = false
  try {
    const smsBody = `BellAveGo: ${args.title}\n${args.shortBody}\n${args.publicUrl}`
    await twilioClient.messages.create({ body: smsBody, from: fromNumber, to: profile.owner_phone })
    smsOk = true
  } catch (e) {
    console.error('[notify] sms failed:', e)
  }

  // Email (best-effort, may be skipped)
  let emailOk = false
  const ownerEmail = await lookupOwnerEmail(args.userId)
  if (ownerEmail) {
    const html = renderEmailHtml({
      title: args.title,
      body: args.shortBody,
      url: args.publicUrl,
      businessName: profile.business_name ?? 'your business',
    })
    const result = await sendEmail({ to: ownerEmail, subject: args.title, html })
    emailOk = result.ok
  }

  return { sms: smsOk, email: emailOk }
}

export async function lookupOwnerEmail(userId: string): Promise<string | null> {
  // Lazy-import Clerk to keep this util cheap when called from Vercel functions.
  // Prefer the primary email — Clerk returns emailAddresses[] in insertion order,
  // so [0] may not be the address the contractor actually checks if they verified
  // a second address later (work email added after signup, etc.).
  try {
    const { clerkClient } = await import('@clerk/nextjs/server')
    const client = await clerkClient()
    const u = await client.users.getUser(userId)
    const primaryId = u.primaryEmailAddressId
    const primary = primaryId ? u.emailAddresses?.find((e) => e.id === primaryId) : null
    return primary?.emailAddress ?? u.emailAddresses?.[0]?.emailAddress ?? null
  } catch (e) {
    console.error('[notify] clerk lookup failed:', e)
    return null
  }
}

function renderEmailHtml(args: { title: string; body: string; url: string; businessName: string }): string {
  return `<!doctype html><html><body style="font-family:'Inter',system-ui,sans-serif;background:#F2F9F5;margin:0;padding:32px;color:#0B1F3A">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:36px 32px;box-shadow:0 2px 16px rgba(7,27,58,0.08)">
      <p style="color:#0AA89F;font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;margin:0 0 10px">BellAveGo · ${args.businessName}</p>
      <h1 style="font-size:24px;font-weight:900;margin:0 0 14px;letter-spacing:-0.5px">${args.title}</h1>
      <p style="font-size:15px;line-height:1.55;color:#4A6670;margin:0 0 24px">${args.body}</p>
      <a href="${args.url}" style="display:inline-block;padding:14px 26px;background:linear-gradient(135deg,#0AA89F 0%,#0D8F87 100%);color:#fff;font-weight:800;text-decoration:none;border-radius:10px;font-size:14px">Open report →</a>
      <p style="font-size:12px;color:#7AAAB2;margin:28px 0 0;line-height:1.5">This is an automated weekly insight from your BellAveGo AI Account Manager. Reply STOP to peter@bellavego.com to pause weekly emails.</p>
    </div>
  </body></html>`
}
