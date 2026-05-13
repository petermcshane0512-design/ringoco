/**
 * Marketing Ops Agent — the orchestrator for the Concierge tier weekly run.
 *
 * Deterministic by design (not a Claude tool-use loop). Each underlying skill
 * uses Claude where reasoning is needed; this file is the choreographer: it
 * decides order, gates on settings flags, swallows per-skill errors so the
 * weekly report still ships even if one source failed.
 *
 * Lives in src/lib/marketing/agent.ts (runtime) — the matching spec doc is in
 * agents/marketing-ops-agent.md.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { pollAndStoreAlertsForCustomer } from './weather-trigger'
import { scanPermitsForCustomer, type Metro } from './permit-scanner'
import { watchCompetitorsForCustomer } from './competitor-watcher'
import { generateCreativesForCustomer } from './ad-creative-generator'
import { generateAndPublishPost } from './local-seo-publisher'
import { runReactivationCampaign } from './reactivation-campaign'
import { buildAndStoreWeeklyReport } from './strategy-report'
import { notifyArtifactReady } from '../notify'

export type AgentRunResult = {
  userId: string
  steps: Record<string, { ok: boolean; detail?: string; error?: string }>
  reportUrl?: string
  notified: { sms: boolean; email: boolean }
}

type ConciergeSettings = {
  user_id: string
  service_area_zips?: string[] | null
  competitor_place_ids?: string[] | null
  website_url?: string | null
  website_provider?: string | null
  website_api_token?: string | null
  website_collection_id?: string | null
  google_place_id?: string | null
  reactivation_enabled?: boolean | null
  weather_triggers_enabled?: boolean | null
  permits_enabled?: boolean | null
  competitor_watch_enabled?: boolean | null
}

type Profile = {
  user_id: string
  business_name?: string | null
  owner_phone?: string | null
  twilio_number?: string | null
  service_area?: string | null
  services?: string | null
  plan_tier?: string | null
  is_active?: boolean | null
}

/**
 * Map service-area free-text → first two-letter state code we can find.
 * Crude for MVP; real impl uses ZIP-to-state crosswalk.
 */
function inferStateCode(serviceArea: string | null | undefined): string | null {
  if (!serviceArea) return null
  const m = serviceArea.toUpperCase().match(/\b([A-Z]{2})\b/)
  return m ? m[1] : null
}

function inferMetro(serviceArea: string | null | undefined): Metro | null {
  if (!serviceArea) return null
  const s = serviceArea.toLowerCase()
  if (s.includes('new york') || s.includes('nyc') || s.includes('manhattan') || s.includes('brooklyn') || s.includes('queens') || s.includes('bronx')) return 'nyc'
  if (s.includes('chicago')) return 'chicago'
  if (s.includes('los angeles') || s.includes(' la ') || s.endsWith(' la')) return 'la'
  if (s.includes('atlanta')) return 'atlanta'
  if (s.includes('houston')) return 'houston'
  if (s.includes('phoenix') || s.includes('scottsdale') || s.includes('tempe') || s.includes('mesa')) return 'phoenix'
  return null
}

function inferPrimaryTrade(services: string | null | undefined): string {
  if (!services) return 'home services'
  const s = services.toLowerCase()
  if (s.includes('hvac')) return 'HVAC'
  if (s.includes('plumb')) return 'plumber'
  if (s.includes('electric')) return 'electrician'
  if (s.includes('roof')) return 'roofer'
  return services.split(',')[0].trim()
}

function inferPrimaryCity(serviceArea: string | null | undefined): string {
  if (!serviceArea) return 'your area'
  return serviceArea.split(',')[0].trim()
}

