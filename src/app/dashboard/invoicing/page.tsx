"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Invoice = {
  id: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  service_type: string;
  amount: number;
  status: string;
  stripe_url: string | null;
  created_at: string;
};

export default function InvoicingPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    service_type: "",
    amount: "",
  });

  useEffect(() => {
    fetchInvoices();
  }, []);

  async function fetchInvoices() {
    const { data } = await supabase
      .from("invoices")
      .select("*")
      .order("created_at", { ascending: false });
    setInvoices(data || []);
    setLoading(false);
  }

  async function handleSend() {
    if (!form.customer_name || !form.service_type || !form.amount) {
      setError("Please fill in customer name, service, and amount.");
      return;
    }
    if (!form.customer_email && !form.customer_phone) {
      setError("Please enter an email or phone number.");
      return;
    }
    setError("");
    setSending(true);
    const res = await fetch("/api/invoices/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSending(false);
    if (!res.ok) {
      setError(data.error || "Something went wrong.");
      return;
    }
    setSent(true);
    setForm({ customer_name: "", customer_email: "", customer_phone: "", service_type: "", amount: "" });
    setTimeout(() => setSent(false), 4000);
    fetchInvoices();
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
  const cardTitle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: "#0B1F3A" };
  const cardBody: React.CSSProperties = { padding: 18 };
  const label: React.CSSProperties = {
    display: "block",
    fontSize: 11,
    fontWeight: 600,
    color: "#7AAAB2",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: 6,
  };
  const input: React.CSSProperties = {
    width: "100%",
    background: "#F5FDFB",
    border: "1.5px solid rgba(10,168,159,0.2)",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 13,
    color: "#0B1F3A",
    fontFamily: "system-ui, -apple-system, sans-serif",
    outline: "none",
    boxSizing: "border-box",
  };
  const fieldWrap: React.CSSProperties = { marginBottom: 14 };

  const statusStyle = (status: string): React.CSSProperties => {
    const map: Record<string, React.CSSProperties> = {
      sent: { background: "rgba(10,168,159,0.08)", color: "#0AA89F", border: "1px solid rgba(10,168,159,0.22)" },
      paid: { background: "#ECFDF5", color: "#059669", border: "1px solid #A7F3D0" },
      failed: { background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" },
    };
    return {
      fontSize: 10,
      fontWeight: 600,
      padding: "3px 8px",
      borderRadius: 20,
      ...(map[status] || map.sent),
    };
  };

  return (
    <div style={{ padding: "24px 28px 60px", color: "#0B1F3A", fontFamily: "system-ui, -apple-system, sans-serif" }}>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "#7AAAB2", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Billing</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0B1F3A", letterSpacing: "-0.5px", marginBottom: 4 }}>Invoicing</h1>
        <p style={{ fontSize: 13, color: "#4A7A80" }}>Send payment links to customers instantly via text or email.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>

        <div style={card}>
          <div style={cardHead}>
            <div>
              <div style={cardTitle}>New invoice</div>
              <div style={{ fontSize: 11, color: "#7AAAB2", marginTop: 2 }}>Customer pays via Stripe — no account needed</div>
            </div>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "#ECFDF5", border: "1px solid #A7F3D0", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2">
                <line x1="12" y1="1" x2="12" y2="23"/>
                <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
              </svg>
            </div>
          </div>
          <div style={cardBody}>

            <div style={fieldWrap}>
              <label style={label}>Customer name</label>
              <input
                style={input}
                placeholder="e.g. John Smith"
                value={form.customer_name}
                onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={label}>Email</label>
                <input
                  style={input}
                  placeholder="john@email.com"
                  value={form.customer_email}
                  onChange={(e) => setForm({ ...form, customer_email: e.target.value })}
                />
              </div>
              <div>
                <label style={label}>Phone</label>
                <input
                  style={input}
                  placeholder="+17737109565"
                  value={form.customer_phone}
                  onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
                />
              </div>
            </div>

            <div style={fieldWrap}>
              <label style={label}>Service description</label>
              <input
                style={input}
                placeholder="e.g. AC tune-up and refrigerant recharge"
                value={form.service_type}
                onChange={(e) => setForm({ ...form, service_type: e.target.value })}
              />
            </div>

            <div style={fieldWrap}>
              <label style={label}>Amount (USD)</label>
              <input
                style={input}
                placeholder="e.g. 250"
                type="number"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>

            {error && (
              <div style={{ fontSize: 12, color: "#DC2626", marginBottom: 12, padding: "8px 12px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8 }}>
                {error}
              </div>
            )}

            <button
              onClick={handleSend}
              disabled={sending}
              style={{
                width: "100%",
                background: sending ? "rgba(10,168,159,0.12)" : "linear-gradient(135deg, #0AA89F 0%, #0D8F87 100%)",
                color: sending ? "#7AAAB2" : "#fff",
                fontSize: 13,
                fontWeight: 700,
                padding: "12px",
                borderRadius: 9,
                border: "none",
                cursor: sending ? "not-allowed" : "pointer",
                fontFamily: "system-ui, -apple-system, sans-serif",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                boxShadow: sending ? "none" : "0 4px 14px rgba(10,168,159,0.28)",
              }}
            >
              {sending ? "Sending..." : "Send Invoice"}
            </button>

            {sent && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "#059669", marginTop: 10, justifyContent: "center" }}>
                ✓ Invoice sent successfully
              </div>
            )}

            <p style={{ fontSize: 11, color: "#7AAAB2", textAlign: "center", marginTop: 10, lineHeight: 1.5 }}>
              A Stripe payment link is created and sent to the customer via text or email.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[
            { label: "Total invoiced", value: "$" + invoices.reduce((s, i) => s + (i.amount || 0), 0).toLocaleString(), sub: "All time", accent: "#0AA89F" },
            { label: "Paid", value: String(invoices.filter(i => i.status === "paid").length), sub: "Completed payments", accent: "#22C55E" },
            { label: "Pending", value: String(invoices.filter(i => i.status === "sent").length), sub: "Awaiting payment", accent: "#F59E0B" },
          ].map((s) => (
            <div key={s.label} style={{ background: "#ffffff", border: "1px solid rgba(10,168,159,0.14)", borderRadius: 14, padding: "18px 20px", position: "relative", overflow: "hidden", boxShadow: "0 2px 16px rgba(7,27,58,0.06)" }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#7AAAB2", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>{s.label}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#0B1F3A", letterSpacing: -1, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 11, marginTop: 6, color: "#4A7A80" }}>{s.sub}</div>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${s.accent}, ${s.accent}00)`, borderRadius: "14px 14px 0 0" }} />
            </div>
          ))}
        </div>
      </div>

      <div style={card}>
        <div style={cardHead}>
          <div>
            <div style={cardTitle}>Invoice history</div>
            <div style={{ fontSize: 11, color: "#7AAAB2", marginTop: 2 }}>All invoices sent to customers</div>
          </div>
          <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: "rgba(10,168,159,0.08)", color: "#0AA89F", border: "1px solid rgba(10,168,159,0.2)" }}>
            {invoices.length} total
          </span>
        </div>
        <div>
          {loading ? (
            <div style={{ padding: "32px", textAlign: "center", fontSize: 13, color: "#7AAAB2" }}>Loading...</div>
          ) : invoices.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "#4A7A80", marginBottom: 4 }}>No invoices yet</div>
              <div style={{ fontSize: 12, color: "#7AAAB2" }}>Send your first invoice using the form above.</div>
            </div>
          ) : (
            invoices.map((inv, i) => (
              <div
                key={inv.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "14px 18px",
                  borderBottom: i < invoices.length - 1 ? "1px solid rgba(10,168,159,0.08)" : "none",
                }}
              >
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(10,168,159,0.1)", border: "1px solid rgba(10,168,159,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 13, fontWeight: 700, color: "#0AA89F" }}>
                  {(inv.customer_name || "?")[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0B1F3A", marginBottom: 2 }}>{inv.customer_name}</div>
                  <div style={{ fontSize: 11, color: "#7AAAB2" }}>{inv.service_type} · {inv.customer_email || inv.customer_phone}</div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0B1F3A", flexShrink: 0 }}>${inv.amount}</div>
                <span style={statusStyle(inv.status)}>{inv.status}</span>
                {inv.stripe_url ? (
                  <a
                    href={inv.stripe_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 11, fontWeight: 600, color: "#0AA89F", background: "rgba(10,168,159,0.08)", border: "1px solid rgba(10,168,159,0.2)", padding: "4px 10px", borderRadius: 6, textDecoration: "none", flexShrink: 0 }}
                  >
                    View
                  </a>
                ) : null}
                <div style={{ fontSize: 11, color: "#7AAAB2", flexShrink: 0 }}>
                  {new Date(inv.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
}
