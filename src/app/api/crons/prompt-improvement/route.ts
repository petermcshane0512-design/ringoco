import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic()
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  // Verify cron secret so only Vercel can trigger this
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Get all failed calls from yesterday — handles both old schema (job_created) and new (booking_completed)
  const { data: failedCalls } = await supabase
    .from('call_logs')
    .select('profile_id, user_id, transcript, hangup_turn, caller_phone, job_created, booking_completed')
    .or('job_created.eq.false,booking_completed.eq.false')
    .gte('created_at', yesterday.toISOString())
    .lt('created_at', today.toISOString())

  if (!failedCalls || failedCalls.length === 0) {
    return NextResponse.json({ message: 'No failed calls yesterday', suggestions: 0 })
  }

  // Group by profile_id (new column) or user_id (existing column)
  const byProfile: Record<string, typeof failedCalls> = {}
  for (const call of failedCalls) {
    const pid = (call as any).profile_id || (call as any).user_id
    if (!pid) continue
    ;(call as any).profile_id = pid
    if (!byProfile[pid]) byProfile[pid] = []
    if (!byProfile[call.profile_id]) byProfile[call.profile_id] = []
    byProfile[call.profile_id].push(call)
  }

  let suggestionsCreated = 0

  for (const [profileId, calls] of Object.entries(byProfile)) {
    if (calls.length === 0) continue

    const transcriptSummaries = calls.slice(0, 5).map((c, i) => {
      let turns: any[] = []
      try { turns = typeof c.transcript === 'string' ? JSON.parse(c.transcript) : (c.transcript as any[]) || [] } catch {}
      const turnNum = (c as any).hangup_turn || turns.length
      return `Call ${i + 1} (hung up at turn ${turnNum}):\n${turns.map((t: any) => `${t.role}: ${t.content}`).join('\n')}`
    }).join('\n\n---\n\n')

    try {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `You are analyzing failed AI receptionist calls for a home service contractor. These callers hung up before a job was booked.

${transcriptSummaries}

In 2-3 sentences, identify: what went wrong, where the AI confused the caller, and one specific change to the system prompt that would fix it. Be concrete and actionable.`
        }]
      })

      const suggestion = response.content[0].type === 'text' ? response.content[0].text : ''

      await supabase.from('prompt_suggestions').insert({
        profile_id: profileId,
        suggestion,
        based_on_call_count: calls.length,
        applied: false,
      })

      suggestionsCreated++
    } catch (err) {
      console.error(`Failed to analyze calls for profile ${profileId}:`, err)
    }
  }

  return NextResponse.json({
    message: 'Prompt improvement run complete',
    profiles_analyzed: Object.keys(byProfile).length,
    suggestions_created: suggestionsCreated,
    failed_calls_reviewed: failedCalls.length,
  })
}
