"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function ScoreRing({ score }: { score: number }) {
  const r = 30;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <svg width="72" height="72" viewBox="0 0 72 72">
      <circle cx="36" cy="36" r={r} fill="none" stroke="#0F2040" strokeWidth="6" />
      <circle cx="36" cy="36" r={r} fill="none" stroke="#0369A1" strokeWidth="6"
        strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
        transform="rotate(-90 36 36)"
        style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)" }}
      />
      <text x="36" y="33" textAnchor="middle" fontSize="15" fontWeight="700" fill="#F1F5F9" fontFamily="system-ui">{score}</text>
      <text x="36" y="47" textAnchor="middle" fontSize="10" fill="#334155" fontFamily="system-ui">/100</text>
    </svg>
  );
}

export default function DashboardPage() {
  const [counts, setCounts] = useState({ jobs: 0, customers: 0 });

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
    { title: "Add your first customer", hint: "Build your contact database", href: "/dashboard/customers", done: counts.customers > 0 },
    { title: "Set your availability", hint: "Define when you accept jobs", href: "/dashboard/scheduling", done: false },
    { title: "Connect AI receptionist", hint: "Answer every missed call, 24/7", href: "/dashboard/receptionist", done: false },
    { title: "Create your first job", hint: "Schedule work and start billing", href: "/dashboard/jobs", done: counts.jobs > 0 },
  ];

  const stepsComplete = steps.filter((s) => s.done).length;
  const progressPct = (stepsComplete / steps.length) * 100;

  const card: React.CSSProperties = { background: "#060E1C", border: "1px solid #0F2040", borderRadius: 12, overflow: "hidden" };
  const cardHead: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid #0F2040" };
  const cardTitle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: "#CBD5E1" };
  const cardBody: React.CSSProperties = { padding: 18 };
  const badgeWarn: React.CSSProperties = { fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 20, background: "#1C1200", color: "#F59E0B", border: "1px solid #713F12" };
  const badgeOff: React.CSSProperties = { fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 20, background: "#150505", color: "#F87171", border: "1px solid #7F1D1D" };
  const emptyBox: React.CSSProperties = { textAlign: "center", padding: "28px 20px" };
  const emptyIcon: React.CSSProperties = { width: 38, height: 38, background: "#0A1828", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", color: "#1E3A5F" };
  const emptyTitle: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: "#475569", marginBottom: 4 };
  const emptySub: React.CSSProperties = { fontSize: 12, color: "#334155", lineHeight: 1.5, maxWidth: 220, margin: "0 auto 14px" };
  const ctaSm: React.CSSProperties = { fontSize: 12, fontWeight: 600, background: "#0C1F3D", border: "1px solid #1E3A5F", color: "#38BDF8", padding: "7px 14px", borderRadius: 8, display: "inline-flex", alignItems: "center", gap: 5, textDecoration: "none" };
  const statRow: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #0A1828" };
  const statDot: React.CSSProperties = { width: 6, height: 6, borderRadius: "50%", background: "#1E3A5F", flexShrink: 0, marginRight: 10 };
  const statLabel: React.CSSProperties = { fontSize: 12, color: "#475569", flex: 1 };
  const statVal: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#94A3B8" };
  const fixRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid #0A1828" };

  const metrics = [
    { label: "Revenue · May", value: "$0", change: "No jobs yet", iconBg: "#051A0D", iconColor: "#4ADE80", accent: "#166534",
      icon: <><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></> },
    { label: "Leads Today", value: "0", change: "Receptionist offline", iconBg: "#171200", iconColor: "#F59E0B", accent: "#713F12",
      icon: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /> },
    { label: "Scheduled Today", value: "0", change: "Calendar clear", iconBg: "#071530", iconColor: "#38BDF8", accent: "#0C4A6E",
      icon: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></> },
    { label: "Total Customers", value: String(counts.customers), change: counts.customers > 0 ? `${counts.customers} contact${counts.customers !== 1 ? "s" : ""}` : "Add your first", iconBg: "#150E2A", iconColor: "#A78BFA", accent: "#5B21B6",
      icon: <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></> },
  ];

  return (
    <div style={{ padding: "24px 28px 60px", color: "#E2E8F0", fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* Metrics row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20 }}>
        {metrics.map((m) => (
          <div key={m.label} style={{ background: "#060E1C", border: "1px solid #0F2040", borderRadius: 12, padding: "18px 20px", position: "relative", overflow: "hidden" }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "#334155", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              {m.label}
              <div style={{ width: 28, height: 28, borderRadius: 7, background: m.iconBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={m.iconColor} strokeWidth="2">{m.icon}</svg>
              </div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#F1F5F9", letterSpacing: -1, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{m.value}</div>
            <div style={{ fontSize: 11, marginTop: 6, color: "#475569" }}>{m.change}</div>
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,${m.accent},${m.accent}00)` }} />
          </div>
        ))}
      </div>

      {/* Two-col */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, alignItems: "start" }}>

        {/* Left */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Checklist */}
          <div style={card}>
            <div style={cardHead}>
              <div>
                <div style={cardTitle}>Launch checklist</div>
                <div style={{ fontSize: 11, color: "#334155", marginTop: 2 }}>Complete setup to start capturing leads automatically</div>
              </div>
              <span style={stepsComplete === 4 ? { ...badgeWarn, background: "#051A0D", color: "#4ADE80", borderColor: "#14532D" } : badgeWarn}>
                {stepsComplete} / 4 done
              </span>
            </div>
            <div style={cardBody}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 6 }}>
                  <span style={{ color: "#475569" }}>Setup progress</span>
                  <span style={{ fontWeight: 600, color: "#94A3B8" }}>{Math.round(progressPct)}%</span>
                </div>
                <div style={{ height: 4, background: "#0F2040", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${progressPct}%`, borderRadius: 99, background: "linear-gradient(90deg,#22C55E,#16A34A)", transition: "width 1.2s cubic-bezier(.4,0,.2,1)" }} />
                </div>
              </div>
              {steps.map((s) => (
                <div key={s.href} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: "1px solid #0A1828", opacity: s.done ? 0.45 : 1 }}>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", background: s.done ? "#0C3320" : "transparent", border: `1.5px solid ${s.done ? "#166534" : "#1E3A5F"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: s.done ? "#4ADE80" : "#334155" }}>
                    {s.done
                      ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                      : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /></svg>
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500, color: "#CBD5E1" }}>{s.title}</div>
                    <div style={{ fontSize: 11, color: "#334155", marginTop: 1 }}>{s.hint}</div>
                  </div>
                  {!s.done && (
                    <Link href={s.href} style={{ fontSize: 11, fontWeight: 600, color: "#38BDF8", background: "#071530", border: "1px solid #0C4A6E", padding: "4px 10px", borderRadius: 6, whiteSpace: "nowrap", textDecoration: "none", flexShrink: 0 }}>
                      Go →
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Today's schedule */}
          <div style={card}>
            <div style={cardHead}>
              <div style={cardTitle}>Today&apos;s schedule</div>
              <Link href="/dashboard/jobs" style={{ fontSize: 11, fontWeight: 600, color: "#38BDF8", textDecoration: "none" }}>View all →</Link>
            </div>
            <div style={emptyBox}>
              <div style={emptyIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
              </div>
              <div style={emptyTitle}>No jobs today</div>
              <div style={emptySub}>Jobs appear here once your AI starts booking or you add them manually.</div>
              <Link href="/dashboard/jobs" style={ctaSm}>+ Create a job</Link>
            </div>
          </div>

          {/* Recent activity */}
          <div style={card}>
            <div style={cardHead}>
              <div style={cardTitle}>Recent activity</div>
            </div>
            <div style={{ ...emptyBox, padding: 20 }}>
              <div style={emptyIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
              </div>
              <div style={emptyTitle}>No activity yet</div>
              <div style={emptySub}>Calls, job updates, and customer events show up here in real time.</div>
            </div>
          </div>

        </div>

        {/* Right */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* AI Receptionist */}
          <div style={{ ...card, borderColor: "#0C2A40" }}>
            <div style={{ background: "#070F20", padding: "16px 18px", borderBottom: "1px solid #0F2040", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: "linear-gradient(135deg,#0C4A6E,#075985)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7DD3FC" strokeWidth="1.8">
                    <rect x="3" y="11" width="18" height="10" rx="2" />
                    <path d="M12 11V7" />
                    <circle cx="12" cy="5" r="2" />
                    <line x1="8" y1="15" x2="8" y2="15" strokeWidth="3" strokeLinecap="round" />
                    <line x1="12" y1="15" x2="12" y2="15" strokeWidth="3" strokeLinecap="round" />
                    <line x1="16" y1="15" x2="16" y2="15" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <div style={cardTitle}>AI Receptionist</div>
                  <div style={{ fontSize: 10, color: "#334155", marginTop: 2 }}>24/7 call handler · (762) 371-3351</div>
                </div>
              </div>
              <span style={badgeOff}>Offline</span>
            </div>
            <div style={cardBody}>
              {[
                { label: "Status", val: "Not connected", muted: true },
                { label: "Approval SMS to", val: "Not set", muted: true },
                { label: "Calls handled today", val: "0", muted: false },
                { label: "Leads captured", val: "0", muted: false },
              ].map((row) => (
                <div key={row.label} style={statRow}>
                  <div style={statDot} />
                  <span style={statLabel}>{row.label}</span>
                  <span style={{ ...statVal, color: row.muted ? "#475569" : "#94A3B8" }}>{row.val}</span>
                </div>
              ))}
              <Link href="/dashboard/receptionist" style={{ width: "100%", marginTop: 14, background: "linear-gradient(135deg,#0369A1,#0284C7)", color: "#fff", fontSize: 12, fontWeight: 700, padding: 11, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, textDecoration: "none" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                </svg>
                Turn on AI Receptionist
              </Link>
              <div style={{ fontSize: 10.5, color: "#334155", textAlign: "center", marginTop: 8, lineHeight: 1.5 }}>
                Never miss a lead — books jobs while you&apos;re on-site
              </div>
            </div>
          </div>

          {/* Business Score */}
          <div style={card}>
            <div style={cardHead}>
              <div>
                <div style={cardTitle}>Business score</div>
                <div style={{ fontSize: 11, color: "#334155", marginTop: 2 }}>How optimized your account is</div>
              </div>
              <span style={badgeWarn}>Needs setup</span>
            </div>
            <div style={cardBody}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
                <ScoreRing score={12} />
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "#334155", marginBottom: 4 }}>Score</div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: "#F1F5F9", lineHeight: 1 }}>
                    12<span style={{ fontSize: 14, color: "#334155", fontWeight: 400 }}> / 100</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#475569", marginTop: 4, lineHeight: 1.4 }}>Set up your receptionist to start growing</div>
                </div>
              </div>
              {[
                { text: "Set availability hours", href: "/dashboard/scheduling" },
                { text: "Add first customers", href: "/dashboard/customers" },
                { text: "Enable AI receptionist", href: "/dashboard/receptionist" },
              ].map((item) => (
                <div key={item.href} style={fixRow}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#1E3A5F", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: "#475569", flex: 1 }}>{item.text}</span>
                  <Link href={item.href} style={{ fontSize: 11, fontWeight: 600, color: "#0EA5E9", textDecoration: "none" }}>Fix →</Link>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}