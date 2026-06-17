import type { Metadata } from 'next'
import Link from 'next/link'
import { CITIES } from '@/lib/seo/cities'
import { TRADES } from '@/lib/seo/trades'
import { BRAND_NAME, PRICE_MONTHLY_USD, TRIAL_DAYS, LEADS_PER_WEEK } from '@/lib/offer'

/**
 * /leads — hub for the programmatic SEO tree (2026-06-17). Links every
 * city so crawlers reach all 312 city×trade pages within 2 hops of the
 * sitemap. Also a real landing page for "free contractor leads" searches.
 */

export const metadata: Metadata = {
  title: `Free Contractor Leads by City & Trade | ${BRAND_NAME}`,
  description: `Free homeowner leads for roofing, HVAC, plumbing, electrical, masonry & landscaping contractors — pulled from public permit & code-enforcement records. First lead free, ${TRIAL_DAYS} days free, then $${PRICE_MONTHLY_USD}/mo. One shop per zip.`,
  alternates: { canonical: 'https://www.bellavego.com/leads' },
}

export default function LeadsHubPage() {
  const byState = new Map<string, typeof CITIES[number][]>()
  for (const c of CITIES) {
    if (!byState.has(c.stateFull)) byState.set(c.stateFull, [])
    byState.get(c.stateFull)!.push(c)
  }
  const states = [...byState.keys()].sort()

  return (
    <main className="min-h-screen bg-[#0b0e14] text-white">
      <section className="mx-auto max-w-4xl px-5 pt-16 pb-10 text-center">
        <h1 className="text-4xl font-black sm:text-5xl">Free contractor leads, by city</h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-300">
          Real homeowners pulled from public permit &amp; code-enforcement records — name, address, phone.
          {' '}{LEADS_PER_WEEK} fresh every Monday. First lead free, {TRIAL_DAYS} days free, then ${PRICE_MONTHLY_USD}/mo.
          One shop per zip.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          {TRADES.map((t) => (
            <span key={t.slug} className="rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-sm text-orange-300">
              {t.label}
            </span>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 pb-16">
        {states.map((state) => (
          <div key={state} className="border-t border-white/10 py-7">
            <h2 className="text-xl font-bold">{state}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {byState.get(state)!.map((c) => (
                <Link key={c.slug} href={`/leads/${c.slug}`} className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-gray-300 hover:border-orange-500/50 hover:text-orange-300">
                  {c.label} leads
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>
    </main>
  )
}
