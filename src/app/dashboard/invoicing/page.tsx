"use client";

import { useState, useEffect } from "react";

// Tenant-scoped invoice reads now go through /api/invoices/list (service-role
// + effectiveAuth). The previous client-side Supabase anon-key query leaked
// invoices across tenants.

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
    const res = await fetch("/api/invoices/list");
    if (!res.ok) {
      setInvoices([]);
      setLoading(false);
      return;
    }
    const j = await res.json();
    setInvoices((j.invoices as Invoice[]) || []);
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
    background: "rgba(255,255,255,0.92)",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
    border: "1px solid rgba(232,116,43,0.12)",
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 16,
    boxShadow: "0 4px 12px rgba(232,116,43,0.06), 0 12px 32px rgba(11,31,58,0.06), inset 0 1px 0 rgba(255,255,255,0.8)",
  };
  const cardHead: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px",
    borderBottom: "1px solid rgba(232,116,43,0.10)",
    background: "linear-gradient(135deg, #FFFFFF 0%, #FFF7EE 100%)",
  };
  const cardTitle: React.CSSProperties = { fontSize: 14, fontWeight: 800, color: "#0B1F3A", letterSpacing: "-0.2px" };
  const cardBody: React.CSSProperties = { padding: 22 };
  const label: React.CSSProperties = {
    display: "block",
    fontSize: 10,
    fontWeight: 800,
    color: "#C84B26",
    textTransform: "uppercase",
    letterSpacing: "0.14em",
    marginBottom: 7,
  };
  const input: React.CSSProperties = {
    width: "100%",
    background: "#FFFAF3",
    border: "1.5px solid rgba(232,116,43,0.20)",
    borderRadius: 9,
    padding: "11px 14px",
    fontSize: 13.5,
    color: "#0B1F3A",
    fontFamily: "system-ui, -apple-system, sans-serif",
    outline: "none",
    boxSizing: "border-box",
  };
  const fieldWrap: React.CSSProperties = { marginBottom: 14 };

  const statusStyle = (status: string): React.CSSProperties => {
    const map: Record<string, React.CSSProperties> = {
      sent: { background: "rgba(20,184,166,0.10)", color: "#0AA89F", border: "1px solid rgba(20,184,166,0.28)" },
      paid: { background: "#ECFDF5", color: "#15803D", border: "1px solid #A7F3D0" },
      failed: { background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" },
    };
    return {
      fontSize: 10,
      fontWeight: 800,
      padding: "3px 10px",
      borderRadius: 99,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      ...(map[status] || map.sent),
    };
  };

  const totalInvoiced = invoices.reduce((s, i) => s + (i.amount || 0), 0);
  const paidCount = invoices.filter(i => i.status === "paid").length;
  const pendingCount = invoices.filter(i => i.status === "sent").length;
  const paidAmount = invoices.filter(i => i.status === "paid").reduce((s, i) => s + (i.amount || 0), 0);

  return (
    <div style={{ padding: "28px 32px 60px", color: "#0B1F3A", fontFamily: "system-ui, -apple-system, sans-serif", maxWidth: 1180, margin: "0 auto" }}>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: "#C84B26", textTransform: "uppercase", letterSpacing: "0.18em", marginBottom: 8 }}>Billing</div>
        <h1 style={{ fontSize: 30, fontWeight: 900, color: "#0B1F3A", letterSpacing: "-0.04em", margin: "0 0 6px" }}>
          Money <span style={{ background: "linear-gradient(135deg, #FF9D5A, #E8742B 60%, #C84B26)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>recovered.</span>
        </h1>
        <p style={{ fontSize: 14, color: "#4A6670" }}>Send Stripe payment links over text or email. Customer pays in two taps.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>

        <div style={card}>
          <div style={cardHead}>
            <div>
              <div style={cardTitle}>New invoice</div>
              <div style={{ fontSize: 11.5, color: "#4A6670", marginTop: 3 }}>Customer pays via Stripe in two taps — no account needed</div>
            </div>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: "#ECFDF5", border: "1px solid #A7F3D0", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="2">
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
          {/* Money recovered — hero stat with orange glow */}
          <div className="mc-card mc-card-orange" style={{ padding: "22px 24px" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#C84B26", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 10 }}>Money Recovered</div>
            <div className="mc-stat-num mc-stat-num-money" style={{ fontSize: "clamp(34px, 4vw, 48px)" }}>${paidAmount.toLocaleString()}</div>
            <div style={{ fontSize: 11.5, marginTop: 8, color: "#4A6670", fontWeight: 500 }}>Paid invoices · all time</div>
          </div>

          {/* Two smaller stats side by side */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div className="mc-card mc-card-teal" style={{ padding: "18px 20px" }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#0AA89F", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8 }}>Paid</div>
              <div className="mc-stat-num mc-stat-num-teal" style={{ fontSize: 30 }}>{paidCount}</div>
              <div style={{ fontSize: 11.5, marginTop: 6, color: "#4A6670", fontWeight: 500 }}>Completed</div>
            </div>
            <div className="mc-card" style={{ padding: "18px 20px" }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#B45309", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8 }}>Pending</div>
              <div className="mc-stat-num" style={{ fontSize: 30, color: "#D97706" }}>{pendingCount}</div>
              <div style={{ fontSize: 11.5, marginTop: 6, color: "#4A6670", fontWeight: 500 }}>Awaiting</div>
            </div>
          </div>

          {/* Total invoiced — quiet third row */}
          <div className="mc-card" style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#7AAAB2", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>Total invoiced</div>
              <div style={{ fontSize: 12.5, color: "#4A6670" }}>{invoices.length} invoice{invoices.length !== 1 ? "s" : ""} · all time</div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#0B1F3A", letterSpacing: "-0.4px", fontVariantNumeric: "tabular-nums" }}>${totalInvoiced.toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div style={card}>
        <div style={cardHead}>
          <div>
            <div style={cardTitle}>Invoice history</div>
            <div style={{ fontSize: 11.5, color: "#4A6670", marginTop: 3 }}>Every payment link sent through BellAveGo</div>
          </div>
          <span style={{ fontSize: 10, fontWeight: 800, padding: "4px 12px", borderRadius: 99, background: "rgba(232,116,43,0.10)", color: "#C84B26", border: "1px solid rgba(232,116,43,0.28)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {invoices.length} total
          </span>
        </div>
        <div>
          {loading ? (
            <div style={{ padding: "40px", textAlign: "center", fontSize: 13, color: "#7AAAB2" }}>Loading...</div>
          ) : invoices.length === 0 ? (
            <div style={{ textAlign: "center", padding: "44px 20px" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0B1F3A", marginBottom: 6 }}>No invoices yet</div>
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
                  padding: "15px 22px",
                  borderBottom: i < invoices.length - 1 ? "1px solid rgba(232,116,43,0.06)" : "none",
                  transition: "background 0.18s",
                }}
              >
                <div style={{ width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(135deg, rgba(232,116,43,0.16), rgba(255,157,90,0.08))", border: "1px solid rgba(232,116,43,0.28)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 14, fontWeight: 800, color: "#C84B26" }}>
                  {(inv.customer_name || "?")[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "#0B1F3A", marginBottom: 3 }}>{inv.customer_name}</div>
                  <div style={{ fontSize: 11.5, color: "#4A6670" }}>{inv.service_type} · {inv.customer_email || inv.customer_phone}</div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: inv.status === "paid" ? "#15803D" : "#0B1F3A", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>${inv.amount}</div>
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
