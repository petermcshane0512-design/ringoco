"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Profile = { twilio_number?: string; owner_phone?: string };

const CARRIERS = [
  {
    name: "Verizon",
    logo: "📱",
    notes: "Works on most Verizon plans. May need to call *73 to disable later.",
    enable: (number: string) => `*71${stripPlus(number)}`,
    disable: "*73",
  },
  {
    name: "AT&T",
    logo: "📞",
    notes: "Conditional forwarding (only when you don't answer). Standard for most AT&T plans.",
    enable: (number: string) => `**61*${stripPlus(number)}*11*15#`,
    disable: "##61#",
  },
  {
    name: "T-Mobile",
    logo: "📲",
    notes: "Forwards after 15 seconds (about 4 rings). Adjust the trailing number for shorter/longer wait.",
    enable: (number: string) => `**61*${stripPlus(number)}*11*15#`,
    disable: "##61#",
  },
  {
    name: "Sprint / US Cellular",
    logo: "☎️",
    notes: "Conditional forwarding code; if it does not work, call your carrier and ask for 'no answer call forward to {your BellAveGo number}.'",
    enable: (number: string) => `*73${stripPlus(number)}`,
    disable: "*740",
  },
];

function stripPlus(num: string) {
  return (num || "").replace(/[^0-9]/g, "");
}

export default function ForwardingPage() {
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    fetch("/api/profile").then((r) => r.json()).then((p) => {
      if (p && !p.error) setProfile(p);
    }).catch(() => {});
  }, []);

  const number = profile?.twilio_number || "";
  const ready = !!number;

  const wrap: React.CSSProperties = { padding: "32px 36px 60px", fontFamily: "'Inter', system-ui, sans-serif", maxWidth: 880 };
  const h1: React.CSSProperties = { fontSize: 24, fontWeight: 800, color: "#0B1F3A", letterSpacing: "-0.03em", marginBottom: 4 };
  const sub: React.CSSProperties = { fontSize: 13, color: "#7AAAB2", marginBottom: 24 };
  const card: React.CSSProperties = { background: "#fff", border: "1px solid rgba(10,168,159,0.14)", borderRadius: 14, padding: 22, boxShadow: "0 2px 14px rgba(7,27,58,0.06)", marginBottom: 16 };
  const carrierTitle: React.CSSProperties = { fontSize: 16, fontWeight: 800, color: "#0B1F3A", marginBottom: 6, display: "flex", alignItems: "center", gap: 10 };
  const code: React.CSSProperties = { fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 16, fontWeight: 700, color: "#0AA89F", background: "#F5FDFB", border: "1px solid rgba(10,168,159,0.22)", borderRadius: 10, padding: "10px 14px", display: "inline-block", marginRight: 10 };
  const note: React.CSSProperties = { fontSize: 12, color: "#4A7A80", marginTop: 8, lineHeight: 1.55 };

  return (
    <div style={wrap}>
      <div style={h1}>Forward your missed calls to BellAveGo</div>
      <p style={sub}>Set conditional call forwarding on your cell so unanswered calls (after about 12 seconds) ring through to your AI receptionist.</p>

      {!ready && (
        <div style={{ ...card, background: "#FFFBEB", borderColor: "#FDE68A" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#92400E" }}>Your BellAveGo number isn't provisioned yet</div>
          <div style={{ fontSize: 12, color: "#78350F", marginTop: 6 }}>
            Activate your subscription on the dashboard first. The forwarding codes below will use that number once it's assigned.
          </div>
          <Link href="/dashboard" style={{ display: "inline-block", marginTop: 12, fontSize: 12, fontWeight: 700, color: "#92400E" }}>← Back to dashboard</Link>
        </div>
      )}

      {ready && (
        <div style={{ ...card, background: "linear-gradient(135deg, #ECFDF5 0%, #F0FAF7 100%)", borderColor: "#A7F3D0" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#7AAAB2", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Your BellAveGo number</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#0B1F3A" }}>{number}</div>
          <div style={{ fontSize: 12, color: "#4A7A80", marginTop: 6 }}>This is the number you forward to. Tap the code below on your cell phone.</div>
        </div>
      )}

      {CARRIERS.map((c) => (
        <div key={c.name} style={card}>
          <div style={carrierTitle}><span>{c.logo}</span>{c.name}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7AAAB2", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 14, marginBottom: 6 }}>Enable forwarding</div>
          <span style={code}>{ready ? c.enable(number) : c.enable("YOUR-BELLAVEGO-NUMBER")}</span>
          <span style={{ fontSize: 12, color: "#4A7A80" }}>Tap on your phone, press call.</span>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7AAAB2", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 14, marginBottom: 6 }}>Disable forwarding</div>
          <span style={code}>{c.disable}</span>
          <p style={note}>{c.notes}</p>
        </div>
      ))}

      <div style={{ ...card, background: "#F5FDFB" }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#0B1F3A" }}>Test it</div>
        <p style={{ fontSize: 12, color: "#4A7A80", marginTop: 6, lineHeight: 1.6 }}>
          1. Enable forwarding using the code for your carrier.<br />
          2. Have a friend call your business cell.<br />
          3. Don't answer for ~15 seconds.<br />
          4. The call should ring through to BellAveGo and the AI greeting plays.<br />
          5. Tell the AI your name + service request, then check the dashboard for a new pending job.
        </p>
      </div>

      <div style={{ marginTop: 24 }}>
        <Link href="/dashboard" style={{ fontSize: 13, fontWeight: 700, color: "#0AA89F", textDecoration: "none" }}>← Back to dashboard</Link>
      </div>
    </div>
  );
}
