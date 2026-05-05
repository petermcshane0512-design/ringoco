"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function SettingsPage() {
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    business_name: "",
    owner_phone: "",
    services: "",
    service_area: "",
    ai_tone: "friendly",
  });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();
      if (data) {
        setForm({
          business_name: data.business_name || "",
          owner_phone: data.owner_phone || "",
          services: data.services || "",
          service_area: data.service_area || "",
          ai_tone: data.ai_tone || "friendly",
        });
      }
      setLoading(false);
    })();
  }, [user]);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    await supabase.from("profiles").upsert(
      { user_id: user.id, ...form },
      { onConflict: "user_id" }
    );
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  const card: React.CSSProperties = {
    background: "#060E1C",
    border: "1px solid #0F2040",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 16,
  };
  const cardHead: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 18px",
    borderBottom: "1px solid #0F2040",
  };
  const cardTitle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: "#CBD5E1",
  };
  const cardBody: React.CSSProperties = { padding: 18 };
  const label: React.CSSProperties = {
    display: "block",
    fontSize: 11,
    fontWeight: 600,
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: 6,
  };
  const input: React.CSSProperties = {
    width: "100%",
    background: "#07101F",
    border: "1px solid #1E3A5F",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 13,
    color: "#E2E8F0",
    fontFamily: "system-ui, -apple-system, sans-serif",
    outline: "none",
  };
  const fieldWrap: React.CSSProperties = { marginBottom: 16 };
  const hint: React.CSSProperties = {
    fontSize: 11,
    color: "#334155",
    marginTop: 5,
    lineHeight: 1.4,
  };
  const toneBtn = (val: string): React.CSSProperties => ({
    flex: 1,
    padding: "9px 0",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 8,
    border: `1px solid ${form.ai_tone === val ? "#0369A1" : "#1E3A5F"}`,
    background: form.ai_tone === val ? "#071530" : "transparent",
    color: form.ai_tone === val ? "#38BDF8" : "#475569",
    cursor: "pointer",
    fontFamily: "system-ui, -apple-system, sans-serif",
    transition: "all 0.15s",
  });

  if (loading) {
    return (
      <div style={{ padding: "24px 28px", color: "#475569", fontSize: 13 }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 28px 60px", color: "#E2E8F0", fontFamily: "system-ui, -apple-system, sans-serif", maxWidth: 640 }}>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "#334155", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Account</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#F1F5F9", letterSpacing: "-0.5px", marginBottom: 4 }}>Settings</h1>
        <p style={{ fontSize: 13, color: "#475569" }}>Configure your business profile and AI receptionist behavior.</p>
      </div>

      <div style={card}>
        <div style={cardHead}>
          <div>
            <div style={cardTitle}>Business info</div>
            <div style={{ fontSize: 11, color: "#334155", marginTop: 2 }}>How your AI greets callers</div>
          </div>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "#071530", border: "1px solid #0C4A6E", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
        </div>
        <div style={cardBody}>
          <div style={fieldWrap}>
            <label style={label}>Business name</label>
            <input
              style={input}
              placeholder="e.g. Mike's HVAC & Plumbing"
              value={form.business_name}
              onChange={(e) => setForm({ ...form, business_name: e.target.value })}
            />
            <p style={hint}>Your AI will greet callers with "Thanks for calling [Business Name]"</p>
          </div>
          <div style={fieldWrap}>
            <label style={label}>Services offered</label>
            <input
              style={input}
              placeholder="e.g. HVAC repair, furnace install, AC tune-up"
              value={form.services}
              onChange={(e) => setForm({ ...form, services: e.target.value })}
            />
            <p style={hint}>Your AI uses this to confirm job types with callers</p>
          </div>
          <div style={{ ...fieldWrap, marginBottom: 0 }}>
            <label style={label}>Service area</label>
            <input
              style={input}
              placeholder="e.g. Chicago, IL and surrounding suburbs"
              value={form.service_area}
              onChange={(e) => setForm({ ...form, service_area: e.target.value })}
            />
            <p style={hint}>Helps your AI tell callers whether you cover their area</p>
          </div>
        </div>
      </div>

      <div style={card}>
        <div style={cardHead}>
          <div>
            <div style={cardTitle}>Approval notifications</div>
            <div style={{ fontSize: 11, color: "#334155", marginTop: 2 }}>Where YES / NO texts get sent</div>
          </div>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "#051A0D", border: "1px solid #14532D", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth="2">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
            </svg>
          </div>
        </div>
        <div style={cardBody}>
          <div style={{ ...fieldWrap, marginBottom: 0 }}>
            <label style={label}>Your cell number</label>
            <input
              style={input}
              placeholder="e.g. +17737109565"
              value={form.owner_phone}
              onChange={(e) => setForm({ ...form, owner_phone: e.target.value })}
            />
            <p style={hint}>When your AI captures a lead, it texts this number with job details. Reply YES to book it, NO to decline.</p>
          </div>
        </div>
      </div>

      <div style={card}>
        <div style={cardHead}>
          <div>
            <div style={cardTitle}>AI tone</div>
            <div style={{ fontSize: 11, color: "#334155", marginTop: 2 }}>How your receptionist sounds on calls</div>
          </div>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "#150E2A", border: "1px solid #5B21B6", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="2">
              <rect x="3" y="11" width="18" height="10" rx="2" />
              <path d="M12 11V7" />
              <circle cx="12" cy="5" r="2" />
            </svg>
          </div>
        </div>
        <div style={cardBody}>
          <div style={{ display: "flex", gap: 8 }}>
            {(["friendly", "professional", "concise"] as const).map((tone) => (
              <button
                key={tone}
                style={toneBtn(tone)}
                onClick={() => setForm({ ...form, ai_tone: tone })}
              >
                {tone.charAt(0).toUpperCase() + tone.slice(1)}
              </button>
            ))}
          </div>
          <p style={{ ...hint, marginTop: 10 }}>
            {form.ai_tone === "friendly" && "Warm and conversational. Great for residential customers."}
            {form.ai_tone === "professional" && "Polished and formal. Good for commercial contracts."}
            {form.ai_tone === "concise" && "Short and direct. Gets job details fast, no small talk."}
          </p>
        </div>
      </div>

      <div style={card}>
        <div style={cardHead}>
          <div>
            <div style={cardTitle}>Your AI phone number</div>
            <div style={{ fontSize: 11, color: "#334155", marginTop: 2 }}>Forward your business line here to activate the AI</div>
          </div>
          <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 20, background: "#1C1200", color: "#F59E0B", border: "1px solid #713F12" }}>
            Demo
          </span>
        </div>
        <div style={cardBody}>
          <div style={{ background: "#07101F", border: "1px solid #1E3A5F", borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#F1F5F9", letterSpacing: "0.05em" }}>(762) 371-3351</span>
            <span style={{ fontSize: 11, color: "#334155" }}>Twilio · Active</span>
          </div>
          <p style={hint}>In your phone settings, forward unanswered calls to this number. Your AI picks up every time.</p>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            background: saving ? "#0C1F3D" : "linear-gradient(135deg,#0369A1,#0284C7)",
            color: saving ? "#475569" : "#fff",
            fontSize: 13,
            fontWeight: 700,
            padding: "11px 28px",
            borderRadius: 9,
            border: "none",
            cursor: saving ? "not-allowed" : "pointer",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
        {saved && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "#4ADE80" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Saved
          </div>
        )}
      </div>

    </div>
  );
}