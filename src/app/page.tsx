'use client'
import Link from 'next/link'
import Image from 'next/image'

export default function HomePage() {
  const handleCheckout = async () => {
    const res = await fetch('/api/stripe/checkout', { method: 'POST' })
    const data = await res.json()
    if (data.url) {
      window.location.href = data.url
    } else if (res.status === 401) {
      window.location.href = '/sign-up'
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui, -apple-system, sans-serif', background: '#fff', color: '#0a0a0a', minHeight: '100vh', overflowX: 'hidden' }}>

      {/* NAV */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 48px', height: 72, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, background: '#1a56db', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#fff', fontSize: 20 }}>📞</span>
          </div>
          <span style={{ fontWeight: 900, fontSize: 28, color: '#fff', letterSpacing: '-0.5px' }}>BellAveGo</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link href="/sign-in" style={{ padding: '10px 22px', border: '1.5px solid rgba(255,255,255,0.25)', borderRadius: 8, textDecoration: 'none', color: '#fff', fontSize: 14, fontWeight: 500 }}>Sign in</Link>
          <button onClick={handleCheckout} style={{ padding: '10px 22px', background: '#1a56db', borderRadius: 8, border: 'none', color: '#fff', fontSize: 14, fontWeight: 800, boxShadow: '0 4px 14px rgba(26,86,219,0.5)', cursor: 'pointer' }}>Start Free Trial</button>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '120px 48px 80px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 800, height: 500, background: 'radial-gradient(ellipse, rgba(26,86,219,0.18) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20, padding: '8px 16px', marginBottom: 36 }}>
          <span style={{ width: 8, height: 8, background: '#22c55e', borderRadius: '50%', display: 'inline-block' }} />
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 500 }}>AI answering calls right now</span>
        </div>
        <h1 style={{ fontSize: 'clamp(52px, 8vw, 100px)', fontWeight: 900, lineHeight: 0.95, letterSpacing: '-3px', color: '#fff', margin: '0 0 12px', maxWidth: 900 }}>You missed a call.</h1>
        <h1 style={{ fontSize: 'clamp(52px, 8vw, 100px)', fontWeight: 900, lineHeight: 0.95, letterSpacing: '-3px', color: '#1a56db', margin: '0 0 40px', maxWidth: 900 }}>That was $400.</h1>
        <p style={{ fontSize: 20, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, marginBottom: 52, maxWidth: 500 }}>
          BellAveGo answers every call 24/7, books the job, and texts your customer — while you work.
        </p>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 40 }}>
          <button onClick={handleCheckout} style={{ padding: '18px 40px', background: '#1a56db', color: '#fff', fontWeight: 900, fontSize: 17, borderRadius: 12, border: 'none', cursor: 'pointer', boxShadow: '0 4px 28px rgba(26,86,219,0.5)' }}>
            Start Free — 14 Days →
          </button>
          <a href="tel:+17623713351" style={{ padding: '18px 28px', background: 'rgba(255,255,255,0.08)', color: '#fff', fontWeight: 700, fontSize: 17, borderRadius: 12, textDecoration: 'none', border: '1.5px solid rgba(255,255,255,0.15)' }}>
            📞 Call the AI demo
          </a>
        </div>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>No credit card · 15-min setup · Cancel anytime</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, marginTop: 72, maxWidth: 700, width: '100%', background: 'rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
          {[
            { num: '62%', label: 'of callers never leave a voicemail' },
            { num: '$54K', label: 'avg lost per year from missed calls' },
            { num: '1 in 3', label: 'calls go unanswered at small businesses' },
          ].map((s, i) => (
            <div key={s.label} style={{ padding: '28px 20px', textAlign: 'center', borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
              <p style={{ fontSize: 36, fontWeight: 900, color: '#fff', margin: '0 0 6px', letterSpacing: '-1px' }}>{s.num}</p>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', margin: 0, lineHeight: 1.5 }}>{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section style={{ padding: '80px 48px', background: '#0a0a0a', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 40, fontWeight: 900, letterSpacing: '-1px', color: '#fff', marginBottom: 12 }}>How it works</h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 16, marginBottom: 56 }}>Set up in 15 minutes. Works while you sleep.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
            {[
              { step: '01', icon: '📞', title: 'Customer calls you', desc: "BellAveGo answers in 2 rings, 24/7 — even when you're on a job, driving, or asleep." },
              { step: '02', icon: '🤖', title: 'AI handles everything', desc: 'Collects their name, address, and job details. Books them into your calendar automatically.' },
              { step: '03', icon: '💬', title: 'Everyone gets notified', desc: 'Customer gets a confirmation text. You get a job alert. Invoice sent when work is done.' },
            ].map((s) => (
              <div key={s.step} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '36px 28px' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#1a56db', letterSpacing: 2, marginBottom: 16 }}>STEP {s.step}</div>
                <div style={{ fontSize: 36, marginBottom: 16 }}>{s.icon}</div>
                <p style={{ fontWeight: 800, fontSize: 18, color: '#fff', marginBottom: 10 }}>{s.title}</p>
                <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, lineHeight: 1.7, margin: 0 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SERVICES TICKER */}
      <section style={{ background: '#fafafa', borderBottom: '1px solid #f0f0f0', borderTop: '1px solid #f0f0f0', padding: '18px 0', overflow: 'hidden' }}>
        <div style={{ display: 'flex', width: 'max-content', animation: 'scroll 25s linear infinite' }}>
          <style>{`@keyframes scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }`}</style>
          {[...Array(2)].map((_, repeat) => (
            <div key={repeat} style={{ display: 'flex' }}>
              {[
                { icon: '❄️', label: 'HVAC' }, { icon: '🪠', label: 'Plumbing' }, { icon: '⚡', label: 'Electrical' },
                { icon: '🧹', label: 'Cleaning' }, { icon: '🌿', label: 'Landscaping' }, { icon: '🔨', label: 'Handyman' },
                { icon: '🏠', label: 'Roofing' }, { icon: '🔧', label: 'Appliance Repair' }, { icon: '🚗', label: 'Auto Detailing' },
                { icon: '🐾', label: 'Pet Services' }, { icon: '💧', label: 'Pool & Spa' }, { icon: '🪟', label: 'Window Cleaning' },
              ].map(s => (
                <div key={s.label + repeat} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 28px', borderRight: '1px solid #ebebeb', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: 18 }}>{s.icon}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#555' }}>{s.label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* STORY */}
      <section style={{ padding: '80px 48px', background: '#fff', borderBottom: '1px solid #f0f0f0' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <h2 style={{ fontSize: 44, fontWeight: 900, letterSpacing: '-1px', color: '#0a0a0a', marginBottom: 12 }}>
              You focus on the job.<br />
              <span style={{ color: '#1a56db' }}>We handle the call.</span>
            </h2>
            <p style={{ color: '#888', fontSize: 17, maxWidth: 460, margin: '0 auto' }}>
              While you&apos;re working, BellAveGo answers, books the job, and texts the customer — all in seconds.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 40 }}>
            <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', boxShadow: '0 16px 48px rgba(0,0,0,0.12)' }}>
              <Image src="/electrician.png" alt="Contractor on the job" width={600} height={420} style={{ width: '100%', height: 340, objectFit: 'cover', display: 'block' }} />
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)', padding: '32px 24px 20px' }}>
                <p style={{ color: '#fff', fontWeight: 700, fontSize: 15, margin: 0 }}>📍 Contractor on a job</p>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: '4px 0 0' }}>Phone rings — can&apos;t pick up</p>
              </div>
            </div>
            <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', boxShadow: '0 16px 48px rgba(0,0,0,0.12)' }}>
              <Image src="/customer.png" alt="Customer getting confirmation" width={600} height={420} style={{ width: '100%', height: 340, objectFit: 'cover', display: 'block' }} />
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)', padding: '32px 24px 20px' }}>
                <p style={{ color: '#fff', fontWeight: 700, fontSize: 15, margin: 0 }}>💬 Customer gets a text instantly</p>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: '4px 0 0' }}>Booked, confirmed, reminded</p>
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
            {[
              { icon: '📞', title: 'BellAveGo answers', desc: 'Every call, every time — 24/7' },
              { icon: '📅', title: 'Job gets booked', desc: 'Added to your schedule instantly' },
              { icon: '💬', title: 'Customer texted', desc: 'Confirmation + reminder, automatic' },
            ].map(s => (
              <div key={s.title} style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 14, padding: '28px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 14 }}>{s.icon}</div>
                <p style={{ fontWeight: 800, fontSize: 16, marginBottom: 6, color: '#0a0a0a' }}>{s.title}</p>
                <p style={{ color: '#888', fontSize: 14, lineHeight: 1.6, margin: 0 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section style={{ padding: '80px 48px', background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <h2 style={{ fontSize: 40, fontWeight: 900, marginBottom: 10, letterSpacing: '-1px', color: '#0a0a0a' }}>Everything runs itself.</h2>
            <p style={{ color: '#888', fontSize: 16 }}>From first call to getting paid — BellAveGo handles it.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            {[
              { icon: '📅', title: 'Auto scheduling', desc: 'Job lands on your calendar the second the call ends.' },
              { icon: '👤', title: 'Customer database', desc: 'Every caller saved automatically. No spreadsheets.' },
              { icon: '💬', title: 'SMS reminders', desc: 'Customers get texts so they actually show up.' },
              { icon: '🧾', title: 'Instant invoicing', desc: 'Send an invoice with one tap. Get paid same day.' },
              { icon: '⭐', title: 'Review requests', desc: 'Auto-texts happy customers for Google reviews.' },
              { icon: '📊', title: 'Revenue dashboard', desc: 'See all your jobs and money in one screen.' },
            ].map(f => (
              <div key={f.title} style={{ background: '#fff', border: '1px solid #ebebeb', borderRadius: 14, padding: '24px 20px' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>{f.icon}</div>
                <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 6, color: '#0a0a0a' }}>{f.title}</p>
                <p style={{ color: '#888', fontSize: 13, lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section style={{ padding: '80px 48px', background: '#fff', borderBottom: '1px solid #f0f0f0' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <h2 style={{ fontSize: 40, fontWeight: 900, marginBottom: 8, letterSpacing: '-1px', color: '#0a0a0a' }}>Real contractors. Real results.</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
            {[
              { name: 'Mike T.', company: 'T&T HVAC · Atlanta', quote: 'Answered 14 calls my first week and booked 9 jobs. Paid for itself day one.', result: '+$3,200 week 1' },
              { name: 'Carlos R.', company: 'Rivera Plumbing · Dallas', quote: 'My AI answered at 11pm and booked an $800 install. Would have missed it completely.', result: '+$800 overnight' },
              { name: 'Dave K.', company: 'K&S Electric · Phoenix', quote: 'Wake up to booked jobs every morning. No-shows are basically gone.', result: 'Never misses a call' },
            ].map(t => (
              <div key={t.name} style={{ background: '#fafafa', border: '1px solid #ebebeb', borderRadius: 16, padding: '28px 24px' }}>
                <div style={{ color: '#f59e0b', fontSize: 14, marginBottom: 14, letterSpacing: 2 }}>★★★★★</div>
                <p style={{ color: '#444', fontSize: 14, lineHeight: 1.75, marginBottom: 20, fontStyle: 'italic' }}>&quot;{t.quote}&quot;</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <div>
                    <p style={{ fontWeight: 700, margin: 0, color: '#0a0a0a', fontSize: 14 }}>{t.name}</p>
                    <p style={{ color: '#aaa', margin: 0, fontSize: 12 }}>{t.company}</p>
                  </div>
                  <span style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6 }}>{t.result}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section style={{ padding: '80px 48px', background: '#fafafa', borderBottom: '1px solid #f0f0f0', textAlign: 'center' }}>
        <h2 style={{ fontSize: 44, fontWeight: 900, marginBottom: 8, letterSpacing: '-1.5px', color: '#0a0a0a' }}>One price. Everything included.</h2>
        <p style={{ color: '#888', fontSize: 16, marginBottom: 52 }}>Pays for itself the first job you would have missed.</p>
        <div style={{ background: '#0a0a0a', borderRadius: 20, padding: '52px 44px', maxWidth: 440, margin: '0 auto', boxShadow: '0 24px 80px rgba(0,0,0,0.18)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 3, marginBottom: 4 }}>
            <span style={{ fontSize: 26, fontWeight: 900, color: 'rgba(255,255,255,0.4)', marginTop: 16 }}>$</span>
            <span style={{ fontSize: 90, fontWeight: 900, color: '#fff', lineHeight: 1, letterSpacing: '-3px' }}>97</span>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.35)', marginBottom: 36, fontSize: 14 }}>per month · no contracts</p>
          <div style={{ textAlign: 'left', marginBottom: 36 }}>
            {['AI receptionist 24/7', 'Auto job booking + calendar', 'SMS confirmations + reminders', 'Invoicing + same-day payments', 'Google review automation', 'Up to 5 team members', 'Cancel anytime'].map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ width: 20, height: 20, background: '#1a56db', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ color: '#fff', fontSize: 11, fontWeight: 800 }}>✓</span>
                </div>
                <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>{f}</span>
              </div>
            ))}
          </div>
          <button onClick={handleCheckout} style={{ display: 'block', width: '100%', padding: '18px', textAlign: 'center', background: '#1a56db', borderRadius: 10, border: 'none', color: '#fff', fontWeight: 900, fontSize: 16, cursor: 'pointer' }}>
            Start Free Trial — 14 Days →
          </button>
          <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12, marginTop: 14 }}>No credit card required</p>
        </div>
      </section>

      {/* FINAL CTA */}
      <section style={{ padding: '100px 48px', background: '#1a56db', textAlign: 'center' }}>
        <h2 style={{ fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 900, marginBottom: 16, color: '#fff', letterSpacing: '-1.5px', lineHeight: 1.1 }}>
          Every missed call is money<br />walking out the door.
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 17, maxWidth: 400, margin: '0 auto 44px', lineHeight: 1.8 }}>
          15 minutes to set up. First job pays for the whole year.
        </p>
        <button onClick={handleCheckout} style={{ display: 'inline-block', padding: '18px 48px', background: '#fff', borderRadius: 12, border: 'none', color: '#1a56db', fontWeight: 900, fontSize: 17, cursor: 'pointer' }}>
          Start Free Trial →
        </button>
        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, marginTop: 20 }}>No credit card. No contract. No BS.</p>
      </section>

      {/* FOOTER */}
      <footer style={{ textAlign: 'center', padding: '28px 40px', background: '#0d1117' }}>
        <p style={{ margin: 0, fontSize: 12, color: '#444' }}>BellAveGo · Built for home service businesses · $97/mo · No contracts · Cancel anytime</p>
      </footer>

    </main>
  )
}