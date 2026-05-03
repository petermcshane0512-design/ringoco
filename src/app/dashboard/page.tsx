"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function IconDollar() {
  return (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    </svg>
  );
}

function IconZap() {
  return (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}

function IconPhone() {
  return (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconCircle() {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

function IconArrowRight() {
  return (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function IconActivity() {
  return (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function IconBot() {
  return (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <path d="M12 11V7" />
      <circle cx="12" cy="5" r="2" />
      <line x1="8" y1="15" x2="8" y2="15" strokeWidth="3" strokeLinecap="round" />
      <line x1="12" y1="15" x2="12" y2="15" strokeWidth="3" strokeLinecap="round" />
      <line x1="16" y1="15" x2="16" y2="15" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 38;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <svg width="100" height="100" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r={r} fill="none" stroke="#E2E8F0" strokeWidth="8" />
      <circle
        cx="50" cy="50" r={r} fill="none"
        stroke="#2563EB" strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        transform="rotate(-90 50 50)"
        style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)" }}
      />
      <text x="50" y="46" textAnchor="middle" fontSize="18" fontWeight="700" fill="#0F172A" fontFamily="'DM Sans', sans-serif">{score}</text>
      <text x="50" y="60" textAnchor="middle" fontSize="10" fill="#94A3B8" fontFamily="'DM Sans', sans-serif">/100</text>
    </svg>
  );
}

function KpiCard({
  label,
  value,
  helper,
  icon,
  accent,
  delay,
}: {
  label: string;
  value: string;
  helper: string;
  icon: React.ReactNode;
  accent: string;
  delay: string;
}) {
  return (
    <div className="kpi-card" style={{ animationDelay: delay }}>
      <div className="kpi-icon" style={{ background: accent + "18", color: accent }}>
        {icon}
      </div>
      <p className="kpi-label">{label}</p>
      <p className="kpi-value">{value}</p>
      <p className="kpi-helper">{helper}</p>
      <div className="kpi-glow" style={{ background: accent }} />
    </div>
  );
}

function OnboardStep({
  done,
  title,
  desc,
  href,
  btnLabel,
}: {
  done: boolean;
  title: string;
  desc: string;
  href: string;
  btnLabel: string;
}) {
  return (
    <div className={`onboard-step ${done ? "done" : ""}`}>
      <div className={`step-check ${done ? "checked" : ""}`}>
        {done ? <IconCheck /> : <IconCircle />}
      </div>
      <div className="step-text">
        <p className="step-title">{title}</p>
        <p className="step-desc">{desc}</p>
      </div>
      {!done && (
        <Link href={href} className="step-btn">
          {btnLabel} <IconArrowRight />
        </Link>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const [counts, setCounts] = useState({ jobs: 0, customers: 0 });

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  useEffect(() => {
    (async () => {
      const [{ count: jobs }, { count: customers }] = await Promise.all([
        supabase.from("jobs").select("*", { count: "exact", head: true }),
        supabase.from("customers").select("*", { count: "exact", head: true }),
      ]);
      setCounts({ jobs: jobs || 0, customers: customers || 0 });
    })();
  }, []);

  const steps = [
    {
      title: "Add your first customer",
      desc: "Start building your customer database.",
      href: "/dashboard/customers",
      btnLabel: "Add customer",
      done: counts.customers > 0,
    },
    {
      title: "Set your availability",
      desc: "Tell BellAveGo when you can accept jobs.",
      href: "/dashboard/scheduling",
      btnLabel: "Set hours",
      done: false,
    },
    {
      title: "Connect your AI receptionist",
      desc: "Answer every call automatically, 24/7.",
      href: "/dashboard/receptionist",
      btnLabel: "Connect now",
      done: false,
    },
    {
      title: "Create your first job",
      desc: "Schedule a job and start earning.",
      href: "/dashboard/jobs",
      btnLabel: "Create job",
      done: counts.jobs > 0,
    },
  ];

  const stepsComplete = steps.filter((s) => s.done).length;
  const progressPct = (stepsComplete / steps.length) * 100;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');

        .dash-root {
          font-family: 'DM Sans', sans-serif;
          background: #F1F5F9;
          min-height: 100vh;
          padding: 28px 32px 60px;
          color: #0F172A;
        }

        @media (max-width: 768px) {
          .dash-root { padding: 16px 16px 48px; }
        }

        .dash-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 28px;
          gap: 16px;
          flex-wrap: wrap;
        }

        .dash-date {
          font-size: 11px;
          font-weight: 500;
          color: #94A3B8;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: 4px;
        }

        .dash-title {
          font-size: 26px;
          font-weight: 700;
          color: #0B1F3A;
          line-height: 1.15;
        }

        .dash-sub {
          font-size: 13.5px;
          color: #64748B;
          margin-top: 3px;
        }

        .header-btns {
          display: flex;
          gap: 10px;
          flex-shrink: 0;
        }

        .btn-primary {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #2563EB;
          color: #fff;
          font-size: 13px;
          font-weight: 600;
          padding: 9px 18px;
          border-radius: 10px;
          border: none;
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          transition: background 0.15s, transform 0.12s;
          text-decoration: none;
        }

        .btn-primary:hover {
          background: #1D4ED8;
          transform: translateY(-1px);
        }

        .btn-ghost {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #fff;
          color: #0F172A;
          font-size: 13px;
          font-weight: 600;
          padding: 9px 18px;
          border-radius: 10px;
          border: 1.5px solid #E2E8F0;
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          transition: border-color 0.15s, transform 0.12s;
          text-decoration: none;
        }

        .btn-ghost:hover {
          border-color: #94A3B8;
          transform: translateY(-1px);
        }

        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          margin-bottom: 24px;
        }

        @media (max-width: 1024px) {
          .kpi-grid { grid-template-columns: repeat(2, 1fr); }
        }

        @media (max-width: 600px) {
          .kpi-grid { grid-template-columns: 1fr; }
        }

        .kpi-card {
          background: #fff;
          border-radius: 16px;
          padding: 22px 20px;
          border: 1.5px solid #E8EEF6;
          position: relative;
          overflow: hidden;
          animation: slideUp 0.45s ease both;
          transition: box-shadow 0.2s, transform 0.2s;
        }

        .kpi-card:hover {
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.07);
          transform: translateY(-2px);
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .kpi-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 14px;
        }

        .kpi-label {
          font-size: 11px;
          font-weight: 600;
          color: #94A3B8;
          text-transform: uppercase;
          letter-spacing: 0.07em;
          margin-bottom: 4px;
        }

        .kpi-value {
          font-size: 32px;
          font-weight: 700;
          color: #0B1F3A;
          line-height: 1;
          margin-bottom: 6px;
          font-variant-numeric: tabular-nums;
        }

        .kpi-helper {
          font-size: 12px;
          color: #94A3B8;
          line-height: 1.45;
        }

        .kpi-glow {
          position: absolute;
          bottom: -20px;
          right: -20px;
          width: 80px;
          height: 80px;
          border-radius: 50%;
          opacity: 0.06;
          filter: blur(12px);
        }

        .main-grid {
          display: grid;
          grid-template-columns: 1fr 360px;
          gap: 20px;
          align-items: start;
        }

        @media (max-width: 1100px) {
          .main-grid { grid-template-columns: 1fr; }
        }

        .left-col { display: flex; flex-direction: column; gap: 20px; }
        .right-col { display: flex; flex-direction: column; gap: 20px; }

        .card {
          background: #fff;
          border-radius: 16px;
          border: 1.5px solid #E8EEF6;
          overflow: hidden;
          animation: slideUp 0.5s ease both;
        }

        .card-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 22px;
          border-bottom: 1px solid #F1F5F9;
        }

        .card-title {
          font-size: 14px;
          font-weight: 700;
          color: #0B1F3A;
        }

        .card-badge {
          font-size: 11px;
          font-weight: 600;
          padding: 3px 10px;
          border-radius: 20px;
        }

        .card-body { padding: 22px; }

        .onboard-bar-wrap { margin-bottom: 20px; }

        .onboard-bar-label {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: #64748B;
          margin-bottom: 8px;
        }

        .onboard-bar-track {
          height: 6px;
          background: #E2E8F0;
          border-radius: 99px;
          overflow: hidden;
        }

        .onboard-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #22C55E, #16A34A);
          border-radius: 99px;
          transition: width 1s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .onboard-step {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px 0;
          border-bottom: 1px solid #F8FAFC;
        }

        .onboard-step:last-child { border-bottom: none; }
        .onboard-step.done { opacity: 0.55; }

        .step-check {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid #CBD5E1;
          color: #CBD5E1;
          transition: all 0.2s;
        }

        .step-check.checked {
          background: #22C55E;
          border-color: #22C55E;
          color: #fff;
        }

        .step-text { flex: 1; min-width: 0; }

        .step-title {
          font-size: 13.5px;
          font-weight: 600;
          color: #0F172A;
        }

        .step-desc {
          font-size: 12px;
          color: #94A3B8;
          margin-top: 2px;
        }

        .step-btn {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 12px;
          font-weight: 600;
          color: #2563EB;
          background: #EFF6FF;
          padding: 6px 12px;
          border-radius: 8px;
          white-space: nowrap;
          text-decoration: none;
          flex-shrink: 0;
          transition: background 0.15s;
        }

        .step-btn:hover { background: #DBEAFE; }

        .empty-state {
          text-align: center;
          padding: 36px 20px;
        }

        .empty-icon {
          width: 48px;
          height: 48px;
          background: #F1F5F9;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 14px;
          color: #94A3B8;
        }

        .empty-title {
          font-size: 14px;
          font-weight: 600;
          color: #475569;
          margin-bottom: 6px;
        }

        .empty-sub {
          font-size: 12.5px;
          color: #94A3B8;
          line-height: 1.5;
          max-width: 280px;
          margin: 0 auto 18px;
        }

        .ai-status-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 0;
          border-bottom: 1px solid #F8FAFC;
        }

        .ai-status-row:last-of-type { border-bottom: none; }

        .ai-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .ai-stat-label {
          font-size: 12px;
          color: #64748B;
          flex: 1;
        }

        .ai-stat-val {
          font-size: 13px;
          font-weight: 600;
          color: #0F172A;
        }

        .ai-cta {
          width: 100%;
          margin-top: 16px;
          background: linear-gradient(135deg, #0B1F3A, #1E3A5F);
          color: #fff;
          font-size: 13px;
          font-weight: 700;
          padding: 12px;
          border-radius: 12px;
          border: none;
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          transition: opacity 0.15s, transform 0.12s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          text-decoration: none;
        }

        .ai-cta:hover {
          opacity: 0.9;
          transform: translateY(-1px);
        }

        .ai-cta-helper {
          font-size: 11.5px;
          color: #94A3B8;
          line-height: 1.5;
          margin-top: 10px;
          text-align: center;
        }

        .score-inner {
          display: flex;
          align-items: center;
          gap: 20px;
          margin-bottom: 18px;
        }

        .score-text h3 {
          font-size: 22px;
          font-weight: 700;
          color: #0B1F3A;
        }

        .score-text p {
          font-size: 12px;
          color: #64748B;
          margin-top: 4px;
          line-height: 1.5;
        }

        .score-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 0;
          border-bottom: 1px solid #F8FAFC;
        }

        .score-item:last-child { border-bottom: none; }

        .score-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #E2E8F0;
          flex-shrink: 0;
        }

        .score-item-text {
          font-size: 12.5px;
          color: #475569;
          flex: 1;
        }

        .score-item-link {
          font-size: 12px;
          font-weight: 600;
          color: #2563EB;
          text-decoration: none;
        }

        .score-item-link:hover { text-decoration: underline; }
      `}</style>

      <div className="dash-root">
        {/* Header */}
        <div className="dash-header">
          <div>
            <p className="dash-date">{today}</p>
            <h1 className="dash-title">Command Center</h1>
            <p className="dash-sub">Track calls, jobs, customers, and revenue — all in one place.</p>
          </div>
          <div className="header-btns">
            <Link href="/dashboard/customers" className="btn-ghost">
              <IconPlus /> Add Customer
            </Link>
            <Link href="/dashboard/jobs" className="btn-primary">
              <IconPlus /> Create Job
            </Link>
          </div>
        </div>

        {/* KPI row */}
        <div className="kpi-grid">
          <KpiCard
            label="Revenue this month"
            value="$0"
            helper="Start booking jobs to generate revenue"
            icon={<IconDollar />}
            accent="#22C55E"
            delay="0ms"
          />
          <KpiCard
            label="New leads today"
            value="0"
            helper="Calls captured by your AI receptionist"
            icon={<IconZap />}
            accent="#F59E0B"
            delay="60ms"
          />
          <KpiCard
            label="Jobs scheduled today"
            value="0"
            helper="Upcoming work on your calendar"
            icon={<IconCalendar />}
            accent="#2563EB"
            delay="120ms"
          />
          <KpiCard
            label="Total customers"
            value={String(counts.customers)}
            helper="Contacts in your customer list"
            icon={<IconUsers />}
            accent="#8B5CF6"
            delay="180ms"
          />
        </div>

        {/* Main grid */}
        <div className="main-grid">

          {/* Left column */}
          <div className="left-col">

            {/* Onboarding card */}
            <div className="card" style={{ animationDelay: "200ms" }}>
              <div className="card-head">
                <div>
                  <p className="card-title">Launch your AI-powered service desk</p>
                  <p style={{ fontSize: 12, color: "#94A3B8", marginTop: 3 }}>
                    Complete these steps to start capturing leads automatically.
                  </p>
                </div>
                <span
                  className="card-badge"
                  style={{
                    background: stepsComplete === 4 ? "#DCFCE7" : "#FEF3C7",
                    color: stepsComplete === 4 ? "#15803D" : "#92400E",
                  }}
                >
                  {stepsComplete}/4 done
                </span>
              </div>
              <div className="card-body">
                <div className="onboard-bar-wrap">
                  <div className="onboard-bar-label">
                    <span>Setup progress</span>
                    <span style={{ fontWeight: 600, color: "#0F172A" }}>{Math.round(progressPct)}%</span>
                  </div>
                  <div className="onboard-bar-track">
                    <div className="onboard-bar-fill" style={{ width: `${progressPct}%` }} />
                  </div>
                </div>
                {steps.map((s) => (
                  <OnboardStep key={s.href} {...s} />
                ))}
              </div>
            </div>

            {/* Today's schedule */}
            <div className="card" style={{ animationDelay: "260ms" }}>
              <div className="card-head">
                <p className="card-title">Today's Schedule</p>
                <Link href="/dashboard/jobs" className="step-btn" style={{ fontSize: 12 }}>
                  View all
                </Link>
              </div>
              <div className="empty-state">
                <div className="empty-icon">
                  <IconCalendar />
                </div>
                <p className="empty-title">No jobs scheduled today</p>
                <p className="empty-sub">
                  Once you create jobs, they'll appear here with customer name, time, service type, and status.
                </p>
                <Link href="/dashboard/jobs" className="btn-primary" style={{ display: "inline-flex", fontSize: 12 }}>
                  <IconPlus /> Create a job
                </Link>
              </div>
            </div>

            {/* Recent activity */}
            <div className="card" style={{ animationDelay: "320ms" }}>
              <div className="card-head">
                <p className="card-title">Recent Activity</p>
              </div>
              <div className="card-body">
                <div className="empty-state" style={{ padding: "16px 0 0" }}>
                  <div className="empty-icon">
                    <IconActivity />
                  </div>
                  <p className="empty-title">No activity yet</p>
                  <p className="empty-sub">
                    Calls, customer updates, and job changes will appear here in real-time.
                  </p>
                </div>
              </div>
            </div>

          </div>

          {/* Right column */}
          <div className="right-col">

            {/* AI Receptionist */}
            <div className="card" style={{ animationDelay: "220ms", border: "1.5px solid #DBEAFE" }}>
              <div className="card-head" style={{ background: "linear-gradient(135deg, #EFF6FF, #F0F9FF)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: "#2563EB",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                    }}
                  >
                    <IconBot />
                  </div>
                  <div>
                    <p className="card-title">AI Receptionist</p>
                    <p style={{ fontSize: 11, color: "#64748B" }}>Your 24/7 call handler</p>
                  </div>
                </div>
                <span className="card-badge" style={{ background: "#FEE2E2", color: "#DC2626" }}>
                  Offline
                </span>
              </div>
              <div className="card-body">
                <div className="ai-status-row">
                  <div className="ai-dot" style={{ background: "#E2E8F0" }} />
                  <span className="ai-stat-label">Status</span>
                  <span className="ai-stat-val" style={{ color: "#94A3B8" }}>Not connected</span>
                </div>
                <div className="ai-status-row">
                  <div className="ai-dot" style={{ background: "#E2E8F0" }} />
                  <span className="ai-stat-label">Phone number</span>
                  <span className="ai-stat-val" style={{ color: "#94A3B8" }}>Not assigned</span>
                </div>
                <div className="ai-status-row">
                  <div className="ai-dot" style={{ background: "#E2E8F0" }} />
                  <span className="ai-stat-label">Calls handled today</span>
                  <span className="ai-stat-val">0</span>
                </div>
                <div className="ai-status-row">
                  <div className="ai-dot" style={{ background: "#E2E8F0" }} />
                  <span className="ai-stat-label">Missed calls recovered</span>
                  <span className="ai-stat-val">0</span>
                </div>
                <Link href="/dashboard/receptionist" className="ai-cta">
                  <IconPhone /> Turn on AI Receptionist
                </Link>
                <p className="ai-cta-helper">
                  Answer every call automatically — capture leads and book jobs while you work.
                </p>
              </div>
            </div>

            {/* Business Score */}
            <div className="card" style={{ animationDelay: "280ms" }}>
              <div className="card-head">
                <p className="card-title">Business Score</p>
                <span className="card-badge" style={{ background: "#FEF3C7", color: "#92400E" }}>
                  Needs setup
                </span>
              </div>
              <div className="card-body">
                <div className="score-inner">
                  <ScoreRing score={12} />
                  <div className="score-text">
                    <h3>12 / 100</h3>
                    <p>You're not fully set up yet. Connect your receptionist to start growing.</p>
                  </div>
                </div>
                <div className="score-item">
                  <div className="score-dot" />
                  <span className="score-item-text">Set your availability hours</span>
                  <Link href="/dashboard/scheduling" className="score-item-link">Fix →</Link>
                </div>
                <div className="score-item">
                  <div className="score-dot" />
                  <span className="score-item-text">Add your first customers</span>
                  <Link href="/dashboard/customers" className="score-item-link">Fix →</Link>
                </div>
                <div className="score-item">
                  <div className="score-dot" />
                  <span className="score-item-text">Turn on AI receptionist</span>
                  <Link href="/dashboard/receptionist" className="score-item-link">Fix →</Link>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}