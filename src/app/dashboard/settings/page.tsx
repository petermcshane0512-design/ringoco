"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function DashboardPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [counts, setCounts] = useState({ jobs: 0, customers: 0 });

  useEffect(() => {
    fetchJobs();
    fetchCounts();
  }, []);

  async function fetchJobs() {
    const { data } = await supabase
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);
    setJobs(data || []);
  }

  async function fetchCounts() {
    const [{ count: jobs }, { count: customers }] = await Promise.all([
      supabase.from("jobs").select("*", { count: "exact", head: true }),
      supabase.from("customers").select("*", { count: "exact", head: true }),
    ]);
    setCounts({ jobs: jobs || 0, customers: customers || 0 });
  }

  async function handleJobAction(id: string, action: "scheduled" | "cancelled") {
    await supabase.from("jobs").update({ status: action }).eq("id", id);
    fetchJobs();
  }

  const card: React.CSSProperties = {
    background: "#060E1C",
    border: "1px solid #0F2040",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 16,
  };
  const cardHead: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 18px",
    borderBottom: "1px solid #0F2040",
  };
  const cardTitle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: "#CBD5E1",
  };
  const cardBody: React.CSSProperties = { padding: 18 };

  const statusBadge = (status: string): React.CSSProperties => {
    const map: Record<string, React.CSSProperties> = {
      pending_approval: { background: "#1C1200", color: "#F59E0B", border: "1px solid #713F12" },
      scheduled: { background: "#051A0D", color: "#4ADE80", border: "1px solid #14532D" },
      cancelled: { background: "#150505", color: "#F87171", border: "1px solid #7F1D1D" },
    };
    return {
      fontSize: 10,
      fontWeight: 600,
      padding: "3px 8px",
      borderRadius: 20,
      ...(map[status] || { background: "#0F2040", color: "#94A3B8", border: "1px solid #1E3A5F" }),
    };
  };

  const metrics = [
    {
      label: "Total Jobs",
      value: String(counts.jobs),
      change: "All time",
      iconBg: "#071530",
      iconColor: "#38BDF8",
      accent: "#0C4A6E",
      icon: <><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></>,
    },
    {
      label: "Pending Approval",
      value: String(jobs.filter(j => j.status === "pending_approval").length),
      change: "Needs your attention",
      iconBg: "#171200",
      iconColor: "#F59E0B",
      accent: "#713F12",
      icon: <><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></>,
    },
    {
      label: "Scheduled",
      value: String(jobs.filter(j => j.status === "scheduled").length),
      change: "Confirmed jobs",
      iconBg: "#051A0D",
      iconColor: "#4ADE80",
      accent: "#166534",
      icon: <><polyline points="20 6 9 17 4 12"/></>,
    },
    {
      label: "Total Customers",
      value: String(counts.customers),
      change: "In your database",
      iconBg: "#150E2A",
      iconColor: "#A78BFA",
      accent: "#5B21B6",
      icon: <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></>,
    },
  ];

  const reports = [
    {
      title: "Q1 2026 Growth Report",
      date: "April 1, 2026",
      status: "delivered",
      desc: "Revenue breakdown, call conversion rate, booking trends, and 90-day action plan.",
    },
    {
      title: "Free Trial Report",
      date: "March 1, 2026",
      status: "delivered",
      desc: "Initial business audit and AI receptionist performance overview.",
    },
  ];

  return (
    <div style={{ padding: "24px 28px 60px", color: "#E2E8F0", fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "#334155", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#F1F5F9", letterSpacing: "-0.5px", marginBottom: 4 }}>Command Center</h1>
        <p style={{ fontSize: 13, color: "#475569" }}>Manage jobs, review reports, and track your business growth.</p>
      </div>

      {/* Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
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

      {/* Jobs */}
      <div style={card}>
        <div style={cardHead}>
          <div>
            <div style={cardTitle}>Jobs</div>
            <div style={{ fontSize: 11, color: "#334155", marginTop: 2 }}>Accept or decline incoming job requests</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {["all", "pending_approval", "scheduled", "cancelled"].map((f) => (
              <button
                key={f}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "4px 10px",
                  borderRadius: 6,
                  border: "1px solid #1E3A5F",
                  background: "transparent",
                  color: "#475569",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {f === "all" ? "All" : f === "pending_approval" ? "Pending" : f === "scheduled" ? "Scheduled" : "Cancelled"}
              </button>
            ))}
          </div>
        </div>
        <div>
          {jobs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 20px" }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "#475569", marginBottom: 4 }}>No jobs yet</div>
              <div style={{ fontSize: 12, color: "#334155" }}>Jobs captured by your AI receptionist will appear here.</div>
            </div>
          ) : (
            jobs.map((job, i) => (
              <div key={job.id} style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "14px 18px",
                borderBottom: i < jobs.length - 1 ? "1px solid #0A1828" : "none",
              }}>
                {/* Avatar */}
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#0C1F3D", border: "1px solid #1E3A5F", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 13, fontWeight: 700, color: "#38BDF8" }}>
                  {(job.customer_name || "?")[0].toUpperCase()}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#CBD5E1", marginBottom: 2 }}>{job.customer_name || "Unknown"}</div>
                  <div style={{ fontSize: 11, color: "#475569" }}>
                    {job.job_type || job.title} · {job.address || "No address"} · {job.scheduled_time || "No time set"}
                  </div>
                </div>

                {/* Phone */}
                <div style={{ fontSize: 11, color: "#334155", flexShrink: 0 }}>{job.customer_phone}</div>

                {/* Status badge */}
                <span style={statusBadge(job.status)}>
                  {job.status === "pending_approval" ? "Pending" : job.status === "scheduled" ? "Scheduled" : job.status === "cancelled" ? "Cancelled" : job.status}
                </span>

                {/* Actions */}
                {job.status === "pending_approval" && (
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => handleJobAction(job.id, "scheduled")}
                      style={{ fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 7, border: "1px solid #14532D", background: "#051A0D", color: "#4ADE80", cursor: "pointer", fontFamily: "inherit" }}
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleJobAction(job.id, "cancelled")}
                      style={{ fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 7, border: "1px solid #7F1D1D", background: "#150505", color: "#F87171", cursor: "pointer", fontFamily: "inherit" }}
                    >
                      Decline
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Consulting Reports */}
      <div style={card}>
        <div style={cardHead}>
          <div>
            <div style={cardTitle}>BellAveGo Consulting Reports</div>
            <div style={{ fontSize: 11, color: "#334155", marginTop: 2 }}>Quarterly growth reports delivered by your BellAveGo advisor</div>
          </div>
          <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 20, background: "#071530", color: "#38BDF8", border: "1px solid #0C4A6E" }}>
            {reports.length} reports
          </span>
        </div>
        <div style={cardBody}>

          {/* Value prop banner */}
          <div style={{ background: "#070F20", border: "1px solid #0C2A40", borderRadius: 10, padding: "16px 18px", marginBottom: 18, display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg,#0C4A6E,#075985)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7DD3FC" strokeWidth="1.8">
                <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/>
                <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#CBD5E1", marginBottom: 3 }}>Your personal growth advisor</div>
              <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.5 }}>Every quarter, your BellAveGo advisor analyzes your calls, jobs, and revenue — and delivers a custom action plan to help you grow.</div>
            </div>
          </div>

          {/* Reports list */}
          {reports.map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: i < reports.length - 1 ? "1px solid #0A1828" : "none" }}>
              <div style={{ width: 38, height: 38, borderRadius: 9, background: "#0A1828", border: "1px solid #1E3A5F", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" strokeWidth="1.8">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#CBD5E1", marginBottom: 2 }}>{r.title}</div>
                <div style={{ fontSize: 11, color: "#475569" }}>{r.desc}</div>
              </div>
              <div style={{ fontSize: 11, color: "#334155", flexShrink: 0, marginRight: 12 }}>{r.date}</div>
              <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 20, background: "#051A0D", color: "#4ADE80", border: "1px solid #14532D", flexShrink: 0 }}>
                Delivered
              </span>
              <button style={{ fontSize: 11, fontWeight: 600, padding: "5px 12px", borderRadius: 7, border: "1px solid #1E3A5F", background: "#0C1F3D", color: "#38BDF8", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                View
              </button>
            </div>
          ))}

          {/* Next report */}
          <div style={{ marginTop: 16, padding: "12px 14px", background: "#070F20", borderRadius: 9, border: "1px solid #0F2040", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>Next report</div>
              <div style={{ fontSize: 11, color: "#334155", marginTop: 2 }}>Q2 2026 · Due July 1, 2026</div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 20, background: "#1C1200", color: "#F59E0B", border: "1px solid #713F12" }}>
              Upcoming
            </span>
          </div>
        </div>
      </div>

    </div>
  );
}