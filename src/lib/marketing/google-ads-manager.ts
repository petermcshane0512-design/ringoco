/**
 * Google Ads campaign manager — STUB.
 *
 * Activates when:
 *   1. GOOGLE_ADS_DEVELOPER_TOKEN env var set (from Google Ads API console)
 *   2. GOOGLE_ADS_MCC_ID env var set (the approved Manager Account ID)
 *   3. Customer has linked their Google Ads account to our MCC (concierge_settings.google_ads_customer_id)
 *
 * When approved, replace `enabled: false` paths with real Google Ads API v17 calls.
 * Reference: https://developers.google.com/google-ads/api/docs/start
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export function isGoogleAdsEnabled(): boolean {
  return !!process.env.GOOGLE_ADS_DEVELOPER_TOKEN && !!process.env.GOOGLE_ADS_MCC_ID
}

export type AdCampaignCreateInput = {
  customerGoogleAdsId: string
  campaignName: string
  dailyBudgetCents: number
  headlines: string[]
  descriptions: string[]
  finalUrl: string
  locationTargetIds?: string[]
}

export async function createCampaign(_args: AdCampaignCreateInput): Promise<{ ok: boolean; externalId?: string; error?: string }> {
  if (!isGoogleAdsEnabled()) {
    return { ok: false, error: 'Google Ads MCC approval pending. Creative is queued and will go live automatically when approval lands.' }
  }
  // TODO: Implement Google Ads API v17 client.
  //   - OAuth2 client using developer token
  //   - mutate campaigns.create + ad_group.create + ad_group_ad.create
  //   - Return campaign resource name
  return { ok: false, error: 'Google Ads adapter not yet implemented (stub)' }
}

export async function pullDailyMetrics(_args: { supabase: SupabaseClient; userId: string }): Promise<{ updated: number; error?: string }> {
  if (!isGoogleAdsEnabled()) return { updated: 0, error: 'gated' }
  // TODO: GAQL query: impressions, clicks, conversions, cost_micros per campaign.
  // Update marketing_campaigns rows + record spend via recordAdSpend() in growth-wallet.
  return { updated: 0 }
}
