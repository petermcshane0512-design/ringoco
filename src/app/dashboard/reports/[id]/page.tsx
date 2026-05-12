import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type Report = {
  id: string;
  user_id: string;
  title: string;
  client_name: string | null;
  period_label: string | null;
  report_type: string;
  cadence_tier: string | null;
  pdf_url: string | null;
  bellavego_score: number | null;
  created_at: string;
};

/**
 * Server-rendered viewer for a single consulting report.
 *
 * Ownership: the consulting_reports.user_id must match the signed-in Clerk
 * userId. RLS isn't enforced on this table (service role queries it server-side),
 * so we enforce ownership at the route layer here.
 */
export default async function ReportViewerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) redirect(`/sign-in?redirect_url=/dashboard/reports/${id}`);

  const { data } = await supabase
    .from("consulting_reports")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const report = data as Report | null;
  if (!report) notFound();
  if (report.user_id !== userId) redirect("/dashboard/reports");

  const generatedDate = new Date(report.created_at).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });

  return (
    <div style={{
      padding: "32px 24px 80px",
      fontFamily: "'Inter', system-ui, sans-serif",
      maxWidth: 980,
      margin: "0 auto",
    }}>
      <Link href="/dashboard/reports" style={{ fontSize: 12, fontWeight: 700, color: "#0AA89F", textDecoration: "none" }}>
        ← All reports
      </Link>

      <div style={{
        marginTop: 14, marginBottom: 18,
        padding: "22px 26px",
        background: report.report_type === "welcome"
          ? "linear-gradient(135deg, #FFF6EE 0%, #FFFFFF 60%)"
          : "linear-gradient(135deg, #F0FAF7 0%, #FFFFFF 60%)",
        border: `1px solid ${report.report_type === "welcome" ? "rgba(232,116,43,0.22)" : "rgba(10,168,159,0.18)"}`,
        borderRadius: 16,
        boxShadow: "0 6px 20px rgba(7,27,58,0.06)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{
            fontSize: 9, fontWeight: 800,
            color: report.report_type === "welcome" ? "#C84B26" : "#0D8F87",
            letterSpacing: "0.14em", textTransform: "uppercase",
            padding: "3px 9px", borderRadius: 99,
            background: report.report_type === "welcome" ? "rgba(232,116,43,0.10)" : "rgba(10,168,159,0.10)",
            border: `1px solid ${report.report_type === "welcome" ? "rgba(232,116,43,0.28)" : "rgba(10,168,159,0.28)"}`,
          }}>
            {report.report_type === "welcome" ? "Welcome" : "Periodic"}
          </span>
          {report.cadence_tier && (
            <span style={{ fontSize: 11, color: "#7AAAB2", fontWeight: 600 }}>
              {report.cadence_tier}
            </span>
          )}
          <span style={{ fontSize: 11, color: "#7AAAB2", marginLeft: "auto" }}>Generated {generatedDate}</span>
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: "#0B1F3A", letterSpacing: "-0.04em", margin: 0, marginBottom: 4 }}>
          {report.title}
        </h1>
        <div style={{ fontSize: 13, color: "#4A7A80" }}>
          {report.client_name && <strong>{report.client_name}</strong>}
          {report.period_label && <> &nbsp;·&nbsp; {report.period_label}</>}
          {report.bellavego_score != null && (
            <> &nbsp;·&nbsp; <span style={{ fontWeight: 700, color: report.report_type === "welcome" ? "#C84B26" : "#0AA89F" }}>BellAveGo Score {report.bellavego_score.toFixed(1)}/10</span></>
          )}
        </div>
        {report.pdf_url && (
          <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
            <a
              href={report.pdf_url}
              download
              style={{
                padding: "10px 18px", borderRadius: 10,
                background: "linear-gradient(135deg, #0AA89F 0%, #0D8F87 100%)",
                color: "#fff", fontSize: 12, fontWeight: 800,
                textDecoration: "none",
                boxShadow: "0 4px 14px rgba(10,168,159,0.32)",
              }}
            >
              ⬇ Download PDF
            </a>
            <a
              href={report.pdf_url}
              target="_blank"
              rel="noreferrer"
              style={{
                padding: "10px 18px", borderRadius: 10,
                background: "#fff",
                border: "1.5px solid rgba(10,168,159,0.25)",
                color: "#0AA89F", fontSize: 12, fontWeight: 800,
                textDecoration: "none",
              }}
            >
              Open in new tab
            </a>
          </div>
        )}
      </div>

      {/* Embedded PDF viewer */}
      {report.pdf_url ? (
        <div style={{
          background: "#0B1F3A",
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: "0 12px 36px rgba(7,27,58,0.18)",
        }}>
          <iframe
            src={report.pdf_url}
            style={{ width: "100%", height: "85vh", border: "none", display: "block", background: "#fff" }}
            title={report.title}
          />
        </div>
      ) : (
        <div style={{ padding: 28, background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 12, color: "#7C2D12", fontSize: 13 }}>
          PDF is still rendering. Refresh in a minute, or text Peter at (773) 710-9565 if it&apos;s been more than 10 minutes.
        </div>
      )}
    </div>
  );
}
