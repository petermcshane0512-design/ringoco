/**
 * Meta (Facebook/Instagram) Ads campaign manager — STUB.
 *
 * Activates when:
 *   1. META_SYSTEM_USER_TOKEN env var set (from approved Meta Business Manager)
 *   2. Customer has granted our Business Manager partner access to their Ad Account
 *      (concierge_settings.meta_ad_account_id)
 *
 * Reference: https://developers.facebook.com/docs/marketing-api/get-started
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export function isMetaAdsEnabled(): boolean {
  return !!process.env.META_SYSTEM_USER_TOKEN
}

export type MetaCampaignCreateInput = {
  customerAdAccountId: string
  campaignName: string
  dailyBudgetCents: number
  headline: string
  primaryText: string
  imageUrl?: string
  landingPageUrl: string
}

export async function createCampaign(_args: MetaCampaignCreateInput): Promise<{ ok: boolean; externalId?: string; error?: string }> {
  if (!isMetaAdsEnabled()) {
    return { ok: false, error: 'Meta Business Manager approval pending. Creative is queued and will go live automatically when approval lands.' }
  }
  // TODO: POST /act_{ad_account_id}/campaigns
  //   POST /act_{ad_account_id}/adsets (audience, placement, budget)
  //   POST /act_{ad_account_id}/adcreatives (headline, primary text, image)
  //   POST /act_{ad_account_id}/ads (links the above)
  return { ok: false, error: 'Meta Ads adapter not yet implemented (stub)' }
}

export async function pullDailyMetrics(_args: { supabase: SupabaseClient; userId: string }): Promise<{ updated: number; error?: string }> {
  if (!isMetaAdsEnabled()) return { updated: 0, error: 'gated' }
  // TODO: GET /act_{id}/insights with fields impressions,clicks,actions,spend daily.
  return { updated: 0 }
}
