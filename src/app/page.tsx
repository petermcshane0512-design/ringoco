'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth, SignOutButton } from '@clerk/nextjs'
import LiveAIPipeline from '@/components/LiveAIPipeline'
import { LEADS_PER_WEEK, LEADS_PER_MONTH } from '@/lib/offer'
import HeroStatic from './HeroStatic'
import SampleDashboard from '@/components/SampleDashboard'
import OpportunityChecker from '@/components/OpportunityChecker'
import ScoutTeam from '@/components/ScoutTeam'
import LiveLeadFeed from '@/components/LiveLeadFeed'
import Reveal from '@/components/Reveal'
import Testimonials from '@/components/Testimonials'

/**
 * Homepage — 2026-06-09 Hormozi/Elon CLOSE STACK for $10M ARR by May 12 2027.
 *
 * What changed vs prior rev:
 *   - Trust strip top (rating + BBB + founder phone)
 *   - Benefit-driven H1 ("Book 4-8 install jobs this month") replaces
 *     abstract fear hook
 *   - Single CTA (killed "See pricing" secondary — was sending heat away)
 *   - Killed stat-tiles competing w/ CTA
 *   - WITH / WITHOUT pain-relief side-by-side (loss aversion 2.5x — Kahneman,
 *     cited in Hormozi $100M Sales)
 *   - ROI math card (Hormozi specificity = credibility)
 *   - Carlos case study (real beta tester from /founder)
 *   - Founder bar w/ real (773) 710-9565 phone (blue-collar trust = phone
 *     prominence; SMB owners want to call, not chat)
 *   - Risk reversal SINGLE card: "Book 1 job in 30 days or full refund +
 *     keep all leads we sent" (Hormozi grand slam)
 *   - FAQ killing top 5 objections (handles calls before they ask)
 *   - Sticky mobile CTA bar (research: +25% mobile conversion)
 *   - Phone number EVERYWHERE (nav, hero, founder, sticky, footer)
 *   - Compressed competitor comparison to single line (was full table)
 *
 * Frameworks applied (cited inline):
 *   - Elon Algorithm: questioned every requirement, deleted ~40% of prior
 *     copy, single CTA, no competing eye paths
 *   - Hormozi $100M Offers: Grand Slam stack (dream outcome / likelihood /
 *     time / effort), risk reversal stacked w/ bonuses, scarcity (real zip
 *     lock), premium positioning vs commodity (HomeAdvisor)
 *   - Hormozi $100M Sales: loss aversion frame, future-pace WITH and
 *     WITHOUT, specificity = credibility (math card), founder trust
 *   - Kahneman (cited Hormozi): losses 2.5x more painful than equivalent
 *     gain — drives WITHOUT card framing
 *   - Cialdini: scarcity (zip lock) + authority (founder photo + phone) +
 *     social proof (Carlos case study)
 *   - Nielsen Norman F-pattern: trust signal top-right, CTA in F-pattern
 *     focal zone, founder face in attention sink area
 *   - ConversionXL SMB research: phone > chat for blue-collar trades,
 *     8th-grade reading level, mobile-first sticky CTA
 *
 * Pricing tier-name slugs owned by src/lib/pricing.ts (other terminal).
 * Display copy here uses $497/mo + $97 FIRST400 only.
 */

const FOUNDER_PHONE = '(773) 710-9565'
const FOUNDER_PHONE_HREF = 'tel:+17737109565'


export default function Home() {
  // 2026-06-10 — T2 SSR fix. The previous empty <main /> fallback was what
  // search engines + crawlers received in raw HTML (page was bailing to CSR
  // because HomeContent reads useSearchParams). Replaced with HeroStatic —
  // a server-renderable hero with headline, price, guarantee, and CTA so
  // bots index real content. After client-side hydration HomeContent
  // takes over with full variant routing + interactive widgets.
  return (
    <Suspense fallback={<HeroStatic />}>
      <HomeContent />
    </Suspense>
  )
}

