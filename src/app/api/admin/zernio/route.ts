import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'

/**
 * Zernio social-media API wrapper. Single endpoint, three actions:
 *
 *   GET  /api/admin/zernio                  → list connected accounts
 *   POST /api/admin/zernio                  → publish or schedule a post
 *
 * Zernio is a unified API across IG / TikTok / FB / X / LinkedIn / etc.
 * Auth header: `Authorization: Bearer $ZERNIO_API_KEY`. Key format:
 *   sk_ + 64 hex chars (set in Vercel env as ZERNIO_API_KEY).
 *
 * Auth on our side: requireAdmin() — same dual-auth (x-admin-secret or
 * Clerk admin session) as every other /api/admin/* endpoint.
 *
 * POST body shape:
 * {
 *   "content": "post text here",
 *   "accountIds": ["acc_x", "acc_y"]      // from the GET response
 *   "scheduledFor": "2026-05-26T14:30:00", // optional, omit to publish now
 *   "timezone": "America/Chicago"          // optional, default America/Chicago
 *   "mediaUrls": ["https://..."]           // optional, attaches images/video
 * }
 */
const ZERNIO_BASE = 'https://zernio.com/api/v1'

function zernioHeaders() {
  if (!process.env.ZERNIO_API_KEY) {
    throw new Error('ZERNIO_API_KEY env var not set')
  }
  return {
    Authorization: `Bearer ${process.env.ZERNIO_API_KEY}`,
    'Content-Type': 'application/json',
  }
}

export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  try {
    const r = await fetch(`${ZERNIO_BASE}/accounts`, { headers: zernioHeaders() })
    const body = await r.text()
    if (!r.ok) {
      return NextResponse.json(
        { error: `Zernio /accounts HTTP ${r.status}`, body: body.slice(0, 400) },
        { status: r.status >= 500 ? 502 : r.status },
      )
    }
    return NextResponse.json(JSON.parse(body))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

type PostBody = {
  content?: string
  accountIds?: string[]
  scheduledFor?: string
  timezone?: string
  mediaUrls?: string[]
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  let body: PostBody
  try {
    body = (await req.json()) as PostBody
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  if (!body.content || !body.accountIds || body.accountIds.length === 0) {
    return NextResponse.json(
      { error: 'missing required fields: content + accountIds[]' },
      { status: 400 },
    )
  }

  // Fetch accounts so we can resolve each accountId to its platform.
  // Zernio's POST /posts wants {platform, accountId} pairs.
  let acctMap: Record<string, string> = {}
  try {
    const accRes = await fetch(`${ZERNIO_BASE}/accounts`, { headers: zernioHeaders() })
    if (!accRes.ok) {
      return NextResponse.json(
        { error: `accounts lookup HTTP ${accRes.status}`, body: (await accRes.text()).slice(0, 300) },
        { status: 502 },
      )
    }
    const arr = (await accRes.json()) as Array<{ _id?: string; id?: string; platform?: string }>
    for (const a of arr) {
      const id = a._id ?? a.id
      if (id && a.platform) acctMap[id] = a.platform
    }
  } catch (e) {
    return NextResponse.json({ error: `accounts lookup threw: ${(e as Error).message}` }, { status: 500 })
  }

  const platforms = body.accountIds
    .filter((id) => acctMap[id])
    .map((id) => ({ platform: acctMap[id], accountId: id }))

  if (platforms.length === 0) {
    return NextResponse.json(
      { error: 'none of the accountIds matched a connected account', accountIdsProvided: body.accountIds, knownAccounts: Object.keys(acctMap) },
      { status: 400 },
    )
  }

  const payload: Record<string, unknown> = {
    content: body.content,
    platforms,
  }
  if (body.scheduledFor) {
    payload.scheduledFor = body.scheduledFor
    payload.timezone = body.timezone || 'America/Chicago'
  } else {
    payload.publishNow = true
  }
  if (body.mediaUrls && body.mediaUrls.length > 0) {
    payload.mediaUrls = body.mediaUrls
  }

  try {
    const r = await fetch(`${ZERNIO_BASE}/posts`, {
      method: 'POST',
      headers: zernioHeaders(),
      body: JSON.stringify(payload),
    })
    const text = await r.text()
    if (!r.ok) {
      return NextResponse.json(
        { error: `Zernio /posts HTTP ${r.status}`, body: text.slice(0, 500), payloadSent: payload },
        { status: r.status >= 500 ? 502 : r.status },
      )
    }
    return NextResponse.json({
      ok: true,
      payloadSent: payload,
      zernioResponse: JSON.parse(text),
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
