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
  // Claude prompt — MUST instruct model to return JSON:
  //   { "headline": "≤6 words", "caption": "post body + hashtags", "scene": "1 vivid visual sentence" }
  // headline → typography overlay baked into image
  // scene    → photographic/illustration moment fed to gpt-image-1
  // caption  → the post body
  promptTemplate: string
  // Fallback static scene if Claude's JSON fails to parse. Used only on
  // error path so we still ship an image with the theme's visual identity.
  imagePrompt: string
  // Hint to gpt-image-1 about render style for this theme.
  visualStyle: 'photo' | 'illustration' | 'infographic'
}

// Shared visual identity fragment — composed into every image prompt so the
// feed has a cohesive look across diverse subjects.
const BRAND_VISUAL = 'warm sunset-orange (#E8742B) and teal (#0AA89F) accent palette, professional but approachable, modern editorial style, square 1:1 composition, social-media-optimized, strong negative space for typography, rule-of-thirds composition'

// Brand-focused caption suffix appended to EVERY post's caption — keeps the
// caption from being a duplicate of the headline (which is now in the image).
const BRAND_CAPTION_FOOTER = `\n\nBellAveGo answers your missed calls in your business name, books the job, and texts you the lead in 20 seconds. Built for HVAC, plumbing, electrical, and home-service contractors. Call (651) 467-7829 to hear it yourself.`

// Shared output contract appended to every theme prompt. Forces JSON so we
// can drive the image prompt from the same story Claude wrote.
const JSON_OUTPUT_CONTRACT = `

OUTPUT FORMAT — return ONLY valid JSON (no markdown, no code fences, no preamble):
{
  "headline": "≤6 words, punchy, no quotes, no period — gets baked into the image as bold typography",
  "caption": "the full post body, ~70-85 words, ending with 4-6 hashtags on the last line",
  "scene": "ONE vivid visual sentence describing the exact moment from the story. Be specific: what the person is doing, where, what's around them, time of day. This becomes the image."
}`

