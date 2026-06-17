import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CITIES, getCity } from '@/lib/seo/cities'
import { TRADES } from '@/lib/seo/trades'
import { BRAND_NAME, PRICE_MONTHLY_USD, TRIAL_DAYS, LEADS_PER_WEEK, FOUNDER_PHONE, FOUNDER_PHONE_HREF } from '@/lib/offer'

/**
 * /leads/[city] — per-city index (2026-06-17). Links every trade page for
 * the city and ranks for "contractor leads {city}" head terms.
 */

export const dynamicParams = false

type Params = Promise<{ city: string }>

export function generateStaticParams() {
  return CITIES.map((c) => ({ city: c.slug }))
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { city: slug } = await params
  const city = getCity(slug)
  if (!city) return { title: 'Not found' }
  const title = `Free Contractor Leads in ${city.label}, ${city.state} | ${BRAND_NAME}`
  return {
    title,
    description: `Free homeowner leads for ${city.label} contractors — roofing, HVAC, plumbing, electrical, masonry, landscaping. From public permit & code records. First lead free, ${TRIAL_DAYS} days free, then $${PRICE_MONTHLY_USD}/mo.`,
    alternates: { canonical: `https://www.bellavego.com/leads/${slug}` },
  }
}

export default async function LeadsCityPage({ params }: { params: Params }) {
  const { city: slug } = await params
  const city = getCity(slug)
  if (!city) notFound()

  return (
    <main className="min-h-screen bg-[#0b0e14] text-white">
      <section className="mx-auto max-w-3xl px-5 pt-16 pb-8 text-center">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-orange-400">{city.stateFull}</p>
        <h1 className="text-4xl font-black sm:text-5xl">Free contractor leads in {city.label}</h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-300">
          Real {city.label} homeowners pulled from public permit &amp; code-enforcement records — name, address, phone.
          {' '}{LEADS_PER_WEEK} fresh every Monday. Pick your trade:
        </p>
      </section>

      <section className="mx-auto max-w-3xl px-5 pb-14">
        <div className="grid gap-3 sm:grid-cols-2">
          {TRADES.map((t) => (
            <Link key={t.slug} href={`/leads/${city.slug}/${t.slug}`} className="rounded-xl border border-white/10 bg-[#0e131c] p-5 transition hover:border-orange-500/50">
              <p className="text-lg font-bold">Free {t.label} leads</p>
              <p className="mt-1 text-sm text-gray-400">in {city.label}, {city.state} &rarr;</p>
            </Link>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-gray-500">
          First lead free, {TRIAL_DAYS} days free, then ${PRICE_MONTHLY_USD}/mo. One shop per zip.
          {' '}Questions? Call Peter: <a href={FOUNDER_PHONE_HREF} className="text-orange-400 underline">{FOUNDER_PHONE}</a>
        </p>
      </section>

      <footer className="border-t border-white/10 px-5 py-8 text-center text-xs text-gray-600">
        <Link href="/leads" className="hover:text-gray-400">All cities</Link>
        <span className="mx-2">&middot;</span>
        <Link href="/" className="hover:text-gray-400">{BRAND_NAME}</Link>
      </footer>
    </main>
  )
}
