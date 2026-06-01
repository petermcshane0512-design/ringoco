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

  // Push-subscription guard. Polled on EVERY step now (step 1 is the
  // critical gate — Peter saw new clients land on step 2+ with 0 push
  // subs and never receive a lead alert, 2026-06-01). When count==0 on
  // step 1, the "Done — let's test it →" button is locked until either
  // (a) push subscribes, or (b) contractor explicitly skips.
  const [pushDeviceCount, setPushDeviceCount] = useState<number | null>(null)
  const [pushTestStatus, setPushTestStatus] = useState<'idle' | 'sending' | 'sent' | 'no-sub' | 'error'>('idle')
  const [pushSkipAck, setPushSkipAck] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    const poll = () => {
      fetch('/api/push/device-count')
        .then(r => (r.ok ? r.json() : null))
        .then((j: { count?: number } | null) => {
          if (!cancelled) setPushDeviceCount(j?.count ?? 0)
        })
        .catch(() => { if (!cancelled) setPushDeviceCount(0) })
    }
    poll()
    // Re-poll every 4s so subscribing in another tab updates the gate.
    const id = setInterval(poll, 4000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  async function copyDialCode(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedCode(code)
      setTimeout(() => setCopiedCode(c => (c === code ? null : c)), 2500)
    } catch {
      // Older Safari may block. Fall back to no-op; the tel: link still works.
      setCopiedCode('err')
      setTimeout(() => setCopiedCode(null), 2500)
    }
  }

  async function fireTestPush() {
    if (pushTestStatus === 'sending') return
    setPushTestStatus('sending')
    try {
      const res = await fetch('/api/push/test', { method: 'POST' })
      const j = await res.json().catch(() => null)
      if (res.ok && j?.sent > 0) setPushTestStatus('sent')
      else if (j?.reason === 'no subscriptions') setPushTestStatus('no-sub')
      else setPushTestStatus('error')
    } catch {
      setPushTestStatus('error')
    }
    setTimeout(() => setPushTestStatus('idle'), 5000)
  }
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
          // PWA-resume guard: if push isn't enabled yet, force back to
          // step 1 regardless of saved setup_step. Without push, future
          // step-2/3 work means nothing (Peter 2026-06-01).
          let resumeStep = p.setup_step && p.setup_step > 1 ? p.setup_step : 1
          try {
            const dc = await fetch('/api/push/device-count').then(r => (r.ok ? r.json() : null))
            if ((dc?.count ?? 0) === 0 && resumeStep > 1) {
              resumeStep = 1
            }
          } catch { /* keep saved step */ }
          setStep(resumeStep)
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

  // After user taps the dial code, advance straight to APPOINTMENT RULES.
  // Old flow had an auto-fire forwarding test (step 2) — removed 2026-06-01
  // because the test failed for too many carriers (CLI rewrites, voicemail
  // racing the conditional-forward timer, etc.) and trapped contractors in
  // a "Forwarding didn't connect" dead end. They now verify in real life
  // by having a friend call their cell from the dashboard onboarding tip.
  async function onDialedForwarding() {
    await saveStep({ forwardingCarrier: carrier, forwardingConfirmed: true, step: 2 });
    setStep(2);
  }

  async function finishReceptionist() {
    await saveStep({ setupComplete: true });
    router.replace("/dashboard");
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
    await saveStep({ step: 3 });
    setStep(3);
  }

  async function continueAfterPhoneStep() {
    // Phone alerts step done → Starter finishes, Pro/Elite go to CRM.
    if (meta.isOfficeMgr || meta.isConcierge) {
      await saveStep({ step: 4 });
      setStep(4);
    } else {
      finishReceptionist();
    }
  }

  async function onPickCrm(provider: string) {
    setCrm(provider);
    if (meta.isConcierge) {
      await saveStep({ crmProvider: provider, step: 5 });
      setStep(5);
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
  // Step 2 (auto-fire forwarding test) was removed 2026-06-01 — too many
  // carrier-specific failures trapping contractors at the very first wall.
  // Counts: Starter 3, Pro 4, Elite 5.
  const totalSteps = meta.isConcierge ? 5 : meta.isOfficeMgr ? 4 : 3;

  return (
    <div style={pageStyle}>
      <style>{`
        @keyframes pulseDot { 0%,100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.4); opacity: 0.5 } }
        @keyframes glowPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,157,90,0.55), 0 12px 32px rgba(10,168,159,0.28) }
          50% { box-shadow: 0 0 0 14px rgba(255,157,90,0), 0 12px 32px rgba(10,168,159,0.32) }
        }
        @keyframes arrowBounce {
          0%, 100% { transform: translateX(0) }
          50% { transform: translateX(6px) }
        }
        @keyframes copyBob {
          0%, 100% { transform: translateY(0) }
          50% { transform: translateY(-4px) }
        }
        @keyframes copyGlow {
          0%, 100% { box-shadow: 0 6px 18px rgba(234,88,12,0.45) }
          50% { box-shadow: 0 10px 26px rgba(234,88,12,0.75) }
        }
        @keyframes copyGlowTeal {
          0%, 100% { box-shadow: 0 6px 18px rgba(10,168,159,0.45) }
          50% { box-shadow: 0 10px 26px rgba(10,168,159,0.75) }
        }
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

              {/* Push install banner — surfaced ON STEP 1, glowing when 0
                  devices so contractors can't miss it (Peter 2026-06-01:
                  brother's call delivered no PWA push because new account
                  had no subscription). Renders no-op if already subscribed. */}
              <div
                style={{
                  marginBottom: 22,
                  borderRadius: 22,
                  animation: pushDeviceCount === 0
                    ? "glowPulse 1.8s ease-in-out infinite"
                    : "none",
                }}
              >
                <PushNotificationSetup />
                {pushDeviceCount === 0 && (
                  <div style={{
                    marginTop: 10,
                    background: "#fff",
                    border: "1.5px dashed rgba(255,157,90,0.45)",
                    borderRadius: 14,
                    padding: "10px 12px",
                    textAlign: "center",
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 900, color: "#C2410C", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
                      How to add BellAveGo to your phone
                    </div>
                    {/* Three compact side-by-side panels — kept small to
                        minimize scrolling on step 1 (Peter 2026-06-01). */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                      <Image
                        src="/ADDTOHOMESCREEN.png"
                        alt="Add to Home Screen — step 1"
                        width={300}
                        height={520}
                        style={{ width: "100%", height: "auto", borderRadius: 6, display: "block" }}
                      />
                      <Image
                        src="/ADDTOHOMESCREEN2.png"
                        alt="Add to Home Screen — step 2"
                        width={300}
                        height={520}
                        style={{ width: "100%", height: "auto", borderRadius: 6, display: "block" }}
                      />
                      <Image
                        src="/ADDTOHOMESCREEN3.png"
                        alt="Add to Home Screen — step 3"
                        width={300}
                        height={520}
                        style={{ width: "100%", height: "auto", borderRadius: 6, display: "block" }}
                      />
                    </div>
                  </div>
                )}
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
                  Two side-by-side carrier-specific image cards 2026-06-01.
                  Contractor picks the one that matches their carrier and
                  copies the code under it. */}
              <div style={{ marginBottom: 18, padding: "16px 16px", background: "#FFF7ED", border: "1.5px solid #FED7AA", borderRadius: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 900, color: "#fff", background: "#EA580C", padding: "3px 9px", borderRadius: 6, letterSpacing: "0.1em" }}>STEP 1 OF 2</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: "#9A3412", letterSpacing: "0.04em", textTransform: "uppercase" }}>Wipe any old forwarding</span>
                </div>
                <div style={{ fontSize: 12.5, color: "#7C2D12", lineHeight: 1.55, marginBottom: 14 }}>
                  If you&apos;ve <strong>ever</strong> forwarded calls before — even years ago — clear it now. Pick your carrier:
                </div>

                {/* Two side-by-side carrier cards */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

                  {/* Card 1 — AT&T / T-Mobile / US Cellular / Sprint → ##002# */}
                  <div style={{ background: "#fff", borderRadius: 14, padding: "12px 12px", border: "1.5px solid #FED7AA", display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: "#9A3412", textAlign: "center", lineHeight: 1.35, letterSpacing: "0.02em" }}>
                      AT&amp;T · T-Mobile<br />US Cellular · Sprint
                    </div>
                    <Image
                      src="/dialsweep1.png"
                      alt="AT&T, T-Mobile, US Cellular, Sprint dial sweep — type ##002# then tap call"
                      width={400}
                      height={500}
                      style={{ width: "100%", height: "auto", borderRadius: 10, display: "block" }}
                    />
                    <button
                      onClick={() => copyDialCode("##002#")}
                      type="button"
                      style={{
                        padding: "12px 10px",
                        background: copiedCode === "##002#"
                          ? "linear-gradient(135deg, #22C55E 0%, #16A34A 100%)"
                          : "linear-gradient(135deg, #FB923C 0%, #EA580C 60%, #C2410C 100%)",
                        color: "#fff",
                        borderRadius: 10, border: "none",
                        fontSize: 14, fontWeight: 900, cursor: "pointer", fontFamily: "inherit",
                        letterSpacing: "0.02em",
                        animation: copiedCode === "##002#"
                          ? "none"
                          : "copyBob 1.4s ease-in-out infinite, copyGlow 2s ease-in-out infinite",
                      }}
                    >
                      {copiedCode === "##002#" ? "✓ Copied!" : "📋 Copy ##002#"}
                    </button>
                  </div>

                  {/* Card 2 — Verizon → *73 */}
                  <div style={{ background: "#fff", borderRadius: 14, padding: "12px 12px", border: "1.5px solid #FED7AA", display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: "#9A3412", textAlign: "center", lineHeight: 1.35, letterSpacing: "0.02em" }}>
                      Verizon
                    </div>
                    <Image
                      src="/dialsweep2.png"
                      alt="Verizon dial sweep — type *73 then tap call"
                      width={400}
                      height={500}
                      style={{ width: "100%", height: "auto", borderRadius: 10, display: "block" }}
                    />
                    <button
                      onClick={() => copyDialCode("*73")}
                      type="button"
                      style={{
                        padding: "12px 10px",
                        background: copiedCode === "*73"
                          ? "linear-gradient(135deg, #22C55E 0%, #16A34A 100%)"
                          : "linear-gradient(135deg, #FB923C 0%, #EA580C 60%, #C2410C 100%)",
                        color: "#fff",
                        borderRadius: 10, border: "none",
                        fontSize: 14, fontWeight: 900, cursor: "pointer", fontFamily: "inherit",
                        letterSpacing: "0.02em",
                        animation: copiedCode === "*73"
                          ? "none"
                          : "copyBob 1.4s ease-in-out infinite, copyGlow 2s ease-in-out infinite",
                      }}
                    >
                      {copiedCode === "*73" ? "✓ Copied!" : "📋 Copy *73"}
                    </button>
                  </div>

                </div>

                <div style={{ fontSize: 11.5, color: "#9A3412", marginTop: 12, lineHeight: 1.55, textAlign: "center" }}>
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

              {/* STEP 2 OF 2 — carrier-specific forward to BellAveGo */}
              {profile.twilio_number && (() => {
                const tn = profile.twilio_number
                const carrierCode = fwdCode(carrier, tn)
                return (
                <div style={{ marginBottom: 14, padding: "16px 16px", background: "#F0FBF8", border: "1.5px solid rgba(10,168,159,0.28)", borderRadius: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 900, color: "#fff", background: "#0AA89F", padding: "3px 9px", borderRadius: 6, letterSpacing: "0.1em" }}>STEP 2 OF 2</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#0B1F3A", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                      Forward to BellAveGo · {CARRIER_LABEL[carrier]}
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, color: "#0B1F3A", lineHeight: 1.55, marginBottom: 14 }}>
                    This code tells your carrier to forward unanswered calls to your AI receptionist after about 15 seconds.
                  </div>

                  {/* Phone mockup — keypad screen with the carrier code typed */}
                  <div style={{
                    background: "linear-gradient(180deg, #1F2937 0%, #111827 100%)",
                    borderRadius: 18,
                    padding: "14px 14px 16px",
                    marginBottom: 12,
                    boxShadow: "0 10px 28px rgba(17,24,39,0.3)",
                    border: "3px solid #1F2937",
                  }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.55)", textAlign: "center", letterSpacing: "0.18em", marginBottom: 6 }}>
                      📱 YOUR PHONE — KEYPAD
                    </div>
                    <div style={{
                      background: "#0B1220",
                      borderRadius: 10,
                      padding: "16px 10px",
                      textAlign: "center",
                      marginBottom: 12,
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}>
                      <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: "1.5px", wordBreak: "break-all" }}>
                        {carrierCode}
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.4)", marginTop: 6, letterSpacing: "0.1em" }}>
                        the digits include your BellAveGo number above
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                      <span style={{
                        fontSize: 22, color: "#22C55E", fontWeight: 900,
                        animation: "arrowBounce 1.2s ease-in-out infinite",
                      }}>
                        →
                      </span>
                      <div style={{
                        width: 64, height: 64, borderRadius: "50%",
                        background: "linear-gradient(135deg, #22C55E 0%, #16A34A 100%)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: "0 0 0 0 rgba(34,197,94,0.55), 0 8px 22px rgba(22,163,74,0.45)",
                        animation: "ringPulse 1.4s ease-out infinite",
                      }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                        </svg>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "#22C55E", letterSpacing: "0.06em" }}>
                        then tap call
                      </span>
                    </div>
                  </div>

                  {/* Copy-only — Tap-to-dial removed 2026-06-01 per Peter.
                      The "Done — set appointment rules →" button below the
                      mockups still fires onDialedForwarding so the wizard
                      advances normally after the contractor pastes + calls. */}
                  <button
                    onClick={() => copyDialCode(carrierCode)}
                    type="button"
                    style={{
                      width: "100%",
                      padding: "16px 18px",
                      background: copiedCode === carrierCode
                        ? "linear-gradient(135deg, #22C55E 0%, #16A34A 100%)"
                        : "linear-gradient(135deg, #14B8A6 0%, #0AA89F 60%, #088A82 100%)",
                      color: "#fff",
                      borderRadius: 12, border: "none",
                      fontSize: 16, fontWeight: 900, cursor: "pointer", fontFamily: "inherit",
                      letterSpacing: "0.02em",
                      boxShadow: "0 8px 22px rgba(10,168,159,0.45)",
                      animation: copiedCode === carrierCode
                        ? "none"
                        : "copyBob 1.4s ease-in-out infinite, copyGlowTeal 2s ease-in-out infinite",
                    }}
                  >
                    {copiedCode === carrierCode
                      ? "✓ Copied — now paste it into your Phone app"
                      : "📋 Copy code"}
                  </button>
                </div>
                )
              })()}

              {/* What to expect — sets the trust */}
              <div style={{ marginTop: 4, padding: "12px 14px", background: "#F5FDFB", border: "1px dashed rgba(10,168,159,0.3)", borderRadius: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#0AA89F", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                  What to expect
                </div>
                <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#4A7A80", lineHeight: 1.7 }}>
                  <li>You&apos;ll hear a confirmation tone or short message</li>
                  <li>Your carrier saves the forwarding rule — calls after 12 sec of no answer route here</li>
                  <li>Have a friend call your business cell to verify it works (on the last step)</li>
                </ol>
              </div>

              {/* PUSH GATE on step 1 — can't continue until phone alerts on,
                  OR contractor explicitly skips. Closes the silent-fail hole
                  where new accounts had 0 push subs (Peter 2026-06-01). */}
              {pushDeviceCount === 0 && !pushSkipAck ? (
                <>
                  <button
                    disabled
                    style={{ ...primaryButton, marginTop: 16, opacity: 0.45, cursor: "not-allowed" }}
                  >
                    🔔 Turn on Lead Alerts above first
                  </button>
                  <div style={{ fontSize: 12, color: "#B45309", fontWeight: 700, marginTop: 10, textAlign: "center", lineHeight: 1.55 }}>
                    Enable lead alerts above before continuing — otherwise you won&apos;t get phone notifications when a customer calls.
                  </div>
                  <button
                    onClick={() => setPushSkipAck(true)}
                    type="button"
                    style={{
                      background: "transparent", border: "none",
                      color: "#A0BCC2", fontSize: 11, fontWeight: 700,
                      cursor: "pointer", padding: "10px 0 0",
                      width: "100%", textAlign: "center", fontFamily: "inherit",
                      textDecoration: "underline",
                    }}
                  >
                    Skip phone alerts for now (not recommended)
                  </button>
                </>
              ) : (
                <button onClick={onDialedForwarding} disabled={busy} style={{ ...primaryButton, marginTop: 16 }}>
                  {busy ? "Saving…" : "Done — set appointment rules →"}
                </button>
              )}

              <div style={{ fontSize: 11, color: "#A0BCC2", marginTop: 14, textAlign: "center" }}>
                To turn off forwarding later, dial <strong style={{ color: "#4A7A80" }}>{disableCode(carrier)}</strong> from the same phone.
              </div>
            </div>
          )}

          {/* STEP 2 — APPOINTMENT RULES (MANDATORY for every tier).
              Was step 3 before the auto-fire forwarding test (old step 2)
              was deleted on 2026-06-01 for trapping contractors with carrier-
              specific dead ends. Locks in default job duration + travel
              buffer so the AI can never book overlapping jobs. */}
          {step === 2 && (
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

          {/* STEP 3 — Call your AI to verify it works (final step for every tier) */}
          {step === 3 && (
            <div className="step-enter">
              <h2 style={{ ...titleStyle, fontSize: 26 }}>Last step — hear your AI live.</h2>
              <p style={{ ...subStyle, fontSize: 15 }}>
                Call your new number from this phone to confirm Emma is answering.
              </p>

              {/* PWA install widget was removed from step 3 on 2026-06-01 —
                  the PushNotificationSetup component is already rendered on
                  step 1 (right under the welcome banner), so repeating it
                  here was duplicate UX. */}

              {/* PART B — Call your AI to hear it */}
              <div style={{
                background: "linear-gradient(135deg, #F0FBF8 0%, #FFFFFF 60%)",
                border: "1.5px solid rgba(10,168,159,0.28)",
                borderRadius: 14,
                padding: "18px 18px",
                marginBottom: 18,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
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

              {/* Real-world forwarding check — replaces the old auto-fire test
                  call that trapped contractors on carrier-specific failures.
                  Asking a real human to call is the actual test that matters. */}
              <div style={{
                background: "linear-gradient(135deg, #F0FBF8 0%, #FFFFFF 60%)",
                border: "1.5px dashed rgba(10,168,159,0.32)",
                borderRadius: 14,
                padding: "16px 18px",
                marginBottom: 18,
              }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: "#0AA89F", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
                  Verify forwarding works
                </div>
                <p style={{ fontSize: 13, color: "#0B1F3A", lineHeight: 1.55, margin: 0 }}>
                  Ask a family member or friend to call your business cell —{' '}
                  <strong>{profile.owner_phone || 'your number'}</strong> — and let it ring. After ~15 seconds your carrier should forward to BellAveGo and Emma should pick up. If she does, you&apos;re live.
                </p>
                <p style={{ fontSize: 11, color: "#7AAAB2", lineHeight: 1.55, margin: "8px 0 0" }}>
                  If Emma doesn&apos;t pick up: go back to step 1 and re-dial the forwarding code. Some carriers need you to wipe old forwarding first.
                </p>
              </div>

              {/* PUSH GATE — REQUIRED. New accounts that ship with 0 push
                  subscriptions deliver email-only and get "where's my
                  notification?" support tickets within 24 hours (Peter's
                  brother's call, 2026-06-01). Block the finish button
                  until either (a) at least one device is registered, or
                  (b) contractor explicitly clicks "skip and finish anyway". */}
              <div style={{
                background: pushDeviceCount && pushDeviceCount > 0
                  ? "linear-gradient(135deg, #F0FDF4 0%, #FFFFFF 60%)"
                  : "linear-gradient(135deg, #FFFBEB 0%, #FFFFFF 60%)",
                border: pushDeviceCount && pushDeviceCount > 0
                  ? "1.5px solid #22C55E"
                  : "1.5px solid #F59E0B",
                borderRadius: 14,
                padding: "16px 18px",
                marginBottom: 18,
              }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: pushDeviceCount && pushDeviceCount > 0 ? "#16A34A" : "#B45309", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
                  {pushDeviceCount == null ? "Checking phone alerts…" : pushDeviceCount > 0 ? "✅ Phone alerts on" : "⚠️ Phone alerts NOT enabled"}
                </div>
                {pushDeviceCount === 0 ? (
                  <>
                    <p style={{ fontSize: 13, color: "#0B1F3A", lineHeight: 1.55, margin: 0 }}>
                      <strong>You won&apos;t get a phone notification</strong> when a customer calls. Email still works, but if you want the lock-screen alert you need to enable lead alerts on your phone.
                    </p>
                    <p style={{ fontSize: 12, color: "#7C2D12", lineHeight: 1.55, margin: "8px 0 0" }}>
                      Go back to step 1, tap <strong>&ldquo;Text me the link&rdquo;</strong>, open the SMS on your phone, tap the link, then tap <strong>&ldquo;Turn on Lead Alerts&rdquo;</strong>.
                    </p>
                  </>
                ) : (
                  <p style={{ fontSize: 13, color: "#0B1F3A", lineHeight: 1.55, margin: 0 }}>
                    <strong>{pushDeviceCount} device{pushDeviceCount === 1 ? '' : 's'}</strong> will get a push notification every time a customer calls. Send a test below to confirm it really works.
                  </p>
                )}
                <button
                  onClick={fireTestPush}
                  disabled={pushTestStatus === 'sending'}
                  style={{
                    marginTop: 10,
                    padding: "10px 18px",
                    borderRadius: 10,
                    border: "none",
                    background: pushTestStatus === 'sent'
                      ? 'linear-gradient(135deg, #22C55E, #16A34A)'
                      : pushTestStatus === 'no-sub' || pushTestStatus === 'error'
                      ? 'linear-gradient(135deg, #F59E0B, #D97706)'
                      : 'linear-gradient(135deg, #0AA89F, #088A82)',
                    color: '#fff',
                    fontSize: 13, fontWeight: 800,
                    cursor: pushTestStatus === 'sending' ? 'wait' : 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {pushTestStatus === 'sending' && 'Sending…'}
                  {pushTestStatus === 'sent' && '✅ Sent — check your phone'}
                  {pushTestStatus === 'no-sub' && 'No device — enable first ↑'}
                  {pushTestStatus === 'error' && 'Failed — try again'}
                  {pushTestStatus === 'idle' && '📲 Send test notification'}
                </button>
              </div>

              {/* Gate: must have devices OR explicitly skip */}
              {pushDeviceCount === 0 && !pushSkipAck ? (
                <>
                  <button
                    disabled
                    style={{ ...primaryButton, opacity: 0.5, cursor: 'not-allowed' }}
                  >
                    🎉 I&apos;m done — open my dashboard →
                  </button>
                  <button
                    onClick={() => setPushSkipAck(true)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#7AAAB2',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      padding: '12px 0 0',
                      width: '100%',
                      textAlign: 'center',
                      fontFamily: 'inherit',
                      textDecoration: 'underline',
                    }}
                  >
                    Skip phone alerts for now — I&apos;ll set them up later
                  </button>
                </>
              ) : (
                <button onClick={continueAfterPhoneStep} disabled={busy} style={primaryButton}>
                  {busy ? "Saving…" : meta.isOfficeMgr || meta.isConcierge ? "Continue →" : "🎉 I'm done — open my dashboard →"}
                </button>
              )}
              <div style={{ fontSize: 12, color: "#A0BCC2", marginTop: 10, textAlign: "center" }}>
                You can come back to enable phone alerts anytime from the dashboard.
              </div>
            </div>
          )}

          {/* STEP 4 — CRM (Office Mgr + Concierge) — was step 5 pre-2026-06-01 */}
          {step === 4 && (meta.isOfficeMgr || meta.isConcierge) && (
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
          {step === 5 && meta.isConcierge && (
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
