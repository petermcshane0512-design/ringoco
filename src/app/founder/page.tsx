'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@clerk/nextjs'

/**
 * /founder — 2026-06-09 LEADS-ONLY REWRITE.
 *
 * Old script was about Peter's missed-calls + Emma the AI receptionist story.
 * New script per Peter 2026-06-09: his contractor friends in their early
 * 20s — solo, fighting to find ONE job a day, watching family-business
 * guys their parents' age coast on inherited customers — until they
 * started running BellAveGo and went from 1 job/day to $300K/yr fully
 * booked.
 *
 * Tone: warm, direct, working-class hero. Light theme matches new homepage.
 */

export default function FounderPage() {
  const { isSignedIn } = useAuth()
  return (
    <main style={{ fontFamily: "'Inter', system-ui, sans-serif", background: '#FFF8F0', color: '#0B1F3A', minHeight: '100vh' }}>
      {/* NAV */}
      <nav style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px clamp(16px, 4vw, 56px)',
        background: 'rgba(255,248,240,0.92)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(232,116,43,0.18)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <Image src="/logo.png" alt="BellAveGo" width={260} height={80} style={{ objectFit: 'contain' }} priority />
        </Link>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
          <Link href="/pricing" style={{ color: '#4A6670', textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>Pricing</Link>
          {isSignedIn ? (
            <Link href="/dashboard" style={ctaNavPrimary}>Dashboard →</Link>
          ) : (
            <Link href="/start?promo=FIRST400" style={ctaNavPrimary}>$97 first month →</Link>
          )}
        </div>
      </nav>

      {/* HERO */}
      <section style={{
        padding: 'clamp(48px, 7vw, 88px) clamp(16px, 5vw, 48px) 32px',
        textAlign: 'center',
      }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 14px', borderRadius: 99,
            background: 'rgba(232,116,43,0.10)',
            border: '1.5px solid rgba(232,116,43,0.30)',
            fontSize: 11, fontWeight: 800, color: '#C84B26',
            letterSpacing: '0.18em', textTransform: 'uppercase',
            marginBottom: 22,
          }}>Why I built BellAveGo</span>
          <h1 style={{
            fontSize: 'clamp(34px, 5vw, 56px)',
            fontWeight: 900, letterSpacing: '-0.045em',
            lineHeight: 1.05, margin: '0 0 22px',
            color: '#0B1F3A',
          }}>
            My buddies were fighting for{' '}
            <span style={{
              background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 50%, #C84B26 100%)',
              WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
            }}>one job a day.</span>{' '}
            Now they&rsquo;re fully booked.
          </h1>
          <p style={{ fontSize: 'clamp(16px, 1.7vw, 19px)', color: '#4A6670', lineHeight: 1.65, margin: '0 auto 32px', maxWidth: 600 }}>
            I&rsquo;m 22. My closest friends — guys 23, 24 — went out on their own as HVAC techs and plumbers two summers ago. I watched them grind 12-hour days finding ONE job and barely making rent. Meanwhile, the family-business guys our parents&rsquo; age were coasting on inherited customers. So I figured out a system — AI that finds them homeowner leads + reaches out as them. Now those same friends are pulling $300K/yr fully booked from 9-7, no more cold-calling, no more HomeAdvisor bait.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 12 }}>
            <Link href="/start?promo=FIRST400" style={ctaHeroPrimary}>Claim $97 first month →</Link>
            <Link href="/pricing" style={ctaHeroSecondary}>See pricing</Link>
          </div>
          <p style={{ fontSize: 12, color: '#7AAAB2', marginTop: 4 }}>$97 first month with FIRST400 · 30-day money back · cancel anytime</p>
        </div>
      </section>

      {/* STORY */}
      <section style={{ padding: '40px clamp(16px, 5vw, 48px)' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          {STORY_BLOCKS.map((b, i) => (
            <div key={i} style={{ marginBottom: 28 }}>
              {b.h && (
                <h2 style={{ fontSize: 'clamp(22px, 2.6vw, 30px)', fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.02em', margin: '0 0 14px' }}>{b.h}</h2>
              )}
              {b.body.map((para, j) => (
                <p key={j} style={{ fontSize: 16.5, color: '#0B1F3A', lineHeight: 1.7, margin: '0 0 14px' }}>{para}</p>
              ))}
            </div>
          ))}

          {/* Inline pull-quote */}
          <div style={{
            padding: '24px 26px', borderRadius: 16,
            background: 'linear-gradient(135deg, #FFD9A8 0%, #FFF8F0 100%)',
            border: '1.5px solid rgba(232,116,43,0.30)',
            margin: '24px 0',
          }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#C84B26', letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 8 }}>The math</div>
            <p style={{ fontSize: 18, fontWeight: 700, color: '#0B1F3A', lineHeight: 1.5, margin: 0 }}>
              80 fresh exclusive leads × 15% close × $400 avg job = <span style={{ color: '#C84B26' }}>$4,800/mo new revenue</span> from a $497 spend. That&rsquo;s what gets a 23-year-old from one job a day to $300K/yr.
            </p>
          </div>

          {STORY_END.map((para, j) => (
            <p key={j} style={{ fontSize: 16.5, color: '#0B1F3A', lineHeight: 1.7, margin: '0 0 14px' }}>{para}</p>
          ))}

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 32 }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'linear-gradient(135deg, #FF9D5A, #E8742B)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 900, fontSize: 22, color: '#fff',
              boxShadow: '0 8px 20px rgba(232,116,43,0.30)',
            }}>PM</div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 900, color: '#0B1F3A' }}>Peter McShane</div>
              <div style={{ fontSize: 13, color: '#4A6670' }}>Founder, BellAveGo · Text me anytime: (773) 710-9565</div>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section style={{ padding: '64px clamp(16px, 5vw, 48px)', background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 100%)', textAlign: 'center' }}>
        <h2 style={{ fontSize: 'clamp(26px, 3.4vw, 38px)', fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', margin: '0 0 14px', lineHeight: 1.15 }}>
          Same thing that got my buddies fully booked.<br />Try it $97 first month.
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.92)', fontSize: 16, maxWidth: 540, margin: '0 auto 28px', lineHeight: 1.6 }}>
          80 fresh leads / mo, AI emails + SMS them as you, you only reply when they say yes. Cancel anytime in first 30 days for full refund.
        </p>
        <Link href="/start?promo=FIRST400" style={ctaFinal}>Claim $97 first month →</Link>
      </section>

      {/* FOOTER */}
      <footer style={{ padding: '32px 24px', background: '#0B1F3A', textAlign: 'center' }}>
        <Image src="/logo.png" alt="BellAveGo" width={220} height={68} style={{ objectFit: 'contain', marginBottom: 10, filter: 'brightness(1.1)' }} />
        <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
          <Link href="/" style={{ color: '#FF9D5A', textDecoration: 'none' }}>Home</Link>
          {' · '}
          <Link href="/pricing" style={{ color: '#5EEAD4', textDecoration: 'none' }}>Pricing</Link>
          {' · '}© 2026 BellAveGo LLC
        </p>
      </footer>
    </main>
  )
}

const STORY_BLOCKS: Array<{ h?: string; body: string[] }> = [
  {
    h: 'I&rsquo;m 22 and watching my friends struggle.',
    body: [
      'I went to high school w/ a lot of trade guys. HVAC, plumbing, electrical. Real guys who picked up tools the day after they got their diploma and went to work. The ones who are out on their own at 23, 24 right now — they all hit the same wall.',
      'They\'re INSANELY good at their craft. They\'ll fix anything. But the second they go solo and step away from a family-owned shop with a 30-year-old customer list, they\'re back to square one. Cold-calling. Scrolling neighborhood Facebook groups. Paying HomeAdvisor $80 a lead that gets shared with five other guys.',
      'Last summer I watched one of them — Carlos, runs his own HVAC out of Mesa — work 14-hour days and book ONE actual paying job. The rest of his week was spent finding people who might need work.',
    ],
  },
  {
    h: 'Meanwhile the family-business guys coast.',
    body: [
      'Guys in their 40s and 50s who took over their dad\'s plumbing company? They never have to look for work. The customer list is just THERE. Generations of word-of-mouth.',
      'And that imbalance pissed me off. Carlos was better at the actual job than half the guys with inherited businesses. He just couldn\'t crack the lead problem.',
    ],
  },
  {
    h: 'So I built BellAveGo.',
    body: [
      'I started looking at what data actually exists about homeowners who NEED work done. Permit filings. Property records. HVAC system ages from public utility data. Real-estate transactions.',
      'Turns out it\'s all sitting there in plain sight. Carlos didn\'t need to cold-call random houses — he needed someone (or some AI) to tell him: "Hey, the person at 4421 Maple Crest just bought the place. Their AC is 14 years old. Here\'s their name, phone, and a personalized intro message ready to send."',
      'That\'s what BellAveGo does. Every Monday, 80 fresh leads in your zip — homeowner names, addresses, phones, intent signal. Then AI sends a personalized text + email to each one signed by YOU. You only respond when they reply yes.',
    ],
  },
  {
    h: 'Carlos went from 1 job a day to fully booked.',
    body: [
      'He was one of my first beta testers. Within 30 days of switching to BellAveGo, he stopped cold-calling entirely. His weeks went from "find work + try to finish it" to "execute on jobs already booked."',
      'He cleared $300K his second year fully booked. At 24 years old. From his own one-truck operation in Mesa.',
      'My other friends followed. Two HVAC guys, a plumber, an electrician. All in their early 20s. All running their own shops. All locked in at $250-400K/yr because they stopped fighting for leads.',
    ],
  },
]

const STORY_END = [
  `I'm building BellAveGo for them. For Carlos and every other 22, 23, 24-year-old who went into the trades, started their own thing, and is now sitting at home Saturday night cold-calling because they have no other way to fill Monday.`,
  `If you're one of those guys — or if you\'re just tired of paying HomeAdvisor $80 a lead that 4 other people already have — try BellAveGo for a month. $97 first month w/ FIRST400. If it doesn't book you at least one job in 30 days, full refund, no calls, no hoops.`,
  `Text me anytime — (773) 710-9565. I'm not going to send you to a chatbot. — Peter`,
]

const ctaNavPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '10px 18px', borderRadius: 10,
  background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 100%)',
  color: '#fff', textDecoration: 'none',
  fontWeight: 900, fontSize: 13,
  boxShadow: '0 6px 18px rgba(232,116,43,0.32)',
}
const ctaHeroPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '14px 26px', borderRadius: 12,
  background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 50%, #C84B26 100%)',
  color: '#fff', textDecoration: 'none',
  fontWeight: 900, fontSize: 14.5,
  boxShadow: '0 12px 32px rgba(232,116,43,0.42)',
  letterSpacing: '-0.01em',
}
const ctaHeroSecondary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '14px 24px', borderRadius: 12,
  background: '#FFFFFF',
  border: '1.5px solid rgba(11,31,58,0.20)',
  color: '#0B1F3A', textDecoration: 'none',
  fontWeight: 800, fontSize: 14.5,
}
const ctaFinal: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '16px 36px', borderRadius: 14,
  background: '#FFFFFF',
  color: '#C84B26', textDecoration: 'none',
  fontWeight: 900, fontSize: 15.5,
  boxShadow: '0 14px 36px rgba(11,31,58,0.18)',
}
