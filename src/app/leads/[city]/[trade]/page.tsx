import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CITIES, getCity } from '@/lib/seo/cities'
import { TRADES, getTrade } from '@/lib/seo/trades'
import {
  PRICE_MONTHLY_USD,
  TRIAL_DAYS,
  LEADS_PER_WEEK,
  FOUNDER_PHONE,
  FOUNDER_PHONE_HREF,
  BRAND_NAME,
} from '@/lib/offer'

/**
 * /leads/[city]/[trade] — programmatic SEO landing pages (2026-06-17).
 *
 * 52 cities × 6 trades = 312 pages targeting the highest-intent search
 * a contractor types: "free roofing leads chicago", "hvac leads near me",
 * "how to get plumbing customers dallas".
 *
 * Each page is INBOUND: a contractor searching for leads finds us, sees
 * one real homeowner lead is free, and the public-records angle makes the
 * "too good to be true" offer credible. CTA -> /start (zip lock, 2 wks free).
 *
 * Autonomous + zero gatekeeper: generated from cities.ts × trades.ts,
 * ISR-revalidated daily, enforcement counts pulled live from Supabase.
 * Compounds for free — no ad spend, no A2P, no Meta.
 */

export const dynamicParams = false // only the 312 known combos
// 2026-06-18 — pure static, NO build-time DB. A per-page Supabase count
// across 312 pages was the prime suspect for the Vercel build dropping the
// /leads segment (per-page generation timeout / rate-limit on the builder,
// invisible to a fast local build). Credibility copy is now evergreen.

type Params = Promise<{ city: string; trade: string }>

export function generateStaticParams() {
  return CITIES.flatMap((c) =>
    TRADES.map((t) => ({ city: c.slug, trade: t.slug })),
  )
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { city: citySlug, trade: tradeSlug } = await params
  const city = getCity(citySlug)
  const trade = getTrade(tradeSlug)
  if (!city || !trade) return { title: 'Not found' }
  const title = `Free ${trade.label} Leads in ${city.label}, ${city.state} | ${BRAND_NAME}`
  const url = `https://www.bellavego.com/leads/${citySlug}/${tradeSlug}`
  return {
    title,
    description: trade.metaDesc(city.label),
    alternates: { canonical: url },
    openGraph: { title, description: trade.metaDesc(city.label), url, type: 'website' },
    robots: { index: true, follow: true },
  }
}

