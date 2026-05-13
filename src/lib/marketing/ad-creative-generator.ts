/**
 * AI Ad Creative Generator. Mines the customer's actual call transcripts to
 * write Google Responsive Search Ads + Meta single-image ad copy in the customer's
 * own customers' words. This is the moat: competitors guess at copy, we use the real
 * language callers used when they were ready to buy.
 *
 * Generates pending_approval creatives. Concierge customers with auto-confirm enabled
 * can flip ad-creatives to live without review.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'

const anthropic = new Anthropic()

export type Creative = {
  platform: 'google_ads' | 'meta_ads'
  format: 'rsa' | 'image'
  headline: string
  description: string
  cta: string
  sourceTranscriptIds: string[]
}

export type GenerateResult = { generated: number; stored: number; failures: number }

const SYSTEM_PROMPT = `You are a direct-response ad copywriter for home-services SMBs.
You write ads grounded in the customer's REAL call transcripts — phrases that prospects actually used when calling about service.

Output rules:
- Google RSA: headline ≤ 30 chars, description ≤ 90 chars
- Meta image ad: headline ≤ 40 chars, description ≤ 125 chars
- Use action verbs. Mention price/urgency/local relevance when present in transcripts.
- Never invent prices, certifications, or guarantees not present in the transcripts or business profile.
- Output exactly 6 ad variants per call: 3 Google RSA, 3 Meta image. JSON array.

Return ONLY a JSON array. No prose.`

export async function generateCreativesForCustomer(args: {
  supabase: SupabaseClient
  userId: string
  businessName: string
  services: string
  serviceArea: string
}): Promise<GenerateResult> {
  // Pull last 30 days of booking-completed transcripts (most valuable signal).
  const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString()
  const { data: logs } = await args.supabase
    .from('call_logs')
    .select('id, transcript, job_type, created_at')
    .eq('user_id', args.userId)
    .eq('booking_completed', true)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20)

  if (!logs || logs.length === 0) {
    return { generated: 0, stored: 0, failures: 0 }
  }

  const transcriptSnippets = logs
    .map(l => {
      try {
        const turns = JSON.parse(l.transcript ?? '[]') as Array<{ role: string; content: string }>
        const callerLines = turns.filter(t => t.role === 'user').map(t => t.content).join(' / ')
        return `[${l.job_type ?? 'job'}] ${callerLines}`
      } catch {
        return ''
      }
    })
    .filter(Boolean)
    .join('\n')

  const userMessage = `Business: ${args.businessName}
Services offered: ${args.services}
Service area: ${args.serviceArea}

Recent caller language (their actual words when booking):
${transcriptSnippets}

Generate 6 ad creatives: 3 Google RSA + 3 Meta image. Lift phrasing from the caller language above.`

  let creatives: Creative[] = []
  try {
    const resp = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })
    const text = resp.content[0].type === 'text' ? resp.content[0].text : '[]'
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
    const parsed = JSON.parse(cleaned) as Array<Partial<Creative>>
    creatives = parsed
      .filter(c => c.platform && c.headline && c.description)
      .map(c => ({
        platform: c.platform!,
        format: c.format ?? (c.platform === 'google_ads' ? 'rsa' : 'image'),
        headline: c.headline!,
        description: c.description!,
        cta: c.cta ?? 'Call Now',
        sourceTranscriptIds: logs.map(l => l.id),
      }))
  } catch (e) {
    console.error('[ad-creative-generator] claude/parse failed:', e)
    return { generated: 0, stored: 0, failures: 1 }
  }

  let stored = 0
  let failures = 0
  for (const c of creatives) {
    const { error } = await args.supabase.from('ad_creatives').insert({
      user_id: args.userId,
      platform: c.platform,
      format: c.format,
      headline: c.headline,
      description: c.description,
      cta: c.cta,
      source_transcript_ids: c.sourceTranscriptIds,
      status: 'pending_approval',
    })
    if (error) failures++
    else stored++
  }
  return { generated: creatives.length, stored, failures }
}
