'use client'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { SAMPLE_REPORT, type ConsultingReport } from '@/lib/consultingReport'
import { TIER_METADATA } from '@/lib/pricing'

type SampleClientProps = {
  /** Server-enriched report with REAL Google Places competitor pins.
   *  When present, the default view uses this. Personalized prospect lookups
   *  via ?for=... still fetch /api/sample-report/personalize on the client. */
  initialReport?: ConsultingReport
  initialSearchParams?: { for?: string; business?: string; zip?: string; type?: string; city?: string }
}

export default function SampleReportClient({ initialReport, initialSearchParams }: SampleClientProps = {}) {
  const base = initialReport ?? SAMPLE_REPORT
  return (
    <Suspense fallback={<ReportView report={base} sample />}>
      <PersonalizedReportLoader baseReport={base} initialParams={initialSearchParams} />
    </Suspense>
  )
}

function PersonalizedReportLoader({
  baseReport,
  initialParams,
}: {
  baseReport: ConsultingReport
  initialParams?: { for?: string; business?: string; zip?: string; type?: string; city?: string }
}) {
  const params = useSearchParams()
  // Server-provided params (from page.tsx) take precedence so the initial
  // render matches what the server enriched. URL params can still override
  // after hydration if the user navigates with new ones.
  const businessName = (initialParams?.for || initialParams?.business || params.get('for') || params.get('business') || '').trim()
  const zip = initialParams?.zip || params.get('zip') || ''
  const type = initialParams?.type || params.get('type') || ''
  const city = initialParams?.city || params.get('city') || ''
  const personalize = !!businessName

  const [report, setReport] = useState<ConsultingReport>(baseReport)
  const [loading, setLoading] = useState(personalize)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!personalize) return
    let cancelled = false
    setLoading(true)
    setError(null)
    const qs = new URLSearchParams({ for: businessName, ...(zip && { zip }), ...(type && { type }), ...(city && { city }) })
    fetch(`/api/sample-report/personalize?${qs.toString()}`)
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}))
          throw new Error(j.error || `HTTP ${r.status}`)
        }
        return r.json()
      })
      .then((j: { report: ConsultingReport }) => { if (!cancelled) { setReport(j.report); setLoading(false) } })
      .catch((e) => { if (!cancelled) { setError(e instanceof Error ? e.message : String(e)); setLoading(false) } })
    return () => { cancelled = true }
  }, [personalize, businessName, zip, type, city])

  if (personalize && loading) return <PersonalizingShim businessName={businessName} />
  if (personalize && error) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: "'Inter', system-ui, sans-serif", padding: 40, color: '#0B1F3A', background: '#F5FCFA' }}>
        <div style={{ maxWidth: 460, background: '#fff', border: '1px solid rgba(10,168,159,0.18)', borderRadius: 18, padding: 28, textAlign: 'center', boxShadow: '0 12px 36px rgba(7,27,58,0.08)' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#DC2626', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 8 }}>Couldn&apos;t personalize</div>
          <h2 style={{ fontSize: 18, fontWeight: 900, marginBottom: 8 }}>Showing you the sample report instead</h2>
          <p style={{ fontSize: 13, color: '#4A6670', marginBottom: 16, lineHeight: 1.55 }}>We&apos;ll still show you what a real BellAveGo Growth Report looks like — just with our demo customer&apos;s data. Reason: {error}.</p>
          <Link href="/sample-report" style={{ display: 'inline-block', padding: '10px 22px', borderRadius: 10, background: 'linear-gradient(135deg, #0AA89F 0%, #0D8F87 100%)', color: '#fff', fontWeight: 800, fontSize: 13, textDecoration: 'none' }}>See the sample →</Link>
        </div>
      </main>
    )
  }

  return <ReportView report={report} sample personalized={personalize} />
}

function PersonalizingShim({ businessName }: { businessName: string }) {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: "'Inter', system-ui, sans-serif", padding: 40, color: '#0B1F3A', background: 'linear-gradient(180deg, #F0F7F5 0%, #F5FCFA 100%)' }}>
      <style>{`
        @keyframes shimmerDots { 0%,80%,100% { opacity: 0.3; transform: scale(0.85);} 40% { opacity: 1; transform: scale(1);} }
        @keyframes scanLine { 0% { transform: translateX(-110%);} 100% { transform: translateX(110%);} }
      `}</style>
      <div style={{ maxWidth: 540, width: '100%', background: '#fff', border: '1px solid rgba(10,168,159,0.16)', borderRadius: 22, padding: 36, textAlign: 'center', boxShadow: '0 24px 60px rgba(7,27,58,0.08)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: '40%', background: 'linear-gradient(90deg, transparent, #0AA89F, transparent)', animation: 'scanLine 1.6s ease-in-out infinite' }} />
        </div>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#0AA89F', letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 10 }}>Generating your personalized report</div>
        <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.03em', marginBottom: 12, lineHeight: 1.2 }}>{businessName}</h1>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 18 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: '#0AA89F', animation: `shimmerDots 1.2s ease-in-out ${i * 0.15}s infinite` }} />
          ))}
        </div>
        <ul style={{ listStyle: 'none', padding: 0, fontSize: 13, color: '#4A6670', lineHeight: 1.9, textAlign: 'left', maxWidth: 340, margin: '0 auto' }}>
          <li>📍 Pulling your local market from Google Places…</li>
          <li>🧠 Analyzing your top 5 competitors…</li>
          <li>📈 Projecting Q-over-Q revenue opportunities…</li>
          <li>✍️ Drafting your action plan with the BellAveGo AI engine…</li>
        </ul>
        <p style={{ fontSize: 11, color: '#7AAAB2', marginTop: 18 }}>This takes 15-30 seconds. Real reports for paying customers use your actual call data.</p>
      </div>
    </main>
  )
}

