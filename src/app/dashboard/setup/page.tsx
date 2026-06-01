"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import PushNotificationSetup from "@/components/PushNotificationSetup";
import { buildFirstMessage } from "@/lib/greeting";

type Tier =
  | "receptionist" | "officemgr" | "concierge"
  | "foundation" | "growth" | "premium" | "starter" | "solo" | "scale" | "multiloc";

type Profile = {
  user_id: string;
  business_name?: string;
  owner_first_name?: string | null;
  owner_phone?: string;
  twilio_number?: string;
  is_active?: boolean;
  plan_tier?: Tier;
  setup_complete?: boolean;
  setup_step?: number;
  forwarding_carrier?: string;
  test_call_at?: string | null;
  forwarding_verified_at?: string | null;
  crm_provider?: string;
  ai_language?: string | null;
  ai_greeting_style?: string | null;
  ai_greeting_custom?: string | null;
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
  // GSM conditional-forward (no-answer, 15s) — safe for AT&T, T-Mobile, and
  // every GSM MVNO. Never use *72 (unconditional) as a fallback — that
  // forwards every call instantly so the owner can never pick up first.
  return `**61*${digits}*11*15#`;
}

function disableCode(carrier: CarrierKey) {
  if (carrier === "verizon") return "*73";
  return "##61#";
}

// Universal "wipe any leftover forwarding" — runs BEFORE the new code so a
// stale *72 from yesterday can't send every call to a dead number.
function clearAllForwardingCode(carrier: CarrierKey) {
  if (carrier === "verizon") return "*73";
  return "##002#";
}

