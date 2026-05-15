"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";

const ADMIN_EMAILS = new Set(["pmcshane@fordham.edu", "peter@bellavego.com"]);

// NOTE: This page previously read jobs/customers/reports directly from
// Supabase with the anon key. That leaked tenant data across customers
// (CLAUDE.md explicitly warned: "Client pages MUST NOT use the anon Supabase
// key for tenant-scoped reads — they leak across tenants"). Now all reads
// go through /api/dashboard/summary which uses service-role + effectiveAuth
// to scope to the current (or impersonated) tenant.

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
  const [tier, setTier] = useState<"receptionist" | "officemgr" | "concierge">("officemgr");
  const [interval, setInterval] = useState<"monthly" | "annual">("annual");
  const [adminSwitching, setAdminSwitching] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const router = useRouter();
  const { user } = useUser();
  const isAdmin = !!user?.primaryEmailAddress?.emailAddress &&
    ADMIN_EMAILS.has(user.primaryEmailAddress.emailAddress.toLowerCase());

  async function adminSwitchTier(target: "receptionist" | "officemgr" | "concierge") {
    setAdminSwitching(target);
    const res = await fetch("/api/admin/grant-tier", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier: target }),
    });
    setAdminSwitching(null);
    if (res.ok) {
      await fetchAll();
    } else {
      const j = await res.json().catch(() => ({}));
      alert(`Switch failed: ${j.error || res.statusText}`);
    }
  }

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    const profileRes = await fetch("/api/profile").then((r) => r.json()).catch(() => null);
    const p = profileRes && !profileRes.error ? profileRes : null;
    setProfile(p);

    // Defensive onboarding check — TRIPLE-redundant so a missing column or stale
    // Clerk metadata never sends an already-onboarded user back to the form:
    //   1. If profile has a business_name set → they did the form, treat as done
    //   2. If profile.onboarding_complete === true → done
    //   3. If neither, send to /onboarding
    const hasBusinessInfo = !!p?.business_name && p.business_name.trim().length > 0;
    const onboardingDone = !!(p?.onboarding_complete || hasBusinessInfo);

    if (!p || !onboardingDone) {
      router.replace("/onboarding");
      return;
    }
    // Active customers who haven't finished post-checkout setup → wizard
    if (p.is_active && !p.setup_complete) {
      router.replace("/dashboard/setup");
      return;
    }

    // Single server-side call — tenant-scoped, no anon key, no data leak.
    setSummaryError(null);
    let summary: { jobs?: Job[]; jobsCount?: number; customersCount?: number; reports?: Report[] } | null = null;
    try {
      const res = await fetch("/api/dashboard/summary");
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setSummaryError(j.error || `Dashboard load failed (HTTP ${res.status}) — refresh in a moment, or text Peter at 773-710-9565 if it persists.`);
      } else {
        summary = await res.json();
      }
    } catch {
      setSummaryError("Couldn't reach the server. Check your connection and refresh.");
    }
    if (!summary) {
      setLoadingJobs(false);
      return;
    }
    const jobList = (summary.jobs as Job[]) || [];
    const revenue = jobList
      .filter((j) => j.status === "completed")
      .reduce((sum, j) => sum + (j.amount || 0), 0);
    setJobs(jobList);
    setReports((summary.reports as Report[]) || []);
    setCounts({
      jobs: summary.jobsCount || 0,
      customers: summary.customersCount || 0,
      revenue,
      leads: 0,
    });
    setLoadingJobs(false);
  }

  async function startCheckout() {
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, interval }),
      }).then((r) => r.json());
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

  async function handleJobAction(jobId: string, action: "scheduled" | "cancelled" | "completed") {
    setActionLoading(jobId + action);
    // Server-side update — double-filters on user_id so tenant A can't update
    // tenant B's job by guessing the id. Auto-stamps completed_at on completion.
    const res = await fetch("/api/jobs/update-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: jobId, status: action }),
    });
    if (res.ok) {
      // Optimistic update — UI feels instant.
      setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, status: action } : j)));
    } else {
      const j = await res.json().catch(() => ({}));
      alert(`Couldn't update job: ${j.error || res.statusText}`);
    }
    setActionLoading(null);
  }

  function jobService(job: Job) { return job.job_type || job.service || "—"; }
  function jobTime(job: Job) { return job.scheduled_time || job.scheduled_at || ""; }

  const pending = jobs.filter((j) => j.status === "pending" || j.status === "pending_approval");
  const upcoming = jobs.filter((j) => j.status === "accepted" || j.status === "scheduled");

  // ── Sunset Mission Control styles (warm white + sunset orange + teal AI) ──
  const card: React.CSSProperties = {
    background: "rgba(255,255,255,0.92)",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
    border: "1px solid rgba(232,116,43,0.12)",
    borderRadius: 16,
    overflow: "hidden",
    boxShadow: "0 4px 12px rgba(232,116,43,0.06), 0 12px 32px rgba(11,31,58,0.06), inset 0 1px 0 rgba(255,255,255,0.8)",
  };
  const cardHead: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "16px 22px", borderBottom: "1px solid rgba(232,116,43,0.10)",
    background: "linear-gradient(135deg, #FFFFFF 0%, #FFF7EE 100%)",
  };
  const cardTitle: React.CSSProperties = { fontSize: 14, fontWeight: 800, color: "#0B1F3A", letterSpacing: "-0.2px" };
  const cardBody: React.CSSProperties = { padding: 22 };
  const th: React.CSSProperties = {
    fontSize: 10, fontWeight: 800, color: "#C84B26", textTransform: "uppercase",
    letterSpacing: "0.14em", padding: "0 0 12px", textAlign: "left",
    borderBottom: "1px solid rgba(232,116,43,0.14)",
  };
  const td: React.CSSProperties = {
    padding: "13px 0", borderBottom: "1px solid rgba(232,116,43,0.06)",
    fontSize: 13, color: "#4A6670", verticalAlign: "middle",
  };
  const emptyBox: React.CSSProperties = { textAlign: "center", padding: "44px 20px" };
  const emptyTitle: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: "#0B1F3A", marginBottom: 6 };
  const emptySub: React.CSSProperties = { fontSize: 12, color: "#7AAAB2", lineHeight: 1.6 };

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
      label: "BellAveGo Revenue · This Month", value: `$${counts.revenue.toLocaleString()}`,
      sub: counts.revenue > 0 ? "From completed jobs" : "Booked jobs you mark complete will land here",
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
      sub: counts.customers > 0 ? `${counts.customers} contact${counts.customers !== 1 ? "s" : ""}` : "AI will add them as calls come in",
      iconBg: "rgba(10,168,159,0.1)", iconColor: "#0AA89F", accentColor: "#0AA89F",
      icon: <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></>,
    },
  ];

  return (
    <div style={{ padding: "28px 32px 60px", fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Header — admin switcher inlined as a compact pill so it doesn't dominate */}
      <div style={{ marginBottom: 26, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: "#0B1F3A", letterSpacing: "-0.04em" }}>
              Command <span style={{ background: "linear-gradient(135deg, #FF9D5A 0%, #E8742B 45%, #0AA89F 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>Center</span>
            </div>
            {profile?.is_active && (
              <span className="mc-status-pill"><span className="mc-live-dot" /> AI Active</span>
            )}
          </div>
          <div style={{ fontSize: 13, color: "#4A6670", marginTop: 4 }}>Live operational view of your AI receptionist — every call, job, and dollar.</div>
        </div>
        {isAdmin && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "5px 8px 5px 12px",
            background: "#0B1F3A", borderRadius: 99,
            fontSize: 11, fontWeight: 700,
          }}>
            <span style={{ color: "#7AAAB2", letterSpacing: "0.06em", textTransform: "uppercase", marginRight: 2 }}>Admin</span>
            {(["receptionist", "officemgr", "concierge"] as const).map(t => {
              const isCurrent = profile?.plan_tier === t;
              const label = t === "receptionist" ? "Recep" : t === "officemgr" ? "OfMgr" : "Conci";
              return (
                <button
                  key={t}
                  onClick={() => adminSwitchTier(t)}
                  disabled={adminSwitching !== null || isCurrent}
                  title={t === "receptionist" ? "Receptionist" : t === "officemgr" ? "Office Manager" : "Concierge"}
                  style={{
                    padding: "4px 10px", borderRadius: 99, border: "none",
                    background: isCurrent ? "#22C55E" : "transparent",
                    color: isCurrent ? "#fff" : "rgba(255,255,255,0.7)",
                    fontSize: 11, fontWeight: 700,
                    cursor: isCurrent || adminSwitching ? "default" : "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {adminSwitching === t ? "…" : label}
                </button>
              );
            })}
            <Link href="/admin/customers" style={{ padding: "4px 10px", borderRadius: 99, color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: 700, textDecoration: "none" }}>
              Cust →
            </Link>
          </div>
        )}
      </div>

      {/* Summary fetch error — surfaces server problems instead of silently
          showing zeros that look like "your business has no data." */}
      {summaryError && (
        <div style={{ marginBottom: 22, padding: "14px 18px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#DC2626", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 14, flexShrink: 0 }}>!</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#991B1B" }}>Dashboard couldn&apos;t load your data</div>
            <div style={{ fontSize: 12, color: "#7F1D1D", marginTop: 2, lineHeight: 1.55 }}>{summaryError}</div>
          </div>
          <button onClick={() => fetchAll()} style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "#DC2626", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
            Retry
          </button>
        </div>
      )}

      {/* Activation banner */}
      {profile && !profile.is_active && (() => {
        const TIERS = {
          receptionist: { label: "Receptionist",   monthly: 397,  annual: 3960,  sub: "AI answers every call · 250 bookings/mo · 6 AI consulting reports/yr" },
          officemgr:    { label: "Office Manager", monthly: 797,  annual: 7940,  sub: "Receptionist + Quote Hunter + Collections + Reviews + Reputation + 12 reports/yr" },
          concierge:    { label: "Concierge",      monthly: 1997, annual: 19920, sub: "Office Manager + AI Marketing Operations (ad creatives, lead sourcing, SEO, weekly strategy reports)" },
        } as const;
        const cur = TIERS[tier];
        const totalToday = interval === "monthly" ? cur.monthly : cur.annual;
        return (
          <div style={{ marginBottom: 22, padding: "20px 22px", background: "linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)", border: "1px solid #FDE68A", borderRadius: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#92400E" }}>Activate your AI receptionist</div>
                <div style={{ fontSize: 12, color: "#78350F", marginTop: 3, lineHeight: 1.5 }}>
                  Pick a plan. We auto-provision your number, register A2P SMS, and tune your prompt after checkout. 30-day money-back.
                </div>
              </div>
              <div style={{ display: "flex", background: "#fff", border: "1px solid #FDE68A", borderRadius: 10, padding: 3, fontSize: 11, fontWeight: 700 }}>
                {(["annual", "monthly"] as const).map((i) => (
                  <button key={i} onClick={() => setInterval(i)} style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", background: interval === i ? "#92400E" : "transparent", color: interval === i ? "#fff" : "#78350F", textTransform: "capitalize" }}>
                    {i}{i === "annual" ? " (save 17%)" : ""}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
              {(Object.keys(TIERS) as Array<keyof typeof TIERS>).map((k) => {
                const t = TIERS[k];
                const m = interval === "monthly" ? t.monthly : Math.round(t.annual / 12);
                const active = tier === k;
                return (
                  <button key={k} onClick={() => setTier(k)} style={{ padding: "14px 14px", borderRadius: 10, border: active ? "2px solid #92400E" : "1px solid #FDE68A", background: active ? "#fff" : "rgba(255,255,255,0.5)", textAlign: "left", cursor: "pointer", position: "relative" }}>
                    {k === "officemgr" && (
                      <span style={{ position: "absolute", top: -10, right: 10, fontSize: 9, fontWeight: 800, padding: "3px 8px", borderRadius: 10, background: "#22C55E", color: "#fff", letterSpacing: "0.06em", textTransform: "uppercase" }}>Most popular</span>
                    )}
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#92400E", marginBottom: 2 }}>{t.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: "#0B1F3A", letterSpacing: "-0.5px" }}>${m}<span style={{ fontSize: 11, color: "#78350F", fontWeight: 700 }}>/mo</span></div>
                    <div style={{ fontSize: 9, color: "#78350F", marginTop: 2 }}>Unlimited calls · No setup fee</div>
                    <div style={{ fontSize: 10, color: "#A16207", marginTop: 4, lineHeight: 1.4 }}>{t.sub}</div>
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
              <div style={{ fontSize: 12, color: "#78350F" }}>
                <span style={{ fontWeight: 700 }}>${totalToday}</span> charged today.
                {interval === "monthly" ? " Cancel anytime within 30 days for full refund." : " 12 months for the price of 10."}
              </div>
              <button onClick={startCheckout} disabled={checkoutLoading} style={{ padding: "12px 26px", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 800, cursor: checkoutLoading ? "wait" : "pointer", background: "linear-gradient(135deg, #22C55E 0%, #16A34A 100%)", color: "#fff", boxShadow: "0 4px 14px rgba(34,197,94,0.32)", whiteSpace: "nowrap" }}>
                {checkoutLoading ? "Loading…" : `Let's get started →`}
              </button>
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: "#A16207" }}>
              Multi-location franchise (3+ locations)? <a href="mailto:peter@bellavego.com?subject=Multi-location%20BellAveGo" style={{ color: "#92400E", fontWeight: 700, textDecoration: "underline" }}>Contact for custom pricing</a>
            </div>
          </div>
        );
      })()}

      {/* Number-pending banner */}
      {profile?.is_active && !profile.twilio_number && (
        <div style={{ marginBottom: 22, padding: "16px 22px", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#1E40AF" }}>Your AI receptionist number is being provisioned</div>
            <div style={{ fontSize: 12, color: "#1E3A8A", marginTop: 3, lineHeight: 1.5 }}>
              This is the local number your missed calls forward to — the AI answers it 24/7. If it didn&apos;t auto-buy, click retry.
            </div>
          </div>
          <button onClick={retryProvision} disabled={provisionLoading} style={{ padding: "9px 18px", borderRadius: 10, border: "none", fontSize: 12, fontWeight: 800, cursor: provisionLoading ? "wait" : "pointer", background: "#2563EB", color: "#fff" }}>
            {provisionLoading ? "Provisioning…" : "Provision number"}
          </button>
        </div>
      )}

      {/* Dashboard shell — always rendered. Pre-activation users see empty
          state behind the activation banner above (sells with desire, not a wall). */}
      <>

      {/* Metric cards — big bold numbers, alternating orange + teal glows */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
        {metrics.map((m, idx) => {
          // Revenue (idx 0) = orange (money); others = teal (AI/operational)
          const tone: "orange" | "teal" = idx === 0 ? "orange" : "teal"
          const accent = tone === "orange"
            ? { eyebrow: "#C84B26", icon: "#E8742B", iconBg: "rgba(232,116,43,0.12)", iconBorder: "rgba(232,116,43,0.30)" }
            : { eyebrow: "#0AA89F", icon: "#0AA89F", iconBg: "rgba(20,184,166,0.10)", iconBorder: "rgba(20,184,166,0.30)" }
          return (
            <div
              key={m.label}
              className={`mc-card mc-card-${tone}`}
              style={{ position: "relative", overflow: "hidden", padding: "20px 22px" }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: accent.eyebrow, textTransform: "uppercase", letterSpacing: "0.14em" }}>
                  {m.label}
                </span>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: accent.iconBg, border: `1px solid ${accent.iconBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={accent.icon} strokeWidth="2">{m.icon}</svg>
                </div>
              </div>
              <div className={tone === "orange" ? "mc-stat-num mc-stat-num-money" : "mc-stat-num mc-stat-num-teal"} style={{ fontSize: "clamp(28px, 3.2vw, 40px)" }}>{m.value}</div>
              <div style={{ fontSize: 11.5, marginTop: 8, color: "#4A6670", fontWeight: 500 }}>{m.sub}</div>
            </div>
          )
        })}
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
                        <td style={td}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {statusPill(job.status)}
                            {(job.status === "scheduled" || job.status === "accepted") && (
                              <button
                                onClick={() => handleJobAction(job.id, "completed")}
                                disabled={!!actionLoading}
                                style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 6, background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#2563EB", cursor: "pointer", opacity: actionLoading ? 0.6 : 1 }}
                                title="Mark this job as completed — triggers Google review request to customer (Growth/Premium tiers)"
                              >
                                Mark complete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Consulting Reports — sunset orange palette */}
          <div style={{
            background: "linear-gradient(160deg, #FFF6EE 0%, #FFFFFF 60%)",
            border: "1px solid rgba(232,116,43,0.24)",
            borderRadius: 14,
            overflow: "hidden",
            boxShadow: "0 6px 20px rgba(232,116,43,0.12), 0 0 0 1px rgba(232,116,43,0.06)",
          }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 20px",
              borderBottom: "1px solid rgba(232,116,43,0.18)",
              background: "linear-gradient(135deg, rgba(232,116,43,0.06), rgba(255,157,90,0.10))",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 9,
                  background: "linear-gradient(135deg, #FF9D5A, #E8742B)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 6px 14px rgba(232,116,43,0.42)",
                  flexShrink: 0,
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="9" y1="13" x2="15" y2="13"/>
                    <line x1="9" y1="17" x2="13" y2="17"/>
                  </svg>
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 9, fontWeight: 800, color: "#C84B26", letterSpacing: "0.16em", textTransform: "uppercase", padding: "2px 8px", borderRadius: 99, background: "rgba(232,116,43,0.12)", border: "1px solid rgba(232,116,43,0.30)" }}>Consulting</span>
                    <div style={cardTitle}>BellAveGo Consulting Reports</div>
                  </div>
                  <div style={{ fontSize: 11, color: "#8B5A3D", marginTop: 3, fontWeight: 500 }}>Your quarterly growth advisor — delivered as a PDF</div>
                </div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 800, padding: "5px 11px", borderRadius: 99, background: "rgba(232,116,43,0.12)", color: "#C84B26", border: "1px solid rgba(232,116,43,0.32)" }}>
                {reports.length} {reports.length === 1 ? "report" : "reports"}
              </span>
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
                      <th style={{ ...th, color: "#8B5A3D", borderBottom: "1px solid rgba(232,116,43,0.18)" }}>Client</th>
                      <th style={{ ...th, color: "#8B5A3D", borderBottom: "1px solid rgba(232,116,43,0.18)" }}>Report</th>
                      <th style={{ ...th, color: "#8B5A3D", borderBottom: "1px solid rgba(232,116,43,0.18)" }}>Date</th>
                      <th style={{ ...th, color: "#8B5A3D", borderBottom: "1px solid rgba(232,116,43,0.18)", textAlign: "right" }}>Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((r) => (
                      <tr key={r.id}>
                        <td style={{ ...td, borderBottom: "1px solid rgba(232,116,43,0.10)", fontWeight: 600, color: "#0B1F3A" }}>{r.client_name}</td>
                        <td style={{ ...td, borderBottom: "1px solid rgba(232,116,43,0.10)" }}>{r.title}</td>
                        <td style={{ ...td, borderBottom: "1px solid rgba(232,116,43,0.10)" }}>{new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                        <td style={{ ...td, borderBottom: "1px solid rgba(232,116,43,0.10)", textAlign: "right" }}>
                          {r.file_url ? (
                            <a href={r.file_url} target="_blank" rel="noreferrer" style={{
                              display: "inline-flex", alignItems: "center", gap: 5,
                              padding: "6px 12px",
                              borderRadius: 8,
                              background: "linear-gradient(135deg, #FF9D5A, #E8742B)",
                              color: "#fff",
                              fontSize: 11, fontWeight: 800,
                              textDecoration: "none",
                              boxShadow: "0 4px 12px rgba(232,116,43,0.38)",
                            }}>
                              View →
                            </a>
                          ) : (
                            <span style={{ fontSize: 11, color: "#8B5A3D" }}>No file</span>
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
            <div style={{ background: "linear-gradient(135deg, #FFFFFF 0%, #F0FBF8 100%)", padding: "16px 20px", borderBottom: "1px solid rgba(20,184,166,0.18)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(20,184,166,0.12)", border: "1px solid rgba(20,184,166,0.32)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0AA89F" strokeWidth="2">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                  </svg>
                </div>
                <div>
                  <div style={cardTitle}>AI Receptionist</div>
                  <div style={{ fontSize: 11, color: "#4A6670", marginTop: 2 }}>
                    24/7 · {profile?.twilio_number || (profile?.is_active ? "Provisioning…" : "We'll buy you a local number after checkout")}
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
                <div key={row.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 0", borderBottom: "1px solid rgba(232,116,43,0.08)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#FF9D5A" }} />
                    <span style={{ fontSize: 12.5, color: "#4A6670" }}>{row.label}</span>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: row.muted ? "#7AAAB2" : "#0B1F3A", fontVariantNumeric: "tabular-nums" }}>{row.val}</span>
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
                  <span style={{ fontSize: 12.5, color: "#0B1F3A", fontWeight: 600 }}>{item.label}</span>
                  <span style={{ marginLeft: "auto", fontSize: 12, color: "#0AA89F", fontWeight: 700 }}>→</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      </>
    </div>
  );
}