export function ReportView({ report, sample = false, personalized = false }: { report: ConsultingReport; sample?: boolean; personalized?: boolean }) {
  const r = report
  const fmtMoney = (n: number) => `$${n.toLocaleString()}`
  const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${(n * 100).toFixed(0)}%`

  return (
    <main className="cr-root">
      <style>{`
        :root {
          --navy: #0B1F3A;
          --navy-deep: #050E1F;
          --navy-mid: #163356;
          --teal: #0AA89F;
          --teal-bright: #14B8A6;
          --teal-light: #5EEAD4;
          --green: #22C55E;
          --amber: #F59E0B;
          --rose: #EF4444;
          --ink: #0B1F3A;
          --ink-mid: #4A6670;
          --ink-soft: #7AAAB2;
          --paper: #FFFFFF;
          --paper-tint: #F5FCFA;
          --line: rgba(10,168,159,0.14);
          --line-soft: rgba(10,168,159,0.08);
        }

        .cr-root {
          font-family: 'Inter', system-ui, sans-serif;
          background: linear-gradient(180deg, #F0F7F5 0%, #F5FCFA 100%);
          color: var(--ink);
          min-height: 100vh;
          line-height: 1.55;
          overflow-x: hidden;          /* kill horizontal scroll on mobile */
        }
        /* Mobile-specific: shrink padding + fix bar labels + reduce hero
           padding so the right side stops getting clipped on iPhone. */
        @media (max-width: 720px) {
          .cr-root { font-size: 14px; }
          .cr-bar { padding: 10px 12px !important; gap: 8px !important; }
          .cr-bar-back { padding: 6px 10px !important; font-size: 12px; }
          .cr-bar-btn { padding: 6px 10px !important; font-size: 11.5px !important; }
          .cr-layout { padding: 22px 14px 56px !important; }
          .cr-hero-inner { padding: 0 14px; }
          .cr-bar-label { width: auto !important; min-width: 0 !important; max-width: 40% !important; }
          .cr-bar-val { width: 36px !important; }
          .cr-tablewrap { margin-left: -2px; margin-right: -2px; }
          /* Section cards: reduce internal padding from 28-32px to 14-18px */
          .cr-section, .cr-card, .cr-sg-card, .cr-opp, .cr-action, .cr-foot {
            padding-left: 16px !important;
            padding-right: 16px !important;
          }
        }

        /* Top bar */
        .cr-bar {
          position: sticky; top: 0; z-index: 50;
          background: rgba(255,255,255,0.92);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border-bottom: 1px solid var(--line);
          padding: 12px 24px;
          display: flex; align-items: center; justify-content: space-between; gap: 16px;
        }
        .cr-bar-left { display: flex; align-items: center; gap: 14px; min-width: 0; }
        .cr-bar-back {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 14px;
          border: 1px solid var(--line);
          border-radius: 9px;
          color: var(--ink-mid);
          font-size: 13px; font-weight: 600;
          text-decoration: none;
          background: #fff;
          transition: all 0.15s ease;
        }
        .cr-bar-back:hover { color: var(--teal); border-color: var(--teal); }
        .cr-bar-actions { display: flex; gap: 8px; }
        .cr-bar-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 9px 16px;
          border-radius: 9px;
          font-size: 13px; font-weight: 700;
          cursor: pointer; border: none;
          transition: all 0.15s ease;
          font-family: inherit;
        }
        .cr-btn-ghost { background: rgba(10,168,159,0.08); color: var(--teal); border: 1px solid var(--line); }
        .cr-btn-ghost:hover { background: rgba(10,168,159,0.14); }
        .cr-btn-primary { background: linear-gradient(135deg, var(--teal), #0D8F87); color: #fff; box-shadow: 0 4px 14px rgba(10,168,159,0.32); }
        .cr-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(10,168,159,0.45); }
        .cr-btn-text { background: linear-gradient(135deg, #E8742B, #C84B26); color: #fff; box-shadow: 0 4px 14px rgba(232,116,43,0.32); text-decoration: none; }
        .cr-btn-text:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(232,116,43,0.45); }

        /* Sample banner */
        .cr-sample {
          background: linear-gradient(90deg, rgba(94,234,212,0.18), rgba(10,168,159,0.10));
          border-bottom: 1px solid rgba(10,168,159,0.22);
          padding: 10px 24px;
          font-size: 12px; font-weight: 700; color: var(--teal);
          text-align: center; letter-spacing: 0.06em; text-transform: uppercase;
        }

        /* Hero header */
        .cr-hero {
          background:
            radial-gradient(900px 500px at 80% 20%, rgba(10,168,159,0.32), transparent 65%),
            radial-gradient(700px 400px at 10% 90%, rgba(94,234,212,0.18), transparent 70%),
            linear-gradient(135deg, var(--navy-deep) 0%, var(--navy) 50%, var(--navy-mid) 100%);
          color: #fff;
          padding: 48px 48px 40px;
          position: relative;
          overflow: hidden;
        }
        .cr-hero::before {
          content: ''; position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(94,234,212,0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(94,234,212,0.05) 1px, transparent 1px);
          background-size: 56px 56px;
          mask-image: radial-gradient(ellipse 80% 70% at 50% 50%, black 50%, transparent 100%);
          -webkit-mask-image: radial-gradient(ellipse 80% 70% at 50% 50%, black 50%, transparent 100%);
          pointer-events: none;
        }
        .cr-hero-inner { position: relative; z-index: 1; max-width: 1100px; margin: 0 auto; }
        .cr-brand {
          display: inline-flex; align-items: center; gap: 10px;
          font-size: 11px; font-weight: 800; color: var(--teal-light);
          letter-spacing: 0.22em; text-transform: uppercase;
          margin-bottom: 18px;
        }
        .cr-brand-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--teal-light); box-shadow: 0 0 10px rgba(94,234,212,0.7); }
        .cr-hero-title {
          font-size: clamp(28px, 3.8vw, 48px);
          font-weight: 900; letter-spacing: -0.035em; line-height: 1.05;
          margin: 0 0 12px;
        }
        .cr-hero-title .accent {
          background: linear-gradient(135deg, #5EEAD4, #2DD4BF, #0AA89F);
          -webkit-background-clip: text; background-clip: text; color: transparent;
        }
        .cr-hero-sub {
          font-size: 16px; color: rgba(255,255,255,0.72);
          margin: 0 0 26px; max-width: 640px; line-height: 1.6;
        }
        .cr-hero-meta {
          display: flex; flex-wrap: wrap; gap: 8px;
        }
        .cr-meta-pill {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 6px 12px;
          border-radius: 99px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(94,234,212,0.22);
          font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.85);
        }
        .cr-meta-pill strong { color: var(--teal-light); font-weight: 700; }

        /* Layout */
        .cr-layout {
          max-width: 1240px; margin: 0 auto;
          padding: 36px 24px 80px;
          display: grid;
          grid-template-columns: 220px minmax(0, 1fr);
          gap: 36px;
        }
        @media (max-width: 980px) { .cr-layout { grid-template-columns: 1fr; gap: 0; } .cr-nav { display: none; } }

        .cr-nav {
          position: sticky; top: 76px; align-self: start;
          padding: 18px 0;
        }
        .cr-nav-label {
          font-size: 10px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase;
          color: var(--ink-soft); padding: 0 12px; margin-bottom: 10px;
        }
        .cr-nav a {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 12px;
          color: var(--ink-mid);
          font-size: 13px; font-weight: 600;
          border-radius: 8px;
          text-decoration: none;
          border-left: 2px solid transparent;
          transition: all 0.15s ease;
        }
        .cr-nav a:hover { color: var(--teal); background: rgba(10,168,159,0.06); border-left-color: var(--teal); }
        .cr-nav-num {
          width: 20px; height: 20px;
          border-radius: 6px; background: rgba(10,168,159,0.10);
          color: var(--teal); font-size: 10px; font-weight: 800;
          display: inline-flex; align-items: center; justify-content: center;
        }

        /* Sections */
        .cr-content { display: flex; flex-direction: column; gap: 36px; }
        .cr-section {
          background: var(--paper);
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 28px 32px;
          box-shadow: 0 4px 20px rgba(7,27,58,0.04);
          scroll-margin-top: 80px;
        }
        .cr-section h2 {
          display: flex; align-items: center; gap: 12px;
          font-size: 22px; font-weight: 900; letter-spacing: -0.02em;
          color: var(--ink); margin: 0 0 6px;
        }
        .cr-section-num {
          display: inline-flex; align-items: center; justify-content: center;
          width: 28px; height: 28px;
          border-radius: 8px;
          background: linear-gradient(135deg, var(--teal), #0D8F87);
          color: #fff; font-size: 13px; font-weight: 800;
          box-shadow: 0 4px 12px rgba(10,168,159,0.32);
        }
        .cr-section-tag {
          display: inline-flex; align-items: center; padding: 4px 10px;
          border-radius: 99px; font-size: 10px; font-weight: 800;
          letter-spacing: 0.08em; text-transform: uppercase;
          background: rgba(10,168,159,0.10); color: var(--teal); border: 1px solid var(--line);
          margin-left: auto;
        }
        .cr-lede { font-size: 14px; color: var(--ink-soft); margin: 0 0 20px; }

        /* Exec summary */
        .cr-exec p { font-size: 15px; line-height: 1.7; color: var(--ink); margin: 0 0 14px; }
        .cr-exec p:last-child { margin: 0; }
        .cr-exec-pull {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 6px;
          background: rgba(34,197,94,0.14);
          color: #15803D;
          font-weight: 800;
        }

        /* KPI cards */
        .cr-kpis {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 12px;
          margin-top: 6px;
        }
        .cr-kpi {
          padding: 16px 18px;
          border: 1px solid var(--line);
          border-radius: 12px;
          background: linear-gradient(160deg, #fff, var(--paper-tint));
          position: relative; overflow: hidden;
        }
        .cr-kpi::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
          background: linear-gradient(90deg, var(--teal), var(--teal-light));
        }
        .cr-kpi-label { font-size: 10px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-soft); margin-bottom: 6px; }
        .cr-kpi-value { font-size: 26px; font-weight: 900; color: var(--ink); letter-spacing: -0.5px; line-height: 1; font-variant-numeric: tabular-nums; }
        .cr-kpi-delta { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; margin-top: 6px; }
        .cr-kpi-delta.up { color: #15803D; }
        .cr-kpi-delta.down { color: #B91C1C; }

        /* Score */
        .cr-score-grid {
          display: grid;
          grid-template-columns: 220px 1fr;
          gap: 28px;
          align-items: center;
          margin-top: 8px;
        }
        @media (max-width: 720px) { .cr-score-grid { grid-template-columns: 1fr; } }
        .cr-score-ring {
          position: relative;
          width: 200px; height: 200px;
          margin: 0 auto;
        }
        .cr-score-num {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
          flex-direction: column;
        }
        .cr-score-num .big { font-size: 56px; font-weight: 900; color: var(--ink); letter-spacing: -2px; line-height: 1; font-variant-numeric: tabular-nums; }
        .cr-score-num .small { font-size: 12px; font-weight: 700; color: var(--ink-soft); margin-top: 2px; }
        .cr-bars { display: flex; flex-direction: column; gap: 12px; }
        .cr-bar { display: flex; align-items: center; gap: 14px; }
        .cr-bar-label { font-size: 13px; font-weight: 700; color: var(--ink); width: 160px; flex-shrink: 0; }
        .cr-bar-track { flex: 1; height: 10px; background: rgba(10,168,159,0.10); border-radius: 5px; overflow: hidden; }
        .cr-bar-fill { height: 100%; background: linear-gradient(90deg, var(--teal-light), var(--teal)); border-radius: 5px; transition: width 0.6s cubic-bezier(0.34,1,0.64,1); }
        .cr-bar-val { font-size: 13px; font-weight: 800; color: var(--ink); width: 40px; text-align: right; font-variant-numeric: tabular-nums; }

        /* Opportunities */
        .cr-opps { display: flex; flex-direction: column; gap: 14px; margin-top: 8px; }
        .cr-opp {
          display: grid;
          grid-template-columns: 64px minmax(0, 1fr) 200px;
          gap: 18px;
          padding: 18px 20px;
          border: 1px solid var(--line);
          border-radius: 14px;
          background: #fff;
          transition: all 0.22s ease;
          position: relative;
        }
        .cr-opp:hover { transform: translateY(-2px); box-shadow: 0 14px 36px rgba(10,168,159,0.18); border-color: rgba(10,168,159,0.32); }
        .cr-opp-rank {
          font-size: 32px; font-weight: 900; color: var(--teal); letter-spacing: -1px; line-height: 1;
          background: linear-gradient(135deg, var(--teal-light), var(--teal));
          -webkit-background-clip: text; background-clip: text; color: transparent;
        }
        .cr-opp-body { min-width: 0; }
        .cr-opp-title { font-size: 17px; font-weight: 800; color: var(--ink); margin: 0 0 6px; letter-spacing: -0.2px; }
        .cr-opp-pat { font-size: 13px; color: var(--ink-mid); margin: 0 0 8px; line-height: 1.5; }
        .cr-opp-act {
          font-size: 13px; color: var(--ink); line-height: 1.55;
          padding: 8px 12px;
          background: var(--paper-tint);
          border-left: 3px solid var(--teal);
          border-radius: 0 8px 8px 0;
        }
        .cr-opp-act b { color: var(--teal); font-weight: 700; }
        .cr-opp-value { text-align: right; }
        .cr-opp-value-num {
          font-size: 28px; font-weight: 900; color: var(--ink); letter-spacing: -0.5px; line-height: 1;
          font-variant-numeric: tabular-nums;
        }
        .cr-opp-value-lab { font-size: 11px; font-weight: 700; color: var(--ink-soft); letter-spacing: 0.06em; text-transform: uppercase; margin-top: 4px; }
        .cr-opp-conf {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 10px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase;
          padding: 3px 8px; border-radius: 99px; margin-top: 8px;
        }
        .cr-opp-conf.high { background: rgba(34,197,94,0.14); color: #15803D; }
        .cr-opp-conf.medium { background: rgba(245,158,11,0.14); color: #B45309; }
        .cr-opp-conf.low { background: rgba(148,163,184,0.18); color: #475569; }

        @media (max-width: 720px) {
          .cr-opp { grid-template-columns: 50px 1fr; }
          .cr-opp-value { grid-column: 2; text-align: left; margin-top: 4px; }
        }

        /* Market data tiles */
        .cr-market-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 12px;
          margin-top: 8px;
        }
        .cr-tile {
          padding: 16px;
          background: linear-gradient(160deg, #fff, var(--paper-tint));
          border: 1px solid var(--line);
          border-radius: 12px;
        }
        .cr-tile-num { font-size: 24px; font-weight: 900; color: var(--ink); letter-spacing: -0.5px; line-height: 1; font-variant-numeric: tabular-nums; }
        .cr-tile-lab { font-size: 11px; font-weight: 700; color: var(--ink-soft); letter-spacing: 0.06em; margin-top: 6px; text-transform: uppercase; }
        .cr-signal {
          margin-top: 16px;
          padding: 14px 18px;
          border-radius: 12px;
          background: linear-gradient(135deg, rgba(10,168,159,0.08), rgba(94,234,212,0.04));
          border: 1px solid var(--line);
          display: flex; gap: 12px; align-items: flex-start;
        }
        .cr-signal-ico {
          width: 32px; height: 32px; border-radius: 50%;
          background: linear-gradient(135deg, var(--teal), #0D8F87);
          color: #fff;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .cr-signal-text { font-size: 13px; line-height: 1.55; color: var(--ink); }
        .cr-signal-text b { color: var(--teal); font-weight: 800; }

        /* Table */
        .cr-tablewrap { overflow-x: auto; margin-top: 8px; border: 1px solid var(--line); border-radius: 12px; }
        .cr-table { width: 100%; border-collapse: collapse; }
        .cr-table thead { background: var(--paper-tint); }
        .cr-table th { font-size: 10px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-soft); padding: 10px 14px; text-align: left; border-bottom: 1px solid var(--line); }
        .cr-table th.right { text-align: right; }
        .cr-table td { font-size: 13px; padding: 12px 14px; border-bottom: 1px solid var(--line-soft); color: var(--ink); }
        .cr-table tr:last-child td { border-bottom: none; }
        .cr-table td.right { text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; }
        .cr-table td .opp-num { color: var(--teal); font-weight: 800; }

        /* Competitive */
        .cr-comp-head {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 12px;
          margin-bottom: 18px;
        }
        .cr-comp-tile {
          padding: 14px 16px;
          border-radius: 12px;
          border: 1px solid var(--line);
          background: #fff;
        }
        .cr-comp-tile.you { border-color: rgba(10,168,159,0.45); background: linear-gradient(160deg, rgba(10,168,159,0.06), #fff); box-shadow: 0 4px 14px rgba(10,168,159,0.12); }
        .cr-comp-lab { font-size: 10px; font-weight: 800; color: var(--ink-soft); letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 6px; }
        .cr-comp-num { font-size: 22px; font-weight: 900; color: var(--ink); line-height: 1; font-variant-numeric: tabular-nums; }
        .cr-comp-num .star { color: var(--amber); margin-right: 2px; }
        .cr-comp-sub { font-size: 11px; color: var(--ink-soft); margin-top: 4px; }
        .cr-sg-grid {
          display: grid; grid-template-columns: 1fr 1fr; gap: 14px;
          margin-top: 14px;
        }
        @media (max-width: 720px) { .cr-sg-grid { grid-template-columns: 1fr; } }
        .cr-sg-card { padding: 14px 16px; border-radius: 12px; border: 1px solid var(--line); background: #fff; }
        .cr-sg-card.strengths { border-color: rgba(34,197,94,0.28); background: linear-gradient(160deg, rgba(34,197,94,0.05), #fff); }
        .cr-sg-card.gaps { border-color: rgba(239,68,68,0.22); background: linear-gradient(160deg, rgba(239,68,68,0.04), #fff); }
        .cr-sg-h {
          font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;
          margin-bottom: 8px;
        }
        .cr-sg-card.strengths .cr-sg-h { color: #15803D; }
        .cr-sg-card.gaps .cr-sg-h { color: #B91C1C; }
        .cr-sg-card ul { list-style: none; padding: 0; margin: 0; }
        .cr-sg-card li { display: flex; gap: 8px; padding: 6px 0; font-size: 13px; line-height: 1.5; color: var(--ink); border-bottom: 1px solid rgba(0,0,0,0.04); }
        .cr-sg-card li:last-child { border-bottom: none; }
        .cr-sg-card li::before { content: ''; flex-shrink: 0; width: 6px; height: 6px; border-radius: 50%; margin-top: 7px; }
        .cr-sg-card.strengths li::before { background: var(--green); }
        .cr-sg-card.gaps li::before { background: var(--rose); }

        /* Action plan */
        .cr-actions { display: flex; flex-direction: column; gap: 12px; margin-top: 8px; }
        .cr-action {
          display: grid;
          grid-template-columns: 40px minmax(0, 1fr) 140px;
          gap: 16px;
          padding: 16px 20px;
          border: 1px solid var(--line);
          border-radius: 12px;
          background: #fff;
          align-items: start;
        }
        @media (max-width: 720px) {
          .cr-action { grid-template-columns: 36px 1fr; }
          .cr-action-meta { grid-column: 2; margin-top: 4px; display: flex; gap: 8px; flex-wrap: wrap; }
        }
        .cr-action-pri {
          width: 32px; height: 32px; border-radius: 8px;
          background: linear-gradient(135deg, var(--navy), var(--navy-mid));
          color: var(--teal-light);
          font-size: 14px; font-weight: 900;
          display: flex; align-items: center; justify-content: center;
        }
        .cr-action-title { font-size: 15px; font-weight: 800; color: var(--ink); margin: 0 0 4px; letter-spacing: -0.2px; }
        .cr-action-rat { font-size: 12.5px; color: var(--ink-mid); margin: 0 0 6px; line-height: 1.5; }
        .cr-action-imp { font-size: 12.5px; color: var(--teal); font-weight: 700; }
        .cr-action-meta { display: flex; flex-direction: column; gap: 6px; align-items: flex-end; }
        .cr-action-eff {
          padding: 3px 10px; border-radius: 99px;
          font-size: 10px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase;
        }
        .cr-action-eff.low { background: rgba(34,197,94,0.14); color: #15803D; }
        .cr-action-eff.medium { background: rgba(245,158,11,0.14); color: #B45309; }
        .cr-action-eff.high { background: rgba(239,68,68,0.14); color: #B91C1C; }
        .cr-action-time { font-size: 11px; font-weight: 700; color: var(--ink-soft); }

        /* Footer */
        .cr-foot {
          margin-top: 24px;
          padding: 28px 32px;
          background: linear-gradient(160deg, var(--navy-deep), var(--navy));
          color: rgba(255,255,255,0.78);
          border-radius: 16px;
          font-size: 12px;
          line-height: 1.7;
        }
        .cr-foot h3 {
          font-size: 13px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;
          color: var(--teal-light); margin: 0 0 8px;
        }
        .cr-foot-credit {
          margin-top: 18px; padding-top: 18px;
          border-top: 1px solid rgba(94,234,212,0.18);
          font-size: 11px; color: rgba(255,255,255,0.55);
          display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px;
        }
        .cr-foot-unis { color: var(--teal-light); font-weight: 700; }

        /* Print */
        @media print {
          .cr-bar, .cr-sample, .cr-nav { display: none !important; }
          .cr-root { background: #fff; }
          .cr-section { break-inside: avoid; box-shadow: none; border-color: #ddd; }
          .cr-hero { padding: 24px 32px; }
          .cr-layout { padding: 12px 24px 24px; grid-template-columns: 1fr; }
        }
      `}</style>

      {/* Top bar */}
      <div className="cr-bar">
        <div className="cr-bar-left">
          <Link href="/" className="cr-bar-back">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Home
          </Link>
          <Image src="/logo.png" alt="BellAveGo" width={120} height={38} style={{ objectFit: 'contain', height: 28, width: 'auto' }} />
        </div>
        <div className="cr-bar-actions">
          <button className="cr-bar-btn cr-btn-ghost" onClick={() => window.print()}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            Print / Save PDF
          </button>
          <a
            href={`sms:+17737109565?body=${encodeURIComponent(`Hi, I want to set up BellAveGo for ${personalized ? report.meta.businessName : 'my shop'}. Saw your report.`)}`}
            className="cr-bar-btn cr-btn-text"
            aria-label="Text Peter at BellAveGo"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            Text us — (773) 710-9565
          </a>
          <Link href="/sign-up" className="cr-bar-btn cr-btn-primary">
            Start 7-day trial
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </Link>
        </div>
      </div>

      {sample && !personalized && (
        <div className="cr-sample">
          Sample report · Real data shape, fictional contractor &middot; Subscribers receive a fresh report every quarter
        </div>
      )}
      {personalized && (
        <div className="cr-sample" style={{ background: 'linear-gradient(90deg, rgba(94,234,212,0.22), rgba(34,197,94,0.14))' }}>
          Personalized preview for <strong style={{ color: '#0B1F3A' }}>{report.meta.businessName}</strong> &middot; Market data: real &middot; Performance figures: industry projection
        </div>
      )}

      {/* Hero — clean: upside number + one subtitle line */}
      <div className="cr-hero">
        <div className="cr-hero-inner">
          <div className="cr-brand">
            <span className="cr-brand-dot" />
            BellAveGo Consulting
          </div>
          <h1 className="cr-hero-title">
            <span className="accent">${monthlyOpportunityTotal(r).toLocaleString()}/mo</span><br />
            in identified upside.
          </h1>
          <p className="cr-hero-sub">
            {r.meta.businessName} · {r.meta.period} · {r.meta.metroLabel}
          </p>
        </div>
      </div>

      {/* Layout */}
      <div className="cr-layout">
        {/* Left nav */}
        <aside className="cr-nav">
          <div className="cr-nav-label">Sections</div>
          {SECTIONS.map((s, i) => (
            <a key={s.id} href={`#${s.id}`}>
              <span className="cr-nav-num">{i + 1}</span>
              {s.label}
            </a>
          ))}
        </aside>

        {/* Content */}
        <div className="cr-content">

          {/* 1. Executive Summary — TL;DR box pulls the #1 opportunity, then one paragraph */}
          <section id="exec" className="cr-section">
            <h2><span className="cr-section-num">1</span>Executive Summary<span className="cr-section-tag">Narrative</span></h2>
            <p className="cr-lede">A 60-second read of your quarter and where the biggest dollars are.</p>
            {r.opportunities[0] && (
              <div style={{
                padding: '16px 20px',
                background: 'linear-gradient(135deg, rgba(34,197,94,0.10), rgba(94,234,212,0.06))',
                border: '1px solid rgba(34,197,94,0.28)',
                borderLeft: '4px solid #15803D',
                borderRadius: 12,
                marginBottom: 18,
              }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#15803D', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>
                  TL;DR — Biggest single opportunity
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#0B1F3A', letterSpacing: '-0.2px', lineHeight: 1.4 }}>
                  {r.opportunities[0].title} = <span style={{ color: '#15803D' }}>+{fmtMoney(r.opportunities[0].monthlyValue)}/mo</span>
                  <span style={{ fontSize: 13, color: '#4A6670', fontWeight: 600 }}> with no ad spend.</span>
                </div>
              </div>
            )}
            <div className="cr-exec">
              {r.executiveSummary.slice(0, 1).map((p, i) => <p key={i}>{p}</p>)}
            </div>
          </section>

          {/* 2. Performance */}
          <section id="performance" className="cr-section">
            <h2><span className="cr-section-num">2</span>Performance vs. Last Quarter<span className="cr-section-tag">Your data</span></h2>
            <p className="cr-lede">Pulled directly from your BellAveGo dashboard for the last 90 days.</p>
            <div className="cr-kpis">
              <Kpi label="Calls Answered" value={r.performance.callsAnswered.toString()} delta={r.performance.callsAnsweredDelta} />
              <Kpi label="Jobs Booked" value={r.performance.jobsBooked.toString()} delta={r.performance.jobsBookedDelta} />
              <Kpi label="Revenue Booked" value={fmtMoney(r.performance.revenue)} delta={r.performance.revenueDelta} />
              <Kpi label="Avg Job Ticket" value={fmtMoney(r.performance.avgTicket)} delta={r.performance.avgTicketDelta} />
              <Kpi label="Calls Saved (after-hours)" value={r.performance.callsSaved.toString()} />
              <Kpi label="Answer Rate" value={`${(r.performance.answerRate * 100).toFixed(0)}%`} />
            </div>
          </section>

          {/* 3. BellAveGo Score */}
          <section id="score" className="cr-section">
            <h2><span className="cr-section-num">3</span>BellAveGo Score<span className="cr-section-tag">Composite</span></h2>
            <p className="cr-lede">A 1–10 score blending answer rate, booking conversion, response time, and pricing power vs. your local market.</p>
            <div className="cr-score-grid">
              <div>
                <ScoreRing score={r.bellaveScore.composite} />
                <div style={{
                  marginTop: 14, textAlign: 'center',
                  padding: '8px 14px', borderRadius: 99,
                  background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.28)',
                  fontSize: 12, fontWeight: 800, color: '#15803D',
                  letterSpacing: '0.04em',
                  display: 'inline-block', width: '100%',
                }}>
                  {scoreBenchmark(r.bellaveScore.composite, r.meta.businessType, r.meta.metroLabel)}
                </div>
              </div>
              <div className="cr-bars">
                <ScoreBar label="Answer rate" v={r.bellaveScore.answerRate} />
                <ScoreBar label="Booking conversion" v={r.bellaveScore.bookingConversion} />
                <ScoreBar label="Response time" v={r.bellaveScore.responseTime} />
                <ScoreBar label="Pricing power" v={r.bellaveScore.pricingPower} />
              </div>
            </div>
          </section>

          {/* 4. Top 3 Opportunities */}
          <section id="opps" className="cr-section">
            <h2><span className="cr-section-num">4</span>Top {r.opportunities.length} Revenue Opportunities<span className="cr-section-tag">Highest leverage</span></h2>
            <p className="cr-lede">Ranked by addressable monthly revenue at current close rates.</p>
            <div className="cr-opps">
              {r.opportunities.map(o => (
                <div key={o.rank} className="cr-opp">
                  <div className="cr-opp-rank">#{o.rank}</div>
                  <div className="cr-opp-body">
                    <h3 className="cr-opp-title">{o.title}</h3>
                    <p className="cr-opp-pat">{o.pattern}</p>
                    <div className="cr-opp-act"><b>Recommended action:</b> {o.action}</div>
                  </div>
                  <div className="cr-opp-value">
                    <div className="cr-opp-value-num">+{fmtMoney(o.monthlyValue)}</div>
                    <div className="cr-opp-value-lab">per month</div>
                    <span className={`cr-opp-conf ${o.confidence}`}>● {o.confidence} confidence</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 5. Market Scan */}
          <section id="market" className="cr-section">
            <h2><span className="cr-section-num">5</span>Local Market Scan<span className="cr-section-tag">Census + Places</span></h2>
            <p className="cr-lede">Demographics and demand signals for the {r.meta.serviceArea.length} ZIPs you serve.</p>
            <div className="cr-market-grid">
              <Tile num={r.marketScan.homeownersInArea.toLocaleString()} lab="Homeowners in service area" />
              <Tile num={fmtMoney(r.marketScan.medianIncome)} lab="Median household income" />
              <Tile num={`${r.marketScan.medianHomeAge} yrs`} lab="Median home age" />
              <Tile num={`${(r.marketScan.pctHvacOver15Yrs * 100).toFixed(0)}%`} lab="Homes with HVAC > 15 yrs" />
              <Tile num={fmtMoney(r.marketScan.addressableRevenueMonthly)} lab="Total addressable / month" />
            </div>
            <div className="cr-signal">
              <div className="cr-signal-ico">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                </svg>
              </div>
              <div className="cr-signal-text">
                <b>Seasonal signal:</b> {r.marketScan.seasonalSignal}
              </div>
            </div>

            {/* Service area map */}
            <div style={{ marginTop: 22 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
                <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', margin: 0, letterSpacing: '-0.2px' }}>Service area pinpoints</h3>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{r.serviceAreaMap.centerLabel}</span>
              </div>
              <ServiceAreaMap report={r} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 12, fontSize: 11, color: 'var(--ink-mid)' }}>
                <Legend color="#0AA89F" label="Your business" />
                <Legend color="#F59E0B" label="Top 5 competitors by review count (real Google Places data)" />
              </div>
              {/* Honesty disclosure — competitors are real Google Places data;
                  the demo business is fictional. Real paying customers see their
                  own real business as the "Y" pin. */}
              <p style={{ marginTop: 10, fontSize: 11, color: 'var(--ink-soft)', lineHeight: 1.5, fontStyle: 'italic' }}>
                The competitor pinpoints on this map are <strong style={{ color: 'var(--ink-mid)' }}>real businesses</strong> pulled from Google Places. The demo business profile (Mike&apos;s HVAC &amp; Cooling) is fictional and used only to show the report format — paying customers see their own real business as the &ldquo;Y&rdquo; pin and their own real competitor landscape.
              </p>
            </div>
          </section>

          {/* 6. Outreach targets */}
          <section id="outreach" className="cr-section">
            <h2><span className="cr-section-num">6</span>Outreach Targets<span className="cr-section-tag">Commercial · TCPA-safe</span></h2>
            <p className="cr-lede">Five high-value B2B prospects in your service area. All commercial properties — legal to cold-call, currently with weak or no HVAC vendor relationship.</p>
            <div className="cr-tablewrap">
              <table className="cr-table">
                <thead>
                  <tr>
                    <th>Business</th>
                    <th>Type</th>
                    <th>Address</th>
                    <th>Phone</th>
                    <th>Why</th>
                  </tr>
                </thead>
                <tbody>
                  {r.outreachTargets.map(t => (
                    <tr key={t.business}>
                      <td><strong>{t.business}</strong></td>
                      <td style={{ color: 'var(--ink-mid)' }}>{t.type}</td>
                      <td style={{ color: 'var(--ink-mid)' }}>{t.address}</td>
                      <td>
                        <a href={`tel:${t.phone.replace(/[^0-9+]/g, '')}`} style={{ color: 'var(--teal)', fontWeight: 700, textDecoration: 'none' }}>
                          {t.phone}
                        </a>
                      </td>
                      <td style={{ color: 'var(--ink)', fontSize: 12.5, lineHeight: 1.5 }}>{t.why}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ marginTop: 12, fontSize: 11.5, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
              Sourced from Google Places — commercial properties only. Residential cold-calling is excluded for TCPA compliance. Phone numbers come straight from each business&rsquo;s Google Business Profile, so a paying customer&rsquo;s report shows real, dialable numbers for property managers, restaurants, retail centers, and real-estate brokerages near them.
            </p>
          </section>

          {/* 7. Upsells table */}
          <section id="upsells" className="cr-section">
            <h2><span className="cr-section-num">7</span>Recommended Priced Upsells<span className="cr-section-tag">Trade benchmarks</span></h2>
            <p className="cr-lede">Industry-benchmark avg ticket + close rate for {r.meta.businessType.toLowerCase()} services. Paying customers see these tuned against their own job mix.</p>
            <div className="cr-tablewrap">
              <table className="cr-table">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Demand signal</th>
                    <th className="right">Avg ticket</th>
                    <th className="right">Close rate</th>
                    <th className="right">Monthly opportunity</th>
                  </tr>
                </thead>
                <tbody>
                  {r.upsells.map(u => (
                    <tr key={u.service}>
                      <td><strong>{u.service}</strong></td>
                      <td style={{ color: 'var(--ink-mid)' }}>{u.demandSignal}</td>
                      <td className="right">{fmtMoney(u.avgTicket)}</td>
                      <td className="right">{(u.closeRate * 100).toFixed(0)}%</td>
                      <td className="right"><span className="opp-num">+{fmtMoney(u.monthlyOpportunity)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 8. Competitive */}
          <section id="competitive" className="cr-section">
            <h2><span className="cr-section-num">8</span>Competitive Snapshot<span className="cr-section-tag">Google Places</span></h2>
            <p className="cr-lede">How you stack against the {r.competitive.totalCompetitors} {r.meta.businessType} businesses within 8 mi.</p>

            <div className="cr-comp-head">
              <div className="cr-comp-tile you">
                <div className="cr-comp-lab">Your rating</div>
                <div className="cr-comp-num"><span className="star">★</span>{r.competitive.yourRating.toFixed(1)}</div>
                <div className="cr-comp-sub">{r.competitive.yourReviewCount} reviews</div>
              </div>
              <div className="cr-comp-tile">
                <div className="cr-comp-lab">Market avg</div>
                <div className="cr-comp-num"><span className="star">★</span>{r.competitive.marketAvgRating.toFixed(1)}</div>
                <div className="cr-comp-sub">{r.competitive.marketAvgReviewCount} reviews avg</div>
              </div>
              <div className="cr-comp-tile you">
                <div className="cr-comp-lab">Your rank</div>
                <div className="cr-comp-num">#{r.competitive.yourRank}</div>
                <div className="cr-comp-sub">of {r.competitive.totalCompetitors} in area</div>
              </div>
            </div>

            <div className="cr-tablewrap">
              <table className="cr-table">
                <thead>
                  <tr>
                    <th>Competitor</th>
                    <th className="right">Rating</th>
                    <th className="right">Reviews</th>
                    <th className="right">Distance</th>
                  </tr>
                </thead>
                <tbody>
                  {r.competitive.competitors.map(c => (
                    <tr key={c.name}>
                      <td><strong>{c.name}</strong></td>
                      <td className="right">★ {c.rating.toFixed(1)}</td>
                      <td className="right">{c.reviewCount.toLocaleString()}</td>
                      <td className="right">{c.distance}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="cr-sg-grid">
              <div className="cr-sg-card strengths">
                <div className="cr-sg-h">Your strengths</div>
                <ul>{r.competitive.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
              <div className="cr-sg-card gaps">
                <div className="cr-sg-h">Your gaps</div>
                <ul>{r.competitive.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
              </div>
            </div>
          </section>

          {/* 8. Action plan */}
          <section id="actions" className="cr-section">
            <h2><span className="cr-section-num">9</span>90-Day Action Plan<span className="cr-section-tag">Prioritized</span></h2>
            <p className="cr-lede">Ranked by expected impact ÷ effort. Each item ties to a specific opportunity above.</p>
            <div className="cr-actions">
              {r.actionPlan.map(a => (
                <div key={a.priority} className="cr-action">
                  <div className="cr-action-pri">{a.priority}</div>
                  <div>
                    <h3 className="cr-action-title">{a.title}</h3>
                    <p className="cr-action-rat">{a.rationale}</p>
                    <div className="cr-action-imp">→ {a.expectedImpact}</div>
                  </div>
                  <div className="cr-action-meta">
                    <span className={`cr-action-eff ${a.effort}`}>{a.effort} effort</span>
                    <span className="cr-action-time">{a.timeline}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Conversion CTA — only shown on personalized reports so the SAMPLE page stays clean */}
          {personalized && (
            <section className="cr-cta-section">
              <style>{`
                .cr-cta-section { margin: 36px 0 28px; padding: 36px 32px; border-radius: 20px; background: linear-gradient(135deg, #0B1F3A 0%, #163356 60%, #0AA89F 100%); color: #fff; box-shadow: 0 24px 60px rgba(11,31,58,0.22); position: relative; overflow: hidden; }
                .cr-cta-section::before { content: ''; position: absolute; inset: 0; background: radial-gradient(circle at 80% 20%, rgba(94,234,212,0.22), transparent 55%); pointer-events: none; }
                .cr-cta-eyebrow { font-size: 11px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; color: #5EEAD4; margin-bottom: 10px; position: relative; }
                .cr-cta-title { font-size: 28px; font-weight: 900; letter-spacing: -0.03em; line-height: 1.15; margin: 0 0 12px; position: relative; }
                .cr-cta-body { font-size: 14px; color: rgba(255,255,255,0.82); line-height: 1.6; max-width: 620px; margin: 0 0 22px; position: relative; }
                .cr-cta-row { display: flex; gap: 12px; flex-wrap: wrap; position: relative; }
                .cr-cta-pri { display: inline-flex; align-items: center; gap: 8px; padding: 14px 26px; border-radius: 12px; background: linear-gradient(135deg, #22C55E 0%, #16A34A 100%); color: #fff; font-weight: 800; font-size: 14px; text-decoration: none; box-shadow: 0 8px 26px rgba(34,197,94,0.42); transition: transform 0.18s ease; }
                .cr-cta-pri:hover { transform: translateY(-1px); }
                .cr-cta-sec { display: inline-flex; align-items: center; gap: 8px; padding: 14px 22px; border-radius: 12px; background: rgba(255,255,255,0.10); border: 1px solid rgba(255,255,255,0.22); color: #fff; font-weight: 700; font-size: 13px; text-decoration: none; cursor: pointer; font-family: inherit; }
                .cr-cta-fineprint { font-size: 11px; color: rgba(255,255,255,0.55); margin-top: 14px; position: relative; }
              `}</style>
              <div className="cr-cta-eyebrow">This is a preview. Real reports use YOUR data.</div>
              <h3 className="cr-cta-title">Get this report monthly for {r.meta.businessName}.</h3>
              <p className="cr-cta-body">
                Real call volume. Real bookings. Real local-market shifts. The AI receptionist answers every missed call, and BellAveGo Consulting compiles your actual numbers into the next report — automatically, on your plan&apos;s cadence. 7-day free trial, cancel anytime.
              </p>
              <div className="cr-cta-row">
                <Link href="/pricing?tier=officemgr&interval=monthly&autocheckout=1" className="cr-cta-pri">
                  Start 7-day free trial →
                </Link>
                <a
                  href={`sms:+17737109565?body=${encodeURIComponent(`Hi, I want to set up BellAveGo for ${r.meta.businessName}. Saw your report.`)}`}
                  className="cr-cta-sec"
                >
                  📱 Text us — (773) 710-9565
                </a>
                <Link href="/pricing" className="cr-cta-sec">
                  See all 3 plans
                </Link>
              </div>
              <div className="cr-cta-fineprint">
                ${TIER_METADATA.officemgr.monthly}/mo for the {TIER_METADATA.officemgr.name} tier (most popular) after the 7-day free trial. Cancel anytime during the trial — no charge fires. Prefer to talk first? Text (773) 710-9565 — we text back within an hour.
              </div>
            </section>
          )}

          {/* Footer */}
          <div className="cr-foot">
            <h3>Methodology</h3>
            <p style={{ margin: 0 }}>{r.methodology}</p>
            <div className="cr-foot-credit">
              <span>Generated {r.meta.generatedAt}</span>
              <span className="cr-foot-unis">Built by the BellAveGo software &amp; finance team</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

const SECTIONS = [
  { id: 'performance', label: 'Performance' },
  { id: 'opps', label: 'Opportunities' },
  { id: 'market', label: 'Market' },
  { id: 'actions', label: 'Plan' },
]

function monthlyOpportunityTotal(r: ConsultingReport) {
  return r.opportunities.reduce((a, b) => a + b.monthlyValue, 0)
}

function scoreBenchmark(score: number, trade: string, metro: string) {
  const tier = score >= 8.5 ? 'Top 10%'
    : score >= 7.0 ? 'Top 30%'
    : score >= 5.5 ? 'Top 50%'
    : 'Bottom 50%'
  return `${tier} of ${trade} contractors in ${metro.split(',')[0]}`
}

function Kpi({ label, value, delta }: { label: string; value: string; delta?: number }) {
  return (
    <div className="cr-kpi">
      <div className="cr-kpi-label">{label}</div>
      <div className="cr-kpi-value">{value}</div>
      {typeof delta === 'number' && (
        <div className={`cr-kpi-delta ${delta >= 0 ? 'up' : 'down'}`}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            {delta >= 0 ? <path d="M7 17l9.2-9.2M17 17V7H7"/> : <path d="M17 7L7.8 16.2M17 7H7v10"/>}
          </svg>
          {(delta >= 0 ? '+' : '') + (delta * 100).toFixed(0)}% vs last quarter
        </div>
      )}
    </div>
  )
}

function ScoreRing({ score }: { score: number }) {
  const pct = score / 10
  const C = 2 * Math.PI * 86
  return (
    <div className="cr-score-ring">
      <svg width="200" height="200" viewBox="0 0 200 200">
        <circle cx="100" cy="100" r="86" fill="none" stroke="rgba(10,168,159,0.10)" strokeWidth="14" />
        <circle
          cx="100" cy="100" r="86"
          fill="none"
          stroke="url(#cr-grad)"
          strokeWidth="14" strokeLinecap="round"
          strokeDasharray={`${C * pct} ${C}`}
          transform="rotate(-90 100 100)"
        />
        <defs>
          <linearGradient id="cr-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#5EEAD4" />
            <stop offset="100%" stopColor="#0AA89F" />
          </linearGradient>
        </defs>
      </svg>
      <div className="cr-score-num">
        <span className="big">{score.toFixed(1)}</span>
        <span className="small">out of 10</span>
      </div>
    </div>
  )
}

function ScoreBar({ label, v }: { label: string; v: number }) {
  return (
    <div className="cr-bar">
      <span className="cr-bar-label">{label}</span>
      <div className="cr-bar-track">
        <div className="cr-bar-fill" style={{ width: `${v * 10}%` }} />
      </div>
      <span className="cr-bar-val">{v.toFixed(1)}</span>
    </div>
  )
}

function Tile({ num, lab }: { num: string; lab: string }) {
  return (
    <div className="cr-tile">
      <div className="cr-tile-num">{num}</div>
      <div className="cr-tile-lab">{lab}</div>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block', boxShadow: `0 0 0 2px ${color}33` }} />
      {label}
    </span>
  )
}

function ServiceAreaMap({ report }: { report: ConsultingReport }) {
  const points = report.serviceAreaMap.points

  // Has the server enriched the points with real lat/lng (via
  // sampleReportEnrich.ts)? If yes, we render Google native markers via
  // markers= URL params. If no, fall back to the stylized SVG overlay over
  // the static-map background.
  const realPoints = points.filter(p => typeof p.lat === 'number' && typeof p.lng === 'number')
  const useRealMarkers = realPoints.length > 0

  // Derive map center. Priority for real-marker mode: the "business" pin's
  // real lat/lng. Otherwise a geocodable string from the report meta.
  let mapCenter: string
  if (useRealMarkers) {
    const biz = realPoints.find(p => p.kind === 'business') || realPoints[0]
    mapCenter = `${biz.lat!.toFixed(6)},${biz.lng!.toFixed(6)}`
  } else {
    const firstZip = report.meta.serviceArea?.find(z => /^\d{5}$/.test(z))
    const centerFromLabel = report.serviceAreaMap.centerLabel.split(/[·•|–—-]/)[0].trim()
    mapCenter = firstZip || centerFromLabel || report.meta.metroLabel
  }

  // Build the Static Maps URL — include markers= params when we have real
  // geometry. Google renders these natively at the correct geographic spot.
  const mapParams = new URLSearchParams({
    center: mapCenter,
    zoom: '12',
    size: '1000x430',
    maptype: 'roadmap',
  })
  if (useRealMarkers) {
    for (const p of realPoints) {
      const color = p.kind === 'business' ? '0x0AA89F' : p.kind === 'opportunity' ? '0x22C55E' : '0xF59E0B'
      // Google Static Maps marker labels accept a single character — clamp.
      const label = (p.label || '').replace(/[^A-Z0-9]/i, '').charAt(0) || '•'
      mapParams.append('markers', `color:${color}|label:${label}|${p.lat!.toFixed(6)},${p.lng!.toFixed(6)}`)
    }
  }
  const mapSrc = `/api/google-static-map?${mapParams.toString()}`

  return (
    <div style={{
      position: 'relative',
      borderRadius: 14,
      overflow: 'hidden',
      border: '1px solid var(--line)',
      background: 'linear-gradient(160deg, #E8F4EF 0%, #DCEDE6 100%)',
      aspectRatio: '21/9',
    }}>
      {/* Real Google Maps background — served via our proxy so the API key
          stays server-side. Falls back to the teal gradient above if Google
          fails to render (no API key, quota, etc.). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={mapSrc}
        alt={`Service area map — ${mapCenter}`}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        loading="lazy"
      />

      {/* Pin overlay — stylized SVG markers shown ONLY when we don't have real
          Google geometry (useRealMarkers=false). When real lat/lng are available,
          the markers are rendered natively by Google Static Maps via URL params
          above, so we skip this overlay entirely. */}
      {!useRealMarkers && (
      <svg viewBox="0 0 1000 430" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        <defs>
          <filter id="pinShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
            <feOffset dy="3"/>
            <feComponentTransfer><feFuncA type="linear" slope="0.55"/></feComponentTransfer>
            <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {points.map((p, i) => {
          const cx = (p.x / 100) * 1000
          const cy = (p.y / 100) * 430
          const fill = p.kind === 'business' ? '#0AA89F' : p.kind === 'opportunity' ? '#22C55E' : '#475569'
          const ring = p.kind === 'business' ? '#5EEAD4' : p.kind === 'opportunity' ? '#86EFAC' : '#94A3B8'
          const r = p.kind === 'business' ? 22 : 18
          return (
            <g key={i} filter="url(#pinShadow)">
              <circle cx={cx} cy={cy} r={r + 6} fill={ring} opacity="0.35" />
              <circle cx={cx} cy={cy} r={r} fill={fill} stroke="#fff" strokeWidth="3" />
              <text x={cx} y={cy + 4} textAnchor="middle" fill="#fff" fontSize="12" fontWeight="800">{p.label}</text>
            </g>
          )
        })}
      </svg>
      )}

      {/* Real-marker mode: render a competitor caption strip along the bottom
          listing the actual Google-Places competitors plotted on the map. */}
      {useRealMarkers && (
        <div style={{ position: 'absolute', inset: 0, padding: 12, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', pointerEvents: 'none' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {realPoints.filter(p => p.kind === 'competitor').slice(0, 5).map((p, i) => (
              <span key={i} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 10px', borderRadius: 99,
                background: 'rgba(255,255,255,0.96)',
                border: '1px solid rgba(245,158,11,0.42)',
                fontSize: 11, fontWeight: 700, color: 'var(--ink)',
                boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
                backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)',
              }}>
                <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#F59E0B', color: '#fff', fontSize: 9, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{p.label}</span>
                {p.note}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Stylized opportunity callouts — only in SVG fallback mode */}
      {!useRealMarkers && (
        <div style={{ position: 'absolute', inset: 0, padding: 12, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', pointerEvents: 'none' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {points.filter(p => p.kind === 'opportunity').map((p, i) => (
              <span key={i} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 10px', borderRadius: 99,
                background: 'rgba(255,255,255,0.96)',
                border: '1px solid rgba(34,197,94,0.42)',
                fontSize: 11, fontWeight: 700, color: 'var(--ink)',
                boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
                backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)',
              }}>
                <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#22C55E', color: '#fff', fontSize: 9, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{p.label}</span>
                {p.note}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
