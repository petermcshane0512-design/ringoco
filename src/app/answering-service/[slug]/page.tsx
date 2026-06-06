import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { TRADES, getTrade } from '@/lib/seo/trades'
import { CITIES, getCity } from '@/lib/seo/cities'
import { getTopShops } from '@/lib/seo/getTopShops'

// Pre-generate every (trade × city) at build time. 6 trades × 50 cities = 300 pages.
export async function generateStaticParams() {
  const params: Array<{ slug: string }> = []
  for (const t of TRADES) for (const c of CITIES) params.push({ slug: `${t.slug}-${c.slug}` })
  return params
}

// ISR — refresh the page (and its shop data) every 7 days.
export const revalidate = 604800

type ParseResult = { tradeSlug: string; citySlug: string } | null
function parseSlug(slug: string): ParseResult {
  for (const t of TRADES) {
    const prefix = `${t.slug}-`
    if (slug.startsWith(prefix)) {
      const citySlug = slug.slice(prefix.length)
      return { tradeSlug: t.slug, citySlug }
    }
  }
  return null
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const parsed = parseSlug(slug)
  if (!parsed) return { title: 'BellAveGo' }
  const trade = getTrade(parsed.tradeSlug)
  const city = getCity(parsed.citySlug)
  if (!trade || !city) return { title: 'BellAveGo' }
  const title = `Best AI Receptionist for ${trade.pluralLabel} in ${city.label}, ${city.state} — $297/mo`
  const description = trade.metaDesc(`${city.label}, ${city.state}`)
  const canonical = `https://www.bellavego.com/answering-service/${slug}`
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const parsed = parseSlug(slug)
  if (!parsed) notFound()
  const trade = getTrade(parsed.tradeSlug)
  const city = getCity(parsed.citySlug)
  if (!trade || !city) notFound()

  const cityFull = `${city.label}, ${city.state}`
  const shops = await getTopShops(trade.slug, city.slug, trade.googleQuery, city.label, city.state)

  // JSON-LD Service schema so Google understands this is a localized service offering
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    serviceType: `AI receptionist for ${trade.pluralLabel}`,
    provider: {
      '@type': 'Organization',
      name: 'BellAveGo',
      url: 'https://www.bellavego.com',
      logo: 'https://www.bellavego.com/logo.png',
      sameAs: ['https://www.bellavego.com'],
    },
    areaServed: {
      '@type': 'City',
      name: city.label,
      containedInPlace: { '@type': 'State', name: city.stateFull },
    },
    offers: {
      '@type': 'Offer',
      price: '147',
      priceCurrency: 'USD',
      url: 'https://www.bellavego.com/pricing',
      availability: 'https://schema.org/InStock',
    },
    description: trade.metaDesc(cityFull),
  }

  const autoCheckoutUrl = `/pricing?tier=officemgr&interval=monthly&autocheckout=1&utm_source=seo&utm_medium=organic&utm_campaign=${trade.slug}-${city.slug}`

  return (
    <main style={{ fontFamily: "'Inter', system-ui, sans-serif", color: '#0B1F3A', background: '#F5FDFB' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* HERO */}
      <section style={{
        background: 'linear-gradient(160deg, #0B1F3A 0%, #163356 55%, #0D8F87 110%)',
        color: '#fff',
        padding: '64px 24px 56px',
      }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#5EEAD4', marginBottom: 12 }}>
            AI receptionist · {cityFull}
          </div>
          <h1 style={{ fontSize: 'clamp(28px, 4.5vw, 48px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.1, margin: '0 0 14px' }}>
            Best AI receptionist for {trade.pluralLabel} in {cityFull}
          </h1>
          <p style={{ fontSize: 'clamp(15px, 1.6vw, 18px)', lineHeight: 1.6, maxWidth: 720, margin: '0 0 26px', color: 'rgba(255,255,255,0.86)' }}>
            {trade.pitchHook}
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <Link
              href={autoCheckoutUrl}
              style={{
                padding: '16px 28px',
                background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 100%)',
                color: '#fff',
                textDecoration: 'none',
                borderRadius: 12,
                fontSize: 16, fontWeight: 800,
                boxShadow: '0 8px 24px rgba(232,116,43,0.42)',
              }}
            >
              Get started — 30-day money back →
            </Link>
            <a
              href="tel:+16514677829"
              style={{
                padding: '15px 22px',
                background: 'rgba(255,255,255,0.08)',
                color: '#fff',
                textDecoration: 'none',
                borderRadius: 12,
                fontSize: 15, fontWeight: 800,
                border: '1.5px solid rgba(255,255,255,0.18)',
              }}
            >
              📞 Hear Emma live — (651) 467-7829
            </a>
          </div>
          <div style={{ marginTop: 18, display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>
            <span>✓ No card to start</span>
            <span>✓ Local {city.state} number</span>
            <span>✓ Cancel anytime · day 1-7</span>
          </div>
        </div>
      </section>

      {/* WHY HVAC SHOPS NEED THIS */}
      <section style={{ padding: '50px 24px', background: '#fff' }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <h2 style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 8 }}>
            Why {trade.pluralLabel} in {city.label} choose BellAveGo
          </h2>
          <p style={{ fontSize: 15, color: '#4A6670', lineHeight: 1.6, marginBottom: 26 }}>
            Built for shops with 1–5 employees. Emma answers every call, qualifies the lead, and texts you the details in 10 seconds — so you can keep working and close more jobs.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            {[
              { icon: '📞', title: '24/7 call answering', body: 'Emma picks up after the first ring, every time. Even at 2 AM Sunday.' },
              { icon: '⚡', title: '10-second lead alert', body: 'Push + SMS + email the moment Emma captures a job. You call back warm.' },
              { icon: '📅', title: 'Books appointments', body: 'Optional: connect Google or Outlook. Emma offers real slots from your free time.' },
              { icon: '💰', title: '$40K cheaper than hiring', body: 'A US receptionist costs $40K+/yr. Emma is $297/mo. Same job. Better hours.' },
            ].map((b) => (
              <div key={b.title} style={{
                background: '#F5FDFB',
                border: '1.5px solid rgba(10,168,159,0.16)',
                borderRadius: 14, padding: '18px 18px',
              }}>
                <div style={{ fontSize: 22, marginBottom: 8 }}>{b.icon}</div>
                <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>{b.title}</div>
                <div style={{ fontSize: 13, color: '#4A6670', lineHeight: 1.5 }}>{b.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TOP SHOPS */}
      {shops.length > 0 && (
        <section style={{ padding: '50px 24px', background: '#F5FDFB' }}>
          <div style={{ maxWidth: 980, margin: '0 auto' }}>
            <h2 style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 6 }}>
              Top {trade.pluralLabel} in {cityFull}
            </h2>
            <p style={{ fontSize: 13, color: '#7AAAB2', marginBottom: 22 }}>
              The {shops.length} highest-rated {trade.label.toLowerCase()} shops in the {city.label} area, ranked by Google review volume.
            </p>
            <div style={{ display: 'grid', gap: 12 }}>
              {shops.map((s, i) => (
                <div key={i} style={{
                  background: '#fff',
                  border: '1px solid rgba(10,168,159,0.14)',
                  borderRadius: 12,
                  padding: '14px 18px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap',
                }}>
                  <div style={{ flex: '1 1 280px' }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#0B1F3A' }}>{i + 1}. {s.name}</div>
                    {s.address && <div style={{ fontSize: 12, color: '#7AAAB2', marginTop: 2 }}>{s.address}</div>}
                    {s.website && (
                      <a href={s.website} target="_blank" rel="noopener noreferrer nofollow"
                        style={{ fontSize: 12, color: '#0AA89F', textDecoration: 'none', fontWeight: 700, marginTop: 4, display: 'inline-block' }}>
                        {new URL(s.website).hostname.replace(/^www\./, '')}
                      </a>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {s.rating !== null && (
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#E8742B' }}>
                        ★ {s.rating.toFixed(1)}
                      </div>
                    )}
                    {s.reviews > 0 && (
                      <div style={{ fontSize: 11, color: '#7AAAB2' }}>{s.reviews.toLocaleString()} reviews</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 18, padding: '14px 16px', background: '#fff', borderRadius: 12, border: '1.5px dashed rgba(10,168,159,0.25)' }}>
              <strong style={{ color: '#0AA89F' }}>Own one of these shops?</strong>{' '}
              <span style={{ color: '#4A6670', fontSize: 14 }}>
                Get a free missed-call audit for your business — see exactly how many leads BellAveGo would recover.{' '}
              </span>
              <Link href={autoCheckoutUrl} style={{ color: '#0AA89F', fontWeight: 800, textDecoration: 'none' }}>
                Get started →
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* PRICING */}
      <section style={{ padding: '50px 24px', background: '#fff' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 10 }}>
            One price. No setup fee. Cancel any time.
          </h2>
          <div style={{ fontSize: 60, fontWeight: 900, color: '#0AA89F', letterSpacing: '-2px', lineHeight: 1 }}>$297</div>
          <div style={{ fontSize: 14, color: '#7AAAB2', marginBottom: 22 }}>per month · unlimited calls · 5 fresh leads every Monday</div>
          <Link href={autoCheckoutUrl} style={{
            display: 'inline-block',
            padding: '18px 36px',
            background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 100%)',
            color: '#fff', textDecoration: 'none',
            borderRadius: 12, fontSize: 17, fontWeight: 800,
            boxShadow: '0 10px 28px rgba(232,116,43,0.42)',
          }}>
            Get started — 30-day money back →
          </Link>
          <div style={{ marginTop: 14, fontSize: 12, color: '#7AAAB2' }}>
            30-day money-back guarantee. Cancel any time from your dashboard, we refund every penny.
          </div>
        </div>
      </section>

      {/* FOOTER LINKS — other cities for this trade (helps Google crawl + interlink) */}
      <section style={{ padding: '40px 24px 60px', background: '#0B1F3A', color: 'rgba(255,255,255,0.8)' }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#5EEAD4', marginBottom: 14 }}>
            AI receptionist for {trade.pluralLabel} — other cities
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, fontSize: 13 }}>
            {CITIES.filter((c) => c.slug !== city.slug).slice(0, 24).map((c) => (
              <Link key={c.slug}
                href={`/answering-service/${trade.slug}-${c.slug}`}
                style={{ color: 'rgba(255,255,255,0.78)', textDecoration: 'none' }}>
                {c.label}, {c.state}
              </Link>
            ))}
          </div>
          <div style={{ marginTop: 24, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
            <Link href="/" style={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>BellAveGo</Link> · AI receptionist for home-service contractors · © {new Date().getFullYear()}
          </div>
        </div>
      </section>
    </main>
  )
}