export const CONTENT_THEMES: ContentTheme[] = [
  {
    id: 'pain-story',
    label: 'Pain story (specific scenario)',
    visualStyle: 'photo',
    promptTemplate: `Write a short Facebook/Instagram post (~80 words MAX) starting with a specific moment a home-service contractor missed a call.

Pattern:
- Open with a vivid scene ("You're under a sink. Phone rings. Hands wet.")
- Pose the real cost in dollar terms
- One line that pivots to BellAveGo as the fix
- End with a curiosity hook, not a "click here" CTA

Avoid: emojis, jargon, "AI receptionist", "innovative"
End the caption with 4-6 relevant hashtags on the last line (pick from: #HVACBusiness #PlumbingContractor #HomeServicePros #SmallBusinessTips #ContractorLife).

The "scene" field should mirror the opening moment of the post — same trade, same setting, same physical detail.${JSON_OUTPUT_CONTRACT}`,
    imagePrompt: `Editorial-style photo of an HVAC technician kneeling under a residential air conditioning unit with a wrench in hand, a smartphone ringing on the ground beside them, blurred suburban garage in background, late-afternoon golden-hour lighting, photorealistic, ${BRAND_VISUAL}`,
  },
  {
    id: 'stat-shock',
    label: 'Stat shocker',
    visualStyle: 'infographic',
    promptTemplate: `Write a short Facebook/Instagram post (~70 words) that opens with a specific dollar or percentage stat about missed calls in home services.

Examples of real stats you can adapt:
- 67% of callers don't leave a voicemail
- The average HVAC service ticket is $480
- Contractors miss 30-40% of inbound calls during peak season
- Caller will dial the next contractor in under 60 seconds

Frame: stat → "do the math on your week" → soft mention BellAveGo answers before voicemail.
End the caption with 4-6 hashtags.

The "scene" field should describe a minimalist editorial infographic visualizing the specific stat you used (e.g. a large "67%" with the missing 33% faded out). NOT a literal photo.${JSON_OUTPUT_CONTRACT}`,
    imagePrompt: `Modern minimalist infographic-style image showing a large stylized percentage symbol bursting outward, abstract data visualization, dark navy background with bright sunset orange and teal geometric accents, clean editorial business aesthetic, ${BRAND_VISUAL}`,
  },
  {
    id: 'how-it-works',
    label: 'How it works (3-step explainer)',
    visualStyle: 'illustration',
    promptTemplate: `Write a short FB/IG post (~85 words) explaining how AI call answering actually works for a home-service contractor. Use a simple 3-step structure:

1. Your phone rings, you can't pick up (in the field, on a job, hands dirty)
2. After 15 seconds of no answer, the call forwards to BellAveGo
3. AI answers in your business name, captures name/address/issue, texts you the lead in 20 seconds

Tone: like explaining to a friend at a job site, not a software demo.
No jargon. No "intelligent automation."
4-6 hashtags at the end of the caption.

The "scene" field should describe a clean flat-vector illustration of the exact 3-step flow you wrote, with the trade you picked visible.${JSON_OUTPUT_CONTRACT}`,
    imagePrompt: `Flat-illustration diagram of three connected circles showing the journey of a phone call: homeowner with a phone, a friendly AI voice waveform, then a contractor receiving a text message, connected by glowing arrows, clean modern vector style, ${BRAND_VISUAL}`,
  },
  {
    id: 'comparison',
    label: 'Voicemail vs AI receptionist',
    visualStyle: 'illustration',
    promptTemplate: `Write a punchy FB/IG post (~75 words) that compares what happens when a customer hits voicemail vs. when an AI receptionist answers.

Format options:
- Two columns of bullet points (visualized in text)
- A "Then" vs "Now" framing
- A short story with two outcomes

Stay concrete (mention real call scenarios like "leaky pipe at 7 PM" or "AC out at 95 degrees").
Soft sell at the end — BellAveGo is the cheap version of having a real receptionist.
4-6 hashtags at end of caption.

The "scene" field should be a split-screen illustration of the SPECIFIC scenario you used — left side voicemail outcome, right side answered outcome.${JSON_OUTPUT_CONTRACT}`,
    imagePrompt: `Split-screen illustration: left half shows a frustrated homeowner holding a phone with a "voicemail" icon and a gray cold color palette, right half shows the same homeowner smiling on the phone with a warm AI assistant waveform glowing, visual contrast between cold-and-warm, modern editorial illustration, ${BRAND_VISUAL}`,
  },
  {
    id: 'behind-the-scenes',
    label: 'Builder behind-the-scenes',
    visualStyle: 'photo',
    promptTemplate: `Write a short FB/IG post (~70 words) from the perspective of Peter, the founder of BellAveGo, sharing a candid moment of building the business.

Examples of moments to riff on:
- Just shipped a fix today
- Talked to a contractor today who lost a $2,000 job because they were under a kitchen sink
- Spent the morning testing the AI's response to angry callers
- Watched the first paying customer get their first booked job via the AI

Tone: builder-in-public, not marketing-polished. Real human voice. Imperfect punctuation OK.
Light promotion at the end — "if you're a contractor missing calls, we should talk."
4-6 hashtags at end of caption.

The "scene" field should describe a photorealistic candid moment matching the post (e.g. if you wrote about testing angry callers, show a founder at a desk with headphones on, phone glowing).${JSON_OUTPUT_CONTRACT}`,
    imagePrompt: `Authentic candid photo of a young founder working on a laptop late at night in a home office, coffee cup beside them, dim warm desk lamp, software code reflecting on glasses, startup-builder aesthetic, photorealistic documentary style, ${BRAND_VISUAL}`,
  },
  {
    id: 'objection-handler',
    label: 'Address a common objection',
    visualStyle: 'photo',
    promptTemplate: `Write a short FB/IG post (~80 words) that addresses one of these contractor objections to AI:

- "My customers want to talk to a real person, not a robot"
- "I'm too small for AI software"
- "AI is going to take my job"
- "I already have voicemail"
- "Sounds expensive"

Pick ONE objection. Acknowledge it. Then flip it with a concrete reason why it's wrong FOR THEIR SPECIFIC BUSINESS (not abstract).
End by inviting them to call our demo line at (651) 467-7829 to hear it themselves.
4-6 hashtags at end of caption.

The "scene" field should be a photorealistic moment that reinforces the flip — e.g. for "customers want a real person", show a homeowner mid-call looking relieved.${JSON_OUTPUT_CONTRACT}`,
    imagePrompt: `Photorealistic image of a contractor and a homeowner shaking hands warmly at the front door of a suburban home, contractor wearing branded work uniform, golden-hour lighting, sense of trust and reassurance, editorial photography style, ${BRAND_VISUAL}`,
  },
  {
    id: 'roi-math',
    label: 'ROI math',
    visualStyle: 'infographic',
    promptTemplate: `Write a short FB/IG post (~75 words) that does the ROI math for a contractor.

Example pattern:
"$179/mo BellAveGo. One missed HVAC service call = $400-600. Recover 1 missed call/month = it pays for itself 2-3x over. Recover 4 missed calls/month = you just netted $2,000 extra per month with zero new marketing spend."

Use real numbers — pick HVAC, plumbing, electrical, or roofing (rotate).
End the caption with: "Math doesn't lie. Calls do, when nobody answers."
4-6 hashtags at end of caption.

The "scene" field should be a clean editorial infographic visualizing the EXACT math you used (the specific dollar amounts as big numbers, trade icon, upward arrow). NOT a generic stock photo.${JSON_OUTPUT_CONTRACT}`,
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

/**
 * Story-aware image generator. Composes a prompt from the SPECIFIC scene
 * Claude wrote for this caption + the headline (rendered as typography
 * overlay) + the theme's visual style + brand identity. Falls back to
 * `theme.imagePrompt` if scene is empty.
 */
function buildImagePromptFromStory(opts: {
  theme: ContentTheme
  scene: string
  headline: string
}): string {
  const styleLead = {
    photo: 'Photorealistic editorial photograph.',
    illustration: 'Modern flat-vector editorial illustration, bold shapes, limited palette.',
    infographic: 'Clean minimalist editorial infographic with bold typography and abstract data shapes.',
  }[opts.theme.visualStyle]

  const scene = opts.scene.trim() || opts.theme.imagePrompt
  const headline = opts.headline.trim().replace(/"/g, '')
  const overlay = headline
    ? ` Large bold sans-serif typography overlay positioned in the upper-third negative space, reading exactly: "${headline}". Text must be legible, high-contrast, single short phrase — no extra words, no logos, no watermarks.`
    : ''

  return `${styleLead} ${scene}.${overlay} ${BRAND_VISUAL}.`
}

export async function generateImageForPost(opts: {
  theme: ContentTheme
  scene: string
  headline: string
}): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('OPENAI_API_KEY not set — skipping image generation')
    return null
  }
  const prompt = buildImagePromptFromStory(opts)
  try {
    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt,
        size: '1024x1024',
        quality: 'high',
        n: 1,
      }),
    })
    if (!r.ok) {
      console.error(`gpt-image-1 ${opts.theme.id} HTTP ${r.status}:`, (await r.text()).slice(0, 200))
      return null
    }
    const data = (await r.json()) as { data?: Array<{ b64_json?: string }> }
    const b64 = data.data?.[0]?.b64_json
    if (!b64) {
      console.error(`gpt-image-1 ${opts.theme.id} returned no b64_json`)
      return null
    }

    const bytes = Buffer.from(b64, 'base64')
    const filename = `${opts.theme.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`
    const { error: upErr } = await supaForImages.storage
      .from(SOCIAL_BUCKET)
      .upload(filename, bytes, { contentType: 'image/png', cacheControl: '31536000' })
    if (upErr) {
      console.error(`supabase storage upload (${filename}) failed:`, upErr.message)
      return null
    }

    const { data: pub } = supaForImages.storage.from(SOCIAL_BUCKET).getPublicUrl(filename)
    return pub.publicUrl ?? null
  } catch (e) {
    console.error(`generateImageForPost(${opts.theme.id}) threw:`, e)
    return null
  }
}

export type GeneratedPost = {
  theme: string
  headline: string
  caption: string
  scene: string
  scheduledFor: string  // ISO datetime in America/Chicago
  timezone: string
  imageUrl?: string | null  // public URL if generation succeeded
}

export type ClaudePostJSON = {
  headline: string
  caption: string
  scene: string
}

/**
 * Robust JSON extractor — Claude sometimes wraps in ```json fences despite
 * instructions, or adds a leading sentence. Strip both, parse, validate shape.
 */
function parsePostJSON(raw: string): ClaudePostJSON | null {
  let s = raw.trim()
  // Strip markdown code fences
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  // Find first {…} block if there's leading prose
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first === -1 || last === -1 || last <= first) return null
  const slice = s.slice(first, last + 1)
  try {
    const obj = JSON.parse(slice) as Partial<ClaudePostJSON>
    if (typeof obj.headline !== 'string' || typeof obj.caption !== 'string' || typeof obj.scene !== 'string') return null
    if (!obj.headline.trim() || !obj.caption.trim()) return null
    return { headline: obj.headline.trim(), caption: obj.caption.trim(), scene: obj.scene.trim() }
  } catch {
    return null
  }
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
 * Call Claude to generate a single post for a theme. Returns parsed
 * {headline, caption, scene}. One retry on JSON parse failure with a
 * stricter reminder. Returns null only after both attempts fail.
 *
 * Uses Haiku for cost (~$0.001 per post).
 */
