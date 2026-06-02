import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { TRADES, getTrade } from '@/lib/seo/trades'
import { CITIES } from '@/lib/seo/cities'

/**
 * National trade hub pages — /answering-service-for-hvac etc.
 *
 * One page per trade. Targets high-volume national keywords like
 * "AI receptionist HVAC" or "answering service for plumbers" — bigger
 * search volume than city-level variants. Acts as the parent page that
 * interlinks to all 50 city variants in the /answering-service/[slug]
 * directory.
 *
 * 6 pages total. Pre-rendered at build time. ISR refresh weekly.
 */
export async function generateStaticParams() {
  return TRADES.map((t) => ({ trade: t.slug }))
}

export const revalidate = 604800

export async function generateMetadata({ params }: { params: Promise<{ trade: string }> }): Promise<Metadata> {
  const { trade: tradeSlug } = await params
  const trade = getTrade(tradeSlug)
  if (!trade) return { title: 'BellAveGo' }
  const title = `AI Receptionist for ${trade.pluralLabel} — $147/mo · BellAveGo`
  const description = `${trade.metaDesc('the United States')} Available in 50+ US metros.`
  const canonical = `https://www.bellavego.com/answering-service-for-${tradeSlug}`
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function Page({ params }: { params: Promise<{ trade: string }> }) {
  const { trade: tradeSlug } = await params
  const trade = getTrade(tradeSlug)
  if (!trade) notFound()

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    serviceType: `AI receptionist for ${trade.pluralLabel}`,
    provider: {
      '@type': 'Organization',
      name: 'BellAveGo',
      url: 'https://www.bellavego.com',
      logo: 'https://www.bellavego.com/logo.png',
    },
    areaServed: { '@type': 'Country', name: 'United States' },
    offers: {
      '@type': 'Offer', price: '147', priceCurrency: 'USD',
      url: 'https://www.bellavego.com/pricing', availability: 'https://schema.org/InStock',
    },
    description: trade.metaDesc('the United States'),
  }

  const autoCheckoutUrl = `/pricing?tier=receptionist&interval=monthly&autocheckout=1&utm_source=seo&utm_medium=organic&utm_campaign=trade-hub-${trade.slug}`

  return (
    <main style={{ fontFamily: "'Inter', system-ui, sans-serif", color: '#0B1F3A', background: '#F5FDFB' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section style={{
        background: 'linear-gradient(160deg, #0B1F3A 0%, #163356 55%, #0D8F87 110%)',
        color: '#fff',
        padding: '70px 24px 56px',
      }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#5EEAD4', marginBottom: 12 }}>
            AI receptionist · {trade.label} contractors nationwide
          </div>
          <h1 style={{ fontSize: 'clamp(30px, 5vw, 52px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.05, margin: '0 0 16px' }}>
            AI Receptionist for {trade.pluralLabel}
          </h1>
          <p style={{ fontSize: 'clamp(15px, 1.6vw, 19px)', lineHeight: 1.55, maxWidth: 720, color: 'rgba(255,255,255,0.86)', margin: '0 0 28px' }}>
            {trade.pitchHook} Works in every US metro. Local number, instant lead alerts, $0 setup.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link href={autoCheckoutUrl} style={{
              padding: '16px 28px', background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 100%)',
              color: '#fff', textDecoration: 'none', borderRadius: 12,
              fontSize: 16, fontWeight: 800, boxShadow: '0 8px 24px rgba(232,116,43,0.42)',
            }}>
              Start 7-day free trial →
            </Link>
            <a href="tel:+16514677829" style={{
              padding: '15px 22px', background: 'rgba(255,255,255,0.08)', color: '#fff',
              textDecoration: 'none', borderRadius: 12, fontSize: 15, fontWeight: 800,
              border: '1.5px solid rgba(255,255,255,0.18)',
            }}>
              📞 Hear Emma · (651) 467-7829
            </a>
          </div>
        </div>
      </section>

      {/* WHY HOME-SERVICE SHOPS USE IT */}
      <section style={{ padding: '50px 24px', background: '#fff' }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <h2 style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 10 }}>
            Why {trade.pluralLabel.toLowerCase()} switch to BellAveGo
          </h2>
          <p style={{ fontSize: 15, color: '#4A6670', lineHeight: 1.6, marginBottom: 28 }}>
            A US receptionist costs $40,000–$55,000/year in salary, benefits, and payroll tax. Emma costs $147/month — and works 24/7, never calls in sick, never quits.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            {[
              { icon: '📞', title: 'Answers in 1 ring', body: `Even at 2 AM on a Sunday. Especially for ${trade.label.toLowerCase()} emergencies.` },
              { icon: '⚡', title: '10-second lead alert', body: 'Push + SMS + email the moment Emma captures a job.' },
              { icon: '📅', title: 'Books appointments', body: 'Optional: connect Google or Outlook. Emma offers real slots from your free time.' },
              { icon: '💸', title: 'Avg missed-call cost', body: `${trade.label} shops lose $${trade.avgMissedJobUsd} per missed-call lead.` },
            ].map((b) => (
              <div key={b.title} style={{
                background: '#F5FDFB', border: '1.5px solid rgba(10,168,159,0.16)',
                borderRadius: 14, padding: '20px 18px',
              }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>{b.icon}</div>
                <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>{b.title}</div>
                <div style={{ fontSize: 13, color: '#4A6670', lineHeight: 1.5 }}>{b.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CITIES — direct interlink to every (trade, city) page */}
      <section style={{ padding: '50px 24px', background: '#F5FDFB' }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <h2 style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 14 }}>
            BellAveGo serves {trade.pluralLabel.toLowerCase()} in {CITIES.length}+ US cities
          </h2>
          <p style={{ fontSize: 13, color: '#7AAAB2', marginBottom: 22 }}>
            Click your metro to see local market data and competitor analysis.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 8 }}>
            {CITIES.map((c) => (
              <Link key={c.slug}
                href={`/answering-service/${trade.slug}-${c.slug}`}
                style={{
                  padding: '10px 12px',
                  background: '#fff',
                  borderRadius: 10,
                  border: '1px solid rgba(10,168,159,0.18)',
                  fontSize: 13, fontWeight: 700, color: '#0B1F3A',
                  textDecoration: 'none',
                  transition: 'all 0.15s ease',
                }}>
                {c.label}, {c.state}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section style={{ padding: '50px 24px', background: '#fff' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 10 }}>
            $147/mo. No setup fee.
          </h2>
          <div style={{ fontSize: 60, fontWeight: 900, color: '#0AA89F', letterSpacing: '-2px', lineHeight: 1 }}>$147</div>
          <div style={{ fontSize: 14, color: '#7AAAB2', marginBottom: 22 }}>per month · 60 calls included · cancel anytime</div>
          <Link href={autoCheckoutUrl} style={{
            display: 'inline-block', padding: '18px 36px',
            background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 100%)',
            color: '#fff', textDecoration: 'none', borderRadius: 12,
            fontSize: 17, fontWeight: 800, boxShadow: '0 10px 28px rgba(232,116,43,0.42)',
          }}>
            Start your 7-day free trial →
          </Link>
          <div style={{ marginTop: 14, fontSize: 12, color: '#7AAAB2' }}>
            No card required for trial. Card on file billed day 8 only if you stay.
          </div>
        </div>
      </section>

      {/* CROSS-LINKS to other trades */}
      <section style={{ padding: '40px 24px 60px', background: '#0B1F3A', color: 'rgba(255,255,255,0.8)' }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#5EEAD4', marginBottom: 14 }}>
            BellAveGo for other home-service trades
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
            {TRADES.filter((t) => t.slug !== trade.slug).map((t) => (
              <Link key={t.slug}
                href={`/answering-service-for-${t.slug}`}
                style={{ color: 'rgba(255,255,255,0.78)', textDecoration: 'none', fontSize: 14, fontWeight: 700 }}>
                AI receptionist for {t.pluralLabel} →
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
