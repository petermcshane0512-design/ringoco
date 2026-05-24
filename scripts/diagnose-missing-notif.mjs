#!/usr/bin/env node
/**
 * Diagnose why Peter didn't receive SMS/email after his demo call to
 * +17739857413. Pulls data from Supabase + Vapi + Twilio directly so
 * we don't have to wait on Vercel deploys or admin secrets.
 *
 * Usage: node scripts/diagnose-missing-notif.mjs
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Prefer .env.production (just pulled from Vercel), fall back to .env.local
const envPath = fs.existsSync(path.resolve(__dirname, '..', '.env.production'))
  ? path.resolve(__dirname, '..', '.env.production')
  : path.resolve(__dirname, '..', '.env.local')
console.log(`Loading env from ${envPath}`)
const env = {}
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  // Match KEY=value where value can contain anything (including = signs)
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function main() {
  console.log('=== STEP 1: Find Peter\'s profile by twilio_number=+17739857413 ===')
  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('twilio_number', '+17739857413')
    .maybeSingle()
  if (pErr) {
    console.error('Profile query error:', pErr)
    return
  }
  if (!profile) {
    console.log('No profile bound to +17739857413. Trying owner_phone=+17737109565...')
    const { data: byOwner } = await supabase
      .from('profiles')
      .select('*')
      .eq('owner_phone', '+17737109565')
      .maybeSingle()
    if (byOwner) {
      console.log('Found by owner_phone:', JSON.stringify(byOwner, null, 2))
    } else {
      console.log('No profile with that owner_phone either.')
    }
    return
  }

  console.log('\nProfile found:')
  console.log({
    user_id: profile.user_id,
    business_name: profile.business_name,
    owner_first_name: profile.owner_first_name,
    owner_phone: profile.owner_phone,
    backup_owner_phone: profile.backup_owner_phone,
    twilio_number: profile.twilio_number,
    plan_tier: profile.plan_tier,
    is_active: profile.is_active,
    vapi_assistant_id: profile.vapi_assistant_id,
    vapi_phone_number_id: profile.vapi_phone_number_id,
    first_call_at: profile.first_call_at,
    forwarding_verified_at: profile.forwarding_verified_at,
  })

  console.log('\n=== STEP 2: Most recent call_logs for this user_id ===')
  const { data: calls } = await supabase
    .from('call_logs')
    .select('*')
    .eq('user_id', profile.user_id)
    .order('created_at', { ascending: false })
    .limit(3)
  console.log(`Found ${calls?.length || 0} call_logs rows.`)
  for (const [i, c] of (calls || []).entries()) {
    console.log(`\n--- Call ${i + 1} (${c.created_at}) ---`)
    console.log({
      call_sid: c.call_sid,
      caller_phone: c.caller_phone,
      job_created: c.job_created,
      booking_completed: c.booking_completed,
      summary_preview: c.summary?.slice(0, 200),
      transcript_chars: c.transcript?.length || 0,
    })
  }

  console.log('\n=== STEP 3: Most recent jobs for this user_id ===')
  const { data: jobs } = await supabase
    .from('jobs')
    .select('*')
    .eq('user_id', profile.user_id)
    .order('created_at', { ascending: false })
    .limit(3)
  console.log(`Found ${jobs?.length || 0} jobs rows.`)
  for (const j of jobs || []) {
    console.log({
      created_at: j.created_at,
      customer_name: j.customer_name,
      customer_phone: j.customer_phone,
      job_type: j.job_type,
      status: j.status,
    })
  }

  console.log('\n=== STEP 4: Vapi assistant config ===')
  if (profile.vapi_assistant_id && env.VAPI_API_KEY) {
    const r = await fetch(`https://api.vapi.ai/assistant/${profile.vapi_assistant_id}`, {
      headers: { Authorization: `Bearer ${env.VAPI_API_KEY}` },
    })
    if (r.ok) {
      const a = await r.json()
      console.log({
        id: a.id,
        name: a.name,
        metadata: a.metadata,
        firstMessage: a.firstMessage?.slice(0, 100),
        tool_names: a.model?.tools?.map((t) => t.function?.name),
        serverUrl: a.serverUrl,
        serverMessages: a.serverMessages,
      })
    } else {
      console.log('Vapi assistant fetch failed:', r.status, await r.text())
    }
  }

  console.log('\n=== STEP 5: Recent Vapi calls for this assistant ===')
  if (profile.vapi_assistant_id && env.VAPI_API_KEY) {
    const r = await fetch(
      `https://api.vapi.ai/call?assistantId=${profile.vapi_assistant_id}&limit=5`,
      { headers: { Authorization: `Bearer ${env.VAPI_API_KEY}` } },
    )
    if (r.ok) {
      const calls = await r.json()
      console.log(`Found ${calls.length} Vapi calls.`)
      for (const [i, c] of calls.entries()) {
        console.log(`\n--- Vapi call ${i + 1} ---`)
        console.log({
          id: c.id,
          createdAt: c.createdAt,
          endedAt: c.endedAt,
          endedReason: c.endedReason,
          phoneNumber: c.phoneNumber?.number,
          customer: c.customer?.number,
          cost: c.cost,
          assistantOverrides_metadata: c.assistantOverrides?.metadata,
          summary_preview: c.summary?.slice(0, 200),
          analysis_success: c.analysis?.successEvaluation,
        })
        if (c.messages) {
          const toolCalls = c.messages.filter((m) => m.toolCalls || m.role === 'tool_calls' || m.toolCallId)
          console.log(`  Tool calls in transcript: ${toolCalls.length}`)
          for (const tc of toolCalls.slice(0, 3)) {
            console.log('  TC:', JSON.stringify(tc).slice(0, 300))
          }
        }
      }
    } else {
      console.log('Vapi calls fetch failed:', r.status, await r.text())
    }
  }

  console.log('\n=== STEP 6: Twilio recent SMS attempts to/from +17737109565 ===')
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
    const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64')
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const r = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json?` +
        `To=%2B17737109565&PageSize=10`,
      { headers: { Authorization: `Basic ${auth}` } },
    )
    if (r.ok) {
      const data = await r.json()
      console.log(`Found ${data.messages?.length || 0} SMS to +17737109565 in last batch.`)
      for (const m of (data.messages || []).slice(0, 5)) {
        console.log({
          date_sent: m.date_sent,
          from: m.from,
          status: m.status,
          error_code: m.error_code,
          error_message: m.error_message,
          body_preview: m.body?.slice(0, 100),
        })
      }
    } else {
      console.log('Twilio fetch failed:', r.status, await r.text())
    }
  }

  console.log('\n=== STEP 7: Env presence check ===')
  console.log({
    RESEND_API_KEY: !!env.RESEND_API_KEY,
    FALLBACK_OWNER_PHONE: env.FALLBACK_OWNER_PHONE || '(not set)',
    FALLBACK_OWNER_EMAIL: env.FALLBACK_OWNER_EMAIL || '(not set — defaults to bellavegollc@gmail.com)',
    TWILIO_DEMO_NUMBER: env.TWILIO_DEMO_NUMBER || '(not set)',
    VAPI_WEBHOOK_SECRET: !!env.VAPI_WEBHOOK_SECRET,
  })

  console.log('\n=== STEP 8: Test Resend API key validity ===')
  if (env.RESEND_API_KEY) {
    const r = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
    })
    console.log('Resend /domains status:', r.status)
    if (r.ok) {
      const d = await r.json()
      console.log(
        'Verified domains:',
        (d.data || []).map((x) => ({ name: x.name, status: x.status })),
      )
    } else {
      console.log('Resend body:', (await r.text()).slice(0, 200))
    }
  }
}

main().catch((e) => {
  console.error('SCRIPT THREW:', e)
  process.exit(1)
})
