"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Tier = "receptionist" | "officemgr" | "concierge" | "foundation" | "growth" | "premium" | "starter" | "solo" | "scale" | "multiloc";

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
  forwarding_confirmed_at?: string | null;
  test_call_at?: string | null;
  crm_provider?: string;
  kickoff_scheduled_at?: string | null;
};

const CAL_LINK = "https://cal.com/petermcshane/bellavego-kickoff";

const CARRIERS = [
  { id: "verizon",  label: "Verizon",            note: "Most common in NY, NJ, FL"},
  { id: "att",      label: "AT&T",               note: "Most common in TX, CA, GA" },
  { id: "tmobile",  label: "T-Mobile",           note: "Includes former Sprint" },
  { id: "sprint",   label: "US Cellular / Other", note: "Smaller carriers" },
] as const;

function fwdCode(carrier: string, bagNumber: string) {
  const digits = (bagNumber || "").replace(/\D/g, "");
  if (carrier === "verizon")        return `*71${digits}`;
  if (carrier === "att")            return `**61*${digits}*11*15#`;
  if (carrier === "tmobile")        return `**61*${digits}*11*15#`;
  if (carrier === "sprint")         return `*73${digits}`;
  return `*71${digits}`;
}

function disableCode(carrier: string) {
  if (carrier === "verizon")        return "*73";
  if (carrier === "att")            return "##61#";
  if (carrier === "tmobile")        return "##61#";
  if (carrier === "sprint")         return "*740";
  return "*73";
}

function tierMeta(tier: Tier | undefined) {
  if (tier === "concierge")   return { label: "Concierge",          steps: 5 };
  if (tier === "officemgr" || tier === "premium" || tier === "growth") return { label: "AI Office Manager", steps: 4 };
  return { label: "Receptionist", steps: 3 }; // receptionist + legacy foundation/solo/starter
}

export default function SetupWizard() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [carrier, setCarrier] = useState<string>("");
  const [crm, setCrm] = useState<string>("");
  const [promptNotes, setPromptNotes] = useState("");
  const [testStatus, setTestStatus] = useState<"idle" | "calling" | "sent" | "error">("idle");

  useEffect(() => {
    fetch("/api/profile").then((r) => r.json()).then((p) => {
      if (!p || p.error) {
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
      setStep((p.setup_step as number) || 1);
      setCarrier(p.forwarding_carrier || "");
      setCrm(p.crm_provider || "");
      setLoading(false);
    });
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

  async function next(payload: Record<string, unknown> = {}) {
    const newStep = step + 1;
    await saveStep({ ...payload, step: newStep });
    setStep(newStep);
  }

  async function fireTestCall() {
    setTestStatus("calling");
    try {
      const res = await fetch("/api/onboarding/test-call", { method: "POST" }).then((r) => r.json());
      if (res.ok) setTestStatus("sent");
      else setTestStatus("error");
    } catch {
      setTestStatus("error");
    }
  }

  async function finish() {
    await saveStep({ setupComplete: true });
    router.replace("/dashboard");
  }

  if (loading || !profile) {
    return (
      <div style={pageStyle}>
        <div style={loadingStyle}>Loading your setup…</div>
      </div>
    );
  }

  const tier = profile.plan_tier || "receptionist";
  const isOfficeMgr = tier === "officemgr" || tier === "premium" || tier === "growth";
  const isConcierge = tier === "concierge";

  const stepLabels = ["Welcome", "Forwarding", "Test call", ...(isOfficeMgr || isConcierge ? ["CRM"] : []), ...(isConcierge ? ["Kickoff"] : [])];

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        {/* Header */}
        <div style={{ padding: "22px 28px 18px", borderBottom: "1px solid rgba(10,168,159,0.14)", background: "linear-gradient(135deg, #0AA89F 0%, #0D8F87 100%)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
            BellAveGo · {meta.label} setup
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: "-0.5px" }}>
            Let's get you live in {stepLabels.length - 1} steps.
          </div>

          {/* Progress dots */}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            {stepLabels.map((label, i) => (
              <div key={label} style={{ flex: 1, height: 4, borderRadius: 2, background: i < step ? "#fff" : "rgba(255,255,255,0.25)" }} />
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "30px 28px 26px" }}>

          {/* Step 1 — Welcome */}
          {step === 1 && (
            <Section title={`Welcome, ${profile.business_name || "partner"}.`} sub="Your subscription is active and your dedicated AI number is provisioned. Two more steps to get calls flowing — or three if you're on Office Manager.">
              <Card title="Your AI number" body={profile.twilio_number || "Provisioning… refresh in a moment."} highlight />
              <Card title="Plan" body={meta.label} />
              <PrimaryButton onClick={() => next()} disabled={busy}>Begin setup →</PrimaryButton>
            </Section>
          )}

          {/* Step 2 — Forwarding */}
          {step === 2 && (
            <Section title="Forward your business cell to BellAveGo" sub="When your phone can't pick up after about 12 seconds, calls forward here automatically. Choose your carrier:">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 18 }}>
                {CARRIERS.map((c) => (
                  <button key={c.id} onClick={() => setCarrier(c.id)} style={pillButton(carrier === c.id)}>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>{c.label}</div>
                    <div style={{ fontSize: 10, color: carrier === c.id ? "rgba(255,255,255,0.85)" : "#7AAAB2", marginTop: 3 }}>{c.note}</div>
                  </button>
                ))}
              </div>

              {carrier && profile.twilio_number && (
                <div style={{ background: "#F5FDFB", border: "1px solid rgba(10,168,159,0.22)", borderRadius: 12, padding: "16px 18px", marginBottom: 18 }}>
                  <div style={{ fontSize: 11, color: "#7AAAB2", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                    Tap this on your business cell, then press call:
                  </div>
                  <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 22, fontWeight: 800, color: "#0AA89F", letterSpacing: "1px", marginBottom: 12 }}>
                    {fwdCode(carrier, profile.twilio_number)}
                  </div>
                  <div style={{ fontSize: 12, color: "#4A7A80", lineHeight: 1.5 }}>
                    You should hear a confirmation tone or message. Then return here. To turn forwarding off later, dial <strong style={{ color: "#0B1F3A" }}>{disableCode(carrier)}</strong>.
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 10, justifyContent: "space-between" }}>
                <SecondaryButton onClick={() => setStep(1)}>← Back</SecondaryButton>
                <PrimaryButton
                  disabled={!carrier || busy}
                  onClick={() => next({ forwardingCarrier: carrier, forwardingConfirmed: true })}
                >
                  I dialed it →
                </PrimaryButton>
              </div>
            </Section>
          )}

          {/* Step 3 — Test call */}
          {step === 3 && (
            <Section title="Let's test it" sub="We'll have your AI receptionist call your cell right now. If you hear the test message, you're live.">
              {testStatus === "idle" && (
                <PrimaryButton onClick={fireTestCall} disabled={busy}>
                  Call my phone now →
                </PrimaryButton>
              )}
              {testStatus === "calling" && (
                <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 12, padding: "16px 18px" }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#92400E", marginBottom: 4 }}>Calling {profile.owner_phone}…</div>
                  <div style={{ fontSize: 12, color: "#78350F" }}>Pick up. You'll hear: "Hi! This is your BellAveGo AI receptionist doing a quick test call…"</div>
                </div>
              )}
              {testStatus === "sent" && (
                <div style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#059669", marginBottom: 4 }}>✓ Test call sent</div>
                  <div style={{ fontSize: 12, color: "#0B1F3A" }}>If you didn't hear it, press the button again. If you got a fast busy or it didn't connect, your forwarding code may not have stuck — go back and re-dial.</div>
                </div>
              )}
              {testStatus === "error" && (
                <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#DC2626", marginBottom: 4 }}>Test call failed</div>
                  <div style={{ fontSize: 12, color: "#7F1D1D" }}>Email peter@bellavego.com or text (773) 710-9565. We'll get this sorted in 5 minutes.</div>
                </div>
              )}
              <div style={{ display: "flex", gap: 10, justifyContent: "space-between", marginTop: 16 }}>
                <SecondaryButton onClick={() => setStep(2)}>← Back</SecondaryButton>
                <PrimaryButton
                  disabled={busy || (isOfficeMgr || isConcierge ? false : false)}
                  onClick={() => isOfficeMgr || isConcierge ? next() : finish()}
                >
                  {(isOfficeMgr || isConcierge) ? "Heard it — continue →" : "I'm done →"}
                </PrimaryButton>
              </div>
            </Section>
          )}

          {/* Step 4 — CRM (Office Manager + Concierge) */}
          {step === 4 && (isOfficeMgr || isConcierge) && (
            <Section title="Connect your CRM" sub="So Quote Hunter, Collections, and Reviews can pull jobs and invoices. Pick yours:">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 18 }}>
                {[
                  { id: "jobber", label: "Jobber" },
                  { id: "housecallpro", label: "Housecall Pro" },
                  { id: "servicetitan", label: "ServiceTitan" },
                  { id: "none", label: "None / Other" },
                ].map((c) => (
                  <button key={c.id} onClick={() => setCrm(c.id)} style={pillButton(crm === c.id)}>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>{c.label}</div>
                  </button>
                ))}
              </div>
              {crm && crm !== "none" && (
                <div style={{ background: "#F5FDFB", border: "1px solid rgba(10,168,159,0.22)", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: "#4A7A80", lineHeight: 1.6 }}>
                    Got it. We'll email you the {crm === "jobber" ? "Jobber" : crm === "housecallpro" ? "Housecall Pro" : "ServiceTitan"} integration link within 24 hours. Concierge customers — Peter will set it up live on the kickoff call.
                  </div>
                </div>
              )}
              <div style={{ display: "flex", gap: 10, justifyContent: "space-between" }}>
                <SecondaryButton onClick={() => setStep(3)}>← Back</SecondaryButton>
                <PrimaryButton
                  disabled={!crm || busy}
                  onClick={() => isConcierge ? next({ crmProvider: crm }) : (saveStep({ crmProvider: crm, setupComplete: true }), router.replace("/dashboard"))}
                >
                  {isConcierge ? "Continue →" : "Finish setup →"}
                </PrimaryButton>
              </div>
            </Section>
          )}

          {/* Step 5 — Kickoff (Concierge only) */}
          {step === 5 && isConcierge && (
            <Section title="Schedule your kickoff with Peter" sub="30 minutes. We'll tune your AI prompt to your shop's voice, walk through your CRM live, and get you fully wired.">
              <div style={{ background: "linear-gradient(135deg, #0B1F3A, #163356)", borderRadius: 14, padding: "20px 22px", color: "#fff", marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#5EEAD4", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
                  White-glove onboarding
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.5, marginBottom: 14 }}>
                  Pick a slot in the next 7 days. Peter answers personally — no AE, no SDR.
                </div>
                <a href={CAL_LINK} target="_blank" rel="noreferrer" style={{ display: "inline-block", padding: "12px 22px", background: "#22C55E", color: "#fff", borderRadius: 10, fontWeight: 800, fontSize: 14, textDecoration: "none" }}>
                  Open Cal.com →
                </a>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ display: "block", fontSize: 11, color: "#7AAAB2", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, fontWeight: 700 }}>
                  Anything specific you want Peter to tune the AI to? (optional)
                </label>
                <textarea
                  value={promptNotes}
                  onChange={(e) => setPromptNotes(e.target.value)}
                  placeholder="e.g. emergency rate is 1.5x, we don't service propane, my wife's name is Sarah and we book together…"
                  rows={4}
                  style={{ width: "100%", padding: "12px 14px", border: "1.5px solid rgba(10,168,159,0.22)", borderRadius: 10, background: "#F5FDFB", fontSize: 13, color: "#0B1F3A", fontFamily: "inherit", outline: "none", boxSizing: "border-box", resize: "vertical" }}
                />
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "space-between" }}>
                <SecondaryButton onClick={() => setStep(4)}>← Back</SecondaryButton>
                <PrimaryButton
                  disabled={busy}
                  onClick={async () => {
                    await saveStep({ kickoffScheduled: true, customPromptNotes: promptNotes, setupComplete: true });
                    router.replace("/dashboard");
                  }}
                >
                  Finish — open dashboard →
                </PrimaryButton>
              </div>
            </Section>
          )}

        </div>

        {/* Footer */}
        <div style={{ padding: "14px 28px", borderTop: "1px solid rgba(10,168,159,0.1)", background: "#F5FDFB", fontSize: 11, color: "#7AAAB2", textAlign: "center" }}>
          Stuck? Text Peter directly: <strong style={{ color: "#0AA89F" }}>(773) 710-9565</strong> · Or <Link href="/dashboard" style={{ color: "#0AA89F", fontWeight: 700 }}>skip to dashboard</Link>
        </div>
      </div>
    </div>
  );
}

// ── Subcomponents ─────────────────────────────────────────────

function Section({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 style={{ fontSize: 19, fontWeight: 800, color: "#0B1F3A", letterSpacing: "-0.4px", marginBottom: 6 }}>{title}</h2>
      <p style={{ fontSize: 13, color: "#4A7A80", lineHeight: 1.6, marginBottom: 22 }}>{sub}</p>
      {children}
    </div>
  );
}

function Card({ title, body, highlight }: { title: string; body: string; highlight?: boolean }) {
  return (
    <div style={{ padding: "12px 14px", background: highlight ? "#F5FDFB" : "#FAFEFD", border: `1px solid ${highlight ? "rgba(10,168,159,0.3)" : "rgba(10,168,159,0.14)"}`, borderRadius: 10, marginBottom: 10 }}>
      <div style={{ fontSize: 10, color: "#7AAAB2", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: "#0B1F3A", fontFamily: highlight ? "ui-monospace, monospace" : undefined }}>{body}</div>
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ padding: "12px 22px", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 800, cursor: disabled ? "not-allowed" : "pointer", background: disabled ? "#A7F3D0" : "linear-gradient(135deg, #22C55E 0%, #16A34A 100%)", color: "#fff", boxShadow: disabled ? "none" : "0 4px 14px rgba(34,197,94,0.32)" }}>
      {children}
    </button>
  );
}

function SecondaryButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ padding: "12px 22px", borderRadius: 10, border: "1.5px solid rgba(10,168,159,0.22)", background: "transparent", color: "#0AA89F", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
      {children}
    </button>
  );
}

function pillButton(active: boolean): React.CSSProperties {
  return {
    padding: "14px 16px",
    borderRadius: 10,
    border: active ? "2px solid #0AA89F" : "1.5px solid rgba(10,168,159,0.18)",
    background: active ? "linear-gradient(135deg, #0AA89F 0%, #0D8F87 100%)" : "#F5FDFB",
    color: active ? "#fff" : "#0B1F3A",
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "inherit",
  };
}

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
  maxWidth: 580,
  background: "#fff",
  borderRadius: 22,
  boxShadow: "0 24px 64px rgba(7,27,58,0.11)",
  border: "1px solid rgba(10,168,159,0.14)",
  overflow: "hidden",
};

const loadingStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#7AAAB2",
};
