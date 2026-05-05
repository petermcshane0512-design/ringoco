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

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "#334155", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Account</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#F1F5F9", letterSpacing: "-0.5px", marginBottom: 4 }}>Settings</h1>
        <p style={{ fontSize: 13, color: "#475569" }}>Configure your business profile and AI receptionist behavior.</p>
      </div>

      {/* Business Info */}
      <div style={card}>
        <div style={cardHead}>
          <div>
            <div style={cardTitle}>Business info</div>
            