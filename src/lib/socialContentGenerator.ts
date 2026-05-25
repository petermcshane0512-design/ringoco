/**
 * Social content generator — daily auto-posts for BellAveGo's FB + IG.
 *
 * Pipeline:
 *   1. Pick N themes from CONTENT_THEMES (rotated based on recent history)
 *   2. For each, call Anthropic with the theme's prompt template
 *   3. Return [{theme, caption, scheduledFor}]
 *
 * Audience: home-service contractors (HVAC, plumbing, electrical, etc.)
 * Tone: shoulder-tap-from-a-friend-who-runs-a-business, not corporate marketing
 * Anti-goals: jargon, AI buzzwords, "leverage", "synergy", emoji-spam
 */
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

export type ContentTheme = {
  id: string
  label: string
  promptTemplate: string  // sent to Claude verbatim; must produce caption + hashtags
}

export const CONTENT_THEMES: ContentTheme[] = [
  {
    id: 'pain-story',
    label: 'Pain story (specific scenario)',
    promptTemplate: `Write a short Facebook/Instagram post (~80 words MAX) starting with a specific moment a home-service contractor missed a call.

Pattern:
- Open with a vivid scene ("You're under a sink. Phone rings. Hands wet.")
- Pose the real cost in dollar terms
- One line that pivots to BellAveGo as the fix
- End with a curiosity hook, not a "click here" CTA

Avoid: emojis, jargon, "AI receptionist", "innovative"
End with 4-6 relevant hashtags on the last line: #HVACBusiness #PlumbingContractor #HomeServicePros #SmallBusinessTips #ContractorLife (pick 4-6).

Return ONLY the post text + hashtags. No preamble, no quotes.`,
  },
  {
    id: 'stat-shock',
    label: 'Stat shocker',
    promptTemplate: `Write a short Facebook/Instagram post (~70 words) that opens with a specific dollar or percentage stat about missed calls in home services.

Examples of real stats you can adapt:
- 67% of callers don't leave a voicemail
- The average HVAC service ticket is $480
- Contractors miss 30-40% of inbound calls during peak season
- Caller will dial the next contractor in under 60 seconds

Frame: stat → "do the math on your week" → soft mention BellAveGo answers before voicemail.
End with 4-6 hashtags.

Return ONLY the post. No quotes, no preamble.`,
  },
  {
    id: 'how-it-works',
    label: 'How it works (3-step explainer)',
    promptTemplate: `Write a short FB/IG post (~85 words) explaining how AI call answering actually works for a home-service contractor. Use a simple 3-step structure:

1. Your phone rings, you can't pick up (in the field, on a job, hands dirty)
2. After 15 seconds of no answer, the call forwards to BellAveGo
3. AI answers in your business name, captures name/address/issue, texts you the lead in 20 seconds

Tone: like explaining to a friend at a job site, not a software demo.
No jargon. No "intelligent automation."
4-6 hashtags at the end.

Return ONLY the post.`,
  },
  {
    id: 'comparison',
    label: 'Voicemail vs AI receptionist',
    promptTemplate: `Write a punchy FB/IG post (~75 words) that compares what happens when a customer hits voicemail vs. when an AI receptionist answers.

Format options:
- Two columns of bullet points (visualized in text)
- A "Then" vs "Now" framing
- A short story with two outcomes

Stay concrete (mention real call scenarios like "leaky pipe at 7 PM" or "AC out at 95 degrees").
Soft sell at the end — BellAveGo is the cheap version of having a real receptionist.
4-6 hashtags.

Return ONLY the post.`,
  },
  {
    id: 'behind-the-scenes',
    label: 'Builder behind-the-scenes',
    promptTemplate: `Write a short FB/IG post (~70 words) from the perspective of Peter, the founder of BellAveGo, sharing a candid moment of building the business.

Examples of moments to riff on:
- Just shipped a fix today
- Talked to a contractor today who lost a $2,000 job because they were under a kitchen sink
- Spent the morning testing the AI's response to angry callers
- Watched the first paying customer get their first booked job via the AI

Tone: builder-in-public, not marketing-polished. Real human voice. Imperfect punctuation OK.
Light promotion at the end — "if you're a contractor missing calls, we should talk."
4-6 hashtags.

Return ONLY the post.`,
  },
  {
    id: 'objection-handler',
    label: 'Address a common objection',
    promptTemplate: `Write a short FB/IG post (~80 words) that addresses one of these contractor objections to AI:

- "My customers want to talk to a real person, not a robot"
- "I'm too small for AI software"
- "AI is going to take my job"
- "I already have voicemail"
- "Sounds expensive"

Pick ONE objection. Acknowledge it. Then flip it with a concrete reason why it's wrong FOR THEIR SPECIFIC BUSINESS (not abstract).
End by inviting them to call our demo line at (651) 467-7829 to hear it themselves.
4-6 hashtags.

Return ONLY the post.`,
  },
  {
    id: 'roi-math',
    label: 'ROI math',
    promptTemplate: `Write a short FB/IG post (~75 words) that does the ROI math for a contractor.

Example pattern:
"$179/mo BellAveGo. One missed HVAC service call = $400-600. Recover 1 missed call/month = it pays for itself 2-3x over. Recover 4 missed calls/month = you just netted $2,000 extra per month with zero new marketing spend."

Use real numbers — pick HVAC, plumbing, electrical, or roofing (rotate).
End with: "Math doesn't lie. Calls do, when nobody answers."
4-6 hashtags.

Return ONLY the post.`,
  },
]

export type GeneratedPost = {
  theme: string
  caption: string
  scheduledFor: string  // ISO datetime in America/Chicago
  timezone: string
}

/**
 * Pick N themes for today, weighting toward themes not used in the last
 * `excludeRecent` days. If history is empty, randomly samples.
 */
export function pickThemesForToday(
  recentThemeIds: string[],
  count: number,
): ContentTheme[] {
  const recentSet = new Set(recentThemeIds)
  const fresh = CONTENT_THEMES.filter((t) => !recentSet.has(t.id))
  const pool = fresh.length >= count ? fresh : CONTENT_THEMES
  // Fisher-Yates shuffle, then take first `count`
  const arr = [...pool]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.slice(0, count)
}

/**
 * Call Claude to generate a single post for a theme. Uses Haiku for cost
 * (~$0.001 per post). Wrap in try/catch; failures return null so the
 * caller can skip that slot.
 */
export async function generatePostForTheme(theme: ContentTheme): Promise<string | null> {
  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: 'You write short, authentic social media posts for BellAveGo, an AI receptionist + AI consulting platform for home-service contractors (HVAC, plumbing, electrical, roofing). The brand voice is direct, builder-in-public, no corporate jargon. Posts should sound like a real person who runs a business — not marketing-polished.',
      messages: [{ role: 'user', content: theme.promptTemplate }],
    })
    const block = res.content[0]
    if (block.type !== 'text') return null
    return block.text.trim()
  } catch (e) {
    console.error(`generatePostForTheme(${theme.id}) failed:`, e)
    return null
  }
}

// Optimal post times for home-service contractors in Central Time.
// Aligned to natural breaks in their day (morning route check, coffee,
// lunch, end of day, evening browsing).
export const POST_SLOTS_CT: string[] = ['07:00', '10:00', '13:00', '16:00', '20:00']

/**
 * Build N posts for today, scheduled at the POST_SLOTS_CT times.
 * Caller (cron) provides today's date in YYYY-MM-DD and the recent theme
 * IDs to avoid repeating.
 */
export async function buildPostsForDay(opts: {
  dateYYYYMMDD: string
  recentThemeIds: string[]
  count?: number
}): Promise<GeneratedPost[]> {
  const count = opts.count ?? POST_SLOTS_CT.length
  const themes = pickThemesForToday(opts.recentThemeIds, count)
  const posts: GeneratedPost[] = []

  for (let i = 0; i < themes.length; i++) {
    const theme = themes[i]
    const slot = POST_SLOTS_CT[i % POST_SLOTS_CT.length]
    const caption = await generatePostForTheme(theme)
    if (!caption) continue
    posts.push({
      theme: theme.id,
      caption,
      scheduledFor: `${opts.dateYYYYMMDD}T${slot}:00`,
      timezone: 'America/Chicago',
    })
  }
  return posts
}
