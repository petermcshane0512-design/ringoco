"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Job = {
  id: string;
  customer_name: string;
  service: string;
  address: string;
  scheduled_at: string;
  status: "pending" | "accepted" | "declined" | "completed";
  amount?: number;
};

type Report = {
  id: string;
  client_name: string;
  title: string;
  created_at: string;
  file_url?: string;
};

export default function DashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [counts, setCounts] = useState({ jobs: 0, customers: 0, revenue: 0, leads: 0 });
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    const [
      { data: jobData },
      { count: jobCount },
      { count: customerCount },
      { data: reportData },
    ] = await Promise.all([
      supabase.from("jobs").select("*").order("scheduled_at", { ascending: true }).limit(20),
      supabase.from("jobs").select("*", { count: "exact", head: true }),
      supabase.from("customers").select("*", { count: "exact", head: true }),
      supabase.from("consulting_reports").select("*").order("created_at", { ascending: false }).limit(10),
    ]);

    const jobList = (jobData as Job[]) || [];
    const revenue = jobList
      .filter((j) => j.status === "completed")
      .reduce((sum, j) => sum + (j.amount || 0), 0);

    setJobs(jobList);
    setReports((reportData as Report[]) || []);
    setCounts({ jobs: jobCount || 0, customers: customerCount || 0, revenue, leads: 0 });
    setLoadingJobs(false);
  }

  async function handleJobAction(jobId: string, action: "accepted" | "declined") {
    setActionLoading(jobId + action);
    await supabase.from("jobs").update({ status: action }).eq("id", jobId);
    setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, status: action } : j)));
    setActionLoading(null);
  }

  const pending = jobs.filter((j) => j.status === "pending");
  const upcoming = jobs.filter((j) => j.status === "accepted");

  // styles
  const card: React.CSSProperties = { background: "#060E1C", border: "1px solid #0F2040", borderRadius: 12, overflow: "hidden" };
  const cardHead: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid #0F2040" };
  const cardTitle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: "#CBD5E1" };
  const cardBody: React.CSSProperties = { padding: 18 };
  const th: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: "#334155", textTransform: "uppercase", letterSpacing: "0.1em", padding: "0 0 10px", textAlign: "left", borderBottom: "1px solid #0A1828" };
  const td: React.CSSProperties = { padding: "12px 0", borderBottom: "1px solid #0A1828", fontSize: 12, color: "#94A3B8", verticalAlign: "middle" };
  const emptyBox: React.CSSProperties = { textAlign: "center", padding: "32px 20px" };
  const emptyTitle: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: "#475569", marginBottom: 4 };
  const emptySub: React.CSSProperties = { fontSize: 11, color: "#334155", lineHeight: 1.5 };

  function statusPill(status: Job["status"]) {
    const map: Record<Job["status"], { bg: string; color: string; label: string }> = {
      pending:   { bg: "#1C1200", color: "#F59E0B", label: "Pending" },
      accepted:  { bg: "#051A0D", color: "#4ADE80", label: "Accepted" },
      declined:  { bg: "#150505", color: "#F87171", label: "Declined" },
      completed: { bg: "#071530", color: "#38BDF8", label: "Completed" },
    };
    const s = map[status];
    return (
      <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 20, background: s.bg, color: s.color }}>
        {s.label}
      </span>
    );
  }

  function formatDate(iso: string) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  const metrics = [
    {
      label: "Revenue · May", value: `$${counts.revenue.toLocaleString()}`,
      sub: counts.revenue > 0 ? "From completed jobs" : "No completed jobs yet",
      iconBg: "#051A0D", iconColor: "#4ADE80", accent: "#166534",
      icon: <><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></>,
    },
    {
      label: "Pending Jobs", value: String(pending.length),
      sub: pending.length > 0 ? "Awaiting your response" : "All caught up",
      iconBg: "#171200", iconColor: "#F59E0B", accent: "#713F12",
      icon: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4" /></>,
    },
    {
      label: "Upcoming Jobs", value: String(upcoming.length),
      sub: upcoming.length > 0 ? "Accepted & scheduled" : "None scheduled",
      iconBg: "#071530", iconColor: "#38BDF8", accent: "#0C4A6E",
      icon: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
    },
    {
      label: "Total Customers", value: String(counts.customers),
      sub: counts.customers > 0 ? `${counts.customers} contact${counts.customers !== 1 ? "s" : ""}` : "Add your first",
      iconBg: "#150E2A", iconColor: "#A78BFA", accent: "#5B21B6",
      icon: <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></>,
    },
  ];

  return (
    <div style={{ padding: "24px 28px 60px", color: "#E2E8F0", fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#F1F5F9", letterSpacing: -0.3 }}>Command Center</div>
        <div style={{ fontSize: 12, color: "#334155", marginTop: 3 }}>Live job requests, schedule, and business overview</div>
      </div>

      {/* Metrics */}
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
            <div style={{ fontSize: 11, marginTop: 6, color: "#475569" }}>{m.sub}</div>
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,${m.accent},${m.accent}00)` }} />
          </div>
        ))}
      </div>

      {/* Two-col layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, alignItems: "start" }}>

        {/* Left col */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Pending jobs — action required */}
          <div style={card}>
            <div style={cardHead}>
              <div>
                <div style={cardTitle}>Incoming requests</div>
                <div style={{ fontSize: 11, color: "#334155", marginTop: 2 }}>Accept or decline jobs from your AI receptionist</div>
              </div>
              {pending.length > 0 && (
                <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 20, background: "#1C1200", color: "#F59E0B" }}>
                  {pending.length} pending
                </span>
              )}
            </div>
            <div style={{ padding: "0 18px" }}>
              {loadingJobs ? (
                <div style={{ ...emptyBox }}>
                  <div style={{ fontSize: 12, color: "#334155" }}>Loading...</div>
                </div>
              ) : pending.length === 0 ? (
                <div style={emptyBox}>
                  <div style={emptyTitle}>No pending requests</div>
                  <div style={emptySub}>New job requests from your AI receptionist will appear here for approval.</div>
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Customer</th>
                      <th style={th}>Service</th>
                      <th style={th}>When</th>
                      <th style={th}>Address</th>
                      <th style={{ ...th, textAlign: "right" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((job) => (
                      <tr key={job.id}>
                        <td style={{ ...td, fontWeight: 600, color: "#CBD5E1" }}>{job.customer_name}</td>
                        <td style={td}>{job.service}</td>
                        <td style={td}>{formatDate(job.scheduled_at)}</td>
                        <td style={{ ...td, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.address || "—"}</td>
                        <td style={{ ...td, textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button
                              onClick={() => handleJobAction(job.id, "accepted")}
                              disabled={!!actionLoading}
                              style={{ fontSize: 11, fontWeight: 600, padding: "5px 12px", borderRadius: 7, background: actionLoading === job.id + "accepted" ? "#0C3320" : "#051A0D", border: "1px solid #166534", color: "#4ADE80", cursor: "pointer", opacity: actionLoading ? 0.6 : 1 }}
                            >
                              Accept
                            </button>
                            <button
                              onClick={() => handleJobAction(job.id, "declined")}
                              disabled={!!actionLoading}
                              style={{ fontSize: 11, fontWeight: 600, padding: "5px 12px", borderRadius: 7, background: "#150505", border: "1px solid #7F1D1D", color: "#F87171", cursor: "pointer", opacity: actionLoading ? 0.6 : 1 }}
                            >
                              Decline
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* All jobs table */}
          <div style={card}>
            <div style={cardHead}>
              <div style={cardTitle}>All jobs</div>
              <span style={{ fontSize: 11, color: "#334155" }}>{counts.jobs} total</span>
            </div>
            <div style={{ padding: "0 18px" }}>
              {loadingJobs ? (
                <div style={emptyBox}><div style={{ fontSize: 12, color: "#334155" }}>Loading...</div></div>
              ) : jobs.length === 0 ? (
                <div style={emptyBox}>
                  <div style={emptyTitle}>No jobs yet</div>
                  <div style={emptySub}>Jobs created by your AI receptionist or manually will appear here.</div>
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Customer</th>
                      <th style={th}>Service</th>
                      <th style={th}>Scheduled</th>
                      <th style={th}>Amount</th>
                      <th style={th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((job) => (
                      <tr key={job.id}>
                        <td style={{ ...td, fontWeight: 500, color: "#CBD5E1" }}>{job.customer_name}</td>
                        <td style={td}>{job.service}</td>
                        <td style={td}>{formatDate(job.scheduled_at)}</td>
                        <td style={td}>{job.amount ? `$${job.amount}` : "—"}</td>
                        <td style={td}>{statusPill(job.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Consulting Reports */}
          <div style={card}>
            <div style={cardHead}>
              <div>
                <div style={cardTitle}>BellAveGo Consulting Reports</div>
                <div style={{ fontSize: 11, color: "#334155", marginTop: 2 }}>Client reports uploaded by Peter</div>
              </div>
            </div>
            <div style={{ padding: "0 18px" }}>
              {reports.length === 0 ? (
                <div style={emptyBox}>
                  <div style={emptyTitle}>No reports yet</div>
                  <div style={emptySub}>Reports will appear here once uploaded to the consulting_reports table.</div>
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Client</th>
                      <th style={th}>Report</th>
                      <th style={th}>Date</th>
                      <th style={{ ...th, textAlign: "right" }}>Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((r) => (
                      <tr key={r.id}>
                        <td style={{ ...td, fontWeight: 500, color: "#CBD5E1" }}>{r.client_name}</td>
                        <td style={td}>{r.title}</td>
                        <td style={td}>{new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                        <td style={{ ...td, textAlign: "right" }}>
                          {r.file_url ? (
                            <a href={r.file_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, fontWeight: 600, color: "#38BDF8", textDecoration: "none" }}>
                              View →
                            </a>
                          ) : (
                            <span style={{ fontSize: 11, color: "#334155" }}>No file</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

        </div>

        {/* Right col */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* AI Receptionist status */}
          <div style={{ ...card, borderColor: "#0C2A40" }}>
            <div style={{ background: "#070F20", padding: "16px 18px", borderBottom: "1px solid #0F2040", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: "linear-gradient(135deg,#0C4A6E,#075985)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7DD3FC" strokeWidth="1.8">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                  </svg>
                </div>
                <div>
                  <div style={cardTitle}>AI Receptionist</div>
                  <div style={{ fontSize: 10, color: "#334155", marginTop: 2 }}>24/7 · (762) 371-3351</div>
                </div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 20, background: "#150505", color: "#F87171", border: "1px solid #7F1D1D" }}>Offline</span>
            </div>
            <div style={cardBody}>
              {[
                { label: "Status", val: "Not connected", muted: true },
                { label: "Approval SMS to", val: "Not set", muted: true },
                { label: "Calls today", val: "0", muted: false },
                { label: "Leads captured", val: "0", muted: false },
              ].map((row) => (
                <div key={row.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #0A1828" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#1E3A5F" }} />
                    <span style={{ fontSize: 12, color: "#475569" }}>{row.label}</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: row.muted ? "#475569" : "#94A3B8" }}>{row.val}</span>
                </div>
              ))}
              <Link href="/dashboard/settings" style={{ width: "100%", marginTop: 14, background: "linear-gradient(135deg,#0369A1,#0284C7)", color: "#fff", fontSize: 12, fontWeight: 700, padding: 11, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, textDecoration: "none" }}>
                Configure in Settings →
              </Link>
            </div>
          </div>

          {/* Quick links */}
          <div style={card}>
            <div style={cardHead}>
              <div style={cardTitle}>Quick actions</div>
            </div>
            <div style={cardBody}>
              {[
                { label: "Send an invoice", href: "/dashboard/invoicing", icon: <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" /></> },
                { label: "View settings", href: "/dashboard/settings", icon: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" /></> },
                { label: "Go to home page", href: "/", icon: <><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></> },
              ].map((item) => (
                <Link key={item.href} href={item.href} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid #0A1828", textDecoration: "none" }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: "#0A1828", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" strokeWidth="2">{item.icon}</svg>
                  </div>
                  <span style={{ fontSize: 12, color: "#94A3B8" }}>{item.label}</span>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "#334155" }}>→</span>
                </Link>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}