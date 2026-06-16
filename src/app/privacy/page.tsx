'use client'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@clerk/nextjs'

/**
 * Privacy Policy — required for OAuth verification (Google / Microsoft)
 * and general trust. Plain-language SaaS boilerplate tailored to what BellAveGo
 * actually does (homeowner lead delivery + AI-assisted outreach).
 *
 * Rewritten 2026-06-10 for the leads-only pivot. PETER: HAVE A LAWYER
 * REVIEW. Update "lastUpdated" any time the substance changes.
 */
const LAST_UPDATED = 'June 10, 2026'

export default function PrivacyPage() {
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
          {!isSignedIn && <Link href="/start" className="nav-cta"><span className="nav-cta-text">Get my first month free →</span></Link>}
        </div>
      </nav>

      <article style={{ maxWidth: 820, margin: '0 auto', padding: '64px 32px 96px', fontSize: 15, lineHeight: 1.7, color: '#1F3A4A' }}>

        <header style={{ marginBottom: 36 }}>
          <p style={{ fontSize: 12, fontWeight: 800, color: '#C84B26', letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 8 }}>Legal</p>
          <h1 style={{ fontSize: 'clamp(34px, 4vw, 48px)', fontWeight: 900, letterSpacing: '-1.2px', color: '#0B1F3A', marginBottom: 8 }}>Privacy Policy</h1>
          <p style={{ fontSize: 13, color: '#7AAAB2' }}>Last updated: {LAST_UPDATED}</p>
        </header>

        <Section title="1. Who we are">
          <p>BellAveGo (&quot;we,&quot; &quot;us,&quot; &quot;BellAveGo&quot;) provides a homeowner lead-generation and AI-assisted outreach platform for home-service contractors. This Privacy Policy explains what data we collect, how we use it, who we share it with, and your rights.</p>
          <p>If you have questions, contact us at <a href="mailto:bellavegollc@gmail.com" style={{ color: '#0AA89F', fontWeight: 700 }}>bellavegollc@gmail.com</a>.</p>
        </Section>

        <Section title="2. What we collect">
          <p><strong>From contractors (our paying customers):</strong></p>
          <ul style={listStyle}>
            <li>Account info — name, email, password (hashed via Clerk), business name, owner name, business address, service area, trade, phone number</li>
            <li>Billing info — handled by Stripe; we store only the Stripe customer ID and subscription status, never card numbers</li>
            <li>Connected accounts — any OAuth tokens you connect (encrypted at rest)</li>
            <li>Usage data — leads delivered, outreach sent, dashboard activity</li>
          </ul>
          <p><strong>About homeowners (the leads we deliver):</strong></p>
          <ul style={listStyle}>
            <li>Name, street address, and property attributes (year built, estimated value) compiled from public records and licensed property-data providers</li>
            <li>Phone number obtained via skip-tracing through licensed data providers</li>
            <li>The public signal that surfaced the lead (e.g. a building permit filing, a verified storm event in the zip, a recorded home sale)</li>
            <li>Responses a homeowner sends to outreach initiated through the platform</li>
          </ul>
          <p>Homeowner data comes from public records and licensed data sources — not from tracking individuals online. Homeowners can request removal from our database at any time (see Section 8).</p>
        </Section>

        <Section title="3. How we use it">
          <ul style={listStyle}>
            <li><strong>Deliver the service</strong> — find homeowner leads in your service area, deliver them to your dashboard, generate outreach scripts, and (when you authorize it) send outreach to those leads in your business name</li>
            <li><strong>Notify you</strong> — SMS and email alerts when leads land or a homeowner responds</li>
            <li><strong>Improve the AI</strong> — anonymized, aggregated patterns help us tune prompts and detect quality issues; we do NOT use your data to train third-party AI models</li>
            <li><strong>Support</strong> — investigate issues you report</li>
            <li><strong>Billing</strong> — process payments via Stripe</li>
            <li><strong>Legal</strong> — comply with subpoenas, court orders, or law enforcement requests where legally required</li>
          </ul>
        </Section>

        <Section title="4. Third-party processors">
          <p>We rely on best-in-class infrastructure providers to deliver the service. Each receives only the data needed for its function and is bound by its own privacy and security commitments:</p>
          <ul style={listStyle}>
            <li><strong>Twilio</strong> — SMS routing and voice infrastructure</li>
            <li><strong>Anthropic</strong> — large language model (Claude) powering outreach scripts and lead analysis</li>
            <li><strong>Licensed property-data providers</strong> — property records and skip-traced contact data used to compile leads</li>
            <li><strong>Stripe</strong> — payment processing and subscription billing</li>
            <li><strong>Supabase</strong> — database and file storage</li>
            <li><strong>Clerk</strong> — authentication and user identity</li>
            <li><strong>Google APIs</strong> — Places and Business Profile (when you connect)</li>
            <li><strong>Vercel</strong> — application hosting</li>
          </ul>
        </Section>

        <Section title="5. SMS communications">
          <p>BellAveGo sends SMS messages on behalf of contractors to their leads and customers, and to contractors themselves. These messages include outreach a contractor authorizes to delivered leads, replies and follow-ups in an ongoing conversation, job status updates, and account notifications to the contractor.</p>
          <p><strong>Consent + compliance:</strong> contractors are responsible for ensuring any outreach they initiate or authorize complies with the TCPA, state telemarketing laws, and Do-Not-Call rules. End users may also opt in by submitting their phone number through a contractor&apos;s website or texting a business number directly; opting in is voluntary and is not a condition of any purchase.</p>
          <p><strong>Message frequency:</strong> message frequency varies based on the customer&apos;s active service requests, appointments, and job activity. Customers typically receive between 1 and 10 messages per service interaction.</p>
          <p><strong>Carrier fees:</strong> message and data rates may apply. BellAveGo does not charge end users for SMS messages, but standard carrier rates from the user&apos;s wireless provider may apply.</p>
          <p><strong>Opt-out:</strong> end users can opt out at any time by replying STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, or QUIT to any message. Once opted out, no further SMS messages will be sent to that number unless the user opts back in by replying START.</p>
          <p><strong>Help:</strong> end users can reply HELP to any message to receive support contact information.</p>
          <p><strong>Non-sharing:</strong> mobile phone numbers and SMS opt-in consent are never shared with third parties or affiliates for their marketing purposes. Phone numbers are only shared with the infrastructure providers listed in Section 4 of this policy strictly for the purpose of delivering SMS messages on behalf of contractors. <strong>No mobile information will be shared with third parties or affiliates for marketing or promotional purposes.</strong></p>
        </Section>

        <Section title="6. Legacy call features">
          <p>Some grandfathered accounts use BellAveGo-provisioned phone numbers with AI call answering. For those accounts only: inbound calls are recorded and transcribed, the AI identifies itself as AI when asked, recordings are stored encrypted and accessible only to the contractor and authorized BellAveGo staff, and the contractor is responsible for complying with applicable call-recording laws in their jurisdiction. Recordings older than 12 months are automatically purged unless retention is specifically requested.</p>
        </Section>

        <Section title="7. Data retention">
          <ul style={listStyle}>
            <li>Active account data — kept while your subscription is active</li>
            <li>Lead and outreach history — kept while your subscription is active; you keep delivered leads after cancellation per the 1-Job Guarantee</li>
            <li>Legacy call recordings + transcripts — 12 months, then auto-purged</li>
            <li>Billing records — 7 years (required for tax compliance)</li>
            <li>Cancelled accounts — data deleted within 30 days of cancellation request, except billing records (above)</li>
          </ul>
        </Section>

        <Section title="8. Your rights">
          <p>You can:</p>
          <ul style={listStyle}>
            <li>Access all data we hold about you or your business</li>
            <li>Request correction of inaccurate data</li>
            <li>Request deletion of your account and associated data</li>
            <li>Export your data in machine-readable format</li>
            <li>Withdraw consent for optional processing</li>
          </ul>
          <p><strong>Homeowners:</strong> if your information appeared in a lead and you want it removed, email us or reply STOP to any message — we suppress your contact information from future lead deliveries and outreach.</p>
          <p>To exercise any of these, email <a href="mailto:bellavegollc@gmail.com" style={{ color: '#0AA89F', fontWeight: 700 }}>bellavegollc@gmail.com</a>. We respond within 7 business days.</p>
        </Section>

        <Section title="9. Security">
          <p>We use industry-standard security practices: TLS encryption in transit, encrypted at rest in Supabase, OAuth tokens encrypted with rotating keys, service-role isolation between tenants, no shared databases. If you suspect a security issue, email <a href="mailto:bellavegollc@gmail.com" style={{ color: '#0AA89F', fontWeight: 700 }}>bellavegollc@gmail.com</a> with &quot;SECURITY&quot; in the subject line.</p>
        </Section>

        <Section title="10. Children">
          <p>BellAveGo is a B2B service for licensed home-service contractors. We do not knowingly collect data from anyone under 18. If you believe we have, contact us and we will delete it immediately.</p>
        </Section>

        <Section title="11. Changes to this policy">
          <p>We may update this policy as the service evolves. Material changes are emailed to all active contractors at least 30 days in advance. The &quot;Last updated&quot; date at the top reflects the most recent change.</p>
        </Section>

        <Section title="12. Contact">
          <p>BellAveGo LLC<br/>Email: <a href="mailto:bellavegollc@gmail.com" style={{ color: '#0AA89F', fontWeight: 700 }}>bellavegollc@gmail.com</a><br/>Founder: Peter McShane</p>
        </Section>

      </article>

      <footer style={{ padding: '40px 32px', background: '#0B1F3A', textAlign: 'center', color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>
        <p>© {new Date().getFullYear()} BellAveGo LLC. <Link href="/terms" style={{ color: '#5EEAD4', textDecoration: 'none', marginLeft: 12 }}>Terms of Service</Link></p>
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
