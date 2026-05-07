"use client";

import { useState, useEffect } from "react";
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
    background: "#ffffff",
    border: "1px solid rgba(10,168,159,0.14)",
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 16,
    boxShadow: "0 2px 16px rgba(7,27,58,0.06)",
  };
  const cardHead: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 18px",
    borderBottom: "1px solid rgba(10,168,159,0.1)",
  };
  const cardTitle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: "#0B1F3A",
  };
  const cardBody: React.CSSProperties = { padding: 18 };

  const statusBadge = (status: string): React.CSSProperties => {
    const map: Record<string, React.CSSProperties> = {
      pending_approval: { background: "#FFFBEB", color: "#D97706", border: "1px solid #FDE68A" },
      scheduled: { background: "#ECFDF5", color: "#059669", border: "1px solid #A7F3D0" },
      cancelled: { background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" },
    };
    return {
      fontSize: 10,
      fontWeight: 600,
      padding: "3px 8px",
      borderRadius: 20,
      ...(map[status] || { background: "rgba(10,168,159,0.08)", color: "#4A7A80", border: "1px solid rgba(10,168,159,0.2)" }),
    };
  };

  const metrics = [
    {
      label: "Total Jobs",
      value: String(counts.jobs),
      change: "All time",
      iconBg: "rgba(10,168,159,0.1)",
      iconColor: "#0AA89F",
      accent: "#0AA89F",
      icon: <><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></>,
    },
    {
      label: "Pending Approval",
      value: String(jobs.filter(j => j.status === "pending_approval").length),
      change: "Needs your attention",
      iconBg: "#FFFBEB",
      iconColor: "#D97706",
      accent: "#F59E0B",
      icon: <><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></>,
    },
    {
      label: "Scheduled",
      value: String(jobs.filter(j => j.status === "scheduled").length),
      change: "Confirmed jobs",
      iconBg: "#ECFDF5",
      iconColor: "#059669",
      accent: "#22C55E",
      icon: <><polyline points="20 6 9 17 4 12"/></>,
    },
    {
      label: "Total Customers",
      value: String(counts.customers),
      change: "In your database",
      iconBg: "rgba(139,92,246,0.1)",
      iconColor: "#7C3AED",
      accent: "#8B5CF6",
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
    <div style={{ padding: "24px 28px 60px", color: "#0B1F3A", fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "#7AAAB2", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0B1F3A", letterSpacing: "-0.5px", marginBottom: 4 }}>Command Center</h1>
        <p style={{ fontSize: 13, color: "#4A7A80" }}>Manage jobs, review reports, and track your business growth.</p>
      </div>

      {/* Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
        {metrics.map((m) => (
          <div key={m.label} style={{ background: "#ffffff", border: "1px solid rgba(10,168,159,0.14)", borderRadius: 14, padding: "18px 20px", position: "relative", overflow: "hidden", boxShadow: "0 2px 16px rgba(7,27,58,0.06)" }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "#7AAAB2", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              {m.label}
              <div style={{ width: 28, height: 28, borderRadius: 7, background: m.iconBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={m.iconColor} strokeWidth="2">{m.icon}</svg>
              </div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#0B1F3A", letterSpacing: -1, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{m.value}</div>
            <div style={{ fontSize: 11, marginTop: 6, color: "#4A7A80" }}>{m.change}</div>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,${m.accent},${m.accent}00)`, borderRadius: "14px 14px 0 0" }} />
          </div>
        ))}
      </div>

      {/* Jobs */}
      <div style={card}>
        <div style={cardHead}>
          <div>
            <div style={cardTitle}>Jobs</div>
            <div style={{ fontSize: 11, color: "#7AAAB2", marginTop: 2 }}>Accept or decline incoming job requests</div>
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
                  border: "1px solid rgba(10,168,159,0.2)",
                  background: "transparent",
                  color: "#4A7A80",
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
              <div style={{ fontSize: 13, fontWeight: 500, color: "#4A7A80", marginBottom: 4 }}>No jobs yet</div>
              <div style={{ fontSize: 12, color: "#7AAAB2" }}>Jobs captured by your AI receptionist will appear here.</div>
            </div>
          ) : (
            jobs.map((job, i) => (
              <div key={job.id} style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "14px 18px",
                borderBottom: i < jobs.length - 1 ? "1px solid rgba(10,168,159,0.08)" : "none",
              }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(10,168,159,0.1)", border: "1px solid rgba(10,168,159,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 13, fontWeight: 700, color: "#0AA89F" }}>
                  {(job.customer_name || "?")[0].toUpperCase()}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0B1F3A", marginBottom: 2 }}>{job.customer_name || "Unknown"}</div>
                  <div style={{ fontSize: 11, color: "#7AAAB2" }}>
                    {job.job_type || job.title} · {job.address || "No address"} · {job.scheduled_time || "No time set"}
                  </div>
                </div>

                <div style={{ fontSize: 11, color: "#7AAAB2", flexShrink: 0 }}>{job.customer_phone}</div>

                <span style={statusBadge(job.status)}>
                  {job.status === "pending_approval" ? "Pending" : job.status === "scheduled" ? "Scheduled" : job.status === "cancelled" ? "Cancelled" : job.status}
                </span>

                {job.status === "pending_approval" && (
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => handleJobAction(job.id, "scheduled")}
                      style={{ fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 7, border: "1px solid #A7F3D0", background: "#ECFDF5", color: "#059669", cursor: "pointer", fontFamily: "inherit" }}
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleJobAction(job.id, "cancelled")}
                      style={{ fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 7, border: "1px solid #FECACA", background: "#FEF2F2", color: "#DC2626", cursor: "pointer", fontFamily: "inherit" }}
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
            <div style={{ fontSize: 11, color: "#7AAAB2", marginTop: 2 }}>Quarterly growth reports delivered by your BellAveGo advisor</div>
          </div>
          <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: "rgba(10,168,159,0.08)", color: "#0AA89F", border: "1px solid rgba(10,168,159,0.2)" }}>
            {reports.length} reports
          </span>
        </div>
        <div style={cardBody}>

          {/* Value prop banner */}
          <div style={{ background: "linear-gradient(135deg, rgba(10,168,159,0.06) 0%, rgba(10,168,159,0.1) 100%)", border: "1px solid rgba(10,168,159,0.18)", borderRadius: 12, padding: "16px 18px", marginBottom: 18, display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg, #0AA89F, #0D8F87)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 4px 12px rgba(10,168,159,0.28)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="1.8">
                <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/>
                <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#0B1F3A", marginBottom: 3 }}>Your personal growth advisor</div>
              <div style={{ fontSize: 12, color: "#4A7A80", lineHeight: 1.5 }}>Every quarter, your BellAveGo advisor analyzes your calls, jobs, and revenue — and delivers a custom action plan to help you grow.</div>
            </div>
          </div>

          {/* Reports list */}
          {reports.map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: i < reports.length - 1 ? "1px solid rgba(10,168,159,0.08)" : "none" }}>
              <div style={{ width: 38, height: 38, borderRadius: 9, background: "rgba(10,168,159,0.08)", border: "1px solid rgba(10,168,159,0.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0AA89F" strokeWidth="1.8">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#0B1F3A", marginBottom: 2 }}>{r.title}</div>
                <div style={{ fontSize: 11, color: "#7AAAB2" }}>{r.desc}</div>
              </div>
              <div style={{ fontSize: 11, color: "#7AAAB2", flexShrink: 0, marginRight: 12 }}>{r.date}</div>
              <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 20, background: "#ECFDF5", color: "#059669", border: "1px solid #A7F3D0", flexShrink: 0 }}>
                Delivered
              </span>
              <button style={{ fontSize: 11, fontWeight: 600, padding: "5px 12px", borderRadius: 7, border: "1px solid rgba(10,168,159,0.2)", background: "rgba(10,168,159,0.08)", color: "#0AA89F", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                View
              </button>
            </div>
          ))}

          {/* Next report */}
          <div style={{ marginTop: 16, padding: "12px 14px", background: "rgba(10,168,159,0.05)", borderRadius: 9, border: "1px solid rgba(10,168,159,0.12)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#4A7A80" }}>Next report</div>
              <div style={{ fontSize: 11, color: "#7AAAB2", marginTop: 2 }}>Q2 2026 · Due July 1, 2026</div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 20, background: "#FFFBEB", color: "#D97706", border: "1px solid #FDE68A" }}>
              Upcoming
            </span>
          </div>
        </div>
      </div>

    </div>
  );
}
