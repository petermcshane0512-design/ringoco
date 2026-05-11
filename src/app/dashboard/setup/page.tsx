"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

type Tier =
  | "receptionist" | "officemgr" | "concierge"
  | "foundation" | "growth" | "premium" | "starter" | "solo" | "scale" | "multiloc";

type Profile = {
  user_id: string;
  business_name?: string;
  owner_phone?: string;
  twilio_number?: string;
  is_active?: boolean;
  plan_tier?: Tier;
  setup_complete?: boolean;
  setup_step?: number;
  forwarding_carrier?: string;
  test_call_at?: string | null;
  crm_provider?: string;
};

type CarrierKey = "verizon" | "att" | "tmobile" | "sprint" | "other";

const CAL_LINK = "https://cal.com/petermcshane/bellavego-kickoff";

const CARRIER_LABEL: Record<CarrierKey, string> = {
  verizon: "Verizon",
  att: "AT&T",
  tmobile: "T-Mobile",
  sprint: "US Cellular / Sprint",
  other: "Other carrier",
};

function fwdCode(carrier: CarrierKey, bagNumber: string) {
  const digits = (bagNumber || "").replace(/\D/g, "");
  if (carrier === "verizon") return `*71${digits}`;
  if (carrier === "att" || carrier === "tmobile") return `**61*${digits}*11*15#`;
  if (carrier === "sprint") return `*73${digits}`;
  return `*72${digits}`; // generic universal-ish fallback
}

function disableCode(carrier: CarrierKey) {
  if (carrier === "verizon") return "*73";
  if (carrier === "att" || carrier === "tmobile") return "##61#";
  if (carrier === "sprint") return "*740";
  return "*73";
}

function tierMeta(tier: Tier | undefined) {
  const t = tier || "receptionist";
  if (t === "concierge") return { label: "Concierge", isOfficeMgr: true, isConcierge: true };
  if (t === "officemgr" || t === "premium" || t === "growth") return { label: "AI Office Manager", isOfficeMgr: true, isConcierge: false };
  return { label: "Receptionist", isOfficeMgr: false, isConcierge: false };
}

export default function SetupWizard() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [carrier, setCarrier] = useState<CarrierKey>("other");
  const [carrierDetected, setCarrierDetected] = useState(false);
  const [showAllCarriers, setShowAllCarriers] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "calling" | "sent" | "error">("idle");
  const [crm, setCrm] = useState<string>("");
  const [promptNotes, setPromptNotes] = useState("");
  const [busy, setBusy] = useState(false);

  // Initial load + carrier auto-detect
  useEffect(() => {
    (async () => {
      const p: Profile = await fetch("/api/profile").then((r) => r.json()).catch(() => null);
      if (!p || (p as unknown as { error?: string }).error) {
        router.replace("/onboarding");
        return;
      }
      if (!p.is_active) {
        router.replace("/dashboard");
        return;
      }
      if (p.setup_complete) {
        router.replace("/dashboard");
        return;
      }
      setProfile(p);
      setStep(p.setup_step && p.setup_step > 1 ? p.setup_step : 1);
      setCrm(p.crm_provider || "");
      setLoading(false);

      // Auto-detect carrier in background — fast, non-blocking
      try {
        const det = await fetch("/api/onboarding/detect-carrier").then((r) => r.json());
        if (det?.carrier && det.carrier !== "other") {
          setCarrier(det.carrier as CarrierKey);
          setCarrierDetected(true);
        }
      } catch {
        // silent — falls through to manual picker
      }
    })();
  }, [router]);

  const meta = useMemo(() => tierMeta(profile?.plan_tier), [profile?.plan_tier]);

  async function saveStep(payload: Record<string, unknown>) {
    setBusy(true);
    try {
      await fetch("/api/onboarding/complete-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } finally {
      setBusy(false);
    }
  }

  async function fireTestCall() {
    setTestStatus("calling");
    try {
      const res = await fetch("/api/onboarding/test-call", { method: "POST" }).then((r) => r.json());
      setTestStatus(res.ok ? "sent" : "error");
    } catch {
      setTestStatus("error");
    }
  }

  // After user taps the dial code, advance + auto-fire test
  async function onDialedForwarding() {
    await saveStep({ forwardingCarrier: carrier, forwardingConfirmed: true, step: 2 });
    setStep(2);
    setTimeout(() => fireTestCall(), 1500); // brief pause for transition
  }

  async function finishReceptionist() {
    await saveStep({ setupComplete: true });
    router.replace("/dashboard");
  }

  async function continueAfterTest() {
    if (meta.isOfficeMgr || meta.isConcierge) {
      await saveStep({ step: 3 });
      setStep(3);
    } else {
      finishReceptionist();
    }
  }

  async function onPickCrm(provider: string) {
    setCrm(provider);
    if (meta.isConcierge) {
      await saveStep({ crmProvider: provider, step: 4 });
      setStep(4);
    } else {
      await saveStep({ crmProvider: provider, setupComplete: true });
      router.replace("/dashboard");
    }
  }

  async function finishConcierge() {
    await saveStep({ kickoffScheduled: true, customPromptNotes: promptNotes, setupComplete: true });
    router.replace("/dashboard");
  }

  if (loading || !profile) {
    return (
      <div style={pageStyle}>
        <div style={{ fontSize: 13, color: "#7AAAB2" }}>Loading your setup…</div>
      </div>
    );
  }

  const totalSteps = meta.isConcierge ? 4 : meta.isOfficeMgr ? 3 : 2;

  return (
    <div style={pageStyle}>
      <style>{`
        @keyframes pulseDot { 0%,100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.4); opacity: 0.5 } }
        @keyframes confettiFall {
          0% { transform: translateY(-20vh) rotate(0deg); opacity: 1 }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0 }
        }
        @keyframes slideUp {
          0% { opacity: 0; transform: translateY(20px) }
          100% { opacity: 1; transform: translateY(0) }
        }
        @keyframes ringPulse {
          0% { box-shadow: 0 0 0 0 rgba(10,168,159,0.55) }
          70% { box-shadow: 0 0 0 16px rgba(10,168,159,0) }
          100% { box-shadow: 0 0 0 0 rgba(10,168,159,0) }
        }
        @keyframes logoFloat {
          0%, 100% { transform: translateY(0) }
          50% { transform: translateY(-4px) }
        }
        .step-enter { animation: slideUp 0.45s cubic-bezier(0.34,1.4,0.64,1) }
      `}</style>

      <div style={cardStyle}>
        {/* Logo + tier + progress strip */}
        <div style={{ padding: "26px 28px 18px", borderBottom: "1px solid rgba(10,168,159,0.12)", textAlign: "center", background: "linear-gradient(135deg, #F5FCFA 0%, #ECF8F4 100%)" }}>
          <div style={{ animation: "logoFloat 3.2s ease-in-out infinite", display: "inline-block" }}>
            <Image src="/logo.png" alt="BellAveGo" width={220} height={70} priority style={{ objectFit: "contain", filter: "drop-shadow(0 4px 14px rgba(10,168,159,0.22))" }} />
          </div>
          <div style={{ marginTop: 12, fontSize: 11, fontWeight: 700, color: "#0AA89F", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            {meta.label} · {step} of {totalSteps}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 12, padding: "0 16px" }}>
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < step ? "linear-gradient(90deg, #0AA89F, #18AFA8)" : "rgba(10,168,159,0.18)", transition: "background 0.4s ease" }} />
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "30px 28px 28px", minHeight: 360 }}>

          {/* STEP 1 — Forwarding (folded with welcome banner) */}
          {step === 1 && (
            <div className="step-enter">
              <div style={{ background: "linear-gradient(135deg, #0AA89F, #0D8F87)", borderRadius: 14, padding: "18px 20px", color: "#fff", marginBottom: 22 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
                  Your AI is live
                </div>
                <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 22, fontWeight: 800, letterSpacing: "1px" }}>
                  {profile.twilio_number || "Provisioning…"}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>
                  Welcome, {profile.business_name || "partner"}. Two taps to go live.
                </div>
              </div>

              <h2 style={titleStyle}>Forward your business cell here.</h2>
              <p style={subStyle}>
                When your phone can&apos;t pick up after about 12 seconds, calls will route to BellAveGo automatically.
                {carrierDetected ? (
                  <> We detected your carrier as <strong style={{ color: "#0AA89F" }}>{CARRIER_LABEL[carrier]}</strong>.</>
                ) : (
                  <> Pick your carrier:</>
                )}
              </p>

              {/* Carrier override (collapsed by default if detected) */}
              {(showAllCarriers || !carrierDetected) && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginBottom: 16 }}>
                  {(["verizon", "att", "tmobile", "sprint"] as CarrierKey[]).map((c) => (
                    <button
                      key={c}
                      onClick={() => { setCarrier(c); setShowAllCarriers(false); setCarrierDetected(true); }}
                      style={pillButton(carrier === c)}
                    >
                      {CARRIER_LABEL[c]}
                    </button>
                  ))}
                </div>
              )}
              {carrierDetected && !showAllCarriers && (
                <button onClick={() => setShowAllCarriers(true)} style={{ background: "transparent", border: "none", color: "#0AA89F", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "0 0 14px", textDecoration: "underline" }}>
                  Wrong carrier? Pick another
                </button>
              )}

              {/* Big tap-to-dial CTA */}
              {profile.twilio_number && (
                <a
                  href={`tel:${fwdCode(carrier, profile.twilio_number)}`}
                  onClick={onDialedForwarding}
                  style={tapToDialStyle}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.85)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
                    Tap to dial · {CARRIER_LABEL[carrier]}
                  </div>
                  <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 26, fontWeight: 800, letterSpacing: "1px" }}>
                    {fwdCode(carrier, profile.twilio_number)}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", marginTop: 8 }}>
                    On desktop, dial it manually on your business cell. Then tap below.
                  </div>
                </a>
              )}

              <button onClick={onDialedForwarding} disabled={busy} style={{ ...primaryButton, marginTop: 16 }}>
                {busy ? "Saving…" : "I dialed it →"}
              </button>

              <div style={{ fontSize: 11, color: "#A0BCC2", marginTop: 14, textAlign: "center" }}>
                Disable later: dial <strong style={{ color: "#4A7A80" }}>{disableCode(carrier)}</strong> from the same phone.
              </div>
            </div>
          )}

          {/* STEP 2 — Test call (auto-fired) */}
          {step === 2 && (
            <div className="step-enter">
              <div style={{ textAlign: "center", padding: "8px 0 18px" }}>
                <div style={{ width: 84, height: 84, borderRadius: "50%", background: "linear-gradient(135deg, #0AA89F, #0D8F87)", margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center", animation: testStatus === "calling" ? "ringPulse 1.4s infinite" : "none" }}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                </div>
                <h2 style={{ ...titleStyle, textAlign: "center", marginBottom: 6 }}>
                  {testStatus === "calling" ? "Calling your phone now…" : testStatus === "sent" ? "Got it!" : testStatus === "error" ? "Hmm — couldn't reach you" : "Verifying your line…"}
                </h2>
                <p style={{ ...subStyle, textAlign: "center", maxWidth: 360, margin: "0 auto" }}>
                  {testStatus === "calling" && (<>Pick up. You&apos;ll hear: <em>&ldquo;Hi! This is your BellAveGo AI receptionist doing a quick test call…&rdquo;</em></>)}
                  {testStatus === "sent" && (<>If you heard it, you&apos;re live. Forwarding works.</>)}
                  {testStatus === "error" && (<>Test call didn&apos;t connect. Your forwarding code may not have stuck. Tap below to retry.</>)}
                  {testStatus === "idle" && (<>Hang tight — calling you in a sec.</>)}
                </p>
              </div>

              {testStatus === "error" && (
                <button onClick={fireTestCall} style={{ ...primaryButton, marginTop: 12, marginBottom: 12 }}>
                  Try again →
                </button>
              )}
              {testStatus === "sent" && (
                <button onClick={continueAfterTest} disabled={busy} style={primaryButton}>
                  {meta.isOfficeMgr || meta.isConcierge ? "Heard it — continue →" : "I&apos;m live — open dashboard →"}
                </button>
              )}
              {testStatus === "calling" && (
                <button onClick={() => setTestStatus("sent")} style={{ ...secondaryButton, marginTop: 4 }}>
                  Skip — I heard it
                </button>
              )}
              {testStatus === "idle" && (
                <button onClick={fireTestCall} style={primaryButton}>
                  Call my phone now →
                </button>
              )}
            </div>
          )}

          {/* STEP 3 — CRM (Office Mgr + Concierge) */}
          {step === 3 && (meta.isOfficeMgr || meta.isConcierge) && (
            <div className="step-enter">
              <h2 style={titleStyle}>Connect your CRM.</h2>
              <p style={subStyle}>
                So Quote Hunter, Collections, and Reviews can pull jobs and invoices from where you already work.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 20 }}>
                {[
                  { id: "jobber", label: "Jobber" },
                  { id: "housecallpro", label: "Housecall Pro" },
                  { id: "servicetitan", label: "ServiceTitan" },
                  { id: "none", label: "None / Other" },
                ].map((c) => (
                  <button key={c.id} onClick={() => onPickCrm(c.id)} disabled={busy} style={pillButton(crm === c.id)}>
                    {c.label}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "#7AAAB2", lineHeight: 1.6 }}>
                We&apos;ll email you the integration link within 24 hours. Concierge customers — Peter sets it up live on the kickoff call.
              </div>
            </div>
          )}

          {/* STEP 4 — Kickoff (Concierge only) */}
          {step === 4 && meta.isConcierge && (
            <div className="step-enter">
              <h2 style={titleStyle}>Schedule your kickoff with Peter.</h2>
              <p style={subStyle}>
                30 minutes. We&apos;ll tune your AI prompt to your shop&apos;s voice, walk through your CRM live, and get you fully wired.
              </p>

              <a href={CAL_LINK} target="_blank" rel="noreferrer" style={{ display: "block", padding: "16px 20px", background: "linear-gradient(135deg, #0B1F3A, #163356)", borderRadius: 14, color: "#fff", textDecoration: "none", marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#5EEAD4", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
                  Concierge kickoff
                </div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Open Cal.com to pick a slot in the next 7 days →</div>
              </a>

              <label style={{ display: "block", fontSize: 11, color: "#7AAAB2", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, fontWeight: 700 }}>
                Anything specific you want Peter to tune the AI to? (optional)
              </label>
              <textarea
                value={promptNotes}
                onChange={(e) => setPromptNotes(e.target.value)}
                placeholder="e.g. emergency rate is 1.5x, we don't service propane, my wife Sarah books with me…"
                rows={4}
                style={{ width: "100%", padding: "12px 14px", border: "1.5px solid rgba(10,168,159,0.22)", borderRadius: 10, background: "#F5FDFB", fontSize: 13, color: "#0B1F3A", fontFamily: "inherit", outline: "none", boxSizing: "border-box", resize: "vertical", marginBottom: 18 }}
              />

              <button onClick={finishConcierge} disabled={busy} style={primaryButton}>
                Finish — open dashboard →
              </button>
            </div>
          )}

        </div>

        {/* Footer */}
        <div style={{ padding: "14px 28px", borderTop: "1px solid rgba(10,168,159,0.1)", background: "#F5FDFB", fontSize: 11, color: "#7AAAB2", textAlign: "center" }}>
          Stuck? Text Peter directly: <strong style={{ color: "#0AA89F" }}>(773) 710-9565</strong>
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(145deg, #F5FCFA 0%, #EBF7F3 50%, #F0FAF7 100%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "32px 20px",
  fontFamily: "'Inter', system-ui, sans-serif",
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 560,
  background: "#fff",
  borderRadius: 22,
  boxShadow: "0 24px 64px rgba(7,27,58,0.14), 0 8px 24px rgba(10,168,159,0.08)",
  border: "1px solid rgba(10,168,159,0.14)",
  overflow: "hidden",
};

const titleStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 900,
  color: "#0B1F3A",
  letterSpacing: "-0.5px",
  marginBottom: 8,
  lineHeight: 1.15,
};

const subStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#4A7A80",
  lineHeight: 1.6,
  marginBottom: 20,
};

const primaryButton: React.CSSProperties = {
  width: "100%",
  padding: "14px 22px",
  borderRadius: 12,
  border: "none",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
  background: "linear-gradient(135deg, #22C55E 0%, #16A34A 100%)",
  color: "#fff",
  boxShadow: "0 6px 18px rgba(34,197,94,0.32)",
  fontFamily: "inherit",
};

const secondaryButton: React.CSSProperties = {
  width: "100%",
  padding: "12px 22px",
  borderRadius: 12,
  border: "1.5px solid rgba(10,168,159,0.22)",
  background: "transparent",
  color: "#0AA89F",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};

const tapToDialStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "20px 22px",
  borderRadius: 14,
  background: "linear-gradient(135deg, #0AA89F 0%, #0D8F87 100%)",
  color: "#fff",
  textDecoration: "none",
  textAlign: "center",
  boxShadow: "0 8px 24px rgba(10,168,159,0.32)",
  cursor: "pointer",
};

function pillButton(active: boolean): React.CSSProperties {
  return {
    padding: "16px 14px",
    borderRadius: 12,
    border: active ? "2px solid #0AA89F" : "1.5px solid rgba(10,168,159,0.18)",
    background: active ? "linear-gradient(135deg, #0AA89F 0%, #0D8F87 100%)" : "#F5FDFB",
    color: active ? "#fff" : "#0B1F3A",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
    textAlign: "center",
    fontFamily: "inherit",
  };
}
