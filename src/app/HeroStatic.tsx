import Link from 'next/link'
import {
  LEADS_PER_WEEK,
  PRICE_MONTHLY_USD,
  INTRO_PRICE_USD,
  INTRO_PROMO_CODE,
} from '@/lib/offer'

/**
 * HeroStatic — server-renderable hero used as the Suspense fallback in
 * src/app/page.tsx.
 *
 * WHY THIS EXISTS:
 * The interactive homepage (HomeContent) reads `useSearchParams()` for the
 * /?trade=<x> variant routing. In Next.js App Router that suspends the
 * component during prerender, and the Suspense fallback is what bots +
 * search engines actually receive in raw HTML. The fallback was an empty
 * <main /> — prod HTML had no headline, no price, no CTA. Search engines
 * indexed the empty body.
 *
 * This component renders the default (HVAC variant) hero shape — headline,
 * value prop, guarantee, price, CTA, founder phone — so bot/SEO/preview
 * fetches land on real content immediately. After client-side hydration,
 * HomeContent takes over with full variant routing + interactive widgets.
 *
 * Static by construction — no hooks, no event handlers. Safe to render on
 * the server.
 *
 * DO NOT inline trade-variant-specific copy here. This is the canonical
 * SEO surface — keep it on the default (HVAC) promise.
 */

const FOUNDER_PHONE = '(773) 710-9565'
const FOUNDER_PHONE_HREF = 'tel:+17737109565'

export default function HeroStatic() {
  return (
    <main style={{
      fontFamily: "'Inter', system-ui, sans-serif",
      background: '#FFF8F0',
      color: '#0B1F3A',
      minHeight: '100vh',
      overflowX: 'hidden',
      paddingBottom: 70,
    }}>
      {/* Lightweight nav — server-renderable subset. The full client Nav
          mounts after hydration; this is just enough markup so bots see
          the brand + a primary link. */}
      <nav style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px clamp(16px, 4vw, 48px)',
        background: 'rgba(255,248,240,0.92)',
        borderBottom: '1px solid rgba(232,116,43,0.16)',
      }}>
        <Link href="/" style={{ fontWeight: 900, color: '#0B1F3A', textDecoration: 'none', fontSize: 18 }}>
          BellAveGo
        </Link>
        <Link
          href="/start?promo=FIRST400"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '10px 18px', borderRadius: 10,
            background: 'linear-gradient(135deg, #FF9D5A, #E8742B)',
            color: '#fff', textDecoration: 'none',
            fontWeight: 900, fontSize: 14,
          }}
        >
          Get my first month — ${INTRO_PRICE_USD} →
        </Link>
      </nav>

      <section style={{ padding: 'clamp(20px, 3vw, 36px) clamp(16px, 5vw, 48px) clamp(28px, 4vw, 48px)' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
          <h1 style={{
            fontSize: 'clamp(30px, 4.2vw, 48px)',
            fontWeight: 900, letterSpacing: '-0.04em',
            lineHeight: 1.04, margin: '0 0 14px',
            color: '#0B1F3A',
          }}>
            Book your next install job from{' '}
            <span style={{
              background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 60%, #C84B26 100%)',
              WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
            }}>leads your competitors never see</span>.
          </h1>

          <p style={{ fontSize: 'clamp(15px, 1.4vw, 17px)', color: '#3D5A66', lineHeight: 1.55, margin: '0 0 14px', maxWidth: 580 }}>
            <strong style={{ color: '#0B1F3A' }}>{LEADS_PER_WEEK} fresh homeowner leads in your service area every week</strong> — real names, addresses, phone numbers. Pulled overnight from new permits, aging systems, storm damage, and move-ins. Every lead arrives with a ready-to-send intro — call, text, or email in 60 seconds.
          </p>

          <p style={{ fontSize: 'clamp(14px, 1.3vw, 16px)', color: '#0B1F3A', lineHeight: 1.5, margin: '0 0 18px', maxWidth: 580, fontWeight: 700 }}>
            One shop per area. When yours is taken, it&rsquo;s taken.
          </p>

          <div style={{
            padding: '14px 16px',
            borderRadius: 12,
            background: 'rgba(34,197,94,0.10)',
            border: '1.5px solid rgba(34,197,94,0.40)',
            margin: '0 0 18px',
            maxWidth: 580,
          }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: '#16803F', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>
              The 1-Job Guarantee
            </div>
            <p style={{ margin: 0, fontSize: 13.5, color: '#0B1F3A', lineHeight: 1.55 }}>
              Book at least one job in 30 days, or you get a <strong>full refund</strong>, <strong>30 more days free</strong>, and you <strong>keep every lead</strong>. One average install covers more than a year of membership.
            </p>
          </div>

          <Link
            href={`/start?promo=${INTRO_PROMO_CODE}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '16px 28px', borderRadius: 12,
              background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 50%, #C84B26 100%)',
              color: '#fff', textDecoration: 'none',
              fontWeight: 900, fontSize: 16, letterSpacing: '-0.01em',
              maxWidth: 580,
            }}
          >
            Claim my area — ${INTRO_PRICE_USD} first month →
          </Link>

          <p style={{ fontSize: 13, color: '#4A6670', margin: '14px 0 18px', maxWidth: 580 }}>
            <strong style={{ color: '#16803F', fontSize: 16 }}>${INTRO_PRICE_USD}</strong> first month with code <strong>{INTRO_PROMO_CODE}</strong> · ${PRICE_MONTHLY_USD}/mo starting month 2 · Didn&rsquo;t book a job in your first 30 days? Full refund and month 2 free. · or call us: <a href={FOUNDER_PHONE_HREF} style={{ color: '#C84B26', fontWeight: 800, textDecoration: 'none' }}>{FOUNDER_PHONE}</a>
          </p>
        </div>
      </section>
    </main>
  )
}
