import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { effectiveAuth } from "@/lib/effectiveAuth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
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

export default async function ReportsIndexPage() {
  const { userId } = await effectiveAuth();
  if (!userId) redirect("/sign-in?redirect_url=/dashboard/reports");

  const { data } = await supabase
    .from("consulting_reports")
    .select("id, title, period_label, report_type, bellavego_score, created_at, pdf_url")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  const reports = (data as Report[] | null) ?? [];

  return (
    <div style={{ padding: "32px 32px 80px", fontFamily: "'Inter', system-ui, sans-serif", maxWidth: 1080, margin: "0 auto" }}>
      <Link href="/dashboard" style={{ fontSize: 12, fontWeight: 700, color: "#C84B26", textDecoration: "none" }}>← Back to dashboard</Link>

      <div style={{ marginTop: 18, marginBottom: 8, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 30, fontWeight: 900, color: "#0B1F3A", letterSpacing: "-0.04em", margin: 0 }}>
          Consulting <span style={{ background: "linear-gradient(135deg, #FF9D5A, #E8742B 60%, #C84B26)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>reports.</span>
        </h1>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "5px 12px", borderRadius: 99,
          background: "rgba(232,116,43,0.10)", border: "1px solid rgba(232,116,43,0.32)",
          fontSize: 10.5, fontWeight: 800, color: "#C84B26",
          letterSpacing: "0.14em", textTransform: "uppercase",
        }}>
          McKinsey-grade · AI-generated
        </span>
      </div>
      <p style={{ fontSize: 14, color: "#4A6670", marginBottom: 30, lineHeight: 1.55, maxWidth: 720 }}>
        AI-generated growth reports based on your actual call and job data, plus local market intel. Delivered automatically on your plan&apos;s cadence.
      </p>

      {reports.length === 0 ? (
        <div className="mc-card mc-card-orange" style={{ padding: "56px 32px", textAlign: "center" }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: "linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 18px",
            boxShadow: "0 14px 32px rgba(232,116,43,0.45)",
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="9" y1="13" x2="15" y2="13"/>
              <line x1="9" y1="17" x2="13" y2="17"/>
            </svg>
          </div>
          <div style={{ fontSize: 19, fontWeight: 800, color: "#0B1F3A", marginBottom: 10, letterSpacing: "-0.2px" }}>
            Your first report is on the way
          </div>
          <div style={{ fontSize: 13.5, color: "#4A6670", lineHeight: 1.65, maxWidth: 520, margin: "0 auto" }}>
            Your <strong style={{ color: "#C84B26" }}>welcome report</strong> is auto-generated the day after activation. After that, reports arrive on your plan&apos;s cadence:<br/>
            <span style={{ display: "inline-block", marginTop: 12, fontSize: 12, color: "#3D5A62" }}>
              <strong style={{ color: "#0AA89F" }}>Mission Control</strong> · bi-monthly (6/yr)
              &nbsp;·&nbsp; <strong style={{ color: "#0AA89F" }}>Operator</strong> · monthly (12/yr)
              &nbsp;·&nbsp; <strong style={{ color: "#0AA89F" }}>Concierge</strong> · weekly (52/yr) + quarterly deep-dive
            </span>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {reports.map((r) => {
            const isWelcome = r.report_type === "welcome";
            return (
              <Link
                key={r.id}
                href={`/dashboard/reports/${r.id}`}
                className={`mc-card ${isWelcome ? "mc-card-orange" : ""}`}
                style={{
                  display: "flex", alignItems: "center", gap: 18,
                  padding: "20px 24px", textDecoration: "none",
                }}
              >
                {/* Icon */}
                <div style={{
                  width: 50, height: 50, borderRadius: 12,
                  background: isWelcome
                    ? "linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B)"
                    : "linear-gradient(135deg, #5EEAD4, #14B8A6)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                  boxShadow: isWelcome
                    ? "0 10px 24px rgba(232,116,43,0.42)"
                    : "0 10px 24px rgba(20,184,166,0.36)",
                }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={isWelcome ? "#fff" : "#0B1F3A"} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="9" y1="13" x2="15" y2="13"/>
                    <line x1="9" y1="17" x2="13" y2="17"/>
                  </svg>
                </div>

                {/* Title block */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                    <span style={{
                      fontSize: 9.5, fontWeight: 800,
                      color: isWelcome ? "#C84B26" : "#0AA89F",
                      letterSpacing: "0.14em", textTransform: "uppercase",
                      padding: "3px 9px", borderRadius: 99,
                      background: isWelcome ? "rgba(232,116,43,0.10)" : "rgba(20,184,166,0.10)",
                      border: `1px solid ${isWelcome ? "rgba(232,116,43,0.28)" : "rgba(20,184,166,0.28)"}`,
                    }}>
                      {isWelcome ? "Welcome" : "Periodic"}
                    </span>
                    <span style={{ fontSize: 11, color: "#7AAAB2" }}>
                      {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#0B1F3A", letterSpacing: "-0.2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.title}
                  </div>
                  <div style={{ fontSize: 11.5, color: "#7AAAB2", marginTop: 3 }}>
                    {r.period_label || "—"}
                  </div>
                </div>

                {/* Score badge — visual highlight */}
                {r.bellavego_score != null && (
                  <div style={{ textAlign: "center", flexShrink: 0 }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: "#0AA89F", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 }}>
                      Score
                    </div>
                    <div className="mc-stat-num mc-stat-num-teal" style={{ fontSize: 28 }}>
                      {r.bellavego_score.toFixed(1)}
                    </div>
                  </div>
                )}

                <span style={{ fontSize: 22, color: "#C84B26", flexShrink: 0 }}>›</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
