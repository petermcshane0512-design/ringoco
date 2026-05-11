'use client'
import Link from 'next/link'

const STEPS = [
  {
    n: 1,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M22 11h-6M19 8v6"/>
      </svg>
    ),
    duration: '2 min',
    title: 'Sign up & tell us your trade',
    desc: 'HVAC, plumbing, electrical, whatever — pick yours. We pre-tune the AI for your industry’s common asks.',
  },
  {
    n: 2,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.97.37 1.92.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.89.33 1.84.57 2.81.7A2 2 0 0 1 22 16.92z"/>
      </svg>
    ),
    duration: '5 min',
    title: 'Forward your calls',
    desc: 'We auto-detect your carrier (Verizon, T-Mobile, AT&T, etc.) and give you the exact star-code to dial. Done in 30 seconds per phone.',
  },
  {
    n: 3,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
        <polyline points="17 6 23 6 23 12"/>
      </svg>
    ),
    duration: 'Same day',
    title: 'Get your first booked job',
    desc: 'Next missed call gets answered. You get a text with the caller’s name, problem, and times they’re free. Take it from there.',
  },
]

export default function SetupSteps() {
  return (
    <section className="ss-root">
      <style>{`
        .ss-root {
          position: relative;
          padding: 56px 32px 60px;
          background: #F5FCFA;
          border-bottom: 1px solid rgba(10,168,159,0.10);
        }
        .ss-wrap { max-width: 1100px; margin: 0 auto; }
        .ss-head { text-align: center; margin-bottom: 32px; }
        .ss-eyebrow {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 5px 13px;
          border-radius: 99px;
          background: rgba(10,168,159,0.10);
          border: 1px solid rgba(10,168,159,0.32);
          font-size: 10.5px; font-weight: 800;
          color: #0AA89F;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          margin-bottom: 14px;
        }
        .ss-eyebrow::before {
          content: ''; width: 6px; height: 6px; border-radius: 50%;
          background: #22C55E; box-shadow: 0 0 8px rgba(34,197,94,0.7);
        }
        .ss-h2 {
          font-size: clamp(28px, 3.6vw, 42px);
          font-weight: 900;
          letter-spacing: -0.035em;
          line-height: 1.04;
          margin: 0 0 12px;
          color: #0B1F3A;
        }
        .ss-h2 .accent {
          background: linear-gradient(135deg, #0AA89F 0%, #14B8A6 50%, #5EEAD4 100%);
          -webkit-background-clip: text; background-clip: text; color: transparent;
        }
        .ss-sub { font-size: 15px; color: #4A7A80; max-width: 580px; margin: 0 auto; line-height: 1.55; }
        .ss-strip {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
          position: relative;
        }
        @media (max-width: 880px) { .ss-strip { grid-template-columns: 1fr; } }

        .ss-step {
          position: relative;
          background: #fff;
          border: 1px solid rgba(10,168,159,0.18);
          border-radius: 16px;
          padding: 24px 22px 22px;
          box-shadow: 0 6px 20px rgba(7,27,58,0.06);
          transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
        }
        .ss-step:hover {
          transform: translateY(-3px);
          box-shadow: 0 16px 36px rgba(10,168,159,0.18);
          border-color: rgba(10,168,159,0.42);
        }
        .ss-step-head {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 14px;
        }
        .ss-step-num {
          width: 36px; height: 36px;
          border-radius: 10px;
          background: linear-gradient(135deg, #0AA89F, #0D8F87);
          color: #fff;
          display: flex; align-items: center; justify-content: center;
          font-size: 16px; font-weight: 900;
          box-shadow: 0 6px 14px rgba(10,168,159,0.35);
        }
        .ss-step-pill {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 4px 10px;
          border-radius: 99px;
          background: rgba(34,197,94,0.10);
          border: 1px solid rgba(34,197,94,0.30);
          font-size: 10.5px; font-weight: 800;
          color: #15803D;
          letter-spacing: 0.04em;
        }
        .ss-step-ico {
          width: 32px; height: 32px;
          border-radius: 9px;
          background: rgba(10,168,159,0.08);
          color: #0AA89F;
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 12px;
        }
        .ss-step-title {
          font-size: 16px; font-weight: 800;
          color: #0B1F3A;
          letter-spacing: -0.3px;
          margin: 0 0 6px;
        }
        .ss-step-desc {
          font-size: 13px;
          color: #4A7A80;
          line-height: 1.55;
          margin: 0;
        }

        .ss-foot {
          margin-top: 26px;
          display: flex; align-items: center; justify-content: center; gap: 14px;
          flex-wrap: wrap;
        }
        .ss-total {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 9px 16px;
          border-radius: 99px;
          background: linear-gradient(135deg, #0B1F3A, #112C4A);
          color: #fff;
          font-size: 12.5px; font-weight: 800;
          letter-spacing: -0.1px;
          box-shadow: 0 6px 18px rgba(11,31,58,0.22);
        }
        .ss-total .accent {
          color: #5EEAD4;
          font-variant-numeric: tabular-nums;
        }
        .ss-cta {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 11px 20px;
          border-radius: 99px;
          background: linear-gradient(135deg, #22C55E, #16A34A);
          color: #fff;
          font-size: 13px; font-weight: 800;
          text-decoration: none;
          box-shadow: 0 6px 18px rgba(34,197,94,0.36);
          transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1), filter 0.22s ease;
        }
        .ss-cta:hover { transform: translateY(-1px) scale(1.03); filter: brightness(1.06); }
      `}</style>
      <div className="ss-wrap">
        <div className="ss-head">
          <span className="ss-eyebrow">Setup is the easy part</span>
          <h2 className="ss-h2">Live in <span className="accent">12 minutes</span>.</h2>
          <p className="ss-sub">Three steps. No installs. No new phone. You keep your number — we just answer when you can&apos;t.</p>
        </div>

        <div className="ss-strip">
          {STEPS.map(s => (
            <div key={s.n} className="ss-step">
              <div className="ss-step-head">
                <div className="ss-step-num">{s.n}</div>
                <div className="ss-step-pill">⏱ {s.duration}</div>
              </div>
              <div className="ss-step-ico">{s.icon}</div>
              <h3 className="ss-step-title">{s.title}</h3>
              <p className="ss-step-desc">{s.desc}</p>
            </div>
          ))}
        </div>

        <div className="ss-foot">
          <div className="ss-total">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            Total setup time: <span className="accent">~12 minutes</span>
          </div>
          <Link href="/pricing" className="ss-cta">
            See plans
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </Link>
        </div>
      </div>
    </section>
  )
}