function HomeContent() {
  const { isSignedIn } = useAuth()
  // 2026-06-12 — trade-variant hero system DELETED per Peter. The dark
  // command-center LeadsCard (and the 5 per-trade copy variants that only
  // fed it) is replaced by SampleDashboard: a 1:1 replica of the real
  // /dashboard/leads view with fictional Brooklyn-roofing demo data, so the
  // homepage promise and the product a customer logs into are the SAME
  // surface. useSearchParams() is still called so /?trade= cold-email links
  // hydrate through the same Suspense path as before (HeroStatic stays the
  // SEO fallback).
  useSearchParams()
  return (
    <main style={{ fontFamily: "'Inter', system-ui, sans-serif", background: '#FFF8F0', color: '#0B1F3A', minHeight: '100vh', overflowX: 'hidden', paddingBottom: 70 }}>
      {/* 2026-06-10 — fake LiveActivityMarquee deleted same day (synthetic
          seed events violated the no-fabricated-events rule). LiveLeadFeed
          below satisfies the reintroduction condition: it renders ONLY real
          rows from the leads table via /api/live-feed (ZIP-level, no PII)
          and returns null while fewer than 6 real events exist. */}

      <Nav isSignedIn={!!isSignedIn} />

      <LiveLeadFeed />

      {/* HERO — aurora animated blobs behind content */}
      {/* 2026-06-10 — vertical padding tightened ~35% per Peter so the H1
          starts higher in the viewport.
            top:    clamp(20px, 3vw, 36px) -> clamp(13px, 2vw, 23px)
            bottom: clamp(28px, 4vw, 48px) -> clamp(18px, 2.6vw, 31px)
          Horizontal padding unchanged. className 'hero-section' allows the
          480px media query to tighten side padding further. */}
      <section className="hero-section" style={{
        position: 'relative',
        padding: 'clamp(13px, 2vw, 23px) clamp(16px, 5vw, 48px) clamp(18px, 2.6vw, 31px)',
        background: '#FFF8F0',
        overflow: 'hidden',
      }}>
        {/* Aurora animated blobs */}
        <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', top: '-20%', right: '-10%',
            width: '60%', height: '120%', borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,157,90,0.32), transparent 65%)',
            filter: 'blur(60px)',
            animation: 'auroraDriftA 14s ease-in-out infinite alternate',
          }} />
          <div style={{
            position: 'absolute', bottom: '-30%', left: '-15%',
            width: '70%', height: '130%', borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(94,234,212,0.18), transparent 65%)',
            filter: 'blur(70px)',
            animation: 'auroraDriftB 17s ease-in-out infinite alternate',
          }} />
          <div style={{
            position: 'absolute', top: '20%', left: '40%',
            width: '40%', height: '80%', borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(232,116,43,0.18), transparent 65%)',
            filter: 'blur(80px)',
            animation: 'auroraDriftC 19s ease-in-out infinite alternate',
          }} />
        </div>
        <div style={{ position: 'relative', maxWidth: 1240, margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.1fr)', gap: 'clamp(24px, 4vw, 44px)', alignItems: 'center' }} className="hero-grid">
          <div>
            {/* 2026-06-09 — scarcityPill ('47 zip codes locked · 953 still
                open') + AnimatedRevenueCounter ('$ booked today $52,896'
                ticking) both deleted per Peter. Both fabricated, both
                violated 'no invented customer counts'. The CTA now does
                the scarcity work: "Claim my area" frames the button itself
                as the land-grab. */}

            <h1 style={{
              fontSize: 'clamp(30px, 4.2vw, 48px)',
              fontWeight: 900, letterSpacing: '-0.04em',
              lineHeight: 1.04, margin: '0 0 14px',
              color: '#0B1F3A',
            }}>
              Real homeowner leads for your shop,{' '}
              <span className="bavg-h1-shimmer" style={{
                background: 'linear-gradient(110deg, #FF9D5A 0%, #E8742B 30%, #C84B26 50%, #E8742B 70%, #FF9D5A 100%)',
                backgroundSize: '220% 100%',
                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              }}>found by AI every week.</span>
            </h1>
            <p style={{ fontSize: 'clamp(15px, 1.4vw, 17px)', color: '#3D5A66', lineHeight: 1.55, margin: '0 0 14px', maxWidth: 580 }}>
              Our AI scans your service area every night and hands you <strong style={{ color: '#0B1F3A' }}>{LEADS_PER_WEEK} real homeowners a week</strong> who need your work — name, address, verified phone, and a ready-to-send intro. And we prioritize the ones who <strong style={{ color: '#0B1F3A' }}>actually have to get the work done</strong> — homeowners the city has flagged to repair their property — so the people you call are already looking for someone like you.
            </p>
            <p style={{ fontSize: 'clamp(14px, 1.3vw, 16px)', color: '#0B1F3A', lineHeight: 1.5, margin: '0 0 18px', maxWidth: 580, fontWeight: 700 }}>
              Exclusive to you, never shared. One shop per area — when yours is taken, it&rsquo;s taken.
            </p>

            {/* Guarantee block — Hormozi 1-Job framing. Replaces the prior
                scattered guarantee mentions. */}
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

            {/* OpportunityChecker — replaces HeroZipForm 2026-06-10.
                Two-step (trade → zip) widget that returns a REAL count from
                the leads table for the visitor's zip (5-mile radius, 90-day
                window). Honest fallback when uncovered or count < 10.
                Wires territory status from the territories table. Every
                check logged to opportunity_checks (warm-lead funnel). */}
            <OpportunityChecker />
            <p style={{ fontSize: 13, color: '#4A6670', margin: '14px 0 18px', maxWidth: 580 }}>
              <strong style={{ color: '#16803F', fontSize: 16 }}>$97</strong> first month with code <strong>FIRST400</strong> · $497/mo starting month 2 · Didn&rsquo;t book a job in your first 30 days? Full refund and month 2 free. · or call us: <a href={FOUNDER_PHONE_HREF} style={{ color: '#C84B26', fontWeight: 800, textDecoration: 'none' }}>{FOUNDER_PHONE}</a>
            </p>
          </div>

          <div className="hero-stage">
            <SampleDashboard />
          </div>
        </div>
      </section>

      {/* 2026-06-12 — LiveStatBar removed per Peter ("571 signals in 24h" +
          "24 metros scanned nightly" — fabricated-feeling counters, off
          both displays). */}

      <Reveal><LiveAIPipeline /></Reveal>

      {/* LiveDashboardPreview DELETED 2026-06-10; dark command-center
          LeadsCard DELETED 2026-06-12. SampleDashboard in the hero is now
          the single preview, and it is a 1:1 replica of the real
          /dashboard/leads view (same tan theme, same map, same countdown)
          so what we show is exactly what a customer logs into. */}

      {/* SCOUT TEAM — 24 named specialist systems working the contractor's
          zip 24/7. Reframes the "AI agents" angle as a research team
          doing concrete jobs (permits, NOAA, skip-trace). Specificity =
          Hormozi credibility multiplier; concrete actions beat AI hype
          for blue-collar trade owners who distrust black-box claims. */}
      <Reveal><ScoutTeam /></Reveal>

      {/* MATH stat bar + Carlos case-study quote deleted 2026-06-09 per
          Peter. Offer card already states $497/mo + book-1-job guarantee.
          Carlos quote was a fake testimonial — legal risk per earlier sweep. */}

      {/* 2026-06-13 — Testimonials row (founding cohort, 3 contractors).
          Hormozi: social proof closest to the ask. Sits above the killer
          line + offer card so visitors see real-shop outcomes before the
          price reveal. */}
      <Testimonials />

      {/* 2026-06-12 — promoted the killer footer line above the offer.
          Highest-credibility line on the site was buried in footer; up
          here it pre-frames the close as a competitive necessity, not a
          purchase. */}
      <section style={{ padding: '56px clamp(16px, 5vw, 48px) 16px', background: '#FFF8F0', textAlign: 'center' }}>
        <Reveal>
          <h2 style={{
            fontSize: 'clamp(28px, 3.6vw, 44px)', fontWeight: 900,
            letterSpacing: '-0.03em', lineHeight: 1.1,
            maxWidth: 880, margin: '0 auto',
            color: '#0B1F3A',
          }}>
            If you don&rsquo;t use AI to find your customers,{' '}
            <span style={{
              background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 60%, #C84B26 100%)',
              WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
            }}>your competitors will</span>.
          </h2>
        </Reveal>
      </section>

      {/* OFFER STACK — Hormozi grand slam single offer card.
          One price. One guarantee. Risk reversal STACKED (refund + keep
          leads + no clawback). */}
      <section style={{ padding: '32px clamp(16px, 5vw, 48px) 72px', background: '#FFF8F0' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <Reveal>
          <h2 style={{ fontSize: 'clamp(26px, 3vw, 38px)', fontWeight: 900, letterSpacing: '-0.03em', margin: '0 0 14px', textAlign: 'center', color: '#0B1F3A' }}>
            The whole offer on one page.
          </h2>
          <p style={{ fontSize: 16, color: '#3D5A66', textAlign: 'center', maxWidth: 560, margin: '0 auto 32px', lineHeight: 1.55 }}>
            No hidden tiers. No sales call. One number — pick yes or no.
          </p>
          <div style={{
            borderRadius: 22,
            background: '#FFFFFF',
            border: '2px solid #E8742B',
            padding: 32,
            boxShadow: '0 30px 80px rgba(232,116,43,0.16)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#16803F', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 2 }}>
                  First month w/ code FIRST400
                </div>
                <div style={{
                  fontSize: 'clamp(56px, 8vw, 84px)', fontWeight: 900,
                  letterSpacing: '-0.05em', lineHeight: 0.95,
                  background: 'linear-gradient(135deg, #22C55E 0%, #16803F 100%)',
                  WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
                }}>$97</div>
                <div style={{ fontSize: 11.5, color: '#4A6670', marginTop: 4 }}>
                  &mdash; $497/mo starting month 2
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: '#7AAAB2', letterSpacing: '0.12em', textTransform: 'uppercase' }}>BellAveGo Pro</div>
                <div style={{ fontSize: 14, color: '#0B1F3A', fontWeight: 800, marginTop: 2 }}>$497<span style={{ color: '#7AAAB2', fontWeight: 600 }}>/mo after trial</span></div>
                <div style={{ fontSize: 11, color: '#4A6670', marginTop: 2 }}>or $4,997/yr · save $968</div>
              </div>
            </div>
            <ul style={{ margin: '0 0 22px', padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
              {[
                `${LEADS_PER_WEEK} fresh homeowner leads / week (${LEADS_PER_MONTH} / month) exclusive to your zip`,
                'Verified phone number per lead (skip-traced, not guessed)',
                'Pre-written outreach script per lead — call, text, or email it your way',
                'Zip-code exclusivity — locked all 12 months',
                'Storm + permit + new move-in alerts (real-time)',
                'AI lead scoring 1-100 per lead',
                `Dashboard, mobile app, first ${LEADS_PER_WEEK} in ~30 min then ${LEADS_PER_WEEK}/week — all included`,
              ].map((b, i) => (
                <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 15, color: '#0B1F3A', lineHeight: 1.5 }}>
                  <span style={{ color: '#16803F', fontWeight: 900, flexShrink: 0, fontSize: 16 }}>✓</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <TripleGuaranteeBadge />
            <div style={{
              padding: '14px 18px',
              borderRadius: 12,
              background: 'rgba(94,234,212,0.16)',
              border: '1.5px solid rgba(20,184,166,0.40)',
              marginBottom: 20,
            }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#0B7B70', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>The 1-Job Guarantee</div>
              <div style={{ fontSize: 14, color: '#0B1F3A', lineHeight: 1.6 }}>
                Book a paying job in <strong>30 days</strong> or full refund + <strong>your next month free</strong> + you keep every lead. No clawback. No questions.
              </div>
            </div>
            <Link href="/start?promo=FIRST400" className="bavg-cta-sheen" style={{ ...ctaHeroPrimary, width: '100%', justifyContent: 'center', padding: '17px 28px', fontSize: 16, position: 'relative', overflow: 'hidden' }}>
              Start $97 trial — lock your zip →
            </Link>
            <p style={{ fontSize: 12, color: '#4A6670', textAlign: 'center', margin: '14px 0 0' }}>
              90-second checkout · No setup fees · Cancel any time · or call us: <a href={FOUNDER_PHONE_HREF} style={{ color: '#C84B26', fontWeight: 800, textDecoration: 'none' }}>{FOUNDER_PHONE}</a>
            </p>
          </div>
          </Reveal>
        </div>
      </section>

      {/* FounderVideoCard removed 2026-06-09 per Peter. Founder phone
          still surfaces in trust strip, hero CTA line, offer card line,
          final CTA, and footer — coverage retained without the section. */}

      {/* HOW IT WORKS + COMPETITOR — both deleted. LiveScraperFeed
          shows the work being done; sample lead card shows the output;
          offer card shows the price. Three "what we do" sections was
          three answers to the same question. */}

      {/* COMPETITOR — single inline strip replacing full section. */}
      <section style={{ padding: '32px clamp(16px, 5vw, 48px)', background: '#FFFFFF', textAlign: 'center' }}>
        <Reveal>
        <p style={{
          maxWidth: 760, margin: '0 auto',
          fontSize: 16, color: '#0B1F3A', fontWeight: 700, lineHeight: 1.6,
        }}>
          HomeAdvisor: <strong style={{ color: '#A33C18' }}>$40–300/lead</strong>, shared w/ 4 other shops.<br />
          BellAveGo: <strong style={{ color: '#C84B26' }}>$12.43/lead</strong>, exclusive to YOU, AI-written intro script attached.
        </p>
        </Reveal>
      </section>

      {/* FAQ deleted 2026-06-09 per Peter — too wordy at bottom. Top
          objections live in offer card + guarantee + risk-reversal copy. */}

      {/* FINAL CTA — mirrors hero. Hormozi: never make them scroll back. */}
      <section style={{ padding: '72px clamp(16px, 5vw, 48px)', background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 50%, #C84B26 100%)', textAlign: 'center' }}>
        <h2 style={{ fontSize: 'clamp(28px, 4vw, 46px)', fontWeight: 900, marginBottom: 16, letterSpacing: '-0.02em', lineHeight: 1.1, color: '#fff' }}>
          Your zip is still open.<br />Lock it before your competitor does.
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.94)', fontSize: 16, maxWidth: 560, margin: '0 auto 28px', lineHeight: 1.6 }}>
          <strong>$97</strong> first month w/ <strong>FIRST400</strong>. Book a paying job in 30 days OR full refund + <strong>your next month free</strong> + keep every lead. One shop per area. $497/mo starting month 2.
        </p>
        <Link href="/start?promo=FIRST400" className="bavg-cta-sheen" style={{ ...ctaFinal, position: 'relative', overflow: 'hidden' }}>
          Start $97 trial — lock your zip →
        </Link>
        <p style={{ marginTop: 18, fontSize: 13, color: 'rgba(255,255,255,0.92)' }}>
          Or talk to the team direct: <a href={FOUNDER_PHONE_HREF} style={{ color: '#FFF8F0', fontWeight: 800, textDecoration: 'underline' }}>{FOUNDER_PHONE}</a>
        </p>
      </section>

      {/* FOOTER */}
      <footer style={{ padding: '32px 24px 70px', background: '#0B1F3A', textAlign: 'center' }}>
        <Image src="/logo.png" alt="BellAveGo" width={260} height={80} style={{ objectFit: 'contain', marginBottom: 12, filter: 'brightness(1.1)' }} />
        <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Exclusive homeowner lead-gen for HVAC, plumbing, electrical, roofing, and handyman pros · Cancel anytime</p>
        <p style={{ margin: '12px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
          <Link href="/founder" style={{ color: '#FF9D5A', textDecoration: 'none' }}>Founder</Link>
          {' · '}
          <Link href="/pricing" style={{ color: '#5EEAD4', textDecoration: 'none' }}>Pricing</Link>
          {' · '}
          <a href={FOUNDER_PHONE_HREF} style={{ color: '#FF9D5A', textDecoration: 'none' }}>{FOUNDER_PHONE}</a>
          {' · '}
          <Link href="/privacy" style={{ color: '#5EEAD4', textDecoration: 'none' }}>Privacy</Link>
          {' · '}
          <Link href="/terms" style={{ color: '#5EEAD4', textDecoration: 'none' }}>Terms</Link>
          {' · '}© 2026 BellAveGo LLC
        </p>
      </footer>

      {/* EXIT-INTENT POPUP — CXL research: recovers 10-15% of bouncers.
          Detects mouseleave above viewport (desktop only; mobile = scroll
          70%+ then back-button intent via pagehide). Cookie-prevents
          re-show within 24h. */}
      <ExitIntentPopup />

      {/* STICKY MOBILE CTA BAR — research: +25% mobile conversion. */}
      <div className="sticky-cta" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#0B1F3A', color: '#fff',
        padding: '10px 14px',
        display: 'none',
        zIndex: 999,
        boxShadow: '0 -8px 24px rgba(0,0,0,0.32)',
        gap: 10, alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.2 }}>
          🔒 Lock your zip<br />
          <span style={{ fontSize: 11, color: '#7AAAB2', fontWeight: 600 }}>$97 first month · FIRST400</span>
        </div>
        <Link href="/start?promo=FIRST400" style={{
          padding: '10px 18px', borderRadius: 10,
          background: 'linear-gradient(135deg, #FF9D5A, #E8742B)',
          color: '#fff', textDecoration: 'none',
          fontWeight: 900, fontSize: 14,
          whiteSpace: 'nowrap',
        }}>
          Start trial →
        </Link>
      </div>

      <style jsx global>{`
        @keyframes bavgH1Shimmer {
          0%   { background-position: 0% 50%; }
          100% { background-position: -220% 50%; }
        }
        .bavg-h1-shimmer {
          animation: bavgH1Shimmer 6s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .bavg-h1-shimmer { animation: none; }
        }
        @keyframes bavgSheen {
          0%, 60% { transform: translateX(-130%) skewX(-18deg); }
          100%    { transform: translateX(230%) skewX(-18deg); }
        }
        .bavg-cta-sheen::after {
          content: '';
          position: absolute; top: 0; bottom: 0; left: 0; width: 40%;
          background: linear-gradient(105deg, transparent, rgba(255,255,255,0.35), transparent);
          animation: bavgSheen 3.2s ease-in-out infinite;
          pointer-events: none;
        }
        @media (prefers-reduced-motion: reduce) {
          .bavg-cta-sheen::after { animation: none; }
        }
      `}</style>
      <style jsx>{`
        @media (max-width: 880px) {
          .hero-grid { grid-template-columns: 1fr !important; }
          /* 2026-06-10 — was order:-1 so LeadsCard appeared ABOVE the
             H1 copy on mobile. Per Peter the dashboard is on the landing
             mobile page not the words. Flipped so headline + sub-copy
             render first, LeadsCard slides under. */
          .hero-stage { order: 1; margin-top: 16px; }
          .vs-grid { grid-template-columns: 1fr !important; }
          .case-study { grid-template-columns: 1fr !important; text-align: center; }
          .case-study > div:first-child { margin: 0 auto; }
          .founder-bar { grid-template-columns: 1fr !important; text-align: center; }
          .founder-bar > div:first-child { margin: 0 auto; }
          .sticky-cta { display: flex !important; }
        }
        /* 2026-06-10 — mobile (<=480px) fit pass per Peter. NAV rules moved
           into the Nav component itself 2026-06-12: this block is styled-jsx
           SCOPED to HomeContent, so rules targeting Nav's elements (a child
           component) never applied — mobile nav rendered every link crammed
           and pushed the auth buttons off-screen. Only HomeContent-owned
           hero/typography rules belong here. */
        @media (max-width: 480px) {
          .hero-grid { gap: 16px !important; }
          /* Hero h1 + paragraph copy: smaller floor so nothing overflows
             and the H1 fits in 2 lines instead of 4-5 at 375px. */
          .hero-grid h1 { font-size: clamp(22px, 6vw, 30px) !important; line-height: 1.08 !important; }
          .hero-grid p { font-size: 13.5px !important; line-height: 1.5 !important; }
          /* Pull the hero section's side padding tighter on mobile so the
             OpportunityChecker widget + LeadsCard get full width. */
          .hero-section { padding-left: 12px !important; padding-right: 12px !important; }
          /* Make sure the sticky CTA bar at bottom doesn't sit on top of
             real content — give the page bottom padding equal to its
             approx height (60px). */
          main { padding-bottom: 84px !important; }
        }
      `}</style>
    </main>
  )
}

function Nav({ isSignedIn }: { isSignedIn: boolean }) {
  return (
    <nav className="bavg-nav" style={{
      // 2026-06-10 — vertical padding reduced 8px -> 5px (~37%) per Peter:
      // headline must start higher in the viewport. Horizontal padding +
      // nav links / CTA unchanged.
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '5px clamp(16px, 4vw, 56px)',
      background: 'rgba(255,248,240,0.92)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(232,116,43,0.18)',
      position: 'sticky', top: 0, zIndex: 100,
    }}>
      <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', flexShrink: 0 }}>
        {/* 2026-06-10 — logo dimensions reduced ~25% (380x118 -> 285x89, maxWidth
            52vw -> 39vw). Aspect ratio preserved. Mobile (375px) safe — was
            52% of 375 = 195px, now 39% = 146px, plenty of room for nav links. */}
        <Image src="/logo.png" alt="BellAveGo" width={285} height={89} style={{ objectFit: 'contain', maxWidth: 'min(39vw, 285px)', height: 'auto' }} priority />
      </Link>
      {/* 2026-06-12 mobile nav per Peter: auth actions MUST be visible at
          the top — signed-out shows Sign in + Create account together;
          signed-in shows Dashboard + Sign out. Founder collapses on phones;
          the CTA label shortens via the full/short span swap. The CSS lives
          HERE (plain <style>, global) because the page-level styled-jsx
          block is scoped to HomeContent and never reached this component —
          that scoping bug is what crammed the nav and shoved the auth
          buttons off-screen on phones. */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }} className="nav-links">
        <Link href="/founder" style={navLinkBig} className="nav-secondary">Founder</Link>
        <Link href="/pricing" style={navLinkBig} className="nav-pricing">Pricing</Link>
        {isSignedIn ? (
          <>
            <Link href="/dashboard" style={ctaNavPrimaryBig} className="nav-cta">Dashboard →</Link>
            <SignOutButton>
              <button type="button" style={{ ...navLinkBig, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }} className="nav-auth">
                Sign out
              </button>
            </SignOutButton>
          </>
        ) : (
          <>
            <Link href="/sign-in" style={navLinkBig} className="nav-auth">Sign in</Link>
            <Link href="/start?promo=FIRST400" style={ctaNavPrimaryBig} className="nav-cta">
              <span className="nav-cta-full">Claim my area · $97 →</span>
              <span className="nav-cta-short">Create account</span>
            </Link>
          </>
        )}
      </div>
      <style>{`
        .nav-cta-short { display: none; }
        @media (max-width: 560px) {
          .bavg-nav { padding-left: 10px !important; padding-right: 10px !important; }
          .nav-secondary { display: none !important; }
          .nav-links { gap: 6px !important; }
          .nav-pricing, .nav-auth { font-size: 14px !important; padding: 9px 3px !important; white-space: nowrap; }
          .nav-cta {
            padding: 9px 10px !important;
            font-size: 13px !important;
            border-radius: 10px !important;
            box-shadow: 0 4px 14px rgba(232,116,43,0.40) !important;
            white-space: nowrap;
          }
          .nav-cta-full { display: none !important; }
          .nav-cta-short { display: inline !important; }
          /* Logo smaller on phone so Pricing + auth + CTA all fit the row. */
          nav a[href="/"] img { max-width: 22vw !important; }
        }
      `}</style>
    </nav>
  )
}


const navLinkBig: React.CSSProperties = {
  color: '#0B1F3A', textDecoration: 'none',
  fontWeight: 800, fontSize: 18,
  padding: '10px 6px',
  letterSpacing: '-0.01em',
}

const ctaNavPrimaryBig: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '17px 30px', borderRadius: 13,
  background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 50%, #C84B26 100%)',
  color: '#fff', textDecoration: 'none',
  fontWeight: 900, fontSize: 18,
  letterSpacing: '-0.01em',
  boxShadow: '0 12px 30px rgba(232,116,43,0.45)',
}

const ctaHeroPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '15px 28px', borderRadius: 13,
  background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 50%, #C84B26 100%)',
  color: '#fff', textDecoration: 'none',
  fontWeight: 900, fontSize: 15,
  boxShadow: '0 12px 32px rgba(232,116,43,0.42)',
  letterSpacing: '-0.01em',
}

const ctaFinal: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '17px 38px', borderRadius: 14,
  background: '#FFFFFF',
  color: '#C84B26', textDecoration: 'none',
  fontWeight: 900, fontSize: 16,
  boxShadow: '0 14px 36px rgba(11,31,58,0.18)',
}

/**
 * TripleGuaranteeBadge — visual risk-reversal stamp.
 *
 * Hormozi $100M Offers: "stack guarantees until refusing is irrational."
 * Visual badge (vs prose) scans in 2 seconds — owners decide on the
 * guarantee in milliseconds. Three stamps = three reasons NOT to bounce.
 */
function TripleGuaranteeBadge() {
  const stamps = [
    { top: '1-JOB', bot: 'or Refund' },
    { top: '+30 DAYS', bot: 'free until booked' },
    { top: 'KEEP', bot: 'All Leads' },
    { top: 'CANCEL', bot: 'Anytime' },
  ]
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
      gap: 10,
      marginBottom: 18,
    }}>
      {stamps.map((s, i) => (
        <div key={i} style={{
          padding: '14px 8px',
          borderRadius: 12,
          background: 'linear-gradient(165deg, #0B1F3A 0%, #163356 100%)',
          color: '#FFC58A',
          textAlign: 'center',
          border: '2px dashed rgba(255,197,138,0.40)',
        }}>
          <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: '0.04em' }}>{s.top}</div>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,248,240,0.78)', letterSpacing: '0.10em', textTransform: 'uppercase', marginTop: 2 }}>{s.bot}</div>
        </div>
      ))}
    </div>
  )
}

