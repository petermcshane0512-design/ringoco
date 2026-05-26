'use client'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@clerk/nextjs'

/**
 * Terms of Service — required for OAuth verification (Google / Microsoft)
 * and general legal hygiene. Standard SaaS boilerplate tailored to BellAveGo:
 * subscription terms (7-day free trial, no money-back guarantee), acceptable use, liability limits.
 *
 * NOT a substitute for a lawyer-reviewed agreement once revenue scales — but
 * solid enough for OAuth review and the first hundred customers. Update
 * lastUpdated when the substance changes.
 */
const LAST_UPDATED = 'May 17, 2026'

export default function TermsPage() {
  const { isSignedIn } = useAuth()
  return (
    <main style={{ fontFamily: "'Inter', system-ui, sans-serif", background: '#F2F9F5', color: '#0B1F3A', minHeight: '100vh' }}>

      <nav className="bavg-top-nav" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 48px', height: 72, background: '#fff', borderBottom: '1px solid #DCE9E2', position: 'sticky', top: 0, zIndex: 100 }}>
        <Link href="/" className="bavg-top-nav-logo" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <Image src="/logo.png" alt="BellAveGo" width={665} height={210} style={{ objectFit: 'contain', marginTop: 10 }} />
        </Link>
        <div className="bavg-top-nav-actions" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {isSignedIn && <Link href="/dashboard" className="nav-cta"><span className="nav-cta-text">Dashboard</span></Link>}
          <Link href="/founder" className="why-pulse"><span className="why-pulse-text">Why BellAveGo?</span></Link>
          <Link href="/pricing" className="price-pulse">Pricing</Link>
          {!isSignedIn && <Link href="/sign-in" className="signin-link">Sign In</Link>}
          {!isSignedIn && <Link href="/sign-up" className="nav-cta"><span className="nav-cta-text">Create Account</span></Link>}
        </div>
      </nav>

      <article style={{ maxWidth: 820, margin: '0 auto', padding: '64px 32px 96px', fontSize: 15, lineHeight: 1.7, color: '#1F3A4A' }}>

        <header style={{ marginBottom: 36 }}>
          <p style={{ fontSize: 12, fontWeight: 800, color: '#C84B26', letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 8 }}>Legal</p>
          <h1 style={{ fontSize: 'clamp(34px, 4vw, 48px)', fontWeight: 900, letterSpacing: '-1.2px', color: '#0B1F3A', marginBottom: 8 }}>Terms of Service</h1>
          <p style={{ fontSize: 13, color: '#7AAAB2' }}>Last updated: {LAST_UPDATED}</p>
        </header>

        <Section title="1. Agreement">
          <p>These Terms of Service (&quot;Terms&quot;) govern your access to and use of BellAveGo (the &quot;Service&quot;), operated by BellAveGo (&quot;BellAveGo,&quot; &quot;we,&quot; &quot;us&quot;). By creating an account, accessing the Service, or paying for a subscription, you (&quot;Customer,&quot; &quot;you&quot;) agree to these Terms.</p>
          <p>If you are using the Service on behalf of a business, you represent that you have authority to bind that business to these Terms.</p>
        </Section>

        <Section title="2. What we provide">
          <p>BellAveGo is an AI-powered platform for home-service contractors. The Service includes:</p>
          <ul style={listStyle}>
            <li>An AI receptionist that answers inbound calls in your business name and captures lead information</li>
            <li>SMS-based message summaries and one-tap action links delivered to your phone</li>
            <li>Optional calendar integration for live appointment booking</li>
            <li>AI-generated consulting reports on a cadence based on your tier</li>
            <li>Operator-tier features: AI Quote Hunter, AI Collections, AI Review Manager, AI Reputation</li>
            <li>Dashboard with call history, transcripts, and analytics</li>
          </ul>
          <p>Features available on your account depend on the subscription tier you select.</p>
        </Section>

        <Section title="3. Subscription, billing, and trial">
          <p><strong>Tiers + pricing:</strong> current pricing is published at <Link href="/pricing" style={{ color: '#0AA89F', fontWeight: 700 }}>bellavego.com/pricing</Link>. We may change pricing for new subscriptions at any time; existing subscriptions are grandfathered until renewal.</p>
          <p><strong>Billing cycle:</strong> month-to-month or annual, billed in advance via Stripe. Annual plans receive the discount shown on the pricing page.</p>
          <p><strong>7-day free trial:</strong> all new subscriptions begin with a 7-day free trial. We collect a payment method at signup but do not charge it during the trial. On day 8, the first month is charged automatically to the saved payment method at the tier&apos;s published price. You may cancel at any point during the 7-day trial from your dashboard or by contacting us — if you cancel before day 8, no charge ever fires.</p>
          <p><strong>Cancellation after the trial:</strong> you may cancel anytime from your dashboard or by contacting us. Service continues through the end of the paid period; no further charges apply. <strong>No refunds are issued for any already-billed period</strong> — including partial months. Cancel before the next renewal to avoid the next charge.</p>
          <p><strong>Failed payments:</strong> if a payment fails, we will retry for 7 days and notify you. After 7 days the service will be suspended (calls will be answered with a polite &quot;service paused&quot; message). After 30 days of non-payment, the account may be cancelled and data subject to the deletion schedule in our <Link href="/privacy" style={{ color: '#0AA89F', fontWeight: 700 }}>Privacy Policy</Link>.</p>
        </Section>

        <Section title="4. Your responsibilities">
          <p>You agree to:</p>
          <ul style={listStyle}>
            <li>Provide accurate account, business, and billing information</li>
            <li>Forward your business line to the BellAveGo number we provision for you (if you want inbound calls answered)</li>
            <li>Comply with all applicable laws, including call-recording disclosure laws in your state — the AI&apos;s greeting can be customized to add a disclosure if your jurisdiction requires it</li>
            <li>Ensure that any SMS communications sent through the Service comply with the TCPA and applicable carrier rules (BellAveGo handles A2P 10DLC compliance at the platform level; you are responsible for your own consent practices when initiating bulk outreach)</li>
            <li>Not use the Service to harass, defraud, or impersonate any person</li>
            <li>Not attempt to reverse-engineer, scrape, or resell the Service without our written permission</li>
          </ul>
        </Section>

        <Section title="5. AI behavior — important">
          <p>The AI receptionist is designed to <strong>take messages, not commit you to appointments you can&apos;t make</strong>. By default, the AI never confirms an appointment — it captures the caller&apos;s request and texts you a summary so you control the schedule.</p>
          <p>If you connect a calendar (Google, Outlook, Calendly), the AI may offer real open slots from your calendar and create events on your behalf when callers pick one. A configurable travel buffer (default 30 minutes) is applied so back-to-back bookings are prevented. You can disconnect your calendar at any time to revert to message-only behavior.</p>
          <p>AI-generated outputs (consulting reports, ad creative, quote follow-up text, review replies) are recommendations, not guaranteed results. Review them before acting.</p>
        </Section>

        <Section title="6. Service availability">
          <p>We target 99.5% uptime but do not guarantee continuous, uninterrupted access. Scheduled maintenance is announced in advance when feasible. We rely on third-party infrastructure (Twilio, Vapi, Anthropic, Stripe, Supabase, Vercel, Google Calendar API, Microsoft Graph) and are not liable for outages caused by those providers, though we will make commercially reasonable efforts to restore service.</p>
        </Section>

        <Section title="7. Intellectual property">
          <p>BellAveGo retains all rights, title, and interest in the Service, software, AI models, prompts, and dashboards. You retain ownership of your business data, call recordings, customer information, and any content you upload. We use your data only as described in our <Link href="/privacy" style={{ color: '#0AA89F', fontWeight: 700 }}>Privacy Policy</Link>.</p>
        </Section>

        <Section title="8. Disclaimers">
          <p>THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE,&quot; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, OR ACCURACY OF AI OUTPUT.</p>
          <p>We do not guarantee that the AI will capture every call perfectly, that every message will be delivered, or that the Service will increase your revenue by any specific amount. The Idiot Index and ROI claims on our marketing pages are estimates based on typical home-service businesses, not promises specific to your shop.</p>
        </Section>

        <Section title="9. Limitation of liability">
          <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, BELLAVEGO&apos;S TOTAL LIABILITY ARISING OUT OF OR RELATED TO THESE TERMS OR THE SERVICE WILL NOT EXCEED THE AMOUNT YOU PAID US IN THE 12 MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM. WE WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOST PROFITS OR LOST BUSINESS OPPORTUNITIES.</p>
        </Section>

        <Section title="10. Indemnification">
          <p>You agree to indemnify and hold harmless BellAveGo from any claims, damages, or costs (including reasonable attorneys&apos; fees) arising from your use of the Service in violation of these Terms or applicable law, including claims by your customers related to your business practices.</p>
        </Section>

        <Section title="11. Termination">
          <p>Either party may terminate this agreement at any time. You can cancel via your dashboard. We may terminate or suspend your access for material breach of these Terms, non-payment, fraudulent activity, or to comply with legal obligations. On termination, your data is subject to the retention + deletion schedule in our <Link href="/privacy" style={{ color: '#0AA89F', fontWeight: 700 }}>Privacy Policy</Link>.</p>
        </Section>

        <Section title="12. Governing law + disputes">
          <p>These Terms are governed by the laws of the State of Illinois, without regard to its conflict of laws principles. Any dispute will be resolved in the state or federal courts located in Cook County, Illinois. You and BellAveGo each waive any right to a jury trial.</p>
          <p>Once BellAveGo&apos;s LLC formation in Delaware completes, jurisdiction may shift to Delaware; we&apos;ll notify active customers at that time.</p>
        </Section>

        <Section title="13. Changes to these Terms">
          <p>We may update these Terms. Material changes are emailed to all active customers at least 30 days in advance and posted with a new &quot;Last updated&quot; date here. Continued use of the Service after changes take effect constitutes acceptance.</p>
        </Section>

        <Section title="14. Contact">
          <p>BellAveGo LLC<br/>Email: <a href="mailto:bellavegollc@gmail.com" style={{ color: '#0AA89F', fontWeight: 700 }}>bellavegollc@gmail.com</a><br/>Founder: Peter McShane</p>
        </Section>

      </article>

      <footer style={{ padding: '40px 32px', background: '#0B1F3A', textAlign: 'center', color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>
        <p>© {new Date().getFullYear()} BellAveGo LLC. <Link href="/privacy" style={{ color: '#5EEAD4', textDecoration: 'none', marginLeft: 12 }}>Privacy Policy</Link></p>
      </footer>
    </main>
  )
}

const listStyle: React.CSSProperties = { paddingLeft: 22, margin: '8px 0 14px' }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0B1F3A', letterSpacing: '-0.4px', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid rgba(232,116,43,0.16)' }}>{title}</h2>
      {children}
    </section>
  )
}
