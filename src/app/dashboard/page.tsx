"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { TIER_METADATA, type Tier } from "@/lib/pricing";
import { useIsMobile } from "@/lib/useIsMobile";
import PushNotificationSetup from "@/components/PushNotificationSetup";

const ADMIN_EMAILS = new Set(["pmcshane@fordham.edu", "peter@bellavego.com"]);

// Activation-banner copy. Prices come from TIER_METADATA in src/lib/pricing.ts
// (single source of truth — if pricing changes, this banner updates automatically).
const TIER_BANNER_COPY: Record<Tier, string> = {
  receptionist: "AI answers every call · 60 calls/mo · 6 AI consulting reports/yr",
  officemgr:    "Starter + 300 calls/mo + Quote Hunter + Collections + Reviews + Reputation + 12 reports/yr",
  concierge:    "Pro + unlimited calls + custom integrations + bi-weekly reports + 4-hr SLA + direct founder access",
};

// NOTE: This page previously read jobs/customers/reports directly from
// Supabase with the anon key. That leaked tenant data across customers.
// Now all reads go through /api/dashboard/summary which uses service-role
// + effectiveAuth to scope to the current (or impersonated) tenant.

type Job = {
  id: string;
  customer_name: string;
  customer_phone?: string;
  service?: string;
  job_type?: string;
  address: string;
  scheduled_at?: string;
  scheduled_time?: string;
  status: "pending" | "pending_approval" | "accepted" | "scheduled" | "declined" | "cancelled" | "completed";
  amount?: number;
  amount_estimated?: number;
  revenue_source?: 'reported' | 'estimated' | 'stripe' | null;
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
  // Renamed from `interval` to `billingCycle` so we don't shadow the global
  // `window.setInterval` (which lint rightly flags as a bug magnet).
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("annual");
  const [adminSwitching, setAdminSwitching] = useState<string | null>(null);
  const [adminBarOpen, setAdminBarOpen] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [callsToday, setCallsToday] = useState(0);
  const [callsThisWeek, setCallsThisWeek] = useState(0);
  const [leadsThisMonth, setLeadsThisMonth] = useState(0);
  // Monthly cap usage — drives the "X of N calls left this month" card.
  // unlimited=true for Elite + legacy unlimited tiers; UI flips to the
  // count-up form ("23 calls this month") with no remaining number.
  const [callsUsedThisMonth, setCallsUsedThisMonth] = useState(0);
  const [callCapMonth, setCallCapMonth] = useState<number | null>(null);
  const [callCapUnlimited, setCallCapUnlimited] = useState(false);
  // Activity feed — persistent in-app history of every call. Survives the
  // OS clearing push notifications + the contractor's inbox burying emails.
  type ActivityRow = {
    id: string
    call_sid: string | null
    caller_phone: string | null
    job_type: string | null
    job_created: boolean | null
    booking_completed: boolean | null
    summary: string | null
    viewed_at: string | null
    created_at: string
    recording_url: string | null
  }
  const [activity, setActivity] = useState<ActivityRow[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const router = useRouter();
  const { user } = useUser();
  const isAdmin = !!user?.primaryEmailAddress?.emailAddress &&
    ADMIN_EMAILS.has(user.primaryEmailAddress.emailAddress.toLowerCase());
  const isMobile = useIsMobile();

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

  useEffect(() => {
    fetchAll();
    // Auto-refresh every 15s so calls + jobs + revenue counters update in
    // near-real-time without the contractor having to reload the page.
    // 15s = fast enough that a missed call "feels" instant when their
    // phone buzzes with the SMS alert, slow enough to avoid hammering
    // the summary API (4 reads × 4/min × 100 contractors = manageable).
    // Pauses when the tab is hidden so background tabs don't burn quota.
    const tick = setInterval(() => {
      if (document.visibilityState === "visible") fetchAll();
    }, 15_000);
    return () => clearInterval(tick);
  }, []);

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
    let summary: {
      jobs?: Job[]
      jobsCount?: number
      customersCount?: number
      reports?: Report[]
      callsToday?: number
      leadsThisMonth?: number
      callsThisWeek?: number
    } | null = null;
    try {
      const res = await fetch("/api/dashboard/summary");
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setSummaryError(j.error || `Dashboard load failed (HTTP ${res.status}) — refresh in a moment, or text our team at 773-710-9565 if it persists.`);
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
    // Revenue: prefer real reported amounts, fall back to trade-average estimates.
    // Includes scheduled + completed (excludes only explicit cancel/decline)
    // because the AI books many jobs that contractors never mark "completed"
    // in our dashboard — would otherwise look like $0 even with bookings.
    const revenue = jobList
      .filter((j) => !["cancelled", "declined"].includes(j.status))
      .reduce((sum, j) => sum + (j.amount || j.amount_estimated || 0), 0);
    setJobs(jobList);
    setReports((summary.reports as Report[]) || []);
    setCounts({
      jobs: summary.jobsCount || 0,
      customers: summary.customersCount || 0,
      revenue,
      leads: summary.leadsThisMonth || 0,
    });
    setCallsToday(summary.callsToday || 0);
    setCallsThisWeek(summary.callsThisWeek || 0);
    setLeadsThisMonth(summary.leadsThisMonth || 0);

    // Pull monthly cap usage in parallel — small, independent endpoint
    // so a slow cap query never blocks the rest of the dashboard render.
    fetch('/api/calls/count')
      .then(r => (r.ok ? r.json() : null))
      .then((c: { used?: number; cap?: number | null; unlimited?: boolean } | null) => {
        if (!c) return
        setCallsUsedThisMonth(c.used ?? 0)
        setCallCapMonth(typeof c.cap === 'number' ? c.cap : null)
        setCallCapUnlimited(!!c.unlimited)
      })
      .catch(() => {})
    setLoadingJobs(false);

    // Activity feed — separate endpoint, runs in parallel-ish. Errors silently
    // (the activity panel just hides if it can't load).
    try {
      const aRes = await fetch("/api/dashboard/activity?limit=15");
      if (aRes.ok) {
        const a = await aRes.json();
        setActivity(a.activity || []);
        setUnreadCount(a.unread || 0);
      }
    } catch {
      /* non-fatal */
    }
  }

  async function markAllActivityRead() {
    try {
      await fetch("/api/dashboard/activity?all=1", { method: "POST" });
      setActivity((rows) => rows.map((r) => ({ ...r, viewed_at: new Date().toISOString() })));
      setUnreadCount(0);
    } catch {}
  }

  async function markActivityRead(id: string) {
    try {
      await fetch(`/api/dashboard/activity?id=${id}`, { method: "POST" });
      setActivity((rows) => rows.map((r) => (r.id === id ? { ...r, viewed_at: new Date().toISOString() } : r)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {}
  }

  async function startCheckout() {
    // Elite (concierge) went live 2026-05-27 — straight to Stripe, no waitlist.
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, interval: billingCycle }),
      }).then((r) => r.json());
      // Belt-and-suspenders: server-side guard also returns {waitlist, redirect}
      if (res.waitlist && res.redirect) {
        window.location.href = res.redirect;
        return;
      }
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

  // Skeleton loader — looks like the table is mid-load instead of just "Loading..."
  function TableSkeleton() {
    return (
      <div style={{ padding: "8px 0 24px" }}>
        <style>{`@keyframes dashShimmer { 0% { background-position: -300px 0 } 100% { background-position: 300px 0 } }`}</style>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 0", borderBottom: "1px solid rgba(232,116,43,0.06)", opacity: 0.6 - i * 0.15 }}>
            <div style={{ flex: 1.6, height: 12, borderRadius: 4, background: "linear-gradient(90deg, rgba(232,116,43,0.06) 0%, rgba(232,116,43,0.16) 50%, rgba(232,116,43,0.06) 100%)", backgroundSize: "600px 100%", animation: "dashShimmer 1.4s linear infinite" }} />
            <div style={{ flex: 1, height: 12, borderRadius: 4, background: "linear-gradient(90deg, rgba(232,116,43,0.06) 0%, rgba(232,116,43,0.16) 50%, rgba(232,116,43,0.06) 100%)", backgroundSize: "600px 100%", animation: "dashShimmer 1.4s linear infinite 0.2s" }} />
            <div style={{ flex: 1.2, height: 12, borderRadius: 4, background: "linear-gradient(90deg, rgba(232,116,43,0.06) 0%, rgba(232,116,43,0.16) 50%, rgba(232,116,43,0.06) 100%)", backgroundSize: "600px 100%", animation: "dashShimmer 1.4s linear infinite 0.4s" }} />
            <div style={{ flex: 0.8, height: 22, borderRadius: 11, background: "linear-gradient(90deg, rgba(232,116,43,0.06) 0%, rgba(232,116,43,0.16) 50%, rgba(232,116,43,0.06) 100%)", backgroundSize: "600px 100%", animation: "dashShimmer 1.4s linear infinite 0.6s" }} />
          </div>
        ))}
      </div>
    );
  }
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
    // New take_message flow stores non-date values like "callback requested",
    // "Wednesday afternoon", "ASAP" in scheduled_time. Don't try to parse those
    // as ISO timestamps — display them verbatim, capitalized.
    if (!/^\d{4}-\d{2}-\d{2}/.test(iso) && isNaN(Date.parse(iso))) {
      return iso.charAt(0).toUpperCase() + iso.slice(1);
    }
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  // Stripped to two metrics that actually reflect the AI's work: calls
  // answered today + this week. Revenue + Total Customers cards removed
  // 2026-05-24 — revenue moved into the consulting reports (estimated
  // there with proper trade-average context); "Total Customers" was
  // confusing because it counted contact rows AI created, not paying
  // accounts. Less noise, more signal.
  const metrics = [
    {
      label: "BellAveGo Calls Answered Today", value: String(callsToday),
      sub: callsToday > 0 ? `${callsToday} call${callsToday === 1 ? "" : "s"} the AI handled today` : "No calls yet today",
      iconBg: "#FFFBEB", iconColor: "#D97706", accentColor: "#F59E0B",
      icon: <><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></>,
    },
    {
      label: "BellAveGo Calls Answered This Week", value: String(callsThisWeek),
      sub: callsThisWeek > 0 ? `${callsThisWeek} call${callsThisWeek === 1 ? "" : "s"} in the last 7 days` : "No calls in the last 7 days",
      iconBg: "#EFF6FF", iconColor: "#2563EB", accentColor: "#3B82F6",
      icon: <><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></>,
    },
    // Monthly cap card — fed by /api/calls/count. Counts call_logs rows
    // since the 1st of the current calendar month + tier cap from
    // TIER_CALL_CAP. Unlimited tiers (Elite + legacy) show the count-up
    // form ("23 calls this month") with no remaining number.
    callCapUnlimited
      ? {
          label: "Calls This Month", value: String(callsUsedThisMonth),
          sub: "Unlimited plan — no monthly cap",
          iconBg: "#F0FDF4", iconColor: "#16A34A", accentColor: "#22C55E",
          icon: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
        }
      : {
          label: "Calls Left This Month",
          value: callCapMonth != null ? `${Math.max(0, callCapMonth - callsUsedThisMonth)} / ${callCapMonth}` : '—',
          sub:
            callCapMonth == null
              ? 'Counting your calls…'
              : callsUsedThisMonth >= callCapMonth
                ? 'Cap reached. Upgrade for more.'
                : `${callsUsedThisMonth} of ${callCapMonth} used`,
          iconBg: "#F5F3FF", iconColor: "#7C3AED", accentColor: "#8B5CF6",
          icon: <><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></>,
        },
  ];

  // Dashboard zoom-out 2026-06-01 — Peter said the home dashboard was too
  // zoomed in on desktop + mobile. 90% zoom on desktop, 95% on mobile so
  // paying contractors see more data at a glance without scrolling.
  return (
    <div style={{
      padding: isMobile ? "10px 8px 36px" : "28px 32px 60px",
      fontFamily: "'Inter', system-ui, sans-serif",
      fontSize: isMobile ? 12 : undefined,
      zoom: isMobile ? 0.95 : 0.9,
    } as React.CSSProperties}>

      {/* CALENDAR SYNC PROMO — top of dashboard, hard to miss. Hides itself
          once the contractor has connected at least one calendar. */}
      <CalendarSyncBanner />

      {/* PUSH NOTIFICATION OPT-IN — auto-hides if subscribed/unsupported.
          Replaces SMS for contractor lead alerts; survives A2P 10DLC blackout. */}
      <PushNotificationSetup />

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
        {isAdmin ? (
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "5px 8px 5px 12px",
            background: "#0B1F3A", borderRadius: 99,
            fontSize: 11, fontWeight: 700,
          }}>
            <button
              onClick={() => setAdminBarOpen((o) => !o)}
              style={{
                background: "transparent", border: "none", color: "#7AAAB2",
                letterSpacing: "0.06em", textTransform: "uppercase",
                fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0,
                fontFamily: "inherit",
              }}
              title={adminBarOpen ? "Hide admin tools" : "Show admin tools"}
            >
              {adminBarOpen ? "Admin ▴" : "Admin ▾"}
            </button>
            {adminBarOpen && (
              <>
            <span style={{ color: "#7AAAB2", letterSpacing: "0.06em", textTransform: "uppercase", marginRight: 2 }}>·</span>
            {(["receptionist", "officemgr", "concierge"] as const).map(t => {
              const isCurrent = profile?.plan_tier === t;
              const label = t === "receptionist" ? "Starter" : t === "officemgr" ? "Pro" : "Elite";
              return (
                <button
                  key={t}
                  onClick={() => adminSwitchTier(t)}
                  disabled={adminSwitching !== null || isCurrent}
                  title={t === "receptionist" ? "Starter" : t === "officemgr" ? "Pro" : "Elite"}
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
            <Link href="/admin/founder" style={{ padding: "4px 10px", borderRadius: 99, background: "rgba(10,168,159,0.18)", color: "#5EEAD4", fontSize: 11, fontWeight: 700, textDecoration: "none" }}>
              Nucleus →
            </Link>
              </>
            )}
          </div>
        ) : profile?.plan_tier && (TIER_METADATA[profile.plan_tier as Tier]) && (
          // Customer-facing tier badge — shows ONLY their tier, plus an Upgrade
          // button to /pricing unless they're already on the top tier. No
          // sibling-tier names visible to customers (those were leaking the
          // admin tier switcher's vocabulary, e.g. "Mission Control / Operator /
          // Concierge" all at once which made customers think they had access
          // to features they hadn't bought).
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 14px",
              background: "#FFF7EE", borderRadius: 99,
              border: "1px solid rgba(232,116,43,0.22)",
            }}>
              <span style={{
                fontSize: 9, fontWeight: 800, color: "#C84B26",
                letterSpacing: "0.12em", textTransform: "uppercase",
              }}>
                Your plan
              </span>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#0B1F3A", letterSpacing: "-0.2px" }}>
                {TIER_METADATA[profile.plan_tier as Tier].name}
              </span>
            </div>
            {profile.plan_tier !== 'concierge' && (
              <Link
                href="/dashboard/upgrade"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "6px 14px", borderRadius: 99,
                  background: "linear-gradient(135deg, #FF9D5A 0%, #E8742B 100%)",
                  color: "#fff", fontSize: 12, fontWeight: 800,
                  textDecoration: "none",
                  boxShadow: "0 4px 12px rgba(232,116,43,0.32)",
                }}
              >
                Upgrade plan →
              </Link>
            )}
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

      {/* Activation banner — all pricing from src/lib/pricing.ts (single source
          of truth). When you update tier prices there, this banner updates
          automatically with no code change. */}
      {profile && !profile.is_active && (() => {
        const cur = TIER_METADATA[tier];
        // TIER_METADATA.annual is the per-MONTH equivalent for annual plans.
        // For "charged today" we need the yearly total (annual × 12) + setup.
        const subToday = billingCycle === "monthly" ? cur.monthly : cur.annual * 12;
        const totalToday = subToday + cur.setup;
        // Elite (concierge) live 2026-05-27 — now selectable from the activation banner.
        const tierKeys: Tier[] = ["receptionist", "officemgr", "concierge"];
        return (
          <div style={{ marginBottom: 22, padding: "20px 22px", background: "linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)", border: "1px solid #FDE68A", borderRadius: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#92400E" }}>Activate your AI receptionist</div>
                <div style={{ fontSize: 12, color: "#78350F", marginTop: 3, lineHeight: 1.5 }}>
                  Pick a plan. We auto-provision your number, register A2P SMS, and tune your prompt after checkout. 7-day free trial, cancel anytime.
                </div>
              </div>
              <div style={{ display: "flex", background: "#fff", border: "1px solid #FDE68A", borderRadius: 10, padding: 3, fontSize: 11, fontWeight: 700 }}>
                {(["annual", "monthly"] as const).map((i) => (
                  <button key={i} onClick={() => setBillingCycle(i)} style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", background: billingCycle === i ? "#92400E" : "transparent", color: billingCycle === i ? "#fff" : "#78350F", textTransform: "capitalize" }}>
                    {i}{i === "annual" ? " (save 17%)" : ""}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 14 }}>
              {tierKeys.map((k) => {
                const t = TIER_METADATA[k];
                const perMonth = billingCycle === "monthly" ? t.monthly : t.annual;
                const callsLine = k === "receptionist" ? "60 calls/mo" : k === "officemgr" ? "300 calls/mo" : "Unlimited calls";
                const setupLine = t.setup > 0 ? ` · +$${t.setup} setup` : "";
                const active = tier === k;
                return (
                  <button key={k} onClick={() => setTier(k)} style={{ padding: "14px 14px", borderRadius: 10, border: active ? "2px solid #92400E" : "1px solid #FDE68A", background: active ? "#fff" : "rgba(255,255,255,0.5)", textAlign: "left", cursor: "pointer", position: "relative" }}>
                    {k === "officemgr" && (
                      <span style={{ position: "absolute", top: -10, right: 10, fontSize: 9, fontWeight: 800, padding: "3px 8px", borderRadius: 10, background: "#22C55E", color: "#fff", letterSpacing: "0.06em", textTransform: "uppercase" }}>Most popular</span>
                    )}
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#92400E", marginBottom: 2 }}>{t.name}</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: "#0B1F3A", letterSpacing: "-0.5px" }}>${perMonth}<span style={{ fontSize: 11, color: "#78350F", fontWeight: 700 }}>/mo</span></div>
                    <div style={{ fontSize: 9, color: "#78350F", marginTop: 2 }}>{callsLine}{setupLine}</div>
                    <div style={{ fontSize: 10, color: "#A16207", marginTop: 4, lineHeight: 1.4 }}>{TIER_BANNER_COPY[k]}</div>
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
              <div style={{ fontSize: 12, color: "#78350F" }}>
                <span style={{ fontWeight: 700 }}>${totalToday.toLocaleString()}</span> charged today
                {cur.setup > 0 ? ` ($${subToday.toLocaleString()} ${billingCycle} + $${cur.setup} setup)` : ""}.
                {billingCycle === "monthly" ? " 1-week free trial · cancel anytime." : " 12 months for the price of 10."}
              </div>
              <button onClick={startCheckout} disabled={checkoutLoading} style={{ padding: "12px 26px", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 800, cursor: checkoutLoading ? "wait" : "pointer", background: "linear-gradient(135deg, #22C55E 0%, #16A34A 100%)", color: "#fff", boxShadow: "0 4px 14px rgba(34,197,94,0.32)", whiteSpace: "nowrap" }}>
                {checkoutLoading ? "Loading…" : `Let's get started →`}
              </button>
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: "#A16207", lineHeight: 1.7 }}>
              Multi-location franchise (3+ locations)? <a href="/waitlist?tier=multi_location" style={{ color: "#92400E", fontWeight: 700, textDecoration: "underline" }}>Text us at (773) 710-9565 for a quote →</a>
            </div>
          </div>
        );
      })()}

      {/* Number-pending banner */}
      {profile?.is_active && !profile.twilio_number && (
        <div style={{ marginBottom: 22, padding: isMobile ? "14px 16px" : "16px 22px", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 14, display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", gap: isMobile ? 12 : 16 }}>
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

      {/* Forwarding-not-verified banner — single most common "looks fine
          but isn't" state. Contractor paid + got a Twilio number + got
          welcomed, but never actually dialed their carrier's conditional-
          forward code (**61*…*11*15# on GSM, *71… on Verizon) to forward
          their business line. Until they do, Emma waits silently
          and nothing happens. Sticky warning until forwarding_verified_at
          is stamped (set by /api/onboarding/verify-forwarding when our
          test call lands on Vapi within 90s). */}
      {profile?.is_active && profile.twilio_number && !((profile as { forwarding_verified_at?: string | null }).forwarding_verified_at) && (
        <div style={{ marginBottom: 22, padding: isMobile ? "14px 16px" : "16px 22px", background: "linear-gradient(135deg, #FFF7EE 0%, #FEF3C7 100%)", border: "1px solid rgba(232,116,43,0.40)", borderRadius: 14, display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", gap: isMobile ? 12 : 16, boxShadow: "0 8px 24px rgba(232,116,43,0.10)" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#C84B26", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>⚠️</span>
              Call forwarding isn&apos;t set up yet — Emma can&apos;t answer your calls
            </div>
            <div style={{ fontSize: 12, color: "#92400E", marginTop: 4, lineHeight: 1.55 }}>
              Your AI number ({profile.twilio_number}) is live, but your business line still rings your old voicemail. Forward your line to Emma so missed calls actually reach her — 2-minute walkthrough.
            </div>
          </div>
          <Link href="/dashboard/forwarding" style={{ padding: "10px 20px", borderRadius: 10, fontSize: 12, fontWeight: 800, background: "linear-gradient(135deg, #FF9D5A, #E8742B)", color: "#fff", textDecoration: "none", whiteSpace: "nowrap", boxShadow: "0 6px 18px rgba(232,116,43,0.32)", flexShrink: 0 }}>
            Set up forwarding →
          </Link>
        </div>
      )}

      {/* Dashboard shell — always rendered. Pre-activation users see empty
          state behind the activation banner above (sells with desire, not a wall). */}
      <>

      {/* Metric cards — big bold numbers, alternating orange + teal glows */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(auto-fit, minmax(180px, 1fr))", gap: isMobile ? 10 : 14, marginBottom: isMobile ? 18 : 24 }}>
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

      {/* Two-col layout — stacks on mobile so the 310px sidebar doesn't
          overflow under the main content panel */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 310px", gap: isMobile ? 12 : 16, alignItems: "start" }}>

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
                <TableSkeleton />
              ) : pending.length === 0 ? (
                <div style={emptyBox}>
                  <div style={emptyTitle}>No pending requests</div>
                  <div style={emptySub}>New job requests from your AI receptionist will appear here for approval.</div>
                </div>
              ) : (
                <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", margin: "0 -8px", padding: "0 8px" }}>
                <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse" }}>
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
                </div>
              )}
            </div>
          </div>

          {/* Activity feed — persistent history of every call the AI handled.
              Push notifications expire from the OS; this is the durable in-app
              log. Unread badge + "Mark all read" button. */}
          <div style={card}>
            <div style={{ ...cardHead, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={cardTitle}>Recent activity</div>
                {unreadCount > 0 && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    minWidth: 22, height: 22, padding: '0 8px',
                    background: 'linear-gradient(135deg, #FF9D5A, #E8742B)',
                    color: '#fff', borderRadius: 99,
                    fontSize: 11, fontWeight: 900, letterSpacing: '-0.2px',
                    boxShadow: '0 2px 8px rgba(232,116,43,0.32)',
                  }}>
                    {unreadCount} new
                  </span>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={markAllActivityRead}
                  style={{ fontSize: 11, fontWeight: 700, color: '#0AA89F', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Mark all read →
                </button>
              )}
            </div>
            <div style={{ padding: '0 20px 16px' }}>
              {activity.length === 0 ? (
                <div style={emptyBox}>
                  <div style={emptyTitle}>No activity yet</div>
                  <div style={emptySub}>Every call the AI handles will show up here — with full transcripts.</div>
                </div>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {activity.map((a) => {
                    const isUnread = !a.viewed_at
                    const created = new Date(a.created_at)
                    const minutesAgo = Math.round((Date.now() - created.getTime()) / 60000)
                    const timeLabel = minutesAgo < 1 ? 'just now'
                      : minutesAgo < 60 ? `${minutesAgo}m ago`
                      : minutesAgo < 1440 ? `${Math.round(minutesAgo / 60)}h ago`
                      : created.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    const phonePretty = a.caller_phone
                      ? a.caller_phone.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3')
                      : 'unknown caller'
                    const summaryShort = (a.summary || a.job_type || 'Call received').slice(0, 110)
                    const isDbFail = a.summary?.startsWith('DB_INSERT_FAILED')
                    return (
                      <li
                        key={a.id}
                        onClick={() => isUnread && markActivityRead(a.id)}
                        style={{
                          padding: '12px 14px',
                          borderRadius: 10,
                          background: isUnread ? 'linear-gradient(90deg, rgba(255,157,90,0.08), rgba(255,157,90,0.02))' : '#F8FCFB',
                          border: `1px solid ${isUnread ? 'rgba(232,116,43,0.22)' : 'rgba(10,168,159,0.10)'}`,
                          cursor: isUnread ? 'pointer' : 'default',
                          display: 'flex', alignItems: 'flex-start', gap: 10,
                          transition: 'background 0.15s ease',
                        }}
                      >
                        {isUnread && (
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#E8742B', flexShrink: 0, marginTop: 6, boxShadow: '0 0 0 2px rgba(232,116,43,0.16)' }} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                            <span style={{ fontSize: 13, fontWeight: 800, color: '#0B1F3A' }}>
                              {a.booking_completed ? '✅ Booked' : a.job_created ? '📞 Lead captured' : isDbFail ? '⚠️ Save failed' : '📞 Call'}
                            </span>
                            <span style={{ fontSize: 11.5, color: '#7AAAB2', fontWeight: 600 }}>{phonePretty}</span>
                            <span style={{ fontSize: 11, color: '#A0BCC2', marginLeft: 'auto' }}>{timeLabel}</span>
                          </div>
                          <div style={{ fontSize: 12.5, color: '#4A6670', lineHeight: 1.45 }}>
                            {summaryShort}{summaryShort.length === 110 ? '…' : ''}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 6, alignItems: 'center' }}>
                            {a.caller_phone && (
                              <a
                                href={`tel:${a.caller_phone}`}
                                onClick={(e) => e.stopPropagation()}
                                style={{ fontSize: 11.5, fontWeight: 700, color: '#0AA89F', textDecoration: 'none' }}
                              >
                                📲 Tap to call back
                              </a>
                            )}
                            {a.recording_url && (
                              <a
                                href={a.recording_url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                style={{ fontSize: 11.5, fontWeight: 700, color: '#7C3AED', textDecoration: 'none' }}
                              >
                                ▶ Listen to call
                              </a>
                            )}
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
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
                <TableSkeleton />
              ) : jobs.length === 0 ? (
                <div style={emptyBox}>
                  <div style={emptyTitle}>No jobs yet</div>
                  <div style={emptySub}>Jobs created by your AI receptionist or manually will appear here.</div>
                </div>
              ) : (
                <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", margin: "0 -8px", padding: "0 8px" }}>
                <table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Customer</th>
                      <th style={th}>Phone</th>
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
                        <td style={td}>
                          {job.customer_phone ? (
                            <a
                              href={`tel:${job.customer_phone}`}
                              style={{ color: "#0AA89F", fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}
                            >
                              📞 {job.customer_phone.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3")}
                            </a>
                          ) : "—"}
                        </td>
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
                </div>
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
                  <div style={emptyTitle}>Your first report is on the way</div>
                  <div style={emptySub}>
                    Your welcome consulting report auto-generates the day after activation.
                    After that, reports arrive on your plan&apos;s cadence — bi-monthly (Mission Control),
                    monthly (Operator), or weekly + quarterly (Concierge).
                  </div>
                </div>
              ) : (
                <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", margin: "0 -8px", padding: "0 8px" }}>
                <table style={{ width: "100%", minWidth: 520, borderCollapse: "collapse" }}>
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
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right col — promoted ABOVE the left col on mobile so AI Receptionist
            status (the #1 thing contractors check) is the first thing they see,
            not buried below the jobs + reports tables. Desktop unchanged. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, order: isMobile ? -1 : 0 }}>

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
              {/* Live status — pulled from profile + /api/dashboard/summary.
                  Previously these were hardcoded ("Not connected" / "0") and
                  customers thought their AI was broken when it was actually fine. */}
              {(() => {
                const isLive = !!(profile?.is_active && profile?.twilio_number);
                const formattedOwnerPhone = profile?.owner_phone
                  ? profile.owner_phone.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3")
                  : "Not set";
                return [
                  { label: "Status", val: isLive ? "Connected · listening" : "Not connected", muted: !isLive },
                  { label: "Approval SMS to", val: formattedOwnerPhone, muted: !profile?.owner_phone },
                  { label: "Calls today", val: String(callsToday), muted: callsToday === 0 },
                  { label: "Leads captured (mo)", val: String(leadsThisMonth), muted: leadsThisMonth === 0 },
                ];
              })().map((row) => (
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

/**
 * CALENDAR SYNC BANNER — top-of-dashboard prompt to connect Google / Outlook /
 * Calendly. Hides itself once any calendar is connected (checks /api/calendar/status
 * on mount). Click goes straight to /dashboard/calendar.
 *
 * Kept inline (not extracted to /components) because it's tightly coupled to
 * the dashboard's own visual rhythm.
 */
function CalendarSyncBanner() {
  // Native BellAveGo calendar is the second-tier surface after the main
  // dashboard metrics. ALWAYS renders — pulls upcoming appointment count
  // + next-event preview, links straight to /dashboard/calendar.
  const [upcomingCount, setUpcomingCount] = useState<number>(0);
  const [nextEventLabel, setNextEventLabel] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/calendar/events?days=30")
      .then((r) => r.json())
      .then((j: { events?: Array<{ start: string; summary: string; isBellaveGo?: boolean }> }) => {
        const events = (j.events ?? []).filter((e) => new Date(e.start).getTime() > Date.now());
        setUpcomingCount(events.length);
        if (events[0]) {
          const d = new Date(events[0].start);
          const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
          const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
          setNextEventLabel(`${day} · ${time} — ${events[0].summary}`);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  if (!loaded) return null;

  return (
    <Link
      href="/dashboard/calendar"
      style={{
        display: "block",
        textDecoration: "none",
        marginBottom: 22,
        padding: "20px 24px",
        background: "linear-gradient(135deg, #0B1F3A 0%, #163356 60%, #0D8F87 100%)",
        border: "1.5px solid rgba(255,157,90,0.42)",
        borderRadius: 16,
        boxShadow: "0 12px 30px rgba(7,27,58,0.22)",
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Decorative glow */}
      <div style={{
        position: "absolute", top: -40, right: -40,
        width: 160, height: 160, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(255,157,90,0.42) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />
      <div style={{ display: "flex", alignItems: "center", gap: 16, position: "relative" }}>
        <div
          style={{
            width: 48, height: 48, borderRadius: 12,
            background: "linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
            boxShadow: "0 6px 16px rgba(232,116,43,0.42)",
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0B1F3A" strokeWidth="2.6">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span
              style={{
                fontSize: 9, fontWeight: 900, color: "#5EEAD4",
                background: "rgba(94,234,212,0.14)", padding: "3px 9px", borderRadius: 99,
                letterSpacing: "0.14em", textTransform: "uppercase",
              }}
            >
              BellAveGo Calendar
            </span>
            <span style={{ fontSize: 16, fontWeight: 900, color: "#fff", letterSpacing: "-0.02em" }}>
              {upcomingCount === 0 ? "No upcoming jobs" : upcomingCount === 1 ? "1 upcoming job" : `${upcomingCount} upcoming jobs`}
            </span>
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.78)", lineHeight: 1.5 }}>
            {nextEventLabel
              ? <>Next: <strong style={{ color: "#fff" }}>{nextEventLabel}</strong></>
              : <>AI bookings land here automatically. Click to view your full schedule + add manual appointments.</>
            }
          </div>
        </div>
        <div
          style={{
            padding: "10px 18px", borderRadius: 9,
            background: "rgba(255,255,255,0.14)",
            color: "#fff", fontSize: 13, fontWeight: 800,
            flexShrink: 0,
            border: "1px solid rgba(255,255,255,0.2)",
          }}
        >
          Open →
        </div>
      </div>
    </Link>
  );
}