export async function generatePostForTheme(theme: ContentTheme): Promise<ClaudePostJSON | null> {
  const system = 'You write short, authentic social media posts for BellAveGo, an AI receptionist + AI consulting platform for home-service contractors (HVAC, plumbing, electrical, roofing). The brand voice is direct, builder-in-public, no corporate jargon. Posts should sound like a real person who runs a business — not marketing-polished. You ALWAYS return strict JSON when asked.'

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const userMsg = attempt === 0
        ? theme.promptTemplate
        : `${theme.promptTemplate}\n\nIMPORTANT: Your previous response was not valid JSON. Return ONLY the JSON object — no markdown fences, no preamble, no trailing commentary. Start with { and end with }.`
      const res = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system,
        messages: [{ role: 'user', content: userMsg }],
      })
      const block = res.content[0]
      if (block.type !== 'text') continue
      const parsed = parsePostJSON(block.text)
      if (parsed) return parsed
      console.warn(`generatePostForTheme(${theme.id}) attempt ${attempt + 1}: JSON parse failed`)
    } catch (e) {
      console.error(`generatePostForTheme(${theme.id}) threw:`, e)
    }
  }
  return null
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

  // Caption must come first — image prompt is now built from the scene +
  // headline Claude produced. Themes are processed in parallel; within each
  // theme the steps are sequential (caption → image).
  const results = await Promise.all(
    themes.map(async (theme, i) => {
      const slot = slots[i % slots.length]
      const json = await generatePostForTheme(theme)
      if (!json) return null
      const imageUrl = await generateImageForPost({
        theme,
        scene: json.scene,
        headline: json.headline,
      })
      return {
        theme: theme.id,
        headline: json.headline,
        caption: json.caption,
        scene: json.scene,
        scheduledFor: `${opts.dateYYYYMMDD}T${slot}:00`,
        timezone: 'America/Chicago',
        imageUrl,
      } as GeneratedPost
    }),
  )
  for (const r of results) if (r) posts.push(r)
  return posts
}
