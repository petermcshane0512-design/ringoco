'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'

type Step = {
  text: string
  detail?: string
  status: 'pending' | 'running' | 'done'
  highlight?: 'orange' | 'teal'
}

const BUILD_SCRIPT: { text: string; detail: string; ms: number; highlight?: 'orange' | 'teal' }[] = [
  { text: 'Pulling call + job data', detail: '195 calls · 38 jobs · last 90 days', ms: 1100 },
  { text: 'Scanning service area', detail: '12,847 homeowners · 4 ZIPs · Census ACS', ms: 1100 },
  { text: 'Indexing local competitors', detail: '8 HVAC businesses within 8 mi · Google Places', ms: 1100 },
  { text: 'Detecting weekend missed-call patterns', detail: '52% close rate when reached later', ms: 1300 },
  { text: 'Cross-referencing tune-up demand window', detail: '1,847 homes · HVAC > 15 yrs', ms: 1100 },
  { text: 'Found 3 high-confidence opportunities', detail: 'ranked by addressable monthly revenue', ms: 1100, highlight: 'teal' },
  { text: '+$4,500 / month identified upside', detail: 'Saturday gap · pre-season tune-up · UV light', ms: 1600, highlight: 'orange' },
]

export default function ConsultingShowcase() {
  const [activeIdx, setActiveIdx] = useState(-1)
  const [resetTick, setResetTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    let timeouts: ReturnType<typeof setTimeout>[] = []
    let total = 0
    BUILD_SCRIPT.forEach((s, i) => {
      total += s.ms
      timeouts.push(setTimeout(() => { if (!cancelled) setActiveIdx(i) }, total - s.ms + 200))
    })
    // Pause then restart loop
    timeouts.push(setTimeout(() => {
      if (!cancelled) {
        setActiveIdx(-1)
        setTimeout(() => { if (!cancelled) setResetTick(t => t + 1) }, 1000)
      }
    }, total + 5000))
    return () => { cancelled = true; timeouts.forEach(clearTimeout) }
  }, [resetTick])

  return (
    <section className="cs-root">
      <style>{`
        .cs-root {
          position: relative;
          padding: 60px 32px 64px;
          background:
            radial-gradient(900px 500px at 90% 8%, rgba(232,123,55,0.18), transparent 65%),
            radial-gradient(700px 500px at 8% 92%, rgba(94,234,212,0.10), transparent 65%),
            linear-gradient(180deg, #050E1F 0%, #0B1F3A 55%, #112C4A 100%);
          color: #fff;
          overflow: hidden;
          border-bottom: 1px solid rgba(94,234,212,0.18);
        }
        .cs-root::before {
          content: '';
          position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(94,234,212,0.045) 1px, transparent 1px),
            linear-gradient(90deg, rgba(94,234,212,0.045) 1px, transparent 1px);
          background-size: 60px 60px;
          mask-image: radial-gradient(ellipse 70% 60% at 50% 40%, black 55%, transparent 100%);
          -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 40%, black 55%, transparent 100%);
          pointer-events: none;
        }
        .cs-wrap { max-width: 1180px; margin: 0 auto; position: relative; z-index: 1; }

        /* Header */
        .cs-head { text-align: center; max-width: 720px; margin: 0 auto 32px; }
        .cs-eyebrow {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 5px 12px;
          border-radius: 99px;
          background: rgba(94,234,212,0.10);
          border: 1px solid rgba(94,234,212,0.30);
          font-size: 10.5px; font-weight: 800;
          color: #5EEAD4; letter-spacing: 0.18em; text-transform: uppercase;
          margin-bottom: 14px;
        }
        .cs-eyebrow::before {
          content: ''; width: 6px; height: 6px; border-radius: 50%;
          background: #22C55E; box-shadow: 0 0 8px rgba(34,197,94,0.7);
          animation: csBlink 1.6s infinite;
        }
        .cs-h2 {
          font-size: clamp(26px, 3.4vw, 42px);
          font-weight: 900; line-height: 1.04;
          letter-spacing: -0.04em;
          margin: 0 0 12px;
          color: #fff;
        }
        .cs-h2 .money {
          background: linear-gradient(135deg, #FFD9A8 0%, #FF9D5A 35%, #E8742B 70%, #C84B26 100%);
          -webkit-background-clip: text; background-clip: text; color: transparent;
          filter: drop-shadow(0 0 24px rgba(232,116,43,0.35));
        }
        .cs-sub { font-size: 15px; line-height: 1.55; color: rgba(255,255,255,0.72); margin: 0; max-width: 640px; margin-left: auto; margin-right: auto; }

        /* Builder + report cover grid */
        .cs-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
          gap: 24px;
          align-items: stretch;
          margin-bottom: 28px;
        }
        @media (max-width: 980px) {
          .cs-grid { grid-template-columns: 1fr; gap: 22px; }
        }

        /* Terminal */
        .cs-term {
          border-radius: 16px;
          background: linear-gradient(165deg, #0F2542 0%, #0A1B33 100%);
          border: 1px solid rgba(94,234,212,0.22);
          box-shadow:
            0 24px 56px rgba(0,0,0,0.45),
            0 0 0 1px rgba(94,234,212,0.10),
            inset 0 1px 0 rgba(255,255,255,0.05);
          overflow: hidden;
          display: flex; flex-direction: column;
          min-height: 380px;
        }
        .cs-term-bar {
          padding: 10px 14px;
          background: linear-gradient(180deg, rgba(255,255,255,0.04), transparent);
          border-bottom: 1px solid rgba(94,234,212,0.12);
          display: flex; align-items: center; gap: 10px;
        }
        .cs-tlight { width: 11px; height: 11px; border-radius: 50%; }
        .cs-term-title {
          flex: 1; font-size: 12px; color: rgba(255,255,255,0.55); font-weight: 600;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
        }
        .cs-live {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 4px 10px; border-radius: 99px;
          background: rgba(94,234,212,0.12);
          border: 1px solid rgba(94,234,212,0.32);
          font-size: 10px; font-weight: 800; color: #5EEAD4;
          letter-spacing: 0.1em; text-transform: uppercase;
        }
        .cs-live::before {
          content: ''; width: 5px; height: 5px; border-radius: 50%;
          background: #22C55E; box-shadow: 0 0 6px rgba(34,197,94,0.85);
          animation: csBlink 1.6s infinite;
        }
        .cs-term-body {
          padding: 16px 20px;
          flex: 1;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 12.5px;
          display: flex; flex-direction: column; gap: 7px;
          overflow: hidden;
          position: relative;
        }
        .cs-term-prompt {
          color: rgba(255,255,255,0.55);
          font-size: 10.5px;
          margin-bottom: 4px;
        }
        .cs-term-prompt b { color: #5EEAD4; font-weight: 700; }
        .cs-line {
          display: flex; gap: 12px;
          opacity: 0;
          transform: translateY(6px);
          transition: opacity 0.35s ease, transform 0.35s ease;
        }
        .cs-line.visible { opacity: 1; transform: translateY(0); }
        .cs-line.dim { opacity: 0.55; }
        .cs-line-mark {
          flex-shrink: 0;
          width: 18px; height: 18px;
          border-radius: 50%;
          display: inline-flex; align-items: center; justify-content: center;
          font-size: 10px;
          margin-top: 2px;
        }
        .cs-line-mark.pending {
          border: 1.5px solid rgba(94,234,212,0.30);
          color: rgba(94,234,212,0.45);
        }
        .cs-line-mark.running {
          border: 1.5px solid rgba(94,234,212,0.7);
          border-top-color: transparent;
          animation: csSpin 0.8s linear infinite;
        }
        .cs-line-mark.done {
          background: linear-gradient(135deg, #14B8A6, #0AA89F);
          color: #fff;
          box-shadow: 0 4px 12px rgba(20,184,166,0.42);
        }
        .cs-line-mark.money {
          background: linear-gradient(135deg, #FF9D5A, #E8742B);
          color: #fff;
          box-shadow: 0 4px 14px rgba(232,116,43,0.55);
        }
        .cs-line-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
        .cs-line-text .t { color: #fff; font-weight: 600; font-size: 12.5px; letter-spacing: -0.1px; }
        .cs-line-text .d { color: rgba(255,255,255,0.55); font-size: 10.5px; font-weight: 500; }
        .cs-line.highlight-orange .t {
          background: linear-gradient(135deg, #FFD9A8, #FF9D5A 30%, #E8742B);
          -webkit-background-clip: text; background-clip: text; color: transparent;
          font-size: 16px; font-weight: 900; letter-spacing: -0.4px;
          filter: drop-shadow(0 0 12px rgba(232,116,43,0.5));
        }
        .cs-line.highlight-teal .t {
          color: #5EEAD4; font-weight: 800;
        }

        /* Report cover (the real artifact) — HUGE clickable affordance */
        .cs-cover-wrap {
          position: relative;
          display: flex; align-items: center; justify-content: center;
          min-height: 380px;
          isolation: isolate;
        }
        /* Pulsing halo behind the cover — the visual "click me" */
        .cs-cover-halo {
          position: absolute;
          width: 280px; height: 380px;
          border-radius: 18px;
          background: radial-gradient(ellipse at center, rgba(232,116,43,0.55) 0%, rgba(94,234,212,0.30) 45%, transparent 70%);
          filter: blur(28px);
          opacity: 0.85;
          animation: csHaloPulse 2.6s ease-in-out infinite;
          pointer-events: none;
          z-index: 0;
        }
        .cs-cover {
          position: relative;
          z-index: 1;
          width: 240px; height: 320px;
          border-radius: 14px;
          overflow: hidden;
          background: #0B1F3A;
          border: 1px solid rgba(94,234,212,0.40);
          box-shadow:
            0 30px 70px rgba(0,0,0,0.55),
            0 0 0 1px rgba(94,234,212,0.18),
            0 0 60px rgba(232,116,43,0.32);
          transform: rotate(-5deg);
          animation: csCoverFloat 6s ease-in-out infinite;
          transition: transform 0.32s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.32s ease, filter 0.32s ease;
          cursor: pointer;
        }
        .cs-cover:hover {
          transform: rotate(0deg) scale(1.08);
          box-shadow:
            0 40px 100px rgba(0,0,0,0.6),
            0 0 0 1px rgba(94,234,212,0.45),
            0 0 100px rgba(232,116,43,0.55);
          filter: brightness(1.06);
        }
        /* Tap-target ring that animates outward */
        .cs-cover-ring {
          position: absolute;
          width: 240px; height: 320px;
          border-radius: 14px;
          border: 2px solid rgba(255,217,168,0.55);
          transform: rotate(-5deg);
          animation: csRingPulse 2.2s ease-out infinite;
          pointer-events: none;
          z-index: 0;
        }
        .cs-cover-photo {
          position: absolute; inset: 0;
          width: 100%; height: 100%;
          object-fit: cover; object-position: center;
          animation: csCoverDrift 14s ease-in-out infinite;
        }
        .cs-cover-shade {
          position: absolute; inset: 0;
          background:
            linear-gradient(180deg,
              rgba(7,22,42,0.78) 0%,
              rgba(7,22,42,0.40) 28%,
              rgba(7,22,42,0.0) 48%,
              rgba(7,22,42,0.0) 72%,
              rgba(7,22,42,0.65) 100%
            );
        }
        .cs-cover-foam {
          position: absolute; left: -4%; right: -4%; top: 78%;
          height: 8px;
          background:
            radial-gradient(ellipse 35% 100% at 22% 50%, rgba(255,255,255,0.85), transparent 70%),
            radial-gradient(ellipse 30% 100% at 58% 50%, rgba(255,255,255,0.65), transparent 70%),
            radial-gradient(ellipse 35% 100% at 86% 50%, rgba(255,255,255,0.75), transparent 70%);
          mix-blend-mode: screen;
          animation: csFoamShimmer 5.5s ease-in-out infinite;
          filter: blur(2px);
        }
        .cs-cover-content {
          position: absolute; inset: 0;
          padding: 16px 16px 14px;
          display: flex; flex-direction: column;
          z-index: 2;
        }
        .cs-cover-logo {
          align-self: flex-start;
          background: rgba(255,255,255,0.96);
          padding: 9px 14px; border-radius: 11px;
          margin-bottom: 14px;
          box-shadow: 0 6px 16px rgba(11,31,58,0.32);
        }
        .cs-cover-logo img { display: block; height: 56px; width: auto; }
        .cs-cover-eyebrow {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 9px; font-weight: 800;
          letter-spacing: 0.18em; text-transform: uppercase;
          color: #fff;
          text-shadow: 0 1px 4px rgba(0,0,0,0.7);
        }
        .cs-cover-eyebrow::before {
          content: ''; width: 5px; height: 5px; border-radius: 50%;
          background: #22C55E; box-shadow: 0 0 6px rgba(34,197,94,0.85);
        }
        .cs-cover-business {
          font-size: 13px; font-weight: 800; color: #fff;
          letter-spacing: -0.3px; line-height: 1.1; margin-top: 3px;
          text-shadow: 0 1px 6px rgba(0,0,0,0.7);
        }
        .cs-cover-headline {
          font-size: 26px; font-weight: 900;
          background: linear-gradient(135deg, #FFD9A8 0%, #FF9D5A 35%, #E8742B 70%);
          -webkit-background-clip: text; background-clip: text; color: transparent;
          line-height: 1.0; letter-spacing: -0.8px; margin-top: 7px;
          filter: drop-shadow(0 0 14px rgba(232,116,43,0.4));
        }
        .cs-cover-sub {
          font-size: 10px; font-weight: 700;
          color: #fff;
          letter-spacing: 0.06em; margin-top: 3px;
          text-shadow: 0 1px 4px rgba(0,0,0,0.6);
        }
        .cs-cover-meta {
          display: flex; gap: 4px; flex-wrap: wrap;
          margin-top: auto;
        }
        .cs-cover-pill {
          font-size: 9px; font-weight: 800;
          padding: 3px 8px; border-radius: 99px;
          background: rgba(11,31,58,0.65);
          border: 1px solid rgba(94,234,212,0.5);
          color: #fff;
          backdrop-filter: blur(3px);
          -webkit-backdrop-filter: blur(3px);
          letter-spacing: 0.04em;
        }
        /* 3 section preview cards */
        .cs-cards {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px;
          margin-bottom: 24px;
        }
        @media (max-width: 880px) { .cs-cards { grid-template-columns: 1fr; } }
        .cs-card {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(94,234,212,0.20);
          border-radius: 14px;
          padding: 16px;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          transition: transform 0.24s ease, border-color 0.24s ease, box-shadow 0.24s ease;
        }
        .cs-card:hover {
          transform: translateY(-2px);
          border-color: rgba(94,234,212,0.45);
          box-shadow: 0 14px 32px rgba(94,234,212,0.10);
        }
        .cs-card-tag {
          display: inline-block;
          font-size: 9.5px; font-weight: 800; color: #5EEAD4;
          letter-spacing: 0.14em; text-transform: uppercase;
          margin-bottom: 7px;
        }
        .cs-card-title { font-size: 14px; font-weight: 800; color: #fff; letter-spacing: -0.3px; margin: 0 0 4px; }
        .cs-card-meta { font-size: 11.5px; color: rgba(255,255,255,0.62); line-height: 1.5; margin: 0; }
        .cs-card-stat {
          display: flex; align-items: baseline; gap: 7px;
          margin: 9px 0 7px;
        }
        .cs-card-stat .num {
          font-size: 22px; font-weight: 900;
          background: linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B);
          -webkit-background-clip: text; background-clip: text; color: transparent;
          letter-spacing: -0.5px; line-height: 1;
          font-variant-numeric: tabular-nums;
        }
        .cs-card-stat .lab {
          font-size: 10px; font-weight: 700; color: rgba(255,255,255,0.55);
          letter-spacing: 0.06em; text-transform: uppercase;
        }
        .cs-card-foot {
          margin-top: 9px; padding-top: 9px;
          border-top: 1px solid rgba(94,234,212,0.14);
          display: flex; justify-content: space-between; align-items: center;
        }
        .cs-card-foot .pip {
          font-size: 9.5px; font-weight: 800; color: #5EEAD4;
          letter-spacing: 0.08em; text-transform: uppercase;
        }

        /* Mini map */
        .cs-mini-map {
          position: relative;
          width: 100%; aspect-ratio: 21/8;
          border-radius: 9px; overflow: hidden;
          background: linear-gradient(160deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
          border: 1px solid rgba(94,234,212,0.18);
          margin: 6px 0;
        }

        /* Outreach row */
        .cs-out-row {
          display: flex; align-items: center; gap: 9px;
          padding: 6px 0;
          border-bottom: 1px solid rgba(94,234,212,0.10);
          font-size: 11.5px;
        }
        .cs-out-row:last-child { border-bottom: none; }
        .cs-out-name { color: #fff; font-weight: 700; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cs-out-phone { color: #5EEAD4; font-weight: 800; font-variant-numeric: tabular-nums; }

        /* University ribbon */
        .cs-ribbon {
          margin: 0 0 22px;
          padding: 18px 26px;
          border-radius: 14px;
          background:
            linear-gradient(120deg, rgba(232,116,43,0.16) 0%, rgba(232,116,43,0) 35%, rgba(94,234,212,0) 65%, rgba(94,234,212,0.14) 100%),
            linear-gradient(135deg, #050E1F 0%, #0F2542 60%, #112C4A 100%);
          border: 1px solid rgba(94,234,212,0.26);
          box-shadow: 0 18px 44px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.05);
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 18px;
          align-items: center;
        }
        @media (max-width: 880px) { .cs-ribbon { grid-template-columns: 1fr; text-align: center; } }
        .cs-rib-ico {
          width: 40px; height: 40px;
          border-radius: 10px;
          background: linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B);
          color: #fff;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 6px 16px rgba(232,116,43,0.42);
          flex-shrink: 0;
        }
        .cs-rib-text { min-width: 0; }
        .cs-rib-tag {
          font-size: 10px; font-weight: 800; color: #FF9D5A;
          letter-spacing: 0.18em; text-transform: uppercase; margin-bottom: 2px;
        }
        .cs-rib-line { font-size: 15px; font-weight: 800; color: #fff; letter-spacing: -0.2px; line-height: 1.3; }
        .cs-rib-unis { color: #FFD9A8; font-weight: 900; }
        .cs-rib-stack { font-size: 10.5px; font-weight: 600; color: rgba(255,255,255,0.55); margin-top: 2px; }
        .cs-rib-side { font-size: 10.5px; font-weight: 700; color: rgba(255,255,255,0.45); letter-spacing: 0.04em; text-align: right; }

        /* CTA row */
        .cs-cta-row {
          display: flex; gap: 14px; justify-content: center; flex-wrap: wrap;
        }
        .cs-cta-primary {
          display: inline-flex; align-items: center; gap: 10px;
          padding: 16px 28px;
          border-radius: 12px;
          background: linear-gradient(135deg, #FFD9A8 0%, #FF9D5A 40%, #E8742B 100%);
          color: #0B1F3A;
          font-weight: 900; font-size: 15px;
          text-decoration: none;
          border: 1px solid rgba(255,217,168,0.55);
          box-shadow: 0 14px 36px rgba(232,116,43,0.42), inset 0 1px 0 rgba(255,255,255,0.55);
          transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.22s ease, filter 0.22s ease;
        }
        .cs-cta-primary:hover {
          transform: translateY(-2px) scale(1.03);
          box-shadow: 0 20px 50px rgba(232,116,43,0.6), inset 0 1px 0 rgba(255,255,255,0.55);
          filter: brightness(1.04);
        }
        .cs-cta-secondary {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 16px 24px;
          border-radius: 12px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(94,234,212,0.30);
          color: #fff;
          font-weight: 700; font-size: 14px;
          text-decoration: none;
          transition: background 0.2s, border-color 0.2s, transform 0.2s;
        }
        .cs-cta-secondary:hover {
          background: rgba(94,234,212,0.10);
          border-color: rgba(94,234,212,0.55);
          transform: translateY(-1px);
        }

        /* Mobile — both CTAs stack to full-width and center cleanly so
           they don't get clipped at narrow viewports. Matches the hero
           CTA mobile pattern on page.tsx. */
        @media (max-width: 720px) {
          .cs-cta-row {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 10px !important;
            width: 100% !important;
            padding: 0 6px;
            box-sizing: border-box;
          }
          .cs-cta-primary,
          .cs-cta-secondary {
            width: 100% !important;
            box-sizing: border-box !important;
            justify-content: center !important;
            text-align: center !important;
            padding: 14px 18px !important;
            font-size: 14px !important;
            white-space: normal !important;
          }
        }

        @keyframes csBlink {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.45; }
        }
        @keyframes csSpin {
          to { transform: rotate(360deg); }
        }
        @keyframes csCoverFloat {
          0%, 100% { transform: rotate(-5deg) translateY(0); }
          50%      { transform: rotate(-5deg) translateY(-8px); }
        }
        @keyframes csCoverDrift {
          0%   { transform: scale(1.04) translate(0, 0); }
          50%  { transform: scale(1.10) translate(-2px, -1px); }
          100% { transform: scale(1.04) translate(0, 0); }
        }
        @keyframes csFoamShimmer {
          0%, 100% { opacity: 0.55; transform: translateX(-2%) scaleY(1); }
          50%      { opacity: 0.85; transform: translateX(2%) scaleY(1.15); }
        }
        @keyframes csHaloPulse {
          0%, 100% { opacity: 0.55; transform: scale(0.94); }
          50%      { opacity: 1; transform: scale(1.08); }
        }
        @keyframes csRingPulse {
          0%   { opacity: 0.7; transform: rotate(-5deg) scale(1); }
          70%  { opacity: 0;   transform: rotate(-5deg) scale(1.18); }
          100% { opacity: 0;   transform: rotate(-5deg) scale(1.18); }
        }
      `}</style>

      <div className="cs-wrap">
        {/* Header */}
        <header className="cs-head">
          <span className="cs-eyebrow">Quarterly Consulting · Included on Growth+</span>
          <h2 className="cs-h2">
            BellAveGo continuously analyzes your business for <span className="money">missed revenue opportunities</span>.
          </h2>
          <p className="cs-sub">
            Higher-tier plans include more frequent reporting, deeper market analysis, and ongoing AI-driven business intelligence.
          </p>
        </header>

        {/* Builder + report cover */}
        <div className="cs-grid">
          {/* Terminal */}
          <div className="cs-term">
            <div className="cs-term-bar">
              <span className="cs-tlight" style={{ background: '#FF5F57' }} />
              <span className="cs-tlight" style={{ background: '#FEBC2E' }} />
              <span className="cs-tlight" style={{ background: '#28C840' }} />
              <span className="cs-term-title">bellavego.consulting · Q1 2026 · Mike&apos;s HVAC</span>
              <span className="cs-live">Generating</span>
            </div>
            <div className="cs-term-body">
              <div className="cs-term-prompt">$ <b>bellavego</b> consulting build --period Q1 --customer mike-hvac</div>
              {BUILD_SCRIPT.map((s, i) => {
                const status: Step['status'] =
                  activeIdx < 0 ? 'pending'
                  : i < activeIdx ? 'done'
                  : i === activeIdx ? 'running'
                  : 'pending'
                const visible = activeIdx >= i
                return (
                  <div key={i} className={`cs-line ${visible ? 'visible' : ''} ${status === 'pending' ? 'dim' : ''} ${s.highlight ? `highlight-${s.highlight}` : ''}`}>
                    <span className={`cs-line-mark ${status} ${s.highlight === 'orange' && status === 'done' ? 'money' : ''}`}>
                      {status === 'done' ? '✓' : status === 'pending' ? '·' : ''}
                    </span>
                    <span className="cs-line-text">
                      <span className="t">{s.text}</span>
                      <span className="d">{s.detail}</span>
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Report cover */}
          <div className="cs-cover-wrap">
            <div className="cs-cover-halo" aria-hidden="true" />
            <div className="cs-cover-ring" aria-hidden="true" />
            <Link href="/sample-report" className="cs-cover" aria-label="View the full sample report">
              <Image
                src="/sunset-beach.jpg"
                alt=""
                width={2400}
                height={1350}
                className="cs-cover-photo"
                aria-hidden="true"
              />
              <div className="cs-cover-foam" />
              <div className="cs-cover-shade" />
              <div className="cs-cover-content">
                <span className="cs-cover-logo">
                  <Image src="/logo.png" alt="BellAveGo" width={665} height={210} />
                </span>
                <span className="cs-cover-eyebrow">Q1 2026 Report</span>
                <div className="cs-cover-business">Mike&apos;s HVAC &amp; Cooling</div>
                <div className="cs-cover-headline">$4,500/mo</div>
                <div className="cs-cover-sub">in identified upside</div>
                <div className="cs-cover-meta">
                  <span className="cs-cover-pill">HVAC</span>
                  <span className="cs-cover-pill">Minneapolis</span>
                  <span className="cs-cover-pill">★ 7.4 score</span>
                </div>
              </div>
            </Link>
          </div>
        </div>

        {/* University ribbon */}
        <div className="cs-ribbon">
          <div className="cs-rib-ico">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
              <path d="M6 12v5c3 3 9 3 12 0v-5"/>
            </svg>
          </div>
          <div className="cs-rib-text">
            <div className="cs-rib-tag">Methodology · Our moat</div>
            <div className="cs-rib-line">
              Your <span className="cs-rib-unis">real call data</span> + your <span className="cs-rib-unis">real local market</span> — analyzed every period, automatically.
            </div>
            <div className="cs-rib-stack">Powered by Claude Sonnet 4.6 · US Census ACS · Google Places · Your own BellAveGo dashboard</div>
          </div>
          <div className="cs-rib-side">No competitor<br />offers this.</div>
        </div>

        {/* CTA row */}
        <div className="cs-cta-row">
          <Link href="/sample-report" className="cs-cta-primary">
            View the full sample report
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </Link>
          <Link href="/pricing" className="cs-cta-secondary">
            See plans · From $147/mo
          </Link>
        </div>
      </div>
    </section>
  )
}