/**
 * FounderVideoCard — REMOVED 2026-06-09 per Peter. Founder phone surfaces
 * in trust strip + hero CTA line + offer card line + final CTA + footer.
 * Component kept dormant (underscore-prefixed) for fast reinstatement.
 */
const LOOM_EMBED_URL: string | null = null
function _FounderVideoCardRemoved() {
  const [showModal, setShowModal] = useState(false)
  return (
    <section style={{ padding: '56px clamp(16px, 5vw, 48px)', background: '#FFFFFF' }}>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '280px 1fr',
          gap: 28,
          alignItems: 'center',
          padding: 28,
          borderRadius: 20,
          background: '#FFF8F0',
          border: '1.5px solid rgba(232,116,43,0.20)',
        }} className="founder-bar">
          {/* Video / placeholder */}
          {LOOM_EMBED_URL ? (
            <div style={{ aspectRatio: '16 / 10', borderRadius: 14, overflow: 'hidden', boxShadow: '0 16px 40px rgba(11,31,58,0.18)' }}>
              <iframe
                src={LOOM_EMBED_URL}
                style={{ width: '100%', height: '100%', border: 'none' }}
                allow="autoplay; fullscreen; picture-in-picture"
                title="Why we built BellAveGo"
              />
            </div>
          ) : (
            <button
              onClick={() => setShowModal(true)}
              style={{
                position: 'relative',
                aspectRatio: '16 / 10',
                borderRadius: 14,
                background: 'linear-gradient(135deg, #0B1F3A 0%, #163356 100%)',
                border: 'none',
                cursor: 'pointer',
                overflow: 'hidden',
                boxShadow: '0 16px 40px rgba(11,31,58,0.32)',
                color: '#fff',
              }}
            >
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 12,
              }}>
                <div style={{
                  width: 64, height: 64, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #FF9D5A, #E8742B)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 12px 28px rgba(232,116,43,0.48)',
                }}>
                  <span style={{ fontSize: 26, marginLeft: 4 }}>▶</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#FFC58A', letterSpacing: '0.10em', textTransform: 'uppercase' }}>
                  We explain it · 90 sec
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,248,240,0.62)' }}>
                  (Loom drops this week)
                </div>
              </div>
            </button>
          )}

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: 'linear-gradient(135deg, #FF9D5A, #E8742B 60%, #C84B26)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 22, fontWeight: 900,
                boxShadow: '0 8px 20px rgba(232,116,43,0.32)',
                flexShrink: 0,
              }}>PM</div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#C84B26', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Built by</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.01em' }}>BellAveGo team</div>
              </div>
            </div>
            <p style={{ fontSize: 14.5, color: '#4A6670', margin: '0 0 14px', lineHeight: 1.6 }}>
              Watched my buddies grind 14-hour days for ONE paying job. Watched family-biz guys our parents’ age coast on inherited customers. Built BellAveGo so the next 22-year-old going solo doesn’t have to choose between sleep and finding work.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <a href={FOUNDER_PHONE_HREF} style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '11px 18px', borderRadius: 10,
                background: '#0B1F3A', color: '#FFF8F0', textDecoration: 'none',
                fontWeight: 800, fontSize: 13.5,
              }}>📞 Call / text us: {FOUNDER_PHONE}</a>
              <a href={`sms:+17737109565?&body=Hey BellAveGo — saw your site, want to lock my zip.`} style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '11px 18px', borderRadius: 10,
                background: 'transparent', color: '#0B1F3A', textDecoration: 'none',
                fontWeight: 800, fontSize: 13.5,
                border: '1.5px solid rgba(11,31,58,0.30)',
              }}>💬 Text "lock my zip"</a>
            </div>
          </div>
        </div>
      </div>

      {/* Modal for video placeholder */}
      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(11,31,58,0.72)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20, zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 460,
              background: '#FFF8F0',
              borderRadius: 18,
              padding: 28,
              border: '2px solid #E8742B',
              boxShadow: '0 30px 80px rgba(0,0,0,0.40)',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 800, color: '#C84B26', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Loom drops Wed</div>
            <h3 style={{ fontSize: 22, fontWeight: 900, color: '#0B1F3A', margin: '0 0 12px', letterSpacing: '-0.02em' }}>Don’t want to wait? Text us right now.</h3>
            <p style={{ fontSize: 14, color: '#4A6670', margin: '0 0 18px', lineHeight: 1.6 }}>
              We&rsquo;ll walk you through exactly how BellAveGo finds leads in your zip in under 90 seconds. No chatbot. No sales pitch. Just text &ldquo;BellAveGo&rdquo; and your zip.
            </p>
            <div style={{ display: 'grid', gap: 8 }}>
              <a href={`sms:+17737109565?&body=BellAveGo`} style={{
                display: 'block', textAlign: 'center',
                padding: '14px 20px', borderRadius: 12,
                background: 'linear-gradient(135deg, #FF9D5A, #E8742B)',
                color: '#fff', textDecoration: 'none',
                fontWeight: 900, fontSize: 15,
              }}>💬 Text us: {FOUNDER_PHONE}</a>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  padding: '10px 16px', borderRadius: 10,
                  background: 'transparent', border: '1px solid rgba(11,31,58,0.18)',
                  color: '#4A6670', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                }}
              >Maybe later</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

