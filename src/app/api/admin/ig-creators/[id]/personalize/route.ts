import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/admin/ig-creators/[id]/personalize
 *
 * Claude Haiku reads creator's bio + recent 8 posts and writes a
 * personalized cold DM. Drops result into generated_dm column for
 * Peter to copy-paste straight into IG.
 *
 * Cost: ~$0.001/DM via Haiku.
 * Requires: enriched_at must be populated first (run /enrich before).
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const DM_SYSTEM = `You write personalized cold IG DMs for Pete McShane, the 21yo founder of BellAveGo (AI receptionist for home service contractors).

You'll receive a target creator's profile (handle, trade, follower count, bio, recent post captions). Your job: write a 130-160 word DM Pete can send.

REQUIRED STRUCTURE:
1. Opening line that references ONE SPECIFIC thing from their recent posts or bio. NOT generic.
2. Identify Pete (21yo founder)
3. Brief product (AI answers missed calls + books jobs + sends leads)
4. Offer (3 months FREE + $250/paid referral + $1,500 bonus at 5 refs)
5. Soft close (Down to try?)
6. Sign off: "— Pete (773) 710-9565"

RULES:
- Casual peer-to-peer tone (founder to founder, not corporate)
- NO emojis except maybe ONE
- 130-160 words MAX (IG DM truncation limit)
- The specific reference in opening = 60% of the value. Make it CLEAR you watched their content.
- Don't say "I noticed" / "I came across" / "Hope this finds you well" — boomer energy
- Don't pitch features, sell outcomes (more booked jobs, never miss leads)

Output ONLY the DM text. No preamble, no explanation, no quotes around it.`

type CreatorRow = {
  handle: string
  trade?: string | null
  followers?: number | null
  bio?: string | null
  recent_posts_json?: Array<{ caption?: string; likes?: number; comments?: number; type?: string | null }> | null
  notes?: string | null
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  const { id } = await params

  const { data: c, error: fetchErr } = await supabase
    .from('ig_creator_outreach')
    .select('handle, trade, followers, bio, recent_posts_json, notes')
    .eq('id', id)
    .maybeSingle<CreatorRow>()
  if (fetchErr || !c) return NextResponse.json({ error: 'creator not found' }, { status: 404 })

  const posts = c.recent_posts_json ?? []
  const userPrompt = `Target creator:
Handle: @${c.handle}
Trade: ${c.trade ?? 'home service'}
Followers: ${c.followers?.toLocaleString() ?? 'unknown'}
Bio: ${c.bio ?? '(no bio)'}
Pete's notes about them: ${c.notes ?? '(none)'}

Recent posts (most recent first):
${posts.length === 0 ? '(no posts enriched yet — write the DM using just handle + trade)' : posts.slice(0, 6).map((p, i) => `${i + 1}. [${p.type || 'post'} · ${p.likes ?? 0} likes] ${(p.caption || '').slice(0, 200)}`).join('\n')}

Write the personalized DM now.`

  let dm = ''
  try {
    const r = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: DM_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    })
    dm = r.content[0].type === 'text' ? r.content[0].text.trim() : ''
  } catch (e) {
    return NextResponse.json({ error: `Claude err: ${(e as Error).message.slice(0, 200)}` }, { status: 502 })
  }

  if (!dm) return NextResponse.json({ error: 'empty DM generated' }, { status: 500 })

  const { error: updateErr } = await supabase
    .from('ig_creator_outreach')
    .update({
      generated_dm: dm,
      generated_dm_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, dm })
}
