"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

// ── Types ───────────────────────────────────────────────────────
type Profile = {
  twilio_number?: string;
  owner_phone?: string;
  forwarding_carrier?: string;
  forwarding_confirmed_at?: string | null;
};

type CarrierKey = "verizon" | "att" | "tmobile" | "sprint" | "iphone" | "android" | "other";

// ── Carrier definitions ─────────────────────────────────────────
type CarrierDef = {
  key: CarrierKey;
  label: string;
  color: string;
  badge: string;
  // Dial-code path (works for ALL carriers, no settings menu needed)
  dial: (bagNumber: string) => string;
  // Disable code
  disable: string;
  // Step-by-step settings-app path (the visual flow users prefer over dial codes)
  steps: { title: string; body: string }[];
  // Carrier-specific note
  note: string;
};

function digits(s: string) {
  return (s || "").replace(/\D/g, "");
}

const CARRIERS: Record<CarrierKey, CarrierDef> = {
  verizon: {
    key: "verizon",
    label: "Verizon",
    color: "#CD040B",
    badge: "V",
    dial: (n) => `*71${digits(n)}`,
    disable: "*73",
    steps: [
      { title: "Open your Phone app", body: "Tap the green phone icon and go to the keypad." },
      { title: "Type the activation code", body: "*71 followed by your BellAveGo number digits (no dashes, no spaces)." },
      { title: "Press the call button", body: "You'll hear a short tone or a confirmation message. That's it." },
      { title: "Test by calling your business number from another phone", body: "Don't answer for ~15 seconds. The call rings through to BellAveGo." },
    ],
    note: "Verizon supports conditional call forwarding on all current consumer plans. To disable later, dial *73.",
  },
  att: {
    key: "att",
    label: "AT&T",
    color: "#00A8E0",
    badge: "A",
    dial: (n) => `**61*${digits(n)}*11*15#`,
    disable: "##61#",
    steps: [
      { title: "Open your Phone app keypad", body: "Same place you'd dial a normal number." },
      { title: "Enter the AT&T conditional-forward code", body: "**61* then your BellAveGo number digits, then *11*15# at the end." },
      { title: "Press call", body: "Your phone will briefly show 'Service code complete' or similar." },
      { title: "Test it", body: "Call your business number from another phone, don't answer for ~15s." },
    ],
    note: "AT&T's *61 code forwards only when you don't answer (perfect — you still pick up calls you want). The 15 at the end = wait 15 seconds before forwarding.",
  },
  tmobile: {
    key: "tmobile",
    label: "T-Mobile",
    color: "#E20074",
    badge: "T",
    dial: (n) => `**61*${digits(n)}*11*15#`,
    disable: "##61#",
    steps: [
      { title: "Open your Phone app keypad", body: "On iPhone: Phone → Keypad. On Android: Phone → dial-pad." },
      { title: "Type the conditional-forward code", body: "**61* then your BellAveGo number digits, then *11*15# at the end." },
      { title: "Press call", body: "T-Mobile shows 'Setting Activation Succeeded'. That's the green light." },
      { title: "Test it", body: "Have a friend call your business number — don't answer for 15s." },
    ],
    note: "T-Mobile uses the same code as AT&T (both run on GSM). The 15 sets a 15-second 'no-answer' delay before forwarding kicks in.",
  },
  sprint: {
    key: "sprint",
    label: "US Cellular / Cricket / Boost",
    color: "#FECB30",
    badge: "U",
    dial: (n) => `*73${digits(n)}`,
    disable: "*740",
    steps: [
      { title: "Open your Phone app keypad", body: "Anywhere you'd dial a phone number." },
      { title: "Type the forward code", body: "*73 then your BellAveGo number digits." },
      { title: "Press call", body: "You'll hear two short beeps confirming activation." },
      { title: "Test it", body: "Call your business number from another phone, don't answer for ~15s." },
    ],
    note: "If *73 doesn't work, your carrier may use a different code. Call them and ask: 'How do I forward unanswered calls to {your BellAveGo number}?' They'll set it up free.",
  },
  iphone: {
    key: "iphone",
    label: "iPhone Settings (any carrier)",
    color: "#0AA89F",
    badge: "i",
    dial: (n) => `**61*${digits(n)}*11*15#`,
    disable: "##61#",
    steps: [
      { title: "Open the Settings app", body: "Gray gear icon on your home screen." },
      { title: "Scroll down and tap 'Phone'", body: "About halfway down the list, between FaceTime and Messages." },
      { title: "Tap 'Call Forwarding'", body: "If you don't see it here, use the dial code above instead — your carrier may hide this menu." },
      { title: "Turn 'Call Forwarding' ON", body: "Toggle the switch. A new field appears: 'Forward To'." },
      { title: "Enter your BellAveGo number", body: "Type it exactly. iPhone saves automatically when you back out." },
      { title: "Test it", body: "Have a friend call you, don't answer. After ~15 seconds it rings BellAveGo instead." },
    ],
    note: "iPhone's Settings menu only works on some carriers (AT&T, T-Mobile, Verizon depending on plan). If you don't see Call Forwarding under Phone settings, fall back to the dial code at the top of this page.",
  },
  android: {
    key: "android",
    label: "Android Settings (any carrier)",
    color: "#3DDC84",
    badge: "A",
    dial: (n) => `**61*${digits(n)}*11*15#`,
    disable: "##61#",
    steps: [
      { title: "Open the Phone app (not Settings)", body: "Tap the green phone icon — same one you dial from." },
      { title: "Tap the three-dot menu (⋮) at the top right", body: "Or sometimes labeled 'More' on Samsung phones." },
      { title: "Tap 'Settings' from the dropdown", body: "Inside the Phone app, NOT your main device settings." },
      { title: "Tap 'Calling accounts' → 'Call forwarding'", body: "On Samsung: 'Supplementary services → Call forwarding'." },
      { title: "Tap 'When unanswered' → enter your BellAveGo number", body: "Confirm and back out — Android saves automatically." },
      { title: "Test it", body: "Have a friend call you, don't pick up. After ~15s, BellAveGo answers." },
    ],
    note: "Menus vary slightly: Samsung calls it 'Supplementary services', Google Pixel calls it 'Calls'. If you can't find the menu, just use the dial code at the top of the page — it works on every Android.",
  },
  other: {
    key: "other",
    label: "Other carrier",
    color: "#7AAAB2",
    badge: "?",
    dial: (n) => `*72${digits(n)}`,
    disable: "*73",
    steps: [
      { title: "Call your carrier's support line", body: "Tell them: 'I need to set up conditional call forwarding to {your BellAveGo number} when I don't answer.'" },
      { title: "Or try the universal code", body: "*72 then your BellAveGo number digits. Works on many smaller carriers." },
      { title: "Test it", body: "Call your business number from another phone, don't answer for ~15s." },
    ],
    note: "Most carriers support this for free. If yours doesn't, text Peter at (773) 710-9565 and we'll figure out an alternative.",
  },
};

// ── Helpers ─────────────────────────────────────────────────────
function formatUS(num: string) {
  const d = digits(num);
  if (d.length === 11 && d.startsWith("1")) return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return num;
}

// ── Page ────────────────────────────────────────────────────────
export default function ForwardingPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [carrier, setCarrier] = useState<CarrierKey>("other");
  const [detected, setDetected] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [showSettingsFlow, setShowSettingsFlow] = useState(false);

  useEffect(() => {
    fetch("/api/profile").then((r) => r.json()).then((p) => {
      if (p && !p.error) setProfile(p);
    }).catch(() => {});
    fetch("/api/onboarding/detect-carrier").then((r) => r.json()).then((d) => {
      if (d?.carrier && d.carrier !== "other") {
        setCarrier(d.carrier as CarrierKey);
        setDetected(d.name || null);
      }
    }).catch(() => {});
  }, []);

  const number = profile?.twilio_number || "";
  const ready = !!number;
  const def = CARRIERS[carrier];
  const dialCode = useMemo(() => (ready ? def.dial(number) : def.dial("YOUR-BELLAVEGO-NUMBER")), [carrier, number, ready, def]);
  const telLink = `tel:${encodeURIComponent(dialCode)}`;

  async function copyCode() {
    try { await navigator.clipboard.writeText(dialCode); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  }

  async function triggerTestCall() {
    if (testStatus === "sending") return;
    setTestStatus("sending");
    try {
      const res = await fetch("/api/onboarding/test-call", { method: "POST" });
      if (res.ok) setTestStatus("sent");
      else setTestStatus("error");
    } catch {
      setTestStatus("error");
    }
  }

  return (
    <div style={{ padding: "32px 28px 80px", maxWidth: 880, margin: "0 auto", fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Link href="/dashboard" style={{ fontSize: 12, fontWeight: 700, color: "#0AA89F", textDecoration: "none" }}>← Back to dashboard</Link>
        <h1 style={{ fontSize: 28, fontWeight: 900, color: "#0B1F3A", letterSpacing: "-0.03em", marginTop: 14, marginBottom: 6 }}>
          Set up call forwarding
        </h1>
        <p style={{ fontSize: 14, color: "#4A7A80", lineHeight: 1.55 }}>
          One-time setup, takes about 60 seconds. After this, every missed call on your business cell rings through to BellAveGo automatically.
        </p>
      </div>

      {/* Your number — big, copyable */}
      {ready ? (
        <div style={{ background: "linear-gradient(135deg, #0B1F3A 0%, #163356 100%)", borderRadius: 20, padding: "24px 28px", marginBottom: 22, color: "#fff", boxShadow: "0 12px 36px rgba(11,31,58,0.22)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#5EEAD4", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>
            Your BellAveGo number
          </div>
          <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.5px" }}>{formatUS(number)}</div>
          <div style={{ fontSize: 12, color: "#94B6BD", marginTop: 6 }}>
            This is the number your missed calls will ring through to. The AI receptionist answers in your business name.
          </div>
        </div>
      ) : (
        <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 14, padding: 18, marginBottom: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#92400E" }}>Your BellAveGo number isn&apos;t provisioned yet</div>
          <div style={{ fontSize: 12, color: "#78350F", marginTop: 6, lineHeight: 1.6 }}>
            Activate your subscription on the dashboard first. We&apos;ll auto-buy a local number near your area code and the forwarding codes below will update.
          </div>
          <Link href="/dashboard" style={{ display: "inline-block", marginTop: 12, fontSize: 12, fontWeight: 700, color: "#92400E" }}>← Back to dashboard</Link>
        </div>
      )}

      {/* Carrier picker */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#7AAAB2", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
          Pick your carrier {detected && (<span style={{ marginLeft: 8, color: "#0AA89F", fontWeight: 800 }}>· Auto-detected: {detected}</span>)}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {(["verizon", "att", "tmobile", "sprint", "other"] as CarrierKey[]).map((k) => {
            const c = CARRIERS[k];
            const active = carrier === k;
            return (
              <button key={k} onClick={() => setCarrier(k)} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 16px", borderRadius: 12,
                border: `1.5px solid ${active ? c.color : "rgba(10,168,159,0.18)"}`,
                background: active ? `${c.color}14` : "#fff",
                color: active ? c.color : "#4A7A80",
                fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                transition: "all 0.15s ease",
              }}>
                <span style={{ width: 24, height: 24, borderRadius: 6, background: c.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900 }}>{c.badge}</span>
                {c.label}
                {active && <span style={{ fontSize: 14 }}>✓</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Method A: Tap-to-dial card (fastest, works on every carrier) */}
      <div style={{ background: "#fff", border: `2px solid ${def.color}`, borderRadius: 18, padding: 22, marginBottom: 18, boxShadow: "0 8px 28px rgba(7,27,58,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", background: def.color, padding: "3px 9px", borderRadius: 20, letterSpacing: "0.06em", textTransform: "uppercase" }}>Fastest method</span>
          <span style={{ fontSize: 11, color: "#7AAAB2", fontWeight: 600 }}>~ 20 seconds</span>
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 900, color: "#0B1F3A", marginTop: 8, marginBottom: 6 }}>Tap this code on your business cell</h2>
        <p style={{ fontSize: 13, color: "#4A7A80", marginBottom: 14, lineHeight: 1.55 }}>
          Open this page on the phone you want to forward, then tap the green button below. Your phone will dial a special carrier code that turns on forwarding.
        </p>

        {/* The big dial button */}
        <div style={{ display: "flex", alignItems: "stretch", gap: 8, flexWrap: "wrap" }}>
          <a href={telLink} style={{
            flex: "1 1 280px",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
            background: "linear-gradient(135deg, #22C55E 0%, #16A34A 100%)",
            color: "#fff", textDecoration: "none",
            padding: "16px 22px", borderRadius: 14,
            fontSize: 18, fontWeight: 800, letterSpacing: "-0.3px",
            boxShadow: "0 8px 24px rgba(34,197,94,0.34)",
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            {dialCode}
          </a>
          <button onClick={copyCode} style={{
            padding: "16px 18px", borderRadius: 14, border: "1.5px solid rgba(10,168,159,0.25)",
            background: "#F5FDFB", color: "#0AA89F", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
            minWidth: 110,
          }}>
            {copied ? "✓ Copied" : "Copy code"}
          </button>
        </div>

        <p style={{ fontSize: 12, color: "#7AAAB2", marginTop: 14, lineHeight: 1.6 }}>
          💡 If you&apos;re reading this on a desktop or laptop, copy the code, then tap it into your <strong>business cell&apos;s</strong> Phone app keypad and press call.
        </p>
      </div>

      {/* Method B: Settings-menu walkthrough (toggle) */}
      <div style={{ marginBottom: 24 }}>
        <button onClick={() => setShowSettingsFlow((s) => !s)} style={{
          width: "100%", padding: "14px 18px", borderRadius: 12,
          border: "1.5px solid rgba(10,168,159,0.18)", background: "#fff",
          color: "#0B1F3A", fontSize: 13, fontWeight: 700, cursor: "pointer",
          display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "inherit",
        }}>
          <span>Prefer using your phone&apos;s Settings app instead? Show me the menu walkthrough.</span>
          <span style={{ fontSize: 16, transform: showSettingsFlow ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
        </button>

        {showSettingsFlow && (
          <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
            {/* Sub-picker iPhone vs Android */}
            <div style={{ display: "flex", gap: 8 }}>
              {(["iphone", "android"] as CarrierKey[]).map((k) => {
                const c = CARRIERS[k];
                const active = carrier === k;
                return (
                  <button key={k} onClick={() => setCarrier(k)} style={{
                    flex: 1, padding: "12px 14px", borderRadius: 12,
                    border: `1.5px solid ${active ? c.color : "rgba(10,168,159,0.18)"}`,
                    background: active ? `${c.color}14` : "#fff",
                    color: active ? c.color : "#4A7A80",
                    fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                  }}>
                    {c.label}
                  </button>
                );
              })}
            </div>

            <PhoneMockup carrier={carrier} bagNumber={number || "(your number)"} />
          </div>
        )}
      </div>

      {/* Step-by-step text */}
      <div style={{ background: "#fff", border: "1px solid rgba(10,168,159,0.14)", borderRadius: 18, padding: 22, marginBottom: 18 }}>
        <h2 style={{ fontSize: 16, fontWeight: 900, color: "#0B1F3A", marginBottom: 4 }}>What to do, step by step</h2>
        <p style={{ fontSize: 12, color: "#7AAAB2", marginBottom: 18 }}>Read once, then do it on your business cell.</p>
        <ol style={{ paddingLeft: 0, listStyle: "none", margin: 0 }}>
          {def.steps.map((s, i) => (
            <li key={i} style={{ display: "flex", gap: 14, marginBottom: 14 }}>
              <div style={{ flexShrink: 0, width: 28, height: 28, borderRadius: "50%", background: def.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900 }}>
                {i + 1}
              </div>
              <div style={{ flex: 1, paddingTop: 2 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#0B1F3A", marginBottom: 3 }}>{s.title}</div>
                <div style={{ fontSize: 12, color: "#4A7A80", lineHeight: 1.55 }}>{s.body}</div>
              </div>
            </li>
          ))}
        </ol>
        <div style={{ marginTop: 8, padding: "12px 14px", background: "#F5FDFB", border: "1px solid rgba(10,168,159,0.16)", borderRadius: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#7AAAB2", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Note</div>
          <div style={{ fontSize: 12, color: "#4A7A80", lineHeight: 1.6 }}>{def.note}</div>
        </div>
      </div>

      {/* Disable code reference */}
      <div style={{ background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 14, padding: 16, marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "#9A3412", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>To turn forwarding OFF later</div>
        <div style={{ fontSize: 13, color: "#7C2D12", lineHeight: 1.6 }}>
          Open your Phone app keypad on the same cell and dial:{" "}
          <code style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 14, fontWeight: 800, color: "#9A3412", background: "#FFEDD5", padding: "2px 8px", borderRadius: 6 }}>{def.disable}</code>{" "}
          then press call.
        </div>
      </div>

      {/* Verification */}
      <div style={{ background: "linear-gradient(135deg, #ECFDF5 0%, #F0FAF7 100%)", border: "1px solid #A7F3D0", borderRadius: 18, padding: 22 }}>
        <h2 style={{ fontSize: 16, fontWeight: 900, color: "#065F46", marginBottom: 6 }}>Confirm it&apos;s working</h2>
        <p style={{ fontSize: 13, color: "#047857", marginBottom: 14, lineHeight: 1.55 }}>
          Once forwarding is on, have a friend (or your own second phone) call your <strong>business number</strong>. Don&apos;t pick up. After ~15 seconds the call rings BellAveGo and the AI greets the caller in your business name.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={triggerTestCall} disabled={!ready || testStatus === "sending"} style={{
            padding: "12px 20px", borderRadius: 12, border: "none",
            background: testStatus === "sent" ? "#10B981" : "linear-gradient(135deg, #0AA89F 0%, #0D8F87 100%)",
            color: "#fff", fontSize: 13, fontWeight: 800,
            cursor: !ready || testStatus === "sending" ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            boxShadow: "0 4px 14px rgba(10,168,159,0.32)",
            opacity: !ready ? 0.5 : 1,
          }}>
            {testStatus === "idle" && "📞 Trigger a test call to my cell"}
            {testStatus === "sending" && "Calling your cell…"}
            {testStatus === "sent" && "✓ Test call sent — answer to hear the AI"}
            {testStatus === "error" && "✗ Failed — try the dial code first"}
          </button>
        </div>
        <p style={{ fontSize: 11, color: "#065F46", marginTop: 12, lineHeight: 1.6, opacity: 0.85 }}>
          This sends a real call from BellAveGo to your business cell so you can hear what your customers will hear.
        </p>
      </div>
    </div>
  );
}

// ── Animated phone mockup for settings flow ─────────────────────
function PhoneMockup({ carrier, bagNumber }: { carrier: CarrierKey; bagNumber: string }) {
  const isIPhone = carrier === "iphone";
  const accent = isIPhone ? "#0AA89F" : "#3DDC84";
  return (
    <div style={{ background: "#fff", border: "1px solid rgba(10,168,159,0.14)", borderRadius: 18, padding: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: "#7AAAB2", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
        {isIPhone ? "iPhone — what you'll see" : "Android — what you'll see"}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        {/* Screen 1: open settings */}
        <PhoneScreen title={isIPhone ? "Settings" : "Phone app"} subtitle={isIPhone ? "Gray gear icon" : "Green phone icon"}>
          <div style={{ padding: "8px 12px" }}>
            <FakeRow label={isIPhone ? "General" : "Recents"} dim />
            <FakeRow label={isIPhone ? "Display & Brightness" : "Contacts"} dim />
            <FakeRow label={isIPhone ? "Phone" : "Keypad"} highlight={accent} arrow />
            <FakeRow label={isIPhone ? "Messages" : "Voicemail"} dim />
          </div>
        </PhoneScreen>
        {/* Screen 2: tap menu */}
        <PhoneScreen title={isIPhone ? "Phone" : "⋮ Menu"} subtitle={isIPhone ? "Find Call Forwarding" : "Three-dot top right"}>
          <div style={{ padding: "8px 12px" }}>
            <FakeRow label="Announce Calls" dim />
            <FakeRow label="Silence Unknown Callers" dim />
            <FakeRow label="Call Forwarding" highlight={accent} arrow />
            <FakeRow label="Call Blocking" dim />
          </div>
        </PhoneScreen>
        {/* Screen 3: enable + enter number */}
        <PhoneScreen title="Call Forwarding" subtitle="Toggle ON, enter number">
          <div style={{ padding: "10px 12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #EAF3F0" }}>
              <span style={{ fontSize: 11, color: "#0B1F3A", fontWeight: 700 }}>Call Forwarding</span>
              <span style={{ width: 26, height: 14, borderRadius: 10, background: "#22C55E", display: "inline-flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 1 }}>
                <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#fff" }} />
              </span>
            </div>
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#7AAAB2", letterSpacing: "0.08em", textTransform: "uppercase" }}>Forward To</div>
              <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800, color: accent, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
                {bagNumber}
              </div>
            </div>
          </div>
        </PhoneScreen>
      </div>
    </div>
  );
}

function PhoneScreen({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#F5FDFB", border: "1.5px solid rgba(10,168,159,0.2)", borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 14px rgba(7,27,58,0.06)" }}>
      <div style={{ padding: "10px 12px", borderBottom: "1px solid rgba(10,168,159,0.12)", background: "#fff" }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: "#0B1F3A" }}>{title}</div>
        <div style={{ fontSize: 10, color: "#7AAAB2", marginTop: 2 }}>{subtitle}</div>
      </div>
      <div style={{ minHeight: 132 }}>{children}</div>
    </div>
  );
}

function FakeRow({ label, dim, highlight, arrow }: { label: string; dim?: boolean; highlight?: string; arrow?: boolean }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "8px 0", borderBottom: "1px solid #EAF3F0",
      background: highlight ? `${highlight}14` : "transparent",
      borderRadius: highlight ? 6 : 0,
      paddingLeft: highlight ? 6 : 0, paddingRight: highlight ? 6 : 0,
    }}>
      <span style={{ fontSize: 11, color: highlight ? highlight : "#0B1F3A", fontWeight: highlight ? 800 : 600, opacity: dim ? 0.45 : 1 }}>{label}</span>
      {arrow && <span style={{ fontSize: 13, color: highlight || "#7AAAB2", fontWeight: 800 }}>›</span>}
    </div>
  );
}
