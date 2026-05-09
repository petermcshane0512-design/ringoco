"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Job = {
  id: string;
  customer_name: string;
  service?: string;
  job_type?: string;
  address: string;
  scheduled_at?: string;
  scheduled_time?: string;
  status: "pending" | "pending_approval" | "accepted" | "scheduled" | "declined" | "cancelled" | "completed";
  amount?: number;
};

type Report = {
  id: string;
  client_name: string;
  title: string;
  created_at: string;
  file_url?: string;
};

type Profile = {
  user_id: string;
  business_name?: string;
  owner_phone?: string;
  twilio_number?: string;
  is_active?: boolean;
  plan_tier?: string;
  onboarding_complete?: boolean;
};

export default function DashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [counts, setCounts] = useState({ jobs: 0, customers: 0, revenue: 0, leads: 0 });
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [provisionLoading, setProvisionLoading] = useState(false);
  const router = useRouter();

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    const profileRes = await fetch("/api/profile").then((r) => r.json()).catch(() => null);
    const p = profileRes && !profileRes.error ? profileRes : null;
    setProfile(p);
    // Send fresh signups (no profile yet, or onboarding not complete) to /onboarding
    if (!p || !p.onboarding_complete) {
      router.replace("/onboarding");
      return;
    }

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
    const revenue = jobList.filter((j) => j.status === "completed").reduce((sum, j) => sum + (j.amount || 0), 0);
    setJobs(jobList);
    setReports((reportData as Report[]) || []);
    setCounts({ jobs: jobCount || 0, customers: customerCount || 0, revenue, leads: 0 });
    setLoadingJobs(false);
  }

  async function startCheckout() {
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" }).then((r) => r.json());
      if (res.url) window.location.href = res.url;
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function retryProvision() {
    setProvisionLoading(true);
    try {
      const res = await fetch("/api/twilio/provision", { method: "POST" }).then((r) => r.json());
      if (res.ok) await fetchAll();
      else alert(`Provisioning failed: ${res.error || "unknown"}`);
    } finally {
      setProvisionLoading(false);
    }
  }

  async function handleJobAction(jobId: string, action: "scheduled" | "cancelled") {
    setActionLoading(jobId + action);
    await supabase.from("jobs").update({ status: action }).eq("id", jobId);
    setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, status: action } : j)));
    setActionLoading(null);
  }

  function jobService(job: Job) { return job.job_type || job.service || "—"; }
  function jobTime(job: Job) { return job.scheduled_time || job.scheduled_at || ""; }

  const pending = jobs.filter((j) => j.status === "pending" || j.status === "pending_approval");
  const upcoming = jobs.filter((j) => j.status === "accepted" || j.status === "scheduled");

  // ── Light coastal styles ──
  const card: React.CSSProperties = {
    background: "#ffffff",
    border: "1px solid rgba(10,168,159,0.14)",
    borderRadius: 14,
    overflow: "hidden",
    boxShadow: "0 2px 16px rgba(7,27,58,0.06)",
  };
  const cardHead: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "14px 20px", borderBottom: "1px solid rgba(10,168,159,0.1)",
  };
  const cardTitle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: "#0B1F3A" };
  const cardBody: React.CSSProperties = { padding: 20 };
  const th: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, color: "#7AAAB2", textTransform: "uppercase",
    letterSpacing: "0.08em", padding: "0 0 10px", textAlign: "left",
    borderBottom: "1px solid rgba(10,168,159,0.1)",
  };
  const td: React.CSSProperties = {
    padding: "12px 0", borderBottom: "1px solid rgba(10,168,159,0.07)",
    fontSize: 12, color: "#4A7A80", verticalAlign: "middle",
  };
  const emptyBox: React.CSSProperties = { textAlign: "center", padding: "36px 20px" };
  const emptyTitle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: "#0B1F3A", marginBottom: 4 };
  const emptySub: React.CSSProperties = { fontSize: 11, color: "#7AAAB2", lineHeight: 1.6 };

  function statusPill(status: Job["status"]) {
    const map: Record<string, { bg: string; color: string; border: string; label: string }> = {
      pending:          { bg: "#FFFBEB", color: "#D97706", border: "#FDE68A", label: "Pending" },
      pending_approval: { bg: "#FFFBEB", color: "#D97706", border: "#FDE68A", label: "Pending" },
      accepted:         { bg: "#ECFDF5", color: "#059669", border: "#A7F3D0", label: "Accepted" },
      scheduled:        { bg: "#ECFDF5", color: "#059669", border: "#A7F3D0", label: "Scheduled" },
      declined:         { bg: "#FEF2F2", color: "#DC2626", border: "#FECACA", label: "Declined" },
      cancelled:        { bg: "#FEF2F2", color: "#DC2626", border: "#FECACA", label: "Cancelled" },
      completed:        { bg: "#EFF6FF", color: "#2563EB", border: "#BFDBFE", label: "Completed" },
    };
    const s = map[status];
    return (
      <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
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
      iconBg: "#ECFDF5", iconColor: "#059669", accentColor: "#22C55E",
      icon: <><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></>,
    },
    {
      label: "Pending Jobs", value: String(pending.length),
      sub: pending.length > 0 ? "Awaiting your response" : "All caught up",
      iconBg: "#FFFBEB", iconColor: "#D97706", accentColor: "#F59E0B",
      icon: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4" /></>,
    },
    {
      label: "Upcoming Jobs", value: String(upcoming.length),
      sub: upcoming.length > 0 ? "Accepted & scheduled" : "None scheduled",
      iconBg: "#EFF6FF", iconColor: "#2563EB", accentColor: "#3B82F6",
      icon: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
    },
    {
      label: "Total Customers", value: String(counts.customers),
      sub: counts.customers > 0 ? `${counts.customers} contact${counts.customers !== 1 ? "s" : ""}` : "Add your first",
      iconBg: "rgba(10,168,159,0.1)", iconColor: "#0AA89F", accentColor: "#0AA89F",
      icon: <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></>,
    },
  ];

  return (
    <div style={{ padding: "28px 32px 60px", fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ marginBottom: 26, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#0B1F3A", letterSpacing: "-0.04em" }}>Command Center</div>
          <div style={{ fontSize: 13, color: "#7AAAB2", marginTop: 3 }}>Live job requests, schedule, and business overview</div>
        </div>
      </div>

      {/* Activation banner */}
      {profile && !profile.is_active && (
        <div style={{ marginBottom: 22, padding: "18px 22px", background: "linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)", border: "1px solid #FDE68A", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#92400E" }}>Activate your AI receptionist</div>
            <div style={{ fontSize: 12, color: "#78350F", marginTop: 4, lineHeight: 1.5 }}>
              Subscribe to get your dedicated number, 24/7 call answering, and SMS booking flow. We'll auto-provision your Twilio number after checkout.
            </div>
          </div>
          <button onClick={startCheckout} disabled={checkoutLoading} style={{ padding: "11px 22px", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 800, cursor: checkoutLoading ? "wait" : "pointer", background: "linear-gradient(135deg, #22C55E 0%, #16A34A 100%)", color: "#fff", boxShadow: "0 4px 14px rgba(34,197,94,0.32)", whiteSpace: "nowrap" }}>
            {checkoutLoading ? "Loading…" : "Subscribe & activate →"}
          </button>
        </div>
      )}

      {/* Number-pending banner */}
      {profile?.is_active && !profile.twilio_number && (
        <div style={{ marginBottom: 22, padding: "16px 22px", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#1E40AF" }}>Number not provisioned yet</div>
            <div style={{ fontSize: 12, color: "#1E3A8A", marginTop: 3 }}>
              Subscription active but no Twilio number assigned. Click to retry.
            </div>
          </div>
          <button onClick={retryProvision} disabled={provisionLoading} style={{ padding: "9px 18px", borderRadius: 10, border: "none", fontSize: 12, fontWeight: 800, cursor: provisionLoading ? "wait" : "pointer", background: "#2563EB", color: "#fff" }}>
            {provisionLoading ? "Provisioning…" : "Provision number"}
          </button>
        </div>
      )}

      {/* Metric cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
        {metrics.map((m) => (
          <div key={m.label} style={{ background: "#ffffff", border: "1px solid rgba(10,168,159,0.14)", borderRadius: 14, padding: "18px 20px", position: "relative", overflow: "hidden", boxShadow: "0 2px 14px rgba(7,27,58,0.06)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#7AAAB2", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              {m.label}
              <div style={{ width: 28, height: 28, borderRadius: 8, background: m.iconBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={m.iconColor} strokeWidth="2">{m.icon}</svg>
              </div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#0B1F3A", letterSpacing: "-1px", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{m.value}</div>
            <div style={{ fontSize: 11, marginTop: 6, color: "#7AAAB2" }}>{m.sub}</div>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,${m.accentColor},${m.accentColor}00)`, borderRadius: "14px 14px 0 0" }} />
          </div>
        ))}
      </div>

      {/* Two-col layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 310px", gap: 16, alignItems: "start" }}>

        {/* Left col */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Pending jobs */}
          <div style={card}>
            <div style={cardHead}>
              <div>
                <div style={cardTitle}>Incoming requests</div>
                <div style={{ fontSize: 11, color: "#7AAAB2", marginTop: 2 }}>Accept or decline jobs from your AI receptionist</div>
              </div>
              {pending.length > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: "#FFFBEB", color: "#D97706", border: "1px solid #FDE68A" }}>
                  {pending.length} pending
                </span>
              )}
            </div>
            <div style={{ padding: "0 20px" }}>
              {loadingJobs ? (
                <div style={emptyBox}><div style={{ fontSize: 12, color: "#7AAAB2" }}>Loading...</div></div>
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
                        <td style={{ ...td, fontWeight: 700, color: "#0B1F3A" }}>{job.customer_name}</td>
                        <td style={td}>{jobService(job)}</td>
                        <td style={td}>{formatDate(jobTime(job))}</td>
                        <td style={{ ...td, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.address || "—"}</td>
                        <td style={{ ...td, textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button
                              onClick={() => handleJobAction(job.id, "scheduled")}
                              disabled={!!actionLoading}
                              style={{ fontSize: 11, fontWeight: 700, padding: "5px 13px", borderRadius: 7, background: "#ECFDF5", border: "1px solid #A7F3D0", color: "#059669", cursor: "pointer", opacity: actionLoading ? 0.6 : 1 }}
                            >
                              Accept
                            </button>
                            <button
                              onClick={() => handleJobAction(job.id, "cancelled")}
                              disabled={!!actionLoading}
                              style={{ fontSize: 11, fontWeight: 700, padding: "5px 13px", borderRadius: 7, background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", cursor: "pointer", opacity: actionLoading ? 0.6 : 1 }}
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

          {/* All jobs */}
          <div style={card}>
            <div style={cardHead}>
              <div style={cardTitle}>All jobs</div>
              <span style={{ fontSize: 11, color: "#7AAAB2", fontWeight: 600 }}>{counts.jobs} total</span>
            </div>
            <div style={{ padding: "0 20px" }}>
              {loadingJobs ? (
                <div style={emptyBox}><div style={{ fontSize: 12, color: "#7AAAB2" }}>Loading...</div></div>
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
                        <td style={{ ...td, fontWeight: 600, color: "#0B1F3A" }}>{job.customer_name}</td>
                        <td style={td}>{jobService(job)}</td>
                        <td style={td}>{formatDate(jobTime(job))}</td>
                        <td style={{ ...td, fontWeight: 600, color: "#0B1F3A" }}>{job.amount ? `$${job.amount}` : "—"}</td>
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
                <div style={{ fontSize: 11, color: "#7AAAB2", marginTop: 2 }}>Client reports uploaded by Peter</div>
              </div>
            </div>
            <div style={{ padding: "0 20px" }}>
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
                        <td style={{ ...td, fontWeight: 600, color: "#0B1F3A" }}>{r.client_name}</td>
                        <td style={td}>{r.title}</td>
                        <td style={td}>{new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                        <td style={{ ...td, textAlign: "right" }}>
                          {r.file_url ? (
                            <a href={r.file_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, fontWeight: 700, color: "#0AA89F", textDecoration: "none" }}>
                              View →
                            </a>
                          ) : (
                            <span style={{ fontSize: 11, color: "#7AAAB2" }}>No file</span>
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
          <div style={{ ...card }}>
            <div style={{ background: "linear-gradient(135deg, #E6F7F4 0%, #F0FAF7 100%)", padding: "16px 20px", borderBottom: "1px solid rgba(10,168,159,0.12)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(10,168,159,0.12)", border: "1px solid rgba(10,168,159,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0AA89F" strokeWidth="1.8">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                  </svg>
                </div>
                <div>
                  <div style={cardTitle}>AI Receptionist</div>
                  <div style={{ fontSize: 10, color: "#7AAAB2", marginTop: 2 }}>
                    24/7 · {profile?.twilio_number || "Not provisioned"}
                  </div>
                </div>
              </div>
              {profile?.is_active && profile?.twilio_number ? (
                <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: "#ECFDF5", color: "#059669", border: "1px solid #A7F3D0" }}>Live</span>
              ) : (
                <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}>Offline</span>
              )}
            </div>
            <div style={cardBody}>
              {[
                { label: "Status", val: "Not connected", muted: true },
                { label: "Approval SMS to", val: "Not set", muted: true },
                { label: "Calls today", val: "0", muted: false },
                { label: "Leads captured", val: "0", muted: false },
              ].map((row) => (
                <div key={row.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid rgba(10,168,159,0.08)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(10,168,159,0.3)" }} />
                    <span style={{ fontSize: 12, color: "#4A7A80" }}>{row.label}</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: row.muted ? "#7AAAB2" : "#0B1F3A" }}>{row.val}</span>
                </div>
              ))}
              <Link href="/dashboard/receptionist" style={{ width: "100%", marginTop: 16, background: "linear-gradient(135deg, #0AA89F, #18AFA8)", color: "#fff", fontSize: 12, fontWeight: 700, padding: "11px", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, textDecoration: "none", boxShadow: "0 4px 14px rgba(10,168,159,0.25)" }}>
                Configure Receptionist →
              </Link>
              {profile?.is_active && profile?.twilio_number && (
                <Link href="/dashboard/forwarding" style={{ width: "100%", marginTop: 8, background: "#fff", border: "1.5px solid rgba(10,168,159,0.25)", color: "#0AA89F", fontSize: 12, fontWeight: 700, padding: "10px", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, textDecoration: "none" }}>
                  Setup call forwarding →
                </Link>
              )}
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
                <Link key={item.href} href={item.href} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid rgba(10,168,159,0.08)", textDecoration: "none" }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(10,168,159,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0AA89F" strokeWidth="2">{item.icon}</svg>
                  </div>
                  <span style={{ fontSize: 12, color: "#0B1F3A", fontWeight: 500 }}>{item.label}</span>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "#7AAAB2" }}>→</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
