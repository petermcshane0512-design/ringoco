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
  // Claude prompt — must return JSON: { headline: string, caption: string }
  //   headline: ≤8 words, punchy, gets baked into the image as text
  //   caption: the post caption — brand-focused, ~50 words, hashtags at end
  promptTemplate: string
  // Visual scene prompt fed to gpt-image-1. The headline gets appended
  // at runtime with "Bold sans-serif typography overlay reading: '<headline>'"
  imagePrompt: string
}

// Shared visual identity prompt fragment — appended to every theme's image
// prompt so the feed has a cohesive look across diverse subjects.
const BRAND_VISUAL = 'warm sunset-orange (#E8742B) and teal (#0AA89F) color palette, professional but approachable, modern editorial style, square 1:1 composition, social-media-optimized'

// Brand-focused caption suffix appended to EVERY post's caption — keeps the
// caption from being a duplicate of the headline (which is now in the image).
const BRAND_CAPTION_FOOTER = `\n\nBellAveGo answers your missed calls in your business name, books the job, and texts you the lead in 20 seconds. Built for HVAC, plumbing, electrical, and home-service contractors. Call (651) 467-7829 to hear it yourself.`

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
    imagePrompt: `Editorial-style photo of an HVAC technician kneeling under a residential air conditioning unit with a wrench in hand, a smartphone ringing on the ground beside them, blurred suburban garage in background, late-afternoon golden-hour lighting, photorealistic, ${BRAND_VISUAL}`,
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
    imagePrompt: `Modern minimalist infographic-style image showing a large stylized percentage symbol bursting outward, abstract data visualization, dark navy background with bright sunset orange and teal geometric accents, clean editorial business aesthetic, ${BRAND_VISUAL}`,
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
    imagePrompt: `Flat-illustration diagram of three connected circles showing the journey of a phone call: homeowner with a phone, a friendly AI voice waveform, then a contractor receiving a text message, connected by glowing arrows, clean modern vector style, ${BRAND_VISUAL}`,
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
    imagePrompt: `Split-screen illustration: left half shows a frustrated homeowner holding a phone with a "voicemail" icon and a gray cold color palette, right half shows the same homeowner smiling on the phone with a warm AI assistant waveform glowing, visual contrast between cold-and-warm, modern editorial illustration, ${BRAND_VISUAL}`,
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
    imagePrompt: `Authentic candid photo of a young founder working on a laptop late at night in a home office, coffee cup beside them, dim warm desk lamp, software code reflecting on glasses, startup-builder aesthetic, photorealistic documentary style, ${BRAND_VISUAL}`,
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
    imagePrompt: `Photorealistic image of a contractor and a homeowner shaking hands warmly at the front door of a suburban home, contractor wearing branded work uniform, golden-hour lighting, sense of trust and reassurance, editorial photography style, ${BRAND_VISUAL}`,
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
    imagePrompt: `Modern flat-illustration of an upward arrow climbing through stacks of gold coins, with subtle home-service icons (wrench, calendar, phone) at the base, dark navy background, ${BRAND_VISUAL}`,
  },
]

/**
 * Generate a unique image via OpenAI gpt-image-1 for a theme. The model
 * returns base64 (no URL response format), so we decode and upload to a
 * public Supabase Storage bucket and return the public URL. Zernio then
 * fetches that URL at post-queue time.
 *
 * Falls back to null on any failure — caller routes the post to
 * text-only platforms if image gen failed.
 *
 * Cost: ~$0.04/image at high quality, ~$0.02 at medium.
 */
import { createClient } from '@supabase/supabase-js'

const supaForImages = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
)
const SOCIAL_BUCKET = 'social-images'

export async function generateImageForTheme(theme: ContentTheme): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('OPENAI_API_KEY not set — skipping image generation')
    return null
  }
  try {
    // 1. Call gpt-image-1
    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: theme.imagePrompt,
        size: '1024x1024',
        quality: 'high',  // best detail per Peter's request
        n: 1,
      }),
    })
    if (!r.ok) {
      console.error(`gpt-image-1 ${theme.id} HTTP ${r.status}:`, (await r.text()).slice(0, 200))
      return null
    }
    const data = (await r.json()) as { data?: Array<{ b64_json?: string }> }
    const b64 = data.data?.[0]?.b64_json
    if (!b64) {
      console.error(`gpt-image-1 ${theme.id} returned no b64_json`)
      return null
    }

    // 2. Decode + upload to Supabase Storage (public bucket)
    const bytes = Buffer.from(b64, 'base64')
    const filename = `${theme.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`
    const { error: upErr } = await supaForImages.storage
      .from(SOCIAL_BUCKET)
      .upload(filename, bytes, { contentType: 'image/png', cacheControl: '31536000' })
    if (upErr) {
      console.error(`supabase storage upload (${filename}) failed:`, upErr.message)
      return null
    }

    // 3. Build the public URL
    const { data: pub } = supaForImages.storage.from(SOCIAL_BUCKET).getPublicUrl(filename)
    return pub.publicUrl ?? null
  } catch (e) {
    console.error(`generateImageForTheme(${theme.id}) threw:`, e)
    return null
  }
}

export type GeneratedPost = {
  theme: string
  caption: string
  scheduledFor: string  // ISO datetime in America/Chicago
  timezone: string
  imageUrl?: string | null  // DALL-E URL if generation succeeded
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
 * Dynamic slot generator — produces N evenly-spaced post times in
 * America/Chicago between "now+leadMinutes" and a cutoff hour (default
 * 21:00 = 9 PM CT). Used when the cron is invoked mid-day (e.g. for
 * a same-day burst) instead of the morning's default schedule.
 *
 * Returns slots as HH:MM strings in CT.
 */
export function generateSlotsForRestOfDay(opts: {
  count: number
  leadMinutes?: number    // earliest = now + leadMinutes (default 45)
  cutoffHour?: number     // latest slot hour (default 21 = 9 PM)
  nowCT?: Date            // override "now" for testing
}): string[] {
  const lead = opts.leadMinutes ?? 45
  const cutoff = opts.cutoffHour ?? 21
  const nowCT = opts.nowCT ?? new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }))

  const firstMs = nowCT.getTime() + lead * 60 * 1000
  const cutoffDate = new Date(nowCT)
  cutoffDate.setHours(cutoff, 0, 0, 0)
  const lastMs = cutoffDate.getTime()

  // If we're already past the cutoff, pack everything back-to-back at 20min
  // intervals starting at lead — better than nothing.
  if (lastMs <= firstMs) {
    return Array.from({ length: opts.count }, (_, i) => {
      const d = new Date(firstMs + i * 20 * 60 * 1000)
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    })
  }

  const span = lastMs - firstMs
  const step = opts.count > 1 ? span / (opts.count - 1) : 0
  return Array.from({ length: opts.count }, (_, i) => {
    const d = new Date(firstMs + step * i)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  })
}

/**
 * Build N posts for today, scheduled at the POST_SLOTS_CT times.
 * Caller (cron) provides today's date in YYYY-MM-DD and the recent theme
 * IDs to avoid repeating.
 */
export async function buildPostsForDay(opts: {
  dateYYYYMMDD: string
  recentThemeIds: string[]
  count?: number
  slots?: string[]         // override POST_SLOTS_CT (HH:MM strings, CT)
}): Promise<GeneratedPost[]> {
  const slots = opts.slots ?? POST_SLOTS_CT
  const count = opts.count ?? slots.length
  // When count exceeds the pool of 7 themes, allow repeats (cycle through).
  const themes = count <= CONTENT_THEMES.length
    ? pickThemesForToday(opts.recentThemeIds, count)
    : (() => {
        // Use all 7 unique themes first, then cycle to fill remaining
        const base = pickThemesForToday(opts.recentThemeIds, CONTENT_THEMES.length)
        const filled: ContentTheme[] = []
        for (let i = 0; i < count; i++) filled.push(base[i % base.length])
        return filled
      })()
  const posts: GeneratedPost[] = []

  // Run caption + image generation in parallel per theme — saves ~30 sec
  // total when generating 8 posts. Each theme is independent.
  const results = await Promise.all(
    themes.map(async (theme, i) => {
      const slot = slots[i % slots.length]
      const [caption, imageUrl] = await Promise.all([
        generatePostForTheme(theme),
        generateImageForTheme(theme),
      ])
      if (!caption) return null
      return {
        theme: theme.id,
        caption,
        scheduledFor: `${opts.dateYYYYMMDD}T${slot}:00`,
        timezone: 'America/Chicago',
        imageUrl,
      } as GeneratedPost
    }),
  )
  for (const r of results) if (r) posts.push(r)
  return posts
}