export default async function LeadsCityTradePage({ params }: { params: Params }) {
  const { city: citySlug, trade: tradeSlug } = await params
  const city = getCity(citySlug)
  const trade = getTrade(tradeSlug)
  if (!city || !trade) notFound()

  const leadHook = trade.leadHook.replace(/\{city\}/g, `${city.label}, ${city.state}`)
  const startHref = `/start?city=${encodeURIComponent(city.label)}&trade=${trade.slug}`

  // Sibling trades in same city + nearby cities — internal links for crawl depth
  const otherTrades = TRADES.filter((t) => t.slug !== trade.slug)
  const sameStateCities = CITIES.filter((c) => c.state === city.state && c.slug !== city.slug).slice(0, 6)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: `Free ${trade.label} Leads in ${city.label}`,
    serviceType: `${trade.label} contractor lead generation`,
    areaServed: { '@type': 'City', name: city.label, address: { '@type': 'PostalAddress', addressRegion: city.state } },
    provider: { '@type': 'Organization', name: BRAND_NAME, telephone: FOUNDER_PHONE, url: 'https://www.bellavego.com' },
    offers: {
      '@type': 'Offer',
      price: PRICE_MONTHLY_USD,
      priceCurrency: 'USD',
      description: `${TRIAL_DAYS}-day free trial, then $${PRICE_MONTHLY_USD}/mo. First lead free.`,
    },
  }

  return (
    <main className="min-h-screen bg-[#0b0e14] text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* HERO */}
      <section className="mx-auto max-w-3xl px-5 pt-16 pb-10 text-center">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-orange-400">
          {city.label}, {city.stateFull} &middot; {trade.label} contractors
        </p>
        <h1 className="text-4xl font-black leading-tight sm:text-5xl">
          Free {trade.label} Leads in {city.label}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-300">{leadHook}</p>

        <p className="mx-auto mt-5 inline-block rounded-full border border-orange-500/40 bg-orange-500/10 px-4 py-2 text-sm font-semibold text-orange-300">
          Fresh {city.label} homeowner leads from public records every Monday
        </p>

        <div className="mt-8 flex flex-col items-center gap-3">
          <Link
            href={startHref}
            className="rounded-xl bg-orange-500 px-8 py-4 text-lg font-bold text-black transition hover:bg-orange-400"
          >
            See your first {city.label} lead free &rarr;
          </Link>
          <p className="text-sm text-gray-500">
            No card. {TRIAL_DAYS} days free, then ${PRICE_MONTHLY_USD}/mo. One {trade.pluralLabel.replace(/s$/, '')} per zip.
          </p>
        </div>
      </section>

      {/* WHY THIS IS REAL — the "too good to be true" disarm */}
      <section className="border-t border-white/10 bg-[#0e131c]">
        <div className="mx-auto max-w-3xl px-5 py-12">
          <h2 className="text-2xl font-bold">Why {city.label} {trade.pluralLabel} get free leads from us</h2>
          <p className="mt-4 text-gray-300">{trade.enforcementAngle}</p>
          <p className="mt-4 text-gray-300">
            We monitor {city.label}&apos;s public code-enforcement and permit feeds every night, skip-trace the
            homeowner&apos;s phone, and hand the lead to one local {trade.label.toLowerCase()} shop. It&apos;s public
            record — you could pull it yourself. We just do it for you, every Monday.
          </p>
          <p className="mt-4 text-sm text-gray-500">
            Sounds too good to be true? That&apos;s exactly why the first lead is free and there&apos;s no card.
            Pull it up with the city yourself, or call Peter, a real person: {' '}
            <a href={FOUNDER_PHONE_HREF} className="text-orange-400 underline">{FOUNDER_PHONE}</a>.
          </p>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="mx-auto max-w-3xl px-5 py-12">
        <h2 className="text-2xl font-bold">How it works</h2>
        <ol className="mt-6 space-y-4">
          {[
            [`Lock your ${city.label} zip`, `One ${trade.label.toLowerCase()} shop per zip code. Once you claim it, no competitor in your area can get these leads.`],
            ['See your first lead free', `Name, address, phone, the violation/permit, and an AI script to call them. $0, no card.`],
            [`Get ${LEADS_PER_WEEK} fresh leads every Monday`, `${TRIAL_DAYS} days free. Cancel anytime before the trial ends and you&apos;re never charged. After that, $${PRICE_MONTHLY_USD}/mo flat — no per-lead fees, no contract.`],
          ].map(([h, b], i) => (
            <li key={i} className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500 font-bold text-black">{i + 1}</span>
              <div>
                <p className="font-semibold">{h}</p>
                <p className="text-sm text-gray-400" dangerouslySetInnerHTML={{ __html: b }} />
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* OFFER / CTA */}
      <section className="border-t border-white/10 bg-[#0e131c]">
        <div className="mx-auto max-w-3xl px-5 py-14 text-center">
          <h2 className="text-3xl font-black">
            {LEADS_PER_WEEK} {trade.label} leads a week in {city.label}, free for {TRIAL_DAYS} days
          </h2>
          <p className="mt-4 text-gray-300">
            One job pays for {BRAND_NAME} for years — {trade.label.toLowerCase()} tickets average ~$
            {trade.avgJobUsd.toLocaleString()}. Then it&apos;s ${PRICE_MONTHLY_USD}/mo flat.
          </p>
          <Link
            href={startHref}
            className="mt-8 inline-block rounded-xl bg-orange-500 px-8 py-4 text-lg font-bold text-black transition hover:bg-orange-400"
          >
            Claim your {city.label} zip &rarr;
          </Link>
        </div>
      </section>

      {/* INTERNAL LINKS — crawl depth + long-tail */}
      <section className="mx-auto max-w-3xl px-5 py-12 text-sm">
        <h2 className="text-lg font-bold text-gray-300">More {city.label} contractor leads</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {otherTrades.map((t) => (
            <Link key={t.slug} href={`/leads/${city.slug}/${t.slug}`} className="rounded-lg border border-white/10 px-3 py-1.5 text-gray-400 hover:border-orange-500/50 hover:text-orange-300">
              Free {t.label} leads in {city.label}
            </Link>
          ))}
        </div>
        {sameStateCities.length > 0 && (
          <>
            <h2 className="mt-8 text-lg font-bold text-gray-300">{trade.label} leads in other {city.stateFull} cities</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {sameStateCities.map((c) => (
                <Link key={c.slug} href={`/leads/${c.slug}/${trade.slug}`} className="rounded-lg border border-white/10 px-3 py-1.5 text-gray-400 hover:border-orange-500/50 hover:text-orange-300">
                  {trade.label} leads in {c.label}
                </Link>
              ))}
            </div>
          </>
        )}
      </section>

      <footer className="border-t border-white/10 px-5 py-8 text-center text-xs text-gray-600">
        <Link href="/leads" className="hover:text-gray-400">All cities &amp; trades</Link>
        <span className="mx-2">&middot;</span>
        <Link href="/" className="hover:text-gray-400">{BRAND_NAME}</Link>
        <span className="mx-2">&middot;</span>
        <a href={FOUNDER_PHONE_HREF} className="hover:text-gray-400">{FOUNDER_PHONE}</a>
      </footer>
    </main>
  )
}