export async function runMarketingOpsForCustomer(args: {
  supabase: SupabaseClient
  userId: string
}): Promise<AgentRunResult> {
  const steps: AgentRunResult['steps'] = {}
  const safeRun = async (name: string, fn: () => Promise<string>) => {
    try {
      const detail = await fn()
      steps[name] = { ok: true, detail }
    } catch (e) {
      steps[name] = { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  // Load profile + concierge_settings
  const { data: profile } = await args.supabase
    .from('profiles')
    .select('user_id, business_name, owner_phone, twilio_number, service_area, services, plan_tier, is_active')
    .eq('user_id', args.userId)
    .maybeSingle<Profile>()

  if (!profile?.is_active) {
    return { userId: args.userId, steps: { gate: { ok: false, error: 'profile inactive' } }, notified: { sms: false, email: false } }
  }
  if (profile.plan_tier !== 'concierge') {
    return { userId: args.userId, steps: { gate: { ok: false, error: `not concierge tier (is ${profile.plan_tier})` } }, notified: { sms: false, email: false } }
  }

  const { data: settings } = await args.supabase
    .from('concierge_settings')
    .select('*')
    .eq('user_id', args.userId)
    .maybeSingle<ConciergeSettings>()

  const stateCode = inferStateCode(profile.service_area)
  const metro = inferMetro(profile.service_area)

  // 1. Weather alerts (free, fast, may trigger reactivation later)
  if (settings?.weather_triggers_enabled !== false && stateCode) {
    await safeRun('weather', async () => {
      const r = await pollAndStoreAlertsForCustomer({
        supabase: args.supabase, userId: args.userId, stateCode,
      })
      return `${r.stored} alerts stored, ${r.skipped} skipped`
    })
  }

  // 2. Permits (free, slow-ish)
  if (settings?.permits_enabled !== false && metro) {
    await safeRun('permits', async () => {
      const r = await scanPermitsForCustomer({
        supabase: args.supabase, userId: args.userId, metro,
        zipFilter: settings?.service_area_zips ?? undefined,
      })
      return `${r.stored} permits stored from ${metro}`
    })
  }

  // 3. Competitor snapshots (paid API but cheap)
  if (settings?.competitor_watch_enabled !== false && settings?.competitor_place_ids?.length) {
    await safeRun('competitors', async () => {
      const r = await watchCompetitorsForCustomer({
        supabase: args.supabase, userId: args.userId,
        competitorPlaceIds: settings.competitor_place_ids!,
      })
      return `${r.snapshotsStored}/${r.competitors} competitor snapshots, ${r.newReviewsTotal} new reviews`
    })
  }

  // 4. Ad creatives (Claude — costs tokens, but cheap)
  await safeRun('ad_creatives', async () => {
    const r = await generateCreativesForCustomer({
      supabase: args.supabase,
      userId: args.userId,
      businessName: profile.business_name ?? 'the business',
      services: profile.services ?? 'home services',
      serviceArea: profile.service_area ?? 'your area',
    })
    return `${r.stored} creatives stored (${r.failures} failures)`
  })

  // 5. SEO blog post (Claude + optional publish)
  await safeRun('seo_post', async () => {
    const r = await generateAndPublishPost({
      supabase: args.supabase,
      userId: args.userId,
      businessName: profile.business_name ?? 'the business',
      phone: profile.owner_phone ?? '',
      trade: inferPrimaryTrade(profile.services),
      city: inferPrimaryCity(profile.service_area),
      websiteUrl: settings?.website_url ?? undefined,
      websiteProvider: settings?.website_provider ?? undefined,
      websiteApiToken: settings?.website_api_token ?? undefined,
      websiteCollectionId: settings?.website_collection_id ?? undefined,
    })
    return r.published_url ? `published: ${r.published_url}` : (r.ok ? 'drafted (no publish creds)' : `error: ${r.error}`)
  })

  // 6. Reactivation campaign — only if a severe weather event happened this week
  if (settings?.reactivation_enabled !== false) {
    const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString()
    const { data: triggers } = await args.supabase
      .from('weather_triggers')
      .select('event_type, severity')
      .eq('user_id', args.userId)
      .eq('campaign_triggered', false)
      .gte('created_at', since)
      .limit(1)
    if (triggers && triggers.length > 0 && profile.owner_phone) {
      await safeRun('reactivation', async () => {
        const event = (triggers[0] as { event_type?: string }).event_type ?? 'severe weather'
        const r = await runReactivationCampaign({
          supabase: args.supabase,
          userId: args.userId,
          trigger: 'weather',
          contextHook: `${event.toLowerCase()} just hit ${inferPrimaryCity(profile.service_area)} — wanted to check on you`,
          businessName: profile.business_name ?? 'we',
          fromNumber: profile.twilio_number ?? process.env.TWILIO_PHONE_NUMBER!,
        })
        // Mark the trigger so we don't fire again next week
        await args.supabase.from('weather_triggers').update({ campaign_triggered: true })
          .eq('user_id', args.userId).eq('campaign_triggered', false)
        return `${r.sent} reactivation SMS sent (${r.suppressed} suppressed)`
      })
    }
  }

  // 7. Build + store the weekly strategy report
  let reportUrl: string | undefined
  await safeRun('weekly_report', async () => {
    const weekStart = new Date()
    weekStart.setUTCHours(0, 0, 0, 0)
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay() + 1)  // Monday of current week
    const r = await buildAndStoreWeeklyReport({
      supabase: args.supabase,
      userId: args.userId,
      businessName: profile.business_name ?? 'your business',
      weekStart,
    })
    reportUrl = r.publicUrl
    return `report ${r.reportId} ready`
  })

  // 8. Notify the customer (SMS + email)
  let notified = { sms: false, email: false }
  if (reportUrl) {
    notified = await notifyArtifactReady({
      supabase: args.supabase,
      userId: args.userId,
      artifactType: 'weekly_report',
      title: 'Your weekly strategy report is ready',
      shortBody: `Open the report below — fresh insights from your AI Account Manager.`,
      publicUrl: reportUrl,
    })
  }

  return { userId: args.userId, steps, reportUrl, notified }
}