function tierMeta(tier: Tier | undefined) {
  const t = tier || "receptionist";
  if (t === "concierge") return { label: "Elite", isOfficeMgr: true, isConcierge: true };
  if (t === "officemgr" || t === "premium" || t === "growth") return { label: "Pro", isOfficeMgr: true, isConcierge: false };
  return { label: "Starter", isOfficeMgr: false, isConcierge: false };
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
  // Appointment rules — set during the new Step 3. Saved to profile so the
  // AI applies these to every booking attempt. Locked-in: contractor cannot
  // proceed past Step 3 without saving (clicking continue saves first).
  const [apptDuration, setApptDuration] = useState<number>(90)
  const [apptBuffer, setApptBuffer] = useState<number>(30)

  // Visible elapsed-seconds counter for the loading screen. Drives rotating
  // status copy ("Securing subscription…" → "Provisioning number…" →
  // "Taking longer than usual…") and reveals an escape-hatch button after
  // 25s so a stalled webhook doesn't trap the user on a silent spinner.
  const [loadingElapsed, setLoadingElapsed] = useState(0)
  useEffect(() => {
    if (!loading) return
    const id = setInterval(() => setLoadingElapsed(e => e + 1), 1000)
    return () => clearInterval(id)
  }, [loading])

  // Initial load + carrier auto-detect
  // Webhook race fix: instead of bouncing to /dashboard when !is_active, we
  // poll /api/profile every 1.5s until either (a) the Stripe webhook lands
  // and is_active flips true OR (b) we exceed the timeout (then fall back to
  // /dashboard with the activation banner shown).
  useEffect(() => {
    let cancelled = false
    const POLL_INTERVAL_MS = 1500
    const MAX_WAIT_MS = 60_000  // 40 polls = up to 60s wait for webhook

    async function pollUntilReady() {
      const startedAt = Date.now()
      while (!cancelled) {
        const p: Profile = await fetch("/api/profile").then((r) => r.json()).catch(() => null)
        if (cancelled) return

        if (!p || (p as unknown as { error?: string }).error) {
          router.replace("/onboarding")
          return
        }
        if (p.setup_complete) {
          router.replace("/dashboard")
          return
        }
        // Gate on BOTH is_active AND twilio_number. The Stripe webhook
        // sets is_active=true BEFORE calling provisionNumberForUser, so
        // is_active flips ~5-10s before the Twilio number actually
        // exists. Without the twilio_number gate, the wizard renders
        // Step 1 with the dial-button hidden (because the button is
        // gated on profile.twilio_number) and the user is stuck on
        // a screen that says "Provisioning…" with no path forward
        // until they manually refresh. (Audit 2026-05-24)
        if (p.is_active && p.twilio_number) {
          // Webhook landed AND number is provisioned — render the wizard.
          setProfile(p)
          setStep(p.setup_step && p.setup_step > 1 ? p.setup_step : 1)
          setCrm(p.crm_provider || "")
          setLoading(false)

          // Auto-detect carrier in background — fast, non-blocking
          try {
            const det = await fetch("/api/onboarding/detect-carrier").then((r) => r.json())
            if (!cancelled && det?.carrier && det.carrier !== "other") {
              setCarrier(det.carrier as CarrierKey)
              setCarrierDetected(true)
            }
          } catch {
            // silent — falls through to manual picker
          }
          return
        }

        if (Date.now() - startedAt > MAX_WAIT_MS) {
          // Webhook never landed — bounce to /dashboard so they see the
          // activation banner with a manual recovery path.
          router.replace("/dashboard")
          return
        }

        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
      }
    }

    pollUntilReady()
    return () => { cancelled = true }
  }, [router])

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
      const res = await fetch("/api/onboarding/verify-forwarding", { method: "POST" }).then((r) => r.json());
      if (!res.ok) {
        setTestStatus("error");
        return;
      }
      // Poll profile.forwarding_verified_at — voice route stamps it when the
      // forwarded call lands. Time out after 90 sec.
      const startedAt = Date.now();
      const maxWait = 90_000;
      const interval = 2000;
      const poll = setInterval(async () => {
        try {
          const p: Profile = await fetch("/api/profile").then((r) => r.json());
          if (p?.forwarding_verified_at) {
            clearInterval(poll);
            setProfile(prev => prev ? { ...prev, forwarding_verified_at: p.forwarding_verified_at } : prev);
            setTestStatus("sent");
            return;
          }
          if (Date.now() - startedAt > maxWait) {
            clearInterval(poll);
            setTestStatus("error");
          }
        } catch {
          // ignore transient errors, keep polling
        }
      }, interval);
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
    // Forwarding works → step 3 = APPOINTMENT RULES (mandatory for every
    // tier; locks in how long the AI books each job + travel buffer).
    await saveStep({ step: 3 });
    setStep(3);
  }

  async function continueAfterAppointmentRules() {
    // Save the appointment rules to profile (POST /api/profile) THEN
    // advance. This is the gate: contractor cannot reach the dashboard
    // without setting these because the AI legally cannot book without
    // them. The setting auto-saves on continue so they can't skip.
    setBusy(true);
    try {
      await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          default_job_duration_min: apptDuration,
          travel_buffer_min: apptBuffer,
          appointment_settings_at: new Date().toISOString(),
        }),
      });
    } catch (e) {
      console.error("appointment rules save failed", e);
    } finally {
      setBusy(false);
    }
    await saveStep({ step: 4 });
    setStep(4);
  }

  async function continueAfterPhoneStep() {
    // Phone alerts step done → Starter finishes, Pro/Elite go to CRM (step 5).
    if (meta.isOfficeMgr || meta.isConcierge) {
      await saveStep({ step: 5 });
      setStep(5);
    } else {
      finishReceptionist();
    }
  }

  async function onPickCrm(provider: string) {
    setCrm(provider);
    if (meta.isConcierge) {
      await saveStep({ crmProvider: provider, step: 6 });
      setStep(6);
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
    // Phased copy so the user sees progress instead of a silent 60-second
    // spinner. After 25s we expose an escape hatch — the webhook may have
    // landed and the dashboard might already work; trapping them on the
    // wizard is worse than letting them try.
    const phase =
      loadingElapsed < 12 ? 'normal' :
      loadingElapsed < 25 ? 'slow' :
      'stuck'
    const headline =
      phase === 'normal' ? 'Setting things up…' :
      phase === 'slow' ? 'Almost there…' :
      'Taking longer than usual'
    const sub =
      phase === 'normal'
        ? 'Stripe is wiring up your subscription and we\'re buying you a local AI receptionist number. Usually 10–30 seconds.'
        : phase === 'slow'
        ? 'Finalizing your AI assistant. Almost done — give it 10 more seconds.'
        : 'Webhook is slow. Your account is being set up in the background — you can refresh, or open your dashboard now and the setup wizard will appear once it\'s ready.'
    return (
      <div style={pageStyle}>
        <style>{`
          @keyframes setupSpin { to { transform: rotate(360deg) } }
        `}</style>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, maxWidth: 420, textAlign: 'center' }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            border: '3px solid rgba(10,168,159,0.18)',
            borderTopColor: '#0AA89F',
            animation: 'setupSpin 0.9s linear infinite',
          }} />
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0B1F3A', letterSpacing: '-0.3px' }}>
            {headline}
          </div>
          <div style={{ fontSize: 13, color: '#4A7A80', lineHeight: 1.55 }}>
            {sub}
          </div>
          {phase === 'stuck' && (
            <div style={{ display: 'flex', gap: 10, flexDirection: 'column', alignItems: 'center', marginTop: 8 }}>
              <button
                onClick={() => window.location.reload()}
                style={{ background: '#0AA89F', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 22px', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}
              >
                Refresh
              </button>
              <button
                onClick={() => router.replace('/dashboard')}
                style={{ background: 'transparent', color: '#0AA89F', border: '1.5px solid #0AA89F', borderRadius: 10, padding: '10px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
              >
                Open dashboard anyway
              </button>
              <div style={{ fontSize: 11, color: '#7AAAB2', marginTop: 4 }}>
                Stuck? Text Peter: (773) 710-9565
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 4 steps now — added Appointment Rules at position 3 (mandatory for AI
  // booking safety). Starter: 4 (forward, test, rules, phone). Pro: 5 (+ CRM).
  // Elite: 6 (+ kickoff).
  const totalSteps = meta.isConcierge ? 6 : meta.isOfficeMgr ? 5 : 4;

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

          {/* Back nav — shown on every step except step 1. Pure client-side
              rewind: doesn't write setup_step backward, just rerenders the
              previous step's UI. Lets contractors fix a wrong carrier /
              wrong forwarding code without restarting. Added after Peter
              hit "Forwarding didn't connect" on step 2 and had no recovery
              path back to step 1 (2026-06-01). */}
          {step > 1 && (
            <button
              onClick={() => setStep(step - 1)}
              type="button"
              style={{
                background: "transparent",
                border: "none",
                color: "#0AA89F",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                padding: "0 0 14px",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontFamily: "inherit",
              }}
              aria-label="Go back to previous step"
            >
              ← Back
            </button>
          )}

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

              {/* Push install banner — surfaced ON STEP 1 (was previously only
                  reachable deep in setup OR on /dashboard). The push fan-out
                  is wired into both the take_message AND end-of-call paths,
                  so getting the device subscribed early = first paid lead
                  alert lands on the contractor's phone the second it comes in.
                  Renders no-op if device already subscribed. */}
              <div style={{ marginBottom: 22 }}>
                <PushNotificationSetup />
              </div>

              <h2 style={titleStyle}>Forward your business cell here.</h2>
              <p style={subStyle}>
                When your phone can&apos;t pick up after about 15 seconds, calls will route to BellAveGo automatically.
                You still answer normally — BellAveGo only picks up if you don&apos;t.
                {carrierDetected ? (
                  <> We detected your carrier as <strong style={{ color: "#0AA89F" }}>{CARRIER_LABEL[carrier]}</strong>.</>
                ) : (
                  <> Pick your carrier:</>
                )}
              </p>

              {/* STEP 0 — wipe any leftover forwarding from a previous setup.
                  This prevents the "stale *72 from yesterday" bug where every
                  call goes to a number that no longer exists. Always shown. */}
              <div style={{ marginBottom: 16, padding: "14px 16px", background: "#FFF7ED", border: "1.5px solid #FED7AA", borderRadius: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", background: "#EA580C", padding: "3px 8px", borderRadius: 6, letterSpacing: "0.08em" }}>DO THIS FIRST</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#9A3412", letterSpacing: "0.04em", textTransform: "uppercase" }}>Wipe any old forwarding (10 sec)</span>
                </div>
                <div style={{ fontSize: 12, color: "#7C2D12", lineHeight: 1.55, marginBottom: 10 }}>
                  If you&apos;ve <strong>ever</strong> forwarded calls before — even years ago — clear it now. Otherwise the new forward may not stick.
                </div>
                <a href={`tel:${encodeURIComponent(clearAllForwardingCode(carrier))}`} style={{
                  display: "inline-block", padding: "10px 18px", background: "#EA580C", color: "#fff",
                  borderRadius: 10, textDecoration: "none", fontSize: 14, fontWeight: 800,
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace", letterSpacing: "0.5px",
                  boxShadow: "0 4px 12px rgba(234,88,12,0.32)",
                }}>
                  Tap to dial {clearAllForwardingCode(carrier)}
                </a>
                <div style={{ fontSize: 11, color: "#9A3412", marginTop: 8, lineHeight: 1.5 }}>
                  You&apos;ll hear &quot;Erasure successful&quot; or two beeps. Then continue below.
                </div>
              </div>

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
                    Tap from your phone &nbsp;·&nbsp; Press call &nbsp;·&nbsp; Hang up
                  </div>
                </a>
              )}

              {/* What to expect — sets the trust */}
              <div style={{ marginTop: 14, padding: "12px 14px", background: "#F5FDFB", border: "1px dashed rgba(10,168,159,0.3)", borderRadius: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#0AA89F", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                  What to expect
                </div>
                <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#4A7A80", lineHeight: 1.7 }}>
                  <li>You&apos;ll hear a confirmation tone or short message</li>
                  <li>Your carrier saves the forwarding rule — calls after 12 sec of no answer route here</li>
                  <li>We&apos;ll verify in the next step with a live test call</li>
                </ol>
              </div>

              <button onClick={onDialedForwarding} disabled={busy} style={{ ...primaryButton, marginTop: 16 }}>
                {busy ? "Saving…" : "Done — let's test it →"}
              </button>

              <div style={{ fontSize: 11, color: "#A0BCC2", marginTop: 14, textAlign: "center" }}>
                To turn off forwarding later, dial <strong style={{ color: "#4A7A80" }}>{disableCode(carrier)}</strong> from the same phone.
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
                  {testStatus === "calling" ? "Calling your business line — DON'T pick up" : testStatus === "sent" ? "Forwarding works ✓" : testStatus === "error" ? "Forwarding didn't connect" : "Ready to test"}
                </h2>
                <p style={{ ...subStyle, textAlign: "center", maxWidth: 380, margin: "0 auto" }}>
                  {testStatus === "calling" && (<><strong>Let it ring through.</strong> After ~12 seconds your carrier will forward the call to BellAveGo. We&apos;ll detect it automatically. Takes about 30 seconds total.</>)}
                  {testStatus === "sent" && (<>Your carrier forwarded the call straight to BellAveGo. You&apos;re live — every missed call from now on lands here.</>)}
                  {testStatus === "error" && (<>Two common causes: (1) you picked up before the carrier forwarded, or (2) the forwarding code didn&apos;t save. Either retry, or go back and re-dial the forwarding code.</>)}
                  {testStatus === "idle" && (<>Tap below — we&apos;ll call your business line, you let it ring, and we&apos;ll confirm when BellAveGo picks up the forwarded call.</>)}
                </p>
              </div>

              {testStatus === "error" && (
                <>
                  <button onClick={fireTestCall} style={{ ...primaryButton, marginTop: 12, marginBottom: 8 }}>
                    Try the test call again →
                  </button>
                  <button
                    onClick={continueAfterTest}
                    type="button"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#0AA89F",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      padding: "8px 0",
                      width: "100%",
                      textAlign: "center",
                      fontFamily: "inherit",
                    }}
                  >
                    Skip for now — I&apos;ll verify from the dashboard later
                  </button>
                </>
              )}
              {testStatus === "sent" && (
                <>
                  {/* Calendar callout — show this prominently after forwarding works,
                      so contractors see it BEFORE they bounce to the dashboard. */}
                  <div style={{
                    marginTop: 8, marginBottom: 16,
                    padding: "20px 22px",
                    background: "linear-gradient(135deg, #FFF9F0 0%, #FFFFFF 60%)",
                    border: "1.5px solid rgba(232,116,43,0.32)",
                    borderRadius: 14,
                    boxShadow: "0 8px 24px rgba(232,116,43,0.10)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <span style={{
                        fontSize: 9, fontWeight: 900, color: "#C84B26",
                        background: "rgba(232,116,43,0.12)", padding: "3px 9px", borderRadius: 99,
                        letterSpacing: "0.14em", textTransform: "uppercase",
                      }}>
                        New · Recommended
                      </span>
                      <span style={{ fontSize: 11, color: "#7AAAB2", fontWeight: 600 }}>30 seconds</span>
                    </div>
                    <h3 style={{ fontSize: 17, fontWeight: 900, color: "#0B1F3A", margin: 0, marginBottom: 6, letterSpacing: "-0.02em" }}>
                      Connect your calendar so the AI offers real time slots.
                    </h3>
                    <p style={{ fontSize: 13, color: "#4A6670", lineHeight: 1.55, margin: 0, marginBottom: 14 }}>
                      Without this, the AI takes a message and you call back. <strong>With it,</strong> the AI says "Mike has Tuesday at 2 PM or Wednesday at 9 AM — which works?" — using your actual free time. You still confirm via SMS, never auto-booked.
                    </p>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <a
                        href="/dashboard/calendar"
                        style={{
                          padding: "11px 20px", borderRadius: 10,
                          background: "linear-gradient(135deg, #FFD9A8 0%, #FF9D5A 50%, #E8742B 100%)",
                          color: "#0B1F3A", fontSize: 13, fontWeight: 900,
                          textDecoration: "none",
                          boxShadow: "0 6px 18px rgba(232,116,43,0.32)",
                        }}
                      >
                        Connect a calendar →
                      </a>
                      <span style={{ fontSize: 11.5, color: "#7AAAB2", fontWeight: 500, alignSelf: "center" }}>
                        Google Calendar · Microsoft Outlook
                      </span>
                    </div>
                  </div>
                  <button onClick={continueAfterTest} disabled={busy} style={primaryButton}>
                    {meta.isOfficeMgr || meta.isConcierge ? "Continue →" : "Skip for now — open dashboard →"}
                  </button>
                </>
              )}
              {testStatus === "idle" && (
                <button onClick={fireTestCall} style={primaryButton}>
                  Start the test call →
                </button>
              )}
            </div>
          )}

          {/* STEP 3 — APPOINTMENT RULES (MANDATORY for every tier).
              Locks in default job duration + travel buffer so the AI can
              never book overlapping jobs. Saves to profile on continue. */}
          {step === 3 && (
            <div className="step-enter">
              <div style={{
                display: 'inline-block',
                fontSize: 10, fontWeight: 900, color: '#fff',
                background: 'linear-gradient(135deg, #FF9D5A, #E8742B)',
                padding: '4px 11px', borderRadius: 99,
                letterSpacing: '0.14em', textTransform: 'uppercase',
                marginBottom: 10,
              }}>
                Required · 30 seconds
              </div>
              <h2 style={{ ...titleStyle, fontSize: 26 }}>Set your appointment rules.</h2>
              <p style={{ ...subStyle, fontSize: 15 }}>
                The AI uses these EVERY time it books a job for you. Set them once. Change anytime later.
              </p>

              {/* Slider 1 — duration */}
              <div style={{ marginBottom: 22 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#0B1F3A' }}>
                    🕐 How long is a typical job?
                  </span>
                  <span style={{ fontSize: 22, fontWeight: 900, color: '#E8742B', letterSpacing: '-0.02em' }}>
                    {apptDuration >= 60 ? `${Math.floor(apptDuration / 60)}h${apptDuration % 60 ? ` ${apptDuration % 60}m` : ''}` : `${apptDuration} min`}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                  {[30, 60, 90, 120, 180].map((min) => {
                    const active = apptDuration === min
                    return (
                      <button
                        key={min}
                        onClick={() => setApptDuration(min)}
                        style={{
                          padding: '12px 6px', borderRadius: 10,
                          border: active ? '2px solid #E8742B' : '1.5px solid rgba(232,116,43,0.20)',
                          background: active ? 'linear-gradient(135deg, #FF9D5A, #E8742B)' : '#FFF7EE',
                          color: active ? '#fff' : '#0B1F3A',
                          fontSize: 13, fontWeight: 800,
                          cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        {min >= 60 ? `${min / 60}h${min % 60 ? `${min % 60}m` : ''}` : `${min}m`}
                      </button>
                    )
                  })}
                </div>
                <div style={{ fontSize: 12, color: '#7AAAB2', marginTop: 8, lineHeight: 1.5 }}>
                  The AI blocks this much time for every booked job. If a caller says &quot;quick fix&quot; or &quot;big install&quot;, the AI adjusts — this is the default.
                </div>
              </div>

              {/* Slider 2 — buffer */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#0B1F3A' }}>
                    🚗 Travel time between jobs?
                  </span>
                  <span style={{ fontSize: 22, fontWeight: 900, color: '#0AA89F', letterSpacing: '-0.02em' }}>
                    {apptBuffer === 0 ? 'None' : `${apptBuffer} min`}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                  {[0, 15, 30, 45, 60].map((min) => {
                    const active = apptBuffer === min
                    return (
                      <button
                        key={min}
                        onClick={() => setApptBuffer(min)}
                        style={{
                          padding: '12px 6px', borderRadius: 10,
                          border: active ? '2px solid #0AA89F' : '1.5px solid rgba(10,168,159,0.20)',
                          background: active ? 'linear-gradient(135deg, #0AA89F, #088A82)' : '#F0FBF8',
                          color: active ? '#fff' : '#0B1F3A',
                          fontSize: 13, fontWeight: 800,
                          cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        {min === 0 ? 'None' : `${min}m`}
                      </button>
                    )
                  })}
                </div>
                <div style={{ fontSize: 12, color: '#7AAAB2', marginTop: 8, lineHeight: 1.5 }}>
                  Space we ALWAYS leave before AND after every existing event on your calendar. Prevents back-to-back bookings.
                </div>
              </div>

              {/* Live example */}
              <div style={{
                background: '#FFF7ED',
                border: '1.5px solid rgba(234,88,12,0.18)',
                borderRadius: 10, padding: '12px 14px',
                marginBottom: 18, fontSize: 12.5, color: '#0B1F3A', lineHeight: 1.55,
              }}>
                <strong style={{ color: '#E8742B' }}>What this means:</strong> Every booked job is {apptDuration >= 60 ? `${Math.floor(apptDuration / 60)}h${apptDuration % 60 ? ` ${apptDuration % 60}m` : ''}` : `${apptDuration} min`} long with {apptBuffer === 0 ? 'no' : `${apptBuffer} min`} buffer on each side. The AI will never book a job that conflicts with this rule.
              </div>

              <button onClick={continueAfterAppointmentRules} disabled={busy} style={primaryButton}>
                {busy ? "Saving…" : "Lock in rules → continue"}
              </button>
              <div style={{ fontSize: 11, color: "#A0BCC2", marginTop: 10, textAlign: "center" }}>
                You can change these later anytime in /dashboard/calendar.
              </div>
            </div>
          )}

          {/* STEP 4 — Phone alerts + hear your AI (UNIVERSAL — every tier) */}
          {step === 4 && (
            <div className="step-enter">
              <h2 style={{ ...titleStyle, fontSize: 26 }}>Two last things on your phone.</h2>
              <p style={{ ...subStyle, fontSize: 15 }}>
                Get instant alerts every time the AI catches a call, then call your new number to hear how it sounds.
              </p>

              {/* PART A — Add to home screen + enable alerts */}
              <div style={{
                background: "linear-gradient(135deg, #FFF9F0 0%, #FFFFFF 60%)",
                border: "1.5px solid rgba(232,116,43,0.28)",
                borderRadius: 14,
                padding: "18px 18px",
                marginBottom: 14,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 900, color: "#fff",
                    background: "linear-gradient(135deg, #FF9D5A, #E8742B)",
                    padding: "4px 10px", borderRadius: 99, letterSpacing: "0.08em",
                  }}>1</span>
                  <span style={{ fontSize: 16, fontWeight: 900, color: "#0B1F3A" }}>
                    Add BellAveGo to your phone
                  </span>
                </div>
                <p style={{ fontSize: 14, color: "#4A6670", lineHeight: 1.55, margin: "0 0 12px" }}>
                  On your phone, open <strong style={{ color: "#0AA89F" }}>bellavego.com/dashboard</strong> in Safari (iPhone) or Chrome (Android). Then:
                </p>
                <div style={{ background: "#fff", borderRadius: 10, padding: "12px 14px", border: "1px solid rgba(232,116,43,0.18)", marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#0B1F3A", marginBottom: 6 }}>📱 iPhone</div>
                  <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#4A6670", lineHeight: 1.7 }}>
                    <li>Tap the <strong>Share</strong> icon (square with up-arrow)</li>
                    <li>Scroll → <strong>Add to Home Screen</strong> → <strong>Add</strong></li>
                    <li>Open BellAveGo from your home screen icon</li>
                    <li>Tap the big orange &quot;Turn on Lead Alerts&quot; button → Allow</li>
                  </ol>
                </div>
                <div style={{ background: "#fff", borderRadius: 10, padding: "12px 14px", border: "1px solid rgba(232,116,43,0.18)" }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#0B1F3A", marginBottom: 6 }}>🤖 Android</div>
                  <p style={{ margin: 0, fontSize: 13, color: "#4A6670", lineHeight: 1.55 }}>
                    Chrome shows an &quot;Install&quot; banner when you open the dashboard. Tap it, then tap &quot;Turn on Lead Alerts&quot; → Allow.
                  </p>
                </div>
                <button
                  onClick={async () => {
                    if (!profile.owner_phone) {
                      alert("Add your phone number in settings first so we can text you the link.")
                      return
                    }
                    setBusy(true)
                    try {
                      const res = await fetch("/api/push/text-link", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({}),
                      })
                      const j = await res.json()
                      if (!res.ok) {
                        alert(j.error || "Couldn't send. Open bellavego.com/dashboard on your phone manually.")
                      } else {
                        alert(`Sent! Check your phone (${j.sent_to}) for the link.`)
                      }
                    } catch (e) {
                      alert(`Failed: ${(e as Error).message}`)
                    } finally {
                      setBusy(false)
                    }
                  }}
                  disabled={busy}
                  style={{
                    marginTop: 12, width: "100%",
                    padding: "12px 18px", borderRadius: 10,
                    background: "linear-gradient(135deg, #FF9D5A, #E8742B)",
                    color: "#fff", fontSize: 14, fontWeight: 900, border: "none",
                    cursor: busy ? "wait" : "pointer", fontFamily: "inherit",
                    boxShadow: "0 6px 18px rgba(232,116,43,0.32)",
                  }}
                >
                  {busy ? "Sending…" : "📲 Text me the link"}
                </button>
              </div>

              {/* PART B — Call your AI to hear it */}
              <div style={{
                background: "linear-gradient(135deg, #F0FBF8 0%, #FFFFFF 60%)",
                border: "1.5px solid rgba(10,168,159,0.28)",
                borderRadius: 14,
                padding: "18px 18px",
                marginBottom: 18,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 900, color: "#fff",
                    background: "linear-gradient(135deg, #0AA89F, #088A82)",
                    padding: "4px 10px", borderRadius: 99, letterSpacing: "0.08em",
                  }}>2</span>
                  <span style={{ fontSize: 16, fontWeight: 900, color: "#0B1F3A" }}>
                    Call your AI and hear it live
                  </span>
                </div>
                <p style={{ fontSize: 14, color: "#4A6670", lineHeight: 1.55, margin: "0 0 12px" }}>
                  Tap below to call your new BellAveGo number from this phone. You&apos;ll hear what your customers hear when you can&apos;t pick up.
                </p>
                {/* Preview the EXACT first line Emma will say — same string the
                    Vapi assistant-request route renders, so what they read
                    here matches what they hear when they tap the dial button. */}
                <div style={{
                  background: "#fff",
                  border: "1.5px solid rgba(10,168,159,0.22)",
                  borderRadius: 10,
                  padding: "12px 14px",
                  marginBottom: 14,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "#0AA89F", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
                    Emma will open with
                  </div>
                  <div style={{ fontSize: 13, color: "#0B1F3A", lineHeight: 1.55, fontStyle: "italic" }}>
                    &ldquo;{buildFirstMessage({
                      businessName: profile.business_name,
                      ownerFirstName: profile.owner_first_name,
                      aiName: 'Emma',
                      style: (profile as { ai_greeting_style?: string | null }).ai_greeting_style,
                      customTemplate: (profile as { ai_greeting_custom?: string | null }).ai_greeting_custom,
                      language: (profile.ai_language as 'en' | 'es') || 'en',
                    })}&rdquo;
                  </div>
                  <a
                    href="/dashboard/settings"
                    style={{ display: "inline-block", marginTop: 8, fontSize: 11, color: "#0AA89F", fontWeight: 700, textDecoration: "underline" }}
                  >
                    Change in Settings →
                  </a>
                </div>
                {profile.twilio_number && (
                  <a
                    href={`tel:${profile.twilio_number}`}
                    style={{
                      display: "block", width: "100%",
                      padding: "18px 22px", borderRadius: 12,
                      background: "linear-gradient(135deg, #0AA89F, #088A82)",
                      color: "#fff", textDecoration: "none", textAlign: "center",
                      boxShadow: "0 8px 24px rgba(10,168,159,0.32)",
                      boxSizing: "border-box",
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.85)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
                      📞 Tap to call
                    </div>
                    <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 22, fontWeight: 800, letterSpacing: "1px" }}>
                      {profile.twilio_number}
                    </div>
                  </a>
                )}
                <p style={{ fontSize: 12, color: "#7AAAB2", margin: "10px 0 0", lineHeight: 1.5, textAlign: "center" }}>
                  Tip: pretend you&apos;re a customer. Say you have a leak. Hear what happens.
                </p>
              </div>

              <button onClick={continueAfterPhoneStep} disabled={busy} style={primaryButton}>
                {busy ? "Saving…" : meta.isOfficeMgr || meta.isConcierge ? "Continue →" : "🎉 I'm done — open my dashboard →"}
              </button>
              <div style={{ fontSize: 12, color: "#A0BCC2", marginTop: 10, textAlign: "center" }}>
                You can come back to enable phone alerts anytime from the dashboard.
              </div>
            </div>
          )}

          {/* STEP 5 — CRM (Office Mgr + Concierge) */}
          {step === 5 && (meta.isOfficeMgr || meta.isConcierge) && (
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
                We&apos;ll email you the integration link within 24 hours. Concierge customers — our team sets it up live on the kickoff call.
              </div>
            </div>
          )}

          {/* STEP 6 — Kickoff (Concierge only) */}
          {step === 6 && meta.isConcierge && (
            <div className="step-enter">
              <h2 style={titleStyle}>Schedule your kickoff call.</h2>
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
                Anything specific you want our team to tune the AI to? (optional)
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

        {/* Footer — sticky help row */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(10,168,159,0.1)", background: "linear-gradient(135deg, #0B1F3A, #163356)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
            Stuck? Our team answers personally —
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <a href="sms:+17737109565" style={{ padding: "6px 12px", borderRadius: 8, background: "#22C55E", color: "#fff", fontSize: 11, fontWeight: 800, textDecoration: "none" }}>Text</a>
            <a href="tel:+17737109565" style={{ padding: "6px 12px", borderRadius: 8, background: "rgba(255,255,255,0.12)", color: "#fff", fontSize: 11, fontWeight: 800, textDecoration: "none", border: "1px solid rgba(255,255,255,0.2)" }}>Call</a>
          </div>
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