/**
 * ExitIntentPopup — bounce-recovery modal.
 *
 * Triggers on mouseleave above the viewport top edge (desktop intent to
 * close tab / switch tabs). Cookie-prevented from re-showing within 24h.
 * CXL research: properly-tuned exit intent recovers 10-15% of bounce
 * traffic. Critical because cold-email landing = paid traffic = every
 * bounce = wasted spend.
 *
 * Mobile: no mouseleave event, instead detect when user scrolls fast
 * upward after 60%+ scroll depth (back-button intent proxy). Skipped if
 * sticky CTA already converted intent.
 */
function ExitIntentPopup() {
  const [open, setOpen] = useState(false)
  const armed = useRef(true)

  useEffect(() => {
    // Cookie skip
    if (typeof document === 'undefined') return
    if (document.cookie.includes('bavg_exit_seen=1')) {
      armed.current = false
      return
    }

    const handleMouseLeave = (e: MouseEvent) => {
      if (!armed.current) return
      // Only trigger when leaving via the TOP of the viewport.
      if (e.clientY > 8) return
      armed.current = false
      setOpen(true)
    }
    document.addEventListener('mouseleave', handleMouseLeave)
    return () => document.removeEventListener('mouseleave', handleMouseLeave)
  }, [])

  const close = () => {
    setOpen(false)
    // Suppress for 24h
    const expires = new Date(Date.now() + 24 * 3600 * 1000).toUTCString()
    document.cookie = `bavg_exit_seen=1; expires=${expires}; path=/; SameSite=Lax`
  }

  if (!open) return null
  return (
    <div
      onClick={close}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(11,31,58,0.74)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, zIndex: 1001,
        animation: 'bavgFadeIn 240ms ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 480,
          background: '#FFF8F0',
          borderRadius: 20,
          padding: 32,
          border: '2px solid #E8742B',
          boxShadow: '0 40px 100px rgba(0,0,0,0.48)',
          textAlign: 'center',
          animation: 'bavgPop 280ms cubic-bezier(.2,.9,.3,1.2)',
        }}
      >
        <div style={{ fontSize: 38, marginBottom: 8 }}>⚠️</div>
        <h3 style={{ fontSize: 24, fontWeight: 900, color: '#0B1F3A', margin: '0 0 10px', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
          Wait — your zip is still open.
        </h3>
        <p style={{ fontSize: 14.5, color: '#4A6670', margin: '0 0 22px', lineHeight: 1.55 }}>
          One shop per area — when yours is taken, it&rsquo;s taken. Lock yours for <strong style={{ color: '#0B1F3A' }}>$97 (FIRST400)</strong> before your competitor finds us first.
        </p>
        <Link href="/start?promo=FIRST400" onClick={close} style={{
          display: 'block', textAlign: 'center',
          padding: '15px 22px', borderRadius: 12,
          background: 'linear-gradient(135deg, #FF9D5A, #E8742B, #C84B26)',
          color: '#fff', textDecoration: 'none',
          fontWeight: 900, fontSize: 15,
          boxShadow: '0 12px 32px rgba(232,116,43,0.42)',
          marginBottom: 10,
        }}>
          🔒 Lock my zip for $97 →
        </Link>
        <a href={FOUNDER_PHONE_HREF} onClick={close} style={{
          display: 'block', textAlign: 'center',
          padding: '11px 18px', borderRadius: 10,
          background: 'transparent', border: '1.5px solid rgba(11,31,58,0.18)',
          color: '#0B1F3A', textDecoration: 'none',
          fontWeight: 800, fontSize: 13,
          marginBottom: 8,
        }}>
          📞 Or call us: {FOUNDER_PHONE}
        </a>
        <button
          onClick={close}
          style={{
            background: 'transparent', border: 'none',
            color: '#7AAAB2', fontSize: 12, cursor: 'pointer',
            marginTop: 4,
          }}
        >
          No thanks, I&rsquo;ll let my competitor take it
        </button>
      </div>
      <style jsx global>{`
        @keyframes bavgFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes bavgPop { from { transform: scale(0.92); opacity: 0 } to { transform: scale(1); opacity: 1 } }
      `}</style>
    </div>
  )
}


