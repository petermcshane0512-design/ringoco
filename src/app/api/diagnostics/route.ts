import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { auth } from '@clerk/nextjs/server'
import Anthropic from '@anthropic-ai/sdk'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const anthropic = new Anthropic()

async function fetchPlacesData(businessName: string, phone: string) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return null

  const query = encodeURIComponent(`${businessName} ${phone}`)
  const searchRes = await fetch(
    `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${apiKey}`,
    { next: { revalidate: 0 } }
  )
  const searchData = await searchRes.json()
  const place = searchData.results?.[0]
  if (!place) return null

  const detailsRes = await fetch(
    `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_phone_number,rating,user_ratings_total,opening_hours,website,reviews&key=${apiKey}`,
    { next: { revalidate: 0 } }
  )
  const detailsData = await detailsRes.json()
  return detailsData.result || null
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { businessName, phone, businessType, revenueRange } = await req.json()

  // Check if diagnostic already exists
  const { data: existing } = await supabase
    .from('diagnostics')
    .select('id')
    .eq('profile_id', userId)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  let placesData: any = null
  let roiEstimate = 0
  let aiSummary = ''

  try {
    placesData = await fetchPlacesData(businessName || '', phone || '')
  } catch {
    // Google Places is optional — continue without it
  }

  const rating = placesData?.rating || 0
  const reviewCount = placesData?.user_ratings_total || 0
  const hasWebsite = !!placesData?.website

  // Estimate monthly missed calls based on business size / revenue range
  const revToMissedCalls: Record<string, number> = {
    under_100k: 8,
    '100k_500k': 18,
    '500k_2m': 40,
    '2m_4m': 80,
    '4m_plus': 150,
  }
  const estimatedMissedCalls = revToMissedCalls[revenueRange] || 18
  const avgJobValue = 350
  const conversionRate = 0.38
  roiEstimate = Math.round(estimatedMissedCalls * avgJobValue * conversionRate)

  try {
    const contextBlurb = placesData
      ? `Business: ${placesData.name}. Google rating: ${rating}/5 (${reviewCount} reviews). ${hasWebsite ? 'Has website.' : 'No website found.'}`
      : `Business name: ${businessName}. Business type: ${businessType}.`

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `You are writing a short "AI receptionist opportunity" summary for a home service contractor who just signed up for BellAveGo.

${contextBlurb}
Revenue range: ${revenueRange}. Estimated monthly missed calls: ${estimatedMissedCalls}.
Estimated monthly revenue recovery if all calls captured: $${roiEstimate}.

Write 2 sentences max. Be specific and exciting. Focus on the revenue opportunity.`,
      }],
    })
    aiSummary = msg.content[0].type === 'text' ? msg.content[0].text : ''
  } catch {
    aiSummary = `Based on your business size, you could recover approximately $${roiEstimate.toLocaleString()}/month in missed call revenue with BellAveGo answering every call.`
  }

  await supabase.from('diagnostics').insert({
    profile_id: userId,
    business_name: businessName,
    google_rating: rating || null,
    google_review_count: reviewCount || null,
    has_website: hasWebsite,
    estimated_missed_calls_per_month: estimatedMissedCalls,
    estimated_monthly_roi: roiEstimate,
    ai_summary: aiSummary,
    raw_places_data: placesData || null,
  })

  return NextResponse.json({
    ok: true,
    roi: roiEstimate,
    summary: aiSummary,
    missedCalls: estimatedMissedCalls,
    rating,
    reviewCount,
  })
}
