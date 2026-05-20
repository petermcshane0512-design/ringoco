'use client'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@clerk/nextjs'

/**
 * Founder story — cinematic editorial layout (v2).
 *
 * Six sections that break the wall-of-text into skimmable moments:
 *   1. HERO ............ 55/45 split, headline + cinematic founder card
 *   2. MOMENT .......... three staggered story cards + premium stat block
 *   3. MANIFESTO ....... dark, oversized "why we exist" type
 *   4. HOW IT WORKS .... 3-column process with icons
 *   5. VISION .......... short founder mission, signed
 *   6. CTA ............. close
 *
 * The hero card is a dark navy gradient with animated orange + teal
 * glows. If /peter.png exists in /public, the image fills the card via
 * Next/Image; if not, the cinematic card itself is the intentional
 * visual. No giant letter placeholders.
 */
export default function FounderPage() {
  const { isSignedIn } = useAuth()

  return (
    <main className="mc-page founder-v2" style={{ fontFamily: "'Inter', system-ui, sans-serif", overflowX: 'hidden', background: '#FFF8F0', color: '#0B1F3A' }}>

      {/* Nav */}
      <nav className="bavg-top-nav" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 48px', height: 72, background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(232,116,43,0.12)', position: 'sticky', top: 0, zIndex: 100 }}>
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

      {/* ── Page-wide styles ─────────────────────────────────────────── */}
      <style>{`
        .founder-v2 { line-height: 1; }
        .fv2-shell { max-width: 1240px; margin: 0 auto; padding: 0 32px; position: relative; z-index: 1; }
        .fv2-eyebrow {
          display: inline-flex; align-items: center; gap: 10px;
          font-size: 11px; font-weight: 800;
          letter-spacing: 0.24em; text-transform: uppercase;
        }
        .fv2-eyebrow.light { color: #C84B26; }
        .fv2-eyebrow.dark { color: #FF9D5A; }
        .fv2-eyebrow::before {
          content: ''; width: 24px; height: 1px;
          background: currentColor;
          opacity: 0.6;
        }

        /* ── 1. HERO ────────────────────────────────────────────── */
        .fv2-hero {
          position: relative;
          padding: 88px 0 96px;
          overflow: hidden;
        }
        .fv2-hero::before {
          content: '';
          position: absolute; inset: 0;
          background:
            radial-gradient(700px 500px at 85% 15%, rgba(255,157,90,0.20), transparent 65%),
            radial-gradient(900px 600px at 8% 85%, rgba(10,168,159,0.12), transparent 70%);
          pointer-events: none;
        }
        .fv2-hero-grid {
          display: grid;
          grid-template-columns: 1.22fr 1fr;
          gap: 72px;
          align-items: center;
        }
        .fv2-hero-h1 {
          font-size: clamp(44px, 5.8vw, 72px);
          font-weight: 900;
          letter-spacing: -0.045em;
          line-height: 1.02;
          margin: 22px 0 26px;
          color: #0B1F3A;
        }
        .fv2-hero-h1 .accent {
          background: linear-gradient(135deg, #FF9D5A 0%, #E8742B 55%, #C84B26 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          filter: drop-shadow(0 2px 14px rgba(232,116,43,0.28));
        }
        .fv2-hero-sub {
          font-size: 19px;
          line-height: 1.55;
          color: #3D5A62;
          margin: 0 0 36px;
          max-width: 540px;
        }
        .fv2-hero-ctas { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 22px; }
        .fv2-credibility {
          display: inline-flex; align-items: center; gap: 8px;
          font-size: 13px; color: #7AAAB2; font-weight: 600;
          padding-top: 18px;
          border-top: 1px solid rgba(232,116,43,0.16);
          max-width: 480px;
        }
        .fv2-credibility::before {
          content: ''; width: 6px; height: 6px; border-radius: 50%;
          background: #22C55E;
          box-shadow: 0 0 8px rgba(34,197,94,0.7);
        }

        /* Cinematic founder card */
        .fv2-hero-card {
          position: relative;
          aspect-ratio: 4/5;
          max-width: 460px;
          margin: 0 auto;
          border-radius: 28px;
          overflow: hidden;
          background:
            radial-gradient(circle at 25% 18%, rgba(255,157,90,0.28), transparent 55%),
            radial-gradient(circle at 78% 82%, rgba(20,184,166,0.22), transparent 60%),
            linear-gradient(140deg, #050E1F 0%, #0B1F3A 45%, #112C4A 100%);
          border: 1px solid rgba(232,116,43,0.32);
          box-shadow:
            0 50px 100px -20px rgba(11,31,58,0.55),
            0 0 0 1px rgba(232,116,43,0.10),
            0 0 120px -10px rgba(232,116,43,0.30);
        }
        .fv2-hero-card::before {
          /* Animated drifting orange glow */
          content: '';
          position: absolute;
          top: -20%; left: -10%;
          width: 60%; height: 60%;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255,157,90,0.35), transparent 60%);
          filter: blur(40px);
          animation: fv2DriftA 11s ease-in-out infinite alternate;
          pointer-events: none;
        }
        .fv2-hero-card::after {
          /* Animated drifting teal glow */
          content: '';
          position: absolute;
          bottom: -20%; right: -15%;
          width: 65%; height: 65%;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(20,184,166,0.30), transparent 65%);
          filter: blur(45px);
          animation: fv2DriftB 13s ease-in-out infinite alternate;
          pointer-events: none;
        }
        @keyframes fv2DriftA {
          0%   { transform: translate(0,0) scale(1); opacity: 0.65; }
          100% { transform: translate(40px, 30px) scale(1.18); opacity: 0.9; }
        }
        @keyframes fv2DriftB {
          0%   { transform: translate(0,0) scale(1); opacity: 0.6; }
          100% { transform: translate(-30px, -40px) scale(1.15); opacity: 0.88; }
        }
        /* Subtle grid overlay */
        .fv2-hero-card-grid {
          position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px);
          background-size: 32px 32px;
          mask-image: radial-gradient(circle at center, #000 30%, transparent 80%);
          -webkit-mask-image: radial-gradient(circle at center, #000 30%, transparent 80%);
          pointer-events: none;
        }
        /* Wave silhouette at bottom — logo callback */
        .fv2-hero-card-wave {
          position: absolute; left: 0; right: 0; bottom: 0;
          height: 60px;
          opacity: 0.55;
          pointer-events: none;
        }
        /* Founder identity overlay (sits in front of glows + image) */
        .fv2-hero-card-overlay {
          position: absolute; inset: 0;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 22px 24px 24px;
          z-index: 3;
          pointer-events: none;
        }
        .fv2-card-tag {
          display: inline-flex; align-items: center; gap: 7px;
          align-self: flex-start;
          padding: 5px 11px;
          font-size: 10px; font-weight: 800;
          color: #FF9D5A;
          letter-spacing: 0.20em; text-transform: uppercase;
          background: rgba(232,116,43,0.10);
          border: 1px solid rgba(232,116,43,0.45);
          border-radius: 100px;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }
        .fv2-card-tag::before {
          content: ''; width: 6px; height: 6px; border-radius: 50%;
          background: #FF9D5A;
          box-shadow: 0 0 8px rgba(255,157,90,0.8);
          animation: fv2BlinkA 2.2s ease-in-out infinite;
        }
        @keyframes fv2BlinkA {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.4; }
        }
        .fv2-card-name {
          font-size: 22px; font-weight: 900; color: #fff;
          letter-spacing: -0.3px; line-height: 1.1;
          margin: 0;
          text-shadow: 0 2px 16px rgba(0,0,0,0.45);
        }
        .fv2-card-role {
          font-size: 13px; font-weight: 700; color: #FF9D5A;
          letter-spacing: 0.06em;
          margin: 4px 0 0;
          text-shadow: 0 2px 12px rgba(0,0,0,0.4);
        }
        .fv2-card-meta {
          font-size: 11px; color: rgba(255,255,255,0.55); font-weight: 600;
          letter-spacing: 0.10em; text-transform: uppercase;
          margin: 8px 0 0;
        }
        /* The next/image fill — sits between background gradient and overlay */
        .fv2-hero-card-image {
          position: absolute; inset: 0;
          z-index: 2;
          object-fit: cover;
        }

        /* CTAs */
        .fv2-btn-primary {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 14px 22px;
          border-radius: 12px;
          background: linear-gradient(135deg, #FF9D5A 0%, #E8742B 55%, #C84B26 100%);
          color: #fff; font-weight: 800; font-size: 14.5px;
          letter-spacing: -0.1px;
          text-decoration: none;
          border: 1px solid rgba(232,116,43,0.5);
          box-shadow:
            0 12px 28px rgba(232,116,43,0.40),
            inset 0 1px 0 rgba(255,255,255,0.25);
          transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.22s, filter 0.22s;
        }
        .fv2-btn-primary:hover {
          transform: translateY(-2px) scale(1.02);
          box-shadow: 0 18px 40px rgba(232,116,43,0.55), inset 0 1px 0 rgba(255,255,255,0.25);
          filter: brightness(1.07);
        }
        .fv2-btn-ghost {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 14px 20px;
          border-radius: 12px;
          background: rgba(255,255,255,0.0);
          color: #0B1F3A; font-weight: 700; font-size: 14px;
          letter-spacing: -0.1px;
          text-decoration: none;
          border: 1.5px solid rgba(11,31,58,0.16);
          transition: background 0.18s, border-color 0.18s, transform 0.18s;
        }
        .fv2-btn-ghost:hover {
          background: rgba(11,31,58,0.04);
          border-color: rgba(11,31,58,0.32);
          transform: translateY(-1px);
        }

        /* ── 2. MOMENT — three staggered story cards ──────────── */
        .fv2-moment {
          position: relative;
          padding: 96px 0 112px;
        }
        .fv2-moment::before {
          content: '';
          position: absolute; inset: 0;
          background:
            radial-gradient(900px 500px at 85% 50%, rgba(255,157,90,0.10), transparent 65%);
          pointer-events: none;
        }
        .fv2-moment-head {
          text-align: center;
          margin-bottom: 64px;
        }
        .fv2-moment-h2 {
          font-size: clamp(34px, 4.2vw, 50px);
          font-weight: 900;
          letter-spacing: -0.035em;
          line-height: 1.05;
          margin: 12px 0 0;
          color: #0B1F3A;
          max-width: 720px;
          margin-left: auto;
          margin-right: auto;
        }
        .fv2-moment-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 22px;
          align-items: start;
        }
        .fv2-moment-card {
          position: relative;
          padding: 28px 26px 26px;
          background: #FFFFFF;
          border-radius: 20px;
          border: 1px solid rgba(232,116,43,0.16);
          box-shadow: 0 18px 44px -12px rgba(11,31,58,0.14);
          transition: transform 0.32s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.32s, border-color 0.32s;
        }
        .fv2-moment-card:hover {
          transform: translateY(-6px);
          box-shadow: 0 28px 60px -12px rgba(11,31,58,0.20);
          border-color: rgba(232,116,43,0.40);
        }
        /* Cinematic descending stagger on desktop */
        .fv2-moment-card-1 { transform: translateY(0); }
        .fv2-moment-card-2 { transform: translateY(32px); }
        .fv2-moment-card-3 { transform: translateY(64px); }
        .fv2-moment-card-1:hover { transform: translateY(-6px); }
        .fv2-moment-card-2:hover { transform: translateY(26px); }
        .fv2-moment-card-3:hover { transform: translateY(58px); }
        .fv2-moment-meta {
          display: flex; align-items: center; justify-content: space-between;
          font-size: 10.5px; font-weight: 800;
          color: #7AAAB2;
          letter-spacing: 0.16em; text-transform: uppercase;
          margin-bottom: 18px;
        }
        .fv2-moment-num {
          color: #C84B26;
        }
        .fv2-moment-card h3 {
          font-size: 26px;
          font-weight: 900;
          letter-spacing: -0.025em;
          line-height: 1.1;
          color: #0B1F3A;
          margin: 0 0 14px;
        }
        .fv2-moment-card p {
          font-size: 14.5px;
          line-height: 1.6;
          color: #3D5A62;
          margin: 0 0 22px;
        }
        .fv2-moment-stat {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 7px 12px;
          font-size: 12px;
          font-weight: 800;
          color: #C84B26;
          letter-spacing: 0.04em;
          background: linear-gradient(135deg, rgba(255,157,90,0.14), rgba(232,116,43,0.06));
          border: 1px solid rgba(232,116,43,0.32);
          border-radius: 100px;
        }
        .fv2-moment-stat::before {
          content: ''; width: 5px; height: 5px; border-radius: 50%;
          background: #E8742B;
        }

        /* Premium stat block */
        .fv2-stat-block {
          margin: 80px auto 0;
          max-width: 720px;
          padding: 36px 40px;
          background: linear-gradient(135deg, #0B1F3A 0%, #112C4A 100%);
          border-radius: 24px;
          border: 1px solid rgba(232,116,43,0.30);
          box-shadow:
            0 30px 60px -16px rgba(11,31,58,0.40),
            0 0 80px -20px rgba(232,116,43,0.25);
          position: relative;
          overflow: hidden;
        }
        .fv2-stat-block::before {
          content: '';
          position: absolute;
          top: -50%; right: -20%;
          width: 50%; height: 150%;
          background: radial-gradient(circle, rgba(255,157,90,0.18), transparent 70%);
          filter: blur(40px);
          pointer-events: none;
        }
        .fv2-stat-content {
          position: relative;
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 28px;
          align-items: center;
        }
        .fv2-stat-num {
          font-size: clamp(56px, 7vw, 80px);
          font-weight: 900;
          letter-spacing: -0.04em;
          line-height: 1;
          background: linear-gradient(135deg, #FFD9A8 0%, #FF9D5A 50%, #E8742B 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        .fv2-stat-label-top {
          font-size: 11px; font-weight: 800;
          letter-spacing: 0.20em; text-transform: uppercase;
          color: #FF9D5A;
          margin: 0 0 4px;
        }
        .fv2-stat-label-main {
          font-size: 22px; font-weight: 800;
          letter-spacing: -0.2px;
          color: #fff;
          margin: 0 0 10px;
          line-height: 1.2;
        }
        .fv2-stat-label-sub {
          font-size: 13px; color: rgba(255,255,255,0.55);
          margin: 0;
          line-height: 1.5;
        }

        /* ── 3. MANIFESTO — dark, oversized type ──────────────── */
        .fv2-manifesto {
          position: relative;
          background: linear-gradient(180deg, #050E1F 0%, #0B1F3A 50%, #050E1F 100%);
          padding: 128px 0 132px;
          overflow: hidden;
        }
        .fv2-manifesto::before {
          content: '';
          position: absolute;
          top: 10%; right: -10%;
          width: 65%; height: 80%;
          background: radial-gradient(circle, rgba(232,116,43,0.18), transparent 65%);
          filter: blur(80px);
          pointer-events: none;
        }
        .fv2-manifesto::after {
          content: '';
          position: absolute;
          bottom: -10%; left: -10%;
          width: 60%; height: 70%;
          background: radial-gradient(circle, rgba(10,168,159,0.14), transparent 65%);
          filter: blur(70px);
          pointer-events: none;
        }
        .fv2-manifesto-grid {
          display: grid;
          grid-template-columns: 1.4fr 1fr;
          gap: 64px;
          align-items: end;
        }
        .fv2-manifesto-h2 {
          font-size: clamp(44px, 7vw, 88px);
          font-weight: 900;
          letter-spacing: -0.05em;
          line-height: 0.96;
          color: #fff;
          margin: 22px 0 32px;
          max-width: 880px;
        }
        .fv2-manifesto-h2 .accent {
          background: linear-gradient(135deg, #FFD9A8 0%, #FF9D5A 40%, #E8742B 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        .fv2-manifesto-body {
          font-size: 17px;
          line-height: 1.65;
          color: rgba(255,255,255,0.72);
          margin: 0;
        }
        .fv2-manifesto-side {
          position: relative;
          padding: 28px 28px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.10);
          border-radius: 18px;
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
        }
        .fv2-manifesto-side-label {
          font-size: 10.5px; font-weight: 800;
          color: #5EEAD4;
          letter-spacing: 0.20em; text-transform: uppercase;
          margin: 0 0 12px;
        }
        .fv2-manifesto-side-title {
          font-size: 15px; font-weight: 800;
          color: #fff;
          margin: 0 0 8px;
        }
        .fv2-manifesto-side-body {
          font-size: 13px;
          color: rgba(255,255,255,0.60);
          line-height: 1.55;
          margin: 0;
        }

        /* ── 4. HOW IT WORKS — 3 column process ──────────────── */
        .fv2-how {
          position: relative;
          padding: 112px 0 104px;
          background: #FFF8F0;
        }
        .fv2-how-head { text-align: center; max-width: 720px; margin: 0 auto 64px; }
        .fv2-how-h2 {
          font-size: clamp(34px, 4.2vw, 50px);
          font-weight: 900;
          letter-spacing: -0.035em;
          line-height: 1.05;
          color: #0B1F3A;
          margin: 12px 0 14px;
        }
        .fv2-how-sub {
          font-size: 16px;
          color: #4A6670;
          line-height: 1.6;
          margin: 0;
        }
        .fv2-how-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
          position: relative;
        }
        /* Connector lines between steps */
        .fv2-how-grid::before {
          content: '';
          position: absolute;
          top: 38px; left: 16%; right: 16%; height: 1px;
          background: repeating-linear-gradient(90deg, rgba(232,116,43,0.35) 0 6px, transparent 6px 14px);
          z-index: 0;
        }
        .fv2-how-card {
          position: relative;
          padding: 32px 28px 30px;
          background: #fff;
          border-radius: 20px;
          border: 1px solid rgba(232,116,43,0.14);
          box-shadow: 0 14px 36px -12px rgba(11,31,58,0.12);
          z-index: 1;
          transition: transform 0.32s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.32s, border-color 0.32s;
        }
        .fv2-how-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 24px 52px -12px rgba(11,31,58,0.18);
          border-color: rgba(232,116,43,0.40);
        }
        .fv2-how-num {
          display: inline-flex; align-items: center; justify-content: center;
          width: 44px; height: 44px;
          background: linear-gradient(135deg, #FF9D5A 0%, #E8742B 55%, #C84B26 100%);
          color: #fff;
          font-size: 13px; font-weight: 900;
          letter-spacing: 0.06em;
          border-radius: 12px;
          box-shadow: 0 10px 22px -8px rgba(232,116,43,0.55);
          margin-bottom: 22px;
        }
        .fv2-how-icon {
          margin-left: auto;
          color: rgba(232,116,43,0.45);
        }
        .fv2-how-top { display: flex; align-items: center; justify-content: space-between; }
        .fv2-how-title {
          font-size: 19px;
          font-weight: 900;
          letter-spacing: -0.025em;
          color: #0B1F3A;
          margin: 0 0 10px;
          line-height: 1.2;
        }
        .fv2-how-card p {
          font-size: 14.5px;
          line-height: 1.6;
          color: #4A6670;
          margin: 0;
        }

        /* ── 5. VISION — short founder quote ─────────────────── */
        .fv2-vision {
          position: relative;
          background: linear-gradient(180deg, #0B1F3A 0%, #050E1F 100%);
          padding: 120px 0;
          overflow: hidden;
        }
        .fv2-vision::before {
          content: '';
          position: absolute;
          top: 0; left: 50%;
          transform: translateX(-50%);
          width: 600px; height: 600px;
          background: radial-gradient(circle, rgba(232,116,43,0.16), transparent 65%);
          filter: blur(80px);
          pointer-events: none;
        }
        .fv2-vision-inner {
          text-align: center;
          max-width: 880px;
          margin: 0 auto;
        }
        .fv2-vision-h2 {
          font-size: clamp(34px, 4.6vw, 56px);
          font-weight: 900;
          letter-spacing: -0.04em;
          line-height: 1.08;
          color: #fff;
          margin: 18px 0 28px;
        }
        .fv2-vision-h2 .accent {
          background: linear-gradient(135deg, #FFD9A8 0%, #FF9D5A 50%, #E8742B 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        .fv2-vision-body {
          font-size: 17px;
          line-height: 1.65;
          color: rgba(255,255,255,0.72);
          max-width: 620px;
          margin: 0 auto 32px;
        }
        .fv2-vision-sig {
          display: inline-flex; align-items: center; gap: 12px;
          padding: 10px 16px 10px 10px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 100px;
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
        }
        .fv2-vision-sig-dot {
          width: 28px; height: 28px;
          border-radius: 50%;
          background: linear-gradient(135deg, #FF9D5A 0%, #E8742B 55%, #C84B26 100%);
          box-shadow: 0 0 18px rgba(232,116,43,0.55);
        }
        .fv2-vision-sig-text {
          font-size: 13px;
          color: rgba(255,255,255,0.78);
          font-weight: 600;
        }
        .fv2-vision-sig-name {
          color: #fff;
          font-weight: 800;
        }

        /* ── 6. CTA ────────────────────────────────────────────── */
        .fv2-cta {
          position: relative;
          padding: 96px 0 104px;
          background: linear-gradient(180deg, #FFF8F0 0%, #FFF1E2 100%);
          text-align: center;
          overflow: hidden;
        }
        .fv2-cta::before {
          content: '';
          position: absolute;
          top: -30%; left: 50%;
          transform: translateX(-50%);
          width: 800px; height: 800px;
          background: radial-gradient(circle, rgba(255,157,90,0.20), transparent 65%);
          filter: blur(60px);
          pointer-events: none;
        }
        .fv2-cta-h2 {
          font-size: clamp(34px, 4.2vw, 50px);
          font-weight: 900;
          letter-spacing: -0.04em;
          line-height: 1.08;
          color: #0B1F3A;
          margin: 0 0 16px;
          max-width: 760px;
          margin-left: auto;
          margin-right: auto;
        }
        .fv2-cta-sub {
          font-size: 17px;
          color: #3D5A62;
          line-height: 1.55;
          max-width: 560px;
          margin: 0 auto 32px;
        }
        .fv2-cta-row { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }

        /* ── Responsive ───────────────────────────────────────── */
        @media (max-width: 1024px) {
          .fv2-hero-grid { grid-template-columns: 1fr; gap: 56px; }
          .fv2-hero-card { max-width: 380px; }
          .fv2-manifesto-grid { grid-template-columns: 1fr; gap: 32px; }
        }
        @media (max-width: 820px) {
          .fv2-shell { padding: 0 22px; }
          .fv2-hero { padding: 56px 0 72px; }
          .fv2-hero-h1 { font-size: clamp(40px, 9vw, 52px); margin: 18px 0 20px; }
          .fv2-hero-sub { font-size: 17px; margin-bottom: 28px; }
          .fv2-hero-card { max-width: 340px; }

          .fv2-moment { padding: 64px 0 80px; }
          .fv2-moment-head { margin-bottom: 40px; }
          .fv2-moment-grid {
            grid-template-columns: 1fr;
            gap: 16px;
          }
          .fv2-moment-card-1, .fv2-moment-card-2, .fv2-moment-card-3,
          .fv2-moment-card-1:hover, .fv2-moment-card-2:hover, .fv2-moment-card-3:hover {
            transform: none;
          }
          .fv2-moment-card:hover { transform: translateY(-4px); }
          .fv2-stat-block { margin-top: 48px; padding: 28px 24px; }
          .fv2-stat-content { grid-template-columns: 1fr; gap: 14px; text-align: left; }

          .fv2-manifesto { padding: 80px 0; }

          .fv2-how { padding: 72px 0 80px; }
          .fv2-how-head { margin-bottom: 36px; }
          .fv2-how-grid { grid-template-columns: 1fr; gap: 14px; }
          .fv2-how-grid::before { display: none; }

          .fv2-vision { padding: 80px 0; }
          .fv2-cta { padding: 64px 0 76px; }
        }
      `}</style>

      {/* ═════════ 1. HERO ═════════ */}
      <section className="fv2-hero">
        <div className="fv2-shell">
          <div className="fv2-hero-grid">

            {/* Left — copy + CTAs */}
            <div>
              <p className="fv2-eyebrow light">Founder · Peter McShane</p>

              <h1 className="fv2-hero-h1">
                Hi, I&rsquo;m Peter,<br />
                and I founded{' '}
                <span className="accent">BellAveGo.</span>
              </h1>

              <p className="fv2-hero-sub">
                I&rsquo;m building an AI operating layer for home service businesses &mdash; starting with the call they always miss, then turning every conversation into revenue intelligence.
              </p>

              <div className="fv2-hero-ctas">
                <Link href="/pricing" className="fv2-btn-primary">
                  Try BellAveGo
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </Link>
                <a href="tel:+16514677829" className="fv2-btn-ghost">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  Hear the AI &middot; (651) 467-7829
                </a>
              </div>

              <p className="fv2-credibility">
                Built for home service businesses losing revenue to missed calls.
              </p>
            </div>

            {/* Right — cinematic founder card. Drop /public/peter.png to
                replace the dark card with your photo; until then the
                animated gradient + identity overlay is the visual. */}
            <div>
              <div className="fv2-hero-card">
                {/* Subtle grid overlay */}
                <div className="fv2-hero-card-grid" aria-hidden />

                {/* Optional photo — fills via objectFit:cover when present.
                    onError hides the element so the dark card is the
                    intentional visual pre-upload. */}
                <Image
                  src="/peter.png"
                  alt="Peter McShane, founder of BellAveGo"
                  fill
                  sizes="(max-width: 1024px) 380px, 460px"
                  priority
                  className="fv2-hero-card-image"
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />

                {/* Wave silhouette — logo callback */}
                <svg
                  className="fv2-hero-card-wave"
                  viewBox="0 0 460 60"
                  preserveAspectRatio="none"
                  aria-hidden
                >
                  <path d="M0,30 C90,5 180,55 230,28 C290,5 380,50 460,22 L460,60 L0,60 Z" fill="rgba(94,234,212,0.10)" />
                  <path d="M0,30 C90,5 180,55 230,28 C290,5 380,50 460,22" stroke="rgba(94,234,212,0.32)" strokeWidth="1.2" fill="none" />
                </svg>

                {/* Identity overlay */}
                <div className="fv2-hero-card-overlay">
                  <span className="fv2-card-tag">Founder · Est. 2026</span>
                  <div>
                    <p className="fv2-card-name">Peter McShane</p>
                    <p className="fv2-card-role">Founder, BellAveGo</p>
                    <p className="fv2-card-meta">AI for home services</p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ═════════ 2. THE MOMENT ═════════ */}
      <section className="fv2-moment">
        <div className="fv2-shell">
          <div className="fv2-moment-head">
            <p className="fv2-eyebrow light" style={{ justifyContent: 'center', display: 'inline-flex' }}>The moment</p>
            <h2 className="fv2-moment-h2">
              The Saturday afternoon that became a company.
            </h2>
          </div>

          <div className="fv2-moment-grid">
            <article className="fv2-moment-card fv2-moment-card-1">
              <div className="fv2-moment-meta">
                <span className="fv2-moment-num">01 / 03</span>
                <span>3:42 PM</span>
              </div>
              <h3>Four calls in under an hour.</h3>
              <p>
                I was helping my friend Joe finish a garage on a Saturday. His phone wouldn&rsquo;t stop ringing.
              </p>
              <span className="fv2-moment-stat">4 calls · 1 hour</span>
            </article>

            <article className="fv2-moment-card fv2-moment-card-2">
              <div className="fv2-moment-meta">
                <span className="fv2-moment-num">02 / 03</span>
                <span>4:18 PM</span>
              </div>
              <h3>He couldn&rsquo;t stop working to answer.</h3>
              <p>
                Two went to voicemail. One he caught long enough to say <em>&ldquo;I&rsquo;ll call you back&rdquo;</em> &mdash; then forgot. The fourth he answered, but had to stop the job to schedule.
              </p>
              <span className="fv2-moment-stat">3 jobs lost · Before lunch</span>
            </article>

            <article className="fv2-moment-card fv2-moment-card-3">
              <div className="fv2-moment-meta">
                <span className="fv2-moment-num">03 / 03</span>
                <span>11:04 PM</span>
              </div>
              <h3>That became BellAveGo.</h3>
              <p>
                I went home that night and started building. Every contractor I&rsquo;ve talked to since tells the same story.
              </p>
              <span className="fv2-moment-stat">Same story · Every contractor</span>
            </article>
          </div>

          {/* Premium stat block */}
          <div className="fv2-stat-block">
            <div className="fv2-stat-content">
              <div className="fv2-stat-num">$5,800</div>
              <div>
                <p className="fv2-stat-label-top">What it actually costs</p>
                <p className="fv2-stat-label-main">Walking out the door every month.</p>
                <p className="fv2-stat-label-sub">$480 average ticket &middot; 35% close rate &middot; 8 missed calls per week.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═════════ 3. MANIFESTO ═════════ */}
      <section className="fv2-manifesto">
        <div className="fv2-shell">
          <div className="fv2-manifesto-grid">
            <div>
              <p className="fv2-eyebrow dark">Why we exist</p>
              <h2 className="fv2-manifesto-h2">
                The receptionist<br />
                is not the product.<br />
                <span className="accent">The product is knowing exactly where your business is losing revenue.</span>
              </h2>
              <p className="fv2-manifesto-body">
                Most AI receptionist startups think the product is call answering. It isn&rsquo;t. Call answering is how we collect the data. What we do with that data &mdash; pattern detection, opportunity scoring, dollar-quantified diagnostics &mdash; is the part nobody else is building, and the only reason BellAveGo will exist in five years.
              </p>
            </div>

            <div className="fv2-manifesto-side">
              <p className="fv2-manifesto-side-label">Operating system, not a tool</p>
              <p className="fv2-manifesto-side-title">Every missed call is operational data.</p>
              <p className="fv2-manifesto-side-body">
                When a homeowner calls and nobody picks up, that&rsquo;s not a missed lead &mdash; it&rsquo;s a signal about your capacity, your hours, your service mix, and your competitors. BellAveGo turns that signal into a number.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═════════ 4. HOW IT WORKS ═════════ */}
      <section className="fv2-how">
        <div className="fv2-shell">
          <div className="fv2-how-head">
            <p className="fv2-eyebrow light" style={{ justifyContent: 'center', display: 'inline-flex' }}>How it works</p>
            <h2 className="fv2-how-h2">More than an AI receptionist.</h2>
            <p className="fv2-how-sub">
              Three steps from a missed call to a booked job, a paid invoice, and a quarterly revenue diagnostic.
            </p>
          </div>

          <div className="fv2-how-grid">
            <article className="fv2-how-card">
              <div className="fv2-how-top">
                <div className="fv2-how-num">01</div>
                <svg className="fv2-how-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
              </div>
              <h3 className="fv2-how-title">BellAveGo answers.</h3>
              <p>
                Every call, 24/7. Sub-second pickup, natural voice, your business name, your hours, your services.
              </p>
            </article>

            <article className="fv2-how-card">
              <div className="fv2-how-top">
                <div className="fv2-how-num">02</div>
                <svg className="fv2-how-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="9" y1="13" x2="15" y2="13"/>
                  <line x1="9" y1="17" x2="15" y2="17"/>
                </svg>
              </div>
              <h3 className="fv2-how-title">The AI extracts the data.</h3>
              <p>
                Name, address, problem, urgency, intent, expected job value, customer type. Structured. Searchable. Yours.
              </p>
            </article>

            <article className="fv2-how-card">
              <div className="fv2-how-top">
                <div className="fv2-how-num">03</div>
                <svg className="fv2-how-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <line x1="18" y1="20" x2="18" y2="10"/>
                  <line x1="12" y1="20" x2="12" y2="4"/>
                  <line x1="6"  y1="20" x2="6"  y2="14"/>
                </svg>
              </div>
              <h3 className="fv2-how-title">You get the booked job &mdash; and the insight.</h3>
              <p>
                Appointment on your calendar in 90 seconds. Quarterly revenue diagnostic showing exactly where the money is.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* ═════════ 5. VISION ═════════ */}
      <section className="fv2-vision">
        <div className="fv2-shell">
          <div className="fv2-vision-inner">
            <p className="fv2-eyebrow dark" style={{ justifyContent: 'center', display: 'inline-flex' }}>The vision</p>
            <h2 className="fv2-vision-h2">
              We&rsquo;re building the operating system{' '}
              <span className="accent">for home services.</span>
            </h2>
            <p className="fv2-vision-body">
              The trades run on phone calls, hand-written invoices, and intuition. We think every one of those moments is operational data &mdash; and that the businesses who turn it into intelligence first will own the next decade of the industry.
            </p>
            <div className="fv2-vision-sig">
              <span className="fv2-vision-sig-dot" />
              <span className="fv2-vision-sig-text">
                &mdash; <span className="fv2-vision-sig-name">Peter McShane</span>, Founder
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ═════════ 6. CTA ═════════ */}
      <section className="fv2-cta">
        <div className="fv2-shell">
          <h2 className="fv2-cta-h2">You don&rsquo;t have to trust me. Trust the AI.</h2>
          <p className="fv2-cta-sub">
            Call <a href="tel:+16514677829" style={{ color: '#C84B26', fontWeight: 800, textDecoration: 'none' }}>(651) 467-7829</a>. Tell it your AC is broken. If the AI doesn&rsquo;t capture the lead in 60 seconds, BellAveGo isn&rsquo;t ready for you.
          </p>
          <div className="fv2-cta-row">
            <a href="tel:+16514677829" className="fv2-btn-primary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              Call the AI &middot; (651) 467-7829
            </a>
            <Link href="/pricing" className="fv2-btn-ghost">
              See pricing
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: '32px 40px', background: '#FFF7EE', borderTop: '1px solid rgba(232,116,43,0.18)', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 12, color: '#7AAAB2' }}>
          BellAveGo &middot; Built by Peter McShane &middot; <a href="mailto:peter@bellavego.com" style={{ color: '#C84B26', textDecoration: 'none', fontWeight: 700 }}>peter@bellavego.com</a>
        </p>
      </footer>
    </main>
  )
}
