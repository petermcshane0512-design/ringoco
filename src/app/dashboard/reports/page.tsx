"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { useUser } from "@clerk/nextjs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

type Report = {
  id: string;
  title: string;
  period_label: string | null;
  report_type: string;
  bellavego_score: number | null;
  created_at: string;
  pdf_url: string | null;
};

export default function ReportsIndexPage() {
  const { user, isLoaded } = useUser();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoaded || !user) return;
    (async () => {
      const { data } = await supabase
        .from("consulting_reports")
        .select("id, title, period_label, report_type, bellavego_score, created_at, pdf_url")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      setReports((data as Report[]) ?? []);
      setLoading(false);
    })();
  }, [user, isLoaded]);

  return (
    <div style={{ padding: "32px 32px 80px", fontFamily: "'Inter', system-ui, sans-serif", maxWidth: 980, margin: "0 auto" }}>
      <Link href="/dashboard" style={{ fontSize: 12, fontWeight: 700, color: "#0AA89F", textDecoration: "none" }}>← Back to dashboard</Link>
      <h1 style={{ fontSize: 28, fontWeight: 900, color: "#0B1F3A", letterSpacing: "-0.03em", marginTop: 14, marginBottom: 6 }}>
        Your consulting reports
      </h1>
      <p style={{ fontSize: 14, color: "#4A7A80", marginBottom: 26, lineHeight: 1.55 }}>
        AI-generated growth reports based on your actual call and job data, plus local market intel. Delivered automatically on your plan&apos;s cadence.
      </p>

      {loading ? (
        <div style={emptyBox}>
          <div style={{ fontSize: 13, color: "#7AAAB2" }}>Loading your reports…</div>
        </div>
      ) : reports.length === 0 ? (
        <div style={{ background: "linear-gradient(160deg, #FFF6EE 0%, #FFFFFF 60%)", border: "1px dashed rgba(232,116,43,0.32)", borderRadius: 14, padding: "40px 22px", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#0B1F3A", marginBottom: 6 }}>No reports yet</div>
          <div style={{ fontSize: 12, color: "#8B5A3D", lineHeight: 1.6, maxWidth: 460, margin: "0 auto" }}>
            Your <strong>welcome report</strong> is auto-generated the day after activation. After that, reports arrive on your plan&apos;s cadence:
            Receptionist &rarr; bi-monthly (6/yr) &nbsp;·&nbsp; Office Manager &rarr; monthly (12/yr) &nbsp;·&nbsp; Concierge &rarr; weekly (52/yr) + quarterly deep-dive.
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {reports.map((r) => (
            <Link key={r.id} href={`/dashboard/reports/${r.id}`} style={{
              display: "flex", alignItems: "center", gap: 16,
              padding: "18px 22px",
              background: "#fff",
              border: "1px solid rgba(232,116,43,0.18)",
              borderRadius: 14,
              textDecoration: "none",
              transition: "transform 0.18s ease, box-shadow 0.18s ease",
              boxShadow: "0 2px 14px rgba(7,27,58,0.05)",
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 11,
                background: r.report_type === "welcome" ? "linear-gradient(135deg, #FF9D5A, #E8742B)" : "linear-gradient(135deg, #0AA89F, #0D8F87)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
                boxShadow: r.report_type === "welcome"
                  ? "0 6px 14px rgba(232,116,43,0.36)"
                  : "0 6px 14px rgba(10,168,159,0.32)",
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="9" y1="13" x2="15" y2="13"/>
                  <line x1="9" y1="17" x2="13" y2="17"/>
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 9, fontWeight: 800, color: r.report_type === "welcome" ? "#C84B26" : "#0D8F87", letterSpacing: "0.14em", textTransform: "uppercase", padding: "2px 8px", borderRadius: 99, background: r.report_type === "welcome" ? "rgba(232,116,43,0.10)" : "rgba(10,168,159,0.10)", border: `1px solid ${r.report_type === "welcome" ? "rgba(232,116,43,0.28)" : "rgba(10,168,159,0.28)"}` }}>
                    {r.report_type === "welcome" ? "Welcome" : "Periodic"}
                  </span>
                  <span style={{ fontSize: 11, color: "#7AAAB2" }}>
                    {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#0B1F3A", letterSpacing: "-0.2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {r.title}
                </div>
                <div style={{ fontSize: 11, color: "#7AAAB2", marginTop: 2 }}>
                  {r.period_label || "—"}{r.bellavego_score != null && ` · BellAveGo Score ${r.bellavego_score.toFixed(1)}/10`}
                </div>
              </div>
              <span style={{ fontSize: 18, color: "#A0BCC2" }}>›</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

const emptyBox: React.CSSProperties = {
  background: "#fff", border: "1px solid rgba(10,168,159,0.14)",
  borderRadius: 14, padding: "40px 22px", textAlign: "center",
};
