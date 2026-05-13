/**
 * Local SEO post generator + publisher. Once a week per Concierge customer,
 * generates a 600-900 word blog post targeting "best [trade] [city]" type
 * queries, publishes to customer's WordPress or Webflow.
 *
 * Customer provides `website_url`, `website_provider` ('webflow' | 'wordpress'),
 * and `website_api_token` during onboarding. We store the post regardless of
 * publish outcome so the dashboard always has a record.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'

const anthropic = new Anthropic()

const SYSTEM_PROMPT = `You are an SEO content writer for home-services local businesses.
Write a 600-900 word blog post that ranks for the target query.

Requirements:
- Natural, conversational, written for a homeowner reader (not an AI)
- Include the target query verbatim in: H1, first paragraph, and one H2
- Cite local context (neighborhoods, weather patterns, typical home types) when relevant
- One actionable checklist or table mid-post
- One paragraph naming the business as the local choice (single mention, not salesy)
- End with a clear single CTA: "Call {business} at {phone} for a same-day quote"

Output STRICT JSON: { "title": "...", "slug": "...", "body_md": "..." }
The slug must be lowercase-kebab. Body must be valid Markdown. No prose outside the JSON.`

export type SeoPost = {
  title: string
  slug: string
  body_md: string
}

export async function generateAndPublishPost(args: {
  supabase: SupabaseClient
  userId: string
  businessName: string
  phone: string
  trade: string
  city: string
  websiteUrl?: string
  websiteProvider?: string
  websiteApiToken?: string
}): Promise<{ ok: boolean; published_url?: string; error?: string; post_id?: string }> {
  const targetQuery = `best ${args.trade} ${args.city}`

  let post: SeoPost
  try {
    const resp = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2500,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Target query: "${targetQuery}"
Business: ${args.businessName}
Phone: ${args.phone}
Trade: ${args.trade}
City: ${args.city}

Write the post.`,
        },
      ],
    })
    const text = resp.content[0].type === 'text' ? resp.content[0].text : '{}'
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
    post = JSON.parse(cleaned) as SeoPost
  } catch (e) {
    return { ok: false, error: `claude/parse: ${e instanceof Error ? e.message : String(e)}` }
  }

  const wordCount = post.body_md.split(/\s+/).length

  // Insert as pending_publish first so we have a record even if publish fails.
  const { data: row, error: insertErr } = await args.supabase
    .from('seo_blog_posts')
    .insert({
      user_id: args.userId,
      target_query: targetQuery,
      title: post.title,
      slug: post.slug,
      body_md: post.body_md,
      word_count: wordCount,
      status: 'pending_publish',
    })
    .select('id')
    .single()
  if (insertErr || !row) {
    return { ok: false, error: `db insert: ${insertErr?.message ?? 'no row'}` }
  }

  // Try to publish if credentials provided. Otherwise leave pending — customer can publish manually.
  if (!args.websiteUrl || !args.websiteProvider || !args.websiteApiToken) {
    return { ok: true, post_id: row.id }
  }

  let publishedUrl: string | undefined
  try {
    if (args.websiteProvider === 'wordpress') {
      publishedUrl = await publishToWordPress(args.websiteUrl, args.websiteApiToken, post)
    } else if (args.websiteProvider === 'webflow') {
      publishedUrl = await publishToWebflow(args.websiteUrl, args.websiteApiToken, post)
    } else {
      throw new Error(`unknown provider: ${args.websiteProvider}`)
    }
    await args.supabase
      .from('seo_blog_posts')
      .update({ published_url: publishedUrl, published_at: new Date().toISOString(), status: 'published' })
      .eq('id', row.id)
    return { ok: true, post_id: row.id, published_url: publishedUrl }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    await args.supabase.from('seo_blog_posts').update({ status: 'failed' }).eq('id', row.id)
    return { ok: false, error: `publish: ${errMsg}`, post_id: row.id }
  }
}

async function publishToWordPress(siteUrl: string, token: string, post: SeoPost): Promise<string> {
  // WordPress REST API: POST /wp-json/wp/v2/posts
  // token = Application Password (base64 'user:apppassword')
  const res = await fetch(`${siteUrl.replace(/\/$/, '')}/wp-json/wp/v2/posts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${token}`,
    },
    body: JSON.stringify({
      title: post.title,
      slug: post.slug,
      content: markdownToHtml(post.body_md),
      status: 'publish',
    }),
  })
  if (!res.ok) throw new Error(`WP API ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as { link?: string }
  return data.link ?? `${siteUrl}/${post.slug}`
}

async function publishToWebflow(siteUrl: string, token: string, post: SeoPost): Promise<string> {
  // Webflow CMS API v2 — requires collectionId discovery (customer-specific).
  // For MVP we return a placeholder and surface a TODO in the dashboard.
  // Real impl: GET /v2/sites → /v2/sites/{id}/collections → find 'blog' → POST item.
  void siteUrl
  void token
  throw new Error('Webflow publishing requires per-customer collectionId — set up in onboarding wizard')
}

// Minimal MD→HTML for WP. Customer's WP theme handles styling. Avoid heavy deps.
function markdownToHtml(md: string): string {
  return md
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    .split(/\n\n+/)
    .map(p => (p.startsWith('<h') ? p : `<p>${p.replace(/\n/g, '<br/>')}</p>`))
    .join('\n')
}
