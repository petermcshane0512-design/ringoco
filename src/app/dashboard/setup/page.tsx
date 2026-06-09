"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

/**
 * /dashboard/setup — 2026-06-09 SMOOTH REWRITE.
 *
 * Was 17 separate steps. Owner felt it. Consolidated into 7 rich
 * logically-grouped steps. Same data collection — just chunked by
 * question, not by field. Warmer orange palette to match the homepage
 * instead of the cyan/teal SaaS look. Closing review step lets owner
 * see everything before launch + builds Hormozi pre-commitment.
 *
 * Step map:
 *   1. About your business (name + owner name + phone + years)
 *   2. Trade + service area (trade + sub-specialty + zip + radius)
 *   3. What jobs you actually want (job types + min + avg + exclusions)
 *   4. Your hours + equipment (work days + hours + equipment/licenses)
 *   5. What makes you stand out (mfr certs + value props + ideal cust)
 *   6. How AI sounds when reaching out (tone radio)
 *   7. Review + launch (summary + big CTA)
 *
 * No AI-receptionist references anywhere. Outreach tone here means AI
 * sending intro messages to LEADS (homeowners) — the moat per CLAUDE.md
 * "Five Things That Matter" #2.
 */

type Profile = {
  user_id: string;
  business_name?: string | null;
  owner_first_name?: string | null;
  owner_last_name?: string | null;
  owner_phone?: string | null;
  service_zips?: string[] | null;
  service_radius_mi?: number | null;
  business_type?: string | null;
  services_offered?: string | null;
  job_types?: string[] | null;
  min_job_value_cents?: number | null;
  years_in_business?: number | null;
  value_props?: string[] | null;
  outreach_tone?: string | null;
  outreach_prompt_template?: string | null;
  setup_complete?: boolean | null;
  sub_specialties?: string[] | null;
  manufacturer_certs?: string[] | null;
  avg_ticket_cents?: number | null;
  work_days?: string[] | null;
  work_hours_start?: string | null;
  work_hours_end?: string | null;
  equipment_capabilities?: string[] | null;
  ideal_customer_desc?: string | null;
  exclusions?: string[] | null;
};

const TRADE_OPTIONS = ["HVAC", "Plumbing", "Electrical", "Roofing", "Handyman", "Multi-trade"];
const JOB_TYPE_OPTIONS = [
  "Residential service / repair",
  "Residential install / replace",
  "Residential maintenance / tune-ups",
  "Commercial service",
  "Emergency 24/7",
  "Multi-family / apartments",
  "New construction",
];
const SUB_SPECIALTY_BY_TRADE: Record<string, string[]> = {
  HVAC: ["AC install / replace", "Heat pump", "Mini-split", "Furnace replace", "Ductwork", "Indoor air quality", "Commercial RTU"],
  Plumbing: ["Drain cleaning", "Sewer / main line", "Water heater", "Repipe", "Bathroom remodel", "Fixture install", "Slab leak"],
  Electrical: ["Panel upgrade", "EV charger install", "Generator install", "Solar / battery", "Service rewire", "Smart home", "Lighting install"],
  Roofing: ["Shingle replace", "Tile / metal roof", "Storm repair", "Skylight", "Gutters / soffits", "Commercial flat roof", "Inspection"],
  Handyman: ["Drywall / paint", "Carpentry", "Door / window", "Deck / fence", "Garage door", "Light plumbing fix", "Light electrical fix", "Kitchen / bath cosmetic"],
};
const MFR_CERTS_BY_TRADE: Record<string, string[]> = {
  HVAC: ["Carrier Factory Authorized", "Trane Comfort Specialist", "Lennox Premier Dealer", "Rheem Pro Partner", "Goodman Dealer", "Daikin Comfort Pro", "Mitsubishi Diamond Contractor"],
  Plumbing: ["Rheem Pro Partner (water heaters)", "Bradford White Authorized", "Rinnai Authorized", "Moen Pro", "Kohler Authorized", "Pfister Pro"],
  Electrical: ["Generac PowerPro", "Kohler Generators Authorized", "Tesla Powerwall Certified", "Enphase Installer", "Schneider Electric Authorized", "Square D Pro"],
  Roofing: ["GAF Master Elite", "Owens Corning Platinum Preferred", "CertainTeed SELECT ShingleMaster", "TAMKO Pro Roofer", "IKO Shield Pro"],
  Handyman: [],
};
const EQUIPMENT_BY_TRADE: Record<string, string[]> = {
  HVAC: ["EPA 608 cert", "NATE cert", "Ductwork install", "Sheet metal fab", "IAQ certified", "Commercial license", "Refrigerant recovery"],
  Plumbing: ["Master plumber license", "Backflow cert", "Medical gas cert", "Sewer camera", "Hydrojetter", "Trenchless capability"],
  Electrical: ["Master electrician license", "Low-voltage license", "Generator cert", "Solar PV cert", "Lift truck", "Underground service drop"],
  Roofing: ["Shingle install", "Tile install", "Metal roof install", "TPO/EPDM (flat)", "Drone inspection", "Insurance claim handling"],
  Handyman: ["Pickup truck", "Trailer", "Ladder (24ft+)", "Power tools complete kit", "Insured for commercial work", "Licensed for plumbing repair", "Licensed for electrical repair"],
};
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const VALUE_PROP_OPTIONS = [
  "Financing available",
  "5-year warranty",
  "10-year warranty",
  "Lifetime warranty (parts)",
  "Family-owned",
  "Veteran-owned",
  "Woman-owned",
  "Licensed + insured + bonded",
  "BBB A+ rating",
  "Same-day service",
  "Free estimates",
  "Senior / military discount",
  "Energy-efficiency rebates",
  "Trade union member",
];
const EXCLUSION_OPTIONS = [
  "No commercial",
  "No new construction",
  "No warranty work",
  "No rental properties",
  "No mobile homes",
  "No properties >50mi",
  "No insurance jobs",
  "No DIY-help calls",
];
const TONE_OPTIONS = [
  { value: "casual", emoji: "👋", label: "Casual / friendly", desc: "\"Hey Mike — saw your AC may be on the way out…\"" },
  { value: "professional", emoji: "🤝", label: "Professional", desc: "\"Hello Mr. Smith — our records show your unit was installed in 2014…\"" },
  { value: "direct", emoji: "⚡", label: "Direct / no-fluff", desc: "\"Mike — your AC is 11 yrs old. Free quote, today if you want.\"" },
];

const STEP_META = [
  { n: 1, icon: "🏢", title: "About your business",        coach: "Takes ~30 sec. We'll use this on every lead reach-out." },
  { n: 2, icon: "📍", title: "Trade + service area",       coach: "So we only send leads in your zone for what you actually do." },
  { n: 3, icon: "💰", title: "What jobs you want",         coach: "Filter out the wrong-fit leads before they hit your dashboard." },
  { n: 4, icon: "🛠️", title: "Hours + equipment",          coach: "We hold leads if you're off-clock. Match capabilities to jobs." },
  { n: 5, icon: "⭐", title: "What makes you stand out",   coach: "AI uses these to write emails that close — not generic spam." },
  { n: 6, icon: "✉️", title: "AI outreach tone",           coach: "How AI sounds writing to homeowners on your behalf." },
  { n: 7, icon: "🚀", title: "Review + launch",            coach: "First lead drop arrives within 24 hrs of finishing." },
];
const TOTAL_STEPS = STEP_META.length;

export default function SetupWizardLeads() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [businessName, setBusinessName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [yearsInBusiness, setYearsInBusiness] = useState<number | "">("");
  const [trades, setTrades] = useState<string[]>([]);
  const [subSpecialties, setSubSpecialties] = useState<string[]>([]);
  const [primaryZip, setPrimaryZip] = useState("");
  const [radius, setRadius] = useState(25);
  const [jobTypes, setJobTypes] = useState<string[]>([]);
  const [minJobValue, setMinJobValue] = useState(0);
  const [avgTicket, setAvgTicket] = useState(1500);
  const [exclusions, setExclusions] = useState<string[]>([]);
  const [workDays, setWorkDays] = useState<string[]>(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  const [workStart, setWorkStart] = useState("07:00");
  const [workEnd, setWorkEnd] = useState("19:00");
  const [equipment, setEquipment] = useState<string[]>([]);
  const [mfrCerts, setMfrCerts] = useState<string[]>([]);
  const [valueProps, setValueProps] = useState<string[]>([]);
  const [idealCustomer, setIdealCustomer] = useState("");
  const [tone, setTone] = useState<string>("casual");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/profile");
        if (r.ok) {
          const p: Profile = await r.json();
          setProfile(p);
          if (p.business_name) setBusinessName(p.business_name);
          if (p.owner_first_name) setFirstName(p.owner_first_name);
          if (p.owner_last_name) setLastName(p.owner_last_name);
          if (p.owner_phone) setOwnerPhone(p.owner_phone);
          if (p.business_type) setTrades(p.business_type.split(",").map(s => s.trim()).filter(Boolean));
          if (Array.isArray(p.service_zips) && p.service_zips[0]) setPrimaryZip(p.service_zips[0]);
          if (p.service_radius_mi) setRadius(p.service_radius_mi);
          if (Array.isArray(p.job_types)) setJobTypes(p.job_types);
          if (p.min_job_value_cents != null) setMinJobValue(Math.round(p.min_job_value_cents / 100));
          if (p.years_in_business != null) setYearsInBusiness(p.years_in_business);
          if (Array.isArray(p.value_props)) setValueProps(p.value_props);
          if (p.outreach_tone) setTone(p.outreach_tone);
          if (Array.isArray(p.sub_specialties)) setSubSpecialties(p.sub_specialties);
          if (Array.isArray(p.manufacturer_certs)) setMfrCerts(p.manufacturer_certs);
          if (p.avg_ticket_cents != null) setAvgTicket(Math.round(p.avg_ticket_cents / 100));
          if (Array.isArray(p.work_days)) setWorkDays(p.work_days);
          if (p.work_hours_start) setWorkStart(p.work_hours_start);
          if (p.work_hours_end) setWorkEnd(p.work_hours_end);
          if (Array.isArray(p.equipment_capabilities)) setEquipment(p.equipment_capabilities);
          if (p.ideal_customer_desc) setIdealCustomer(p.ideal_customer_desc);
          if (Array.isArray(p.exclusions)) setExclusions(p.exclusions);
        }
      } catch { /* allow new */ }
      setLoading(false);
    })();
  }, []);

  function toggleArr(setter: (v: string[]) => void, current: string[], value: string) {
    setter(current.includes(value) ? current.filter(v => v !== value) : [...current, value]);
  }

  async function save(partial: Partial<Profile>): Promise<boolean> {
    setSaving(true); setError(null);
    try {
      const r = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      });
      if (!r.ok) { setError((await r.json()).error || "save failed"); setSaving(false); return false; }
      setSaving(false);
      return true;
    } catch (e) {
      setError((e as Error).message); setSaving(false); return false;
    }
  }

  async function finishOnboarding() {
    const payload: Partial<Profile> = {
      business_name: businessName.trim(),
      owner_first_name: firstName.trim(),
      owner_last_name: lastName.trim(),
      owner_phone: ownerPhone.replace(/\D/g, ""),
      business_type: trades.join(", "),
      services_offered: trades.join(", "),
      service_zips: primaryZip ? [primaryZip] : [],
      service_radius_mi: radius,
      job_types: jobTypes,
      min_job_value_cents: minJobValue * 100,
      years_in_business: typeof yearsInBusiness === "number" ? yearsInBusiness : null,
      value_props: valueProps,
      outreach_tone: tone,
      sub_specialties: subSpecialties,
      manufacturer_certs: mfrCerts,
      avg_ticket_cents: avgTicket * 100,
      work_days: workDays,
      work_hours_start: workStart,
      work_hours_end: workEnd,
      equipment_capabilities: equipment,
      ideal_customer_desc: idealCustomer.trim() || null,
      exclusions: exclusions,
      setup_complete: true,
    };
    const ok = await save(payload);
    if (!ok) return;

    try {
      await fetch("/api/leads/generate-outreach-prompt", { method: "POST" });
    } catch { /* non-fatal */ }

    router.push("/dashboard/leads?welcome=1");
  }

  if (loading) {
    return (
      <main style={{ padding: 40, color: "#0B1F3A", fontFamily: "'Inter', system-ui, sans-serif" }}>Loading…</main>
    );
  }

  const pct = Math.round((step / TOTAL_STEPS) * 100);
  const primaryTrade = trades[0] || "HVAC";
  const subSpecOptions = SUB_SPECIALTY_BY_TRADE[primaryTrade] || SUB_SPECIALTY_BY_TRADE.HVAC;
  const mfrCertOptions = MFR_CERTS_BY_TRADE[primaryTrade] || [];
  const equipmentOptions = EQUIPMENT_BY_TRADE[primaryTrade] || EQUIPMENT_BY_TRADE.HVAC;
  const meta = STEP_META[step - 1];

  return (
    <main style={{
      minHeight: "100vh",
      background: "radial-gradient(ellipse at 50% -10%, rgba(255,217,168,0.55) 0%, rgba(255,248,240,1) 55%)",
      fontFamily: "'Inter', system-ui, sans-serif",
      color: "#0B1F3A",
      padding: "28px 16px 80px",
    }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <Image src="/logo.png" alt="BellAveGo" width={200} height={62} style={{ objectFit: "contain" }} />
          <div style={{
            padding: "6px 14px", borderRadius: 99,
            background: "rgba(232,116,43,0.10)",
            border: "1.5px solid rgba(232,116,43,0.30)",
            fontSize: 11, fontWeight: 800, color: "#C84B26",
            letterSpacing: "0.08em", textTransform: "uppercase",
          }}>Step {step} of {TOTAL_STEPS}</div>
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ height: 8, background: "rgba(11,31,58,0.06)", borderRadius: 99, overflow: "hidden" }}>
            <div style={{
              width: `${pct}%`, height: "100%",
              background: "linear-gradient(90deg, #FF9D5A, #E8742B, #C84B26)",
              transition: "width 320ms cubic-bezier(.2,.9,.3,1.2)",
              boxShadow: "0 0 14px rgba(232,116,43,0.42)",
            }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "#7AAAB2", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            <span>{pct}% there</span>
            {pct >= 50 && pct < 100 && <span style={{ color: "#16803F" }}>Almost done · {TOTAL_STEPS - step} step{TOTAL_STEPS - step === 1 ? "" : "s"} left</span>}
            {pct === 100 && <span style={{ color: "#16803F" }}>🎉 Last step</span>}
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: "#FFFFFF",
          borderRadius: 22,
          padding: "30px 28px 26px",
          boxShadow: "0 18px 52px rgba(11,31,58,0.08), 0 4px 16px rgba(232,116,43,0.06)",
          border: "1px solid rgba(232,116,43,0.18)",
        }}>
          {/* Step header w/ icon */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14,
              background: "linear-gradient(135deg, #FF9D5A, #E8742B 60%, #C84B26)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 26,
              boxShadow: "0 10px 24px rgba(232,116,43,0.36)",
              flexShrink: 0,
            }}>{meta.icon}</div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#C84B26", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 3 }}>Step {step}</div>
              <h1 style={{ fontSize: 26, fontWeight: 900, color: "#0B1F3A", letterSpacing: "-0.025em", margin: 0, lineHeight: 1.15 }}>{meta.title}</h1>
            </div>
          </div>
          <p style={{ fontSize: 14, color: "#4A6670", lineHeight: 1.55, margin: "0 0 22px" }}>{meta.coach}</p>

          {/* Step body */}
          {step === 1 && (
            <div style={{ display: "grid", gap: 14 }}>
              <Field label="Business name">
                <Input value={businessName} onChange={setBusinessName} placeholder="Mike's HVAC & Plumbing" autoFocus />
              </Field>
              <Field label="Your name">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Input value={firstName} onChange={setFirstName} placeholder="First name" />
                  <Input value={lastName} onChange={setLastName} placeholder="Last name" />
                </div>
              </Field>
              <Field label="Cell phone (for reply alerts)">
                <Input value={ownerPhone} onChange={setOwnerPhone} placeholder="(555) 555-1234" type="tel" />
              </Field>
              <Field label="Years in business" hint="Used in your outreach — credibility signal homeowners respond to.">
                <Input
                  value={String(yearsInBusiness ?? "")}
                  onChange={(v) => {
                    const n = parseInt(v.replace(/\D/g, ""), 10);
                    if (isNaN(n)) setYearsInBusiness("");
                    else setYearsInBusiness(Math.min(75, Math.max(0, n)));
                  }}
                  placeholder="e.g. 8"
                  type="number"
                />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div style={{ display: "grid", gap: 18 }}>
              <Field label="Trade(s) you serve">
                <Multi options={TRADE_OPTIONS} value={trades} onToggle={(v) => toggleArr(setTrades, trades, v)} />
              </Field>
              {trades.length > 0 && (
                <Field label={`What ${primaryTrade.toLowerCase()} work specifically?`} hint="Pick at least one — we filter leads to match.">
                  <Multi options={subSpecOptions} value={subSpecialties} onToggle={(v) => toggleArr(setSubSpecialties, subSpecialties, v)} />
                </Field>
              )}
              <Field label="Primary zip + service radius">
                <div style={{ display: "grid", gap: 12 }}>
                  <Input value={primaryZip} onChange={(v) => setPrimaryZip(v.replace(/\D/g, "").slice(0, 5))} placeholder="Primary zip code" />
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "#4A6670", display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span>Service radius</span>
                      <span style={{ color: "#C84B26", fontWeight: 900 }}>{radius} miles</span>
                    </label>
                    <input type="range" min={5} max={75} step={5} value={radius} onChange={(e) => setRadius(parseInt(e.target.value, 10))} style={rangeStyle} />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#7AAAB2", marginTop: 4 }}>
                      <span>5mi</span><span>75mi</span>
                    </div>
                  </div>
                </div>
              </Field>
            </div>
          )}

          {step === 3 && (
            <div style={{ display: "grid", gap: 18 }}>
              <Field label="Job types you want">
                <Multi options={JOB_TYPE_OPTIONS} value={jobTypes} onToggle={(v) => toggleArr(setJobTypes, jobTypes, v)} />
              </Field>
              <Field label="Smallest job worth your time" hint="$0 = receive everything. Slide up to filter out tiny service calls.">
                <label style={{ fontSize: 12, fontWeight: 700, color: "#4A6670", display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span>Minimum job size</span>
                  <span style={{ color: "#C84B26", fontWeight: 900 }}>${minJobValue.toLocaleString()}</span>
                </label>
                <input type="range" min={0} max={5000} step={50} value={minJobValue} onChange={(e) => setMinJobValue(parseInt(e.target.value, 10))} style={rangeStyle} />
              </Field>
              <Field label="Average job size" hint="Used to match you to right-fit homes for higher close rate.">
                <label style={{ fontSize: 12, fontWeight: 700, color: "#4A6670", display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span>Average ticket</span>
                  <span style={{ color: "#C84B26", fontWeight: 900 }}>${avgTicket.toLocaleString()}</span>
                </label>
                <input type="range" min={100} max={20000} step={50} value={avgTicket} onChange={(e) => setAvgTicket(parseInt(e.target.value, 10))} style={rangeStyle} />
              </Field>
              <Field label="Jobs we should NEVER send you" hint="Optional — check anything that's an instant no.">
                <Multi options={EXCLUSION_OPTIONS} value={exclusions} onToggle={(v) => toggleArr(setExclusions, exclusions, v)} />
              </Field>
            </div>
          )}

          {step === 4 && (
            <div style={{ display: "grid", gap: 18 }}>
              <Field label="Days you work" hint="We hold leads if you're off-clock — no Monday 6am alerts on your Sunday.">
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {DAYS.map((d) => {
                    const active = workDays.includes(d);
                    return (
                      <button key={d} onClick={() => toggleArr(setWorkDays, workDays, d)} type="button" style={{
                        padding: "11px 16px", borderRadius: 11,
                        border: active ? "2px solid #E8742B" : "1.5px solid rgba(11,31,58,0.14)",
                        background: active ? "rgba(232,116,43,0.10)" : "#FFFFFF",
                        color: active ? "#C84B26" : "#4A6670",
                        fontSize: 13, fontWeight: 800, cursor: "pointer",
                        transition: "all 160ms ease",
                      }}>{d}</button>
                    );
                  })}
                </div>
              </Field>
              <Field label="Work hours">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#7AAAB2", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>Start</div>
                    <input type="time" value={workStart} onChange={(e) => setWorkStart(e.target.value)} style={timeInputStyle} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#7AAAB2", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>End</div>
                    <input type="time" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} style={timeInputStyle} />
                  </div>
                </div>
              </Field>
              <Field label="Equipment + licenses" hint="Matches you to leads needing your specific capabilities. EPA-cert? Send refrigerant work. Sewer camera? Send drain leads.">
                <Multi options={equipmentOptions} value={equipment} onToggle={(v) => toggleArr(setEquipment, equipment, v)} />
              </Field>
            </div>
          )}

          {step === 5 && (
            <div style={{ display: "grid", gap: 18 }}>
              {mfrCertOptions.length > 0 && (
                <Field label="Manufacturer dealer status" hint='Optional but huge — drives premium positioning ("Carrier Factory Authorized") in your outreach.'>
                  <Multi options={mfrCertOptions} value={mfrCerts} onToggle={(v) => toggleArr(setMfrCerts, mfrCerts, v)} />
                </Field>
              )}
              <Field label="What makes you stand out" hint="AI uses these to write emails that close — not generic spam.">
                <Multi options={VALUE_PROP_OPTIONS} value={valueProps} onToggle={(v) => toggleArr(setValueProps, valueProps, v)} />
              </Field>
              <Field label="Describe your ideal customer (optional)" hint="Free text. Our 'lookalike' AI finds more homeowners just like the ones you love.">
                <textarea
                  value={idealCustomer}
                  onChange={(e) => setIdealCustomer(e.target.value.slice(0, 280))}
                  placeholder="e.g. Suburban homeowner, $400K+ house, values long-term relationships, not a tire-kicker."
                  rows={3}
                  style={{
                    width: "100%", padding: "13px 15px",
                    fontSize: 14, fontWeight: 500,
                    border: "1.5px solid rgba(11,31,58,0.14)", borderRadius: 12,
                    background: "#FFFFFF", color: "#0B1F3A", outline: "none",
                    fontFamily: "inherit", resize: "vertical",
                    boxSizing: "border-box",
                  }}
                />
                <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 11, color: "#7AAAB2", marginTop: 4 }}>
                  {idealCustomer.length}/280
                </div>
              </Field>
            </div>
          )}

          {step === 6 && (
            <div style={{ display: "grid", gap: 10 }}>
              {TONE_OPTIONS.map((opt) => {
                const active = tone === opt.value;
                return (
                  <label key={opt.value} style={{
                    display: "flex", gap: 14, alignItems: "flex-start",
                    padding: "16px 18px", borderRadius: 14,
                    border: active ? "2px solid #E8742B" : "1.5px solid rgba(11,31,58,0.14)",
                    background: active ? "rgba(232,116,43,0.08)" : "#FFFFFF",
                    cursor: "pointer",
                    transition: "all 160ms ease",
                    boxShadow: active ? "0 8px 24px rgba(232,116,43,0.18)" : "none",
                  }}>
                    <div style={{
                      width: 42, height: 42, borderRadius: 11,
                      background: active ? "linear-gradient(135deg, #FF9D5A, #E8742B)" : "rgba(11,31,58,0.06)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 22, flexShrink: 0,
                    }}>{opt.emoji}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input type="radio" name="tone" value={opt.value} checked={active} onChange={() => setTone(opt.value)} />
                        <div style={{ fontSize: 15, fontWeight: 900, color: "#0B1F3A" }}>{opt.label}</div>
                      </div>
                      <div style={{ fontSize: 12.5, color: "#4A6670", marginTop: 6, fontStyle: "italic", lineHeight: 1.5 }}>{opt.desc}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}

          {step === 7 && (
            <ReviewSummary
              data={{
                businessName, firstName, lastName, ownerPhone, yearsInBusiness,
                trades, subSpecialties, primaryZip, radius,
                jobTypes, minJobValue, avgTicket, exclusions,
                workDays, workStart, workEnd, equipment,
                mfrCerts, valueProps, idealCustomer, tone,
              }}
              onEdit={(s) => setStep(s)}
            />
          )}

          {error && (
            <div style={{
              marginTop: 16, padding: "11px 14px", borderRadius: 11,
              background: "#FEE2E2", color: "#991B1B", fontSize: 13, fontWeight: 600,
            }}>
              {error}
            </div>
          )}

          {/* Nav buttons */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 28, gap: 10 }}>
            <button
              onClick={() => setStep(Math.max(1, step - 1))}
              disabled={step === 1 || saving}
              style={{
                padding: "12px 22px", borderRadius: 11,
                background: "transparent",
                border: "1.5px solid rgba(11,31,58,0.18)",
                color: "#4A6670",
                fontSize: 13, fontWeight: 800, cursor: step === 1 ? "default" : "pointer",
                opacity: step === 1 ? 0.4 : 1,
              }}
            >
              ← Back
            </button>
            {step < TOTAL_STEPS ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={!canAdvance(step, { businessName, firstName, lastName, ownerPhone, trades, primaryZip, jobTypes, valueProps, subSpecialties, workDays })}
                style={{
                  padding: "14px 30px", borderRadius: 11,
                  background: "linear-gradient(135deg, #FF9D5A 0%, #E8742B 50%, #C84B26 100%)",
                  border: "none", color: "#FFFFFF", fontSize: 14, fontWeight: 900,
                  cursor: "pointer",
                  opacity: canAdvance(step, { businessName, firstName, lastName, ownerPhone, trades, primaryZip, jobTypes, valueProps, subSpecialties, workDays }) ? 1 : 0.45,
                  boxShadow: "0 10px 28px rgba(232,116,43,0.38)",
                  letterSpacing: "-0.01em",
                }}
              >
                Continue →
              </button>
            ) : (
              <button
                onClick={finishOnboarding}
                disabled={saving}
                style={{
                  padding: "14px 30px", borderRadius: 11,
                  background: "linear-gradient(135deg, #22C55E 0%, #16803F 100%)",
                  border: "none", color: "#FFFFFF", fontSize: 14, fontWeight: 900,
                  cursor: "pointer",
                  boxShadow: "0 10px 28px rgba(34,197,94,0.40)",
                  letterSpacing: "-0.01em",
                }}
              >
                {saving ? "Setting up…" : "🚀 Launch — start delivering my leads"}
              </button>
            )}
          </div>
        </div>

        <p style={{ textAlign: "center", marginTop: 18, fontSize: 12, color: "#7AAAB2" }}>
          {profile?.business_name ? `${profile.business_name} · ` : ""}First lead drop arrives within 24 hrs of finishing.
        </p>
      </div>
    </main>
  );
}

function canAdvance(step: number, s: { businessName: string; firstName: string; lastName: string; ownerPhone: string; trades: string[]; primaryZip: string; jobTypes: string[]; valueProps: string[]; subSpecialties: string[]; workDays: string[] }): boolean {
  if (step === 1) {
    return s.businessName.trim().length > 1
      && s.firstName.trim().length > 0
      && s.lastName.trim().length > 0
      && s.ownerPhone.replace(/\D/g, "").length === 10;
  }
  if (step === 2) {
    return s.trades.length > 0 && s.subSpecialties.length > 0 && s.primaryZip.length === 5;
  }
  if (step === 3) return s.jobTypes.length > 0;
  if (step === 4) return s.workDays.length > 0;
  if (step === 5) return s.valueProps.length > 0;
  if (step === 6) return true;
  if (step === 7) return true;
  return true;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 800, color: "#0B1F3A", marginBottom: 6, letterSpacing: "-0.01em" }}>{label}</div>
      {hint && <div style={{ fontSize: 12, color: "#7AAAB2", marginBottom: 10, lineHeight: 1.5 }}>{hint}</div>}
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text", autoFocus }: { value: string; onChange: (v: string) => void; placeholder: string; type?: string; autoFocus?: boolean }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      style={{
        width: "100%", padding: "14px 16px",
        fontSize: 16, fontWeight: 600,
        border: "1.5px solid rgba(11,31,58,0.14)",
        borderRadius: 12,
        background: "#FFFFFF",
        outline: "none",
        color: "#0B1F3A",
        boxSizing: "border-box",
        transition: "border-color 160ms ease, box-shadow 160ms ease",
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = "#E8742B";
        e.currentTarget.style.boxShadow = "0 0 0 3px rgba(232,116,43,0.18)";
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = "rgba(11,31,58,0.14)";
        e.currentTarget.style.boxShadow = "none";
      }}
    />
  );
}

const timeInputStyle: React.CSSProperties = {
  width: "100%", padding: "13px 14px",
  fontSize: 15, fontWeight: 700,
  border: "1.5px solid rgba(11,31,58,0.14)", borderRadius: 12,
  background: "#FFFFFF", color: "#0B1F3A", outline: "none",
  boxSizing: "border-box",
};

const rangeStyle: React.CSSProperties = {
  width: "100%",
  accentColor: "#E8742B",
};

function Multi({ options, value, onToggle }: { options: string[]; value: string[]; onToggle: (v: string) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
      {options.map((opt) => {
        const checked = value.includes(opt);
        return (
          <label key={opt} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 14px", borderRadius: 11,
            border: checked ? "2px solid #E8742B" : "1.5px solid rgba(11,31,58,0.12)",
            background: checked ? "rgba(232,116,43,0.08)" : "#FFFFFF",
            cursor: "pointer",
            fontSize: 13, fontWeight: 700, color: checked ? "#C84B26" : "#0B1F3A",
            transition: "all 160ms ease",
          }}>
            <input type="checkbox" checked={checked} onChange={() => onToggle(opt)} style={{ accentColor: "#E8742B" }} />
            {opt}
          </label>
        );
      })}
    </div>
  );
}

function ReviewSummary({
  data,
  onEdit,
}: {
  data: {
    businessName: string; firstName: string; lastName: string; ownerPhone: string;
    yearsInBusiness: number | "";
    trades: string[]; subSpecialties: string[]; primaryZip: string; radius: number;
    jobTypes: string[]; minJobValue: number; avgTicket: number; exclusions: string[];
    workDays: string[]; workStart: string; workEnd: string; equipment: string[];
    mfrCerts: string[]; valueProps: string[]; idealCustomer: string;
    tone: string;
  };
  onEdit: (step: number) => void;
}) {
  const sections: { step: number; icon: string; label: string; lines: string[] }[] = [
    {
      step: 1, icon: "🏢", label: "Business",
      lines: [
        data.businessName,
        `${data.firstName} ${data.lastName}`,
        formatPhone(data.ownerPhone),
        typeof data.yearsInBusiness === "number" ? `${data.yearsInBusiness} yr${data.yearsInBusiness === 1 ? "" : "s"} in business` : "Years not set",
      ].filter(Boolean),
    },
    {
      step: 2, icon: "📍", label: "Trade + area",
      lines: [
        data.trades.join(", ") || "No trade selected",
        data.subSpecialties.length ? data.subSpecialties.join(" · ") : "No sub-specialties",
        `${data.primaryZip || "no zip"} · ${data.radius}mi radius`,
      ],
    },
    {
      step: 3, icon: "💰", label: "Jobs you want",
      lines: [
        data.jobTypes.join(", ") || "No job types",
        `Min job $${data.minJobValue.toLocaleString()} · Avg $${data.avgTicket.toLocaleString()}`,
        data.exclusions.length ? `Excl: ${data.exclusions.join(", ")}` : "No exclusions",
      ],
    },
    {
      step: 4, icon: "🛠️", label: "Hours + tools",
      lines: [
        `${data.workDays.join(" · ")} · ${data.workStart}-${data.workEnd}`,
        data.equipment.length ? data.equipment.join(", ") : "No equipment listed",
      ],
    },
    {
      step: 5, icon: "⭐", label: "Differentiators",
      lines: [
        data.mfrCerts.length ? `Certs: ${data.mfrCerts.join(", ")}` : "",
        data.valueProps.length ? data.valueProps.join(", ") : "No value props",
        data.idealCustomer ? `Ideal: ${data.idealCustomer}` : "",
      ].filter(Boolean),
    },
    {
      step: 6, icon: "✉️", label: "AI outreach tone",
      lines: [TONE_OPTIONS.find((t) => t.value === data.tone)?.label || data.tone],
    },
  ];
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{
        padding: "14px 16px", borderRadius: 12,
        background: "rgba(34,197,94,0.10)",
        border: "1.5px solid rgba(34,197,94,0.32)",
        fontSize: 13.5, color: "#0B1F3A", lineHeight: 1.55,
      }}>
        <strong style={{ color: "#16803F" }}>Everything's set.</strong> Review below, click <em>Launch</em>, and your first lead drop arrives within 24 hrs.
      </div>
      {sections.map((s) => (
        <div key={s.step} style={{
          padding: "14px 16px", borderRadius: 12,
          background: "#FFF8F0",
          border: "1px solid rgba(232,116,43,0.18)",
          display: "grid", gridTemplateColumns: "36px 1fr auto", gap: 12, alignItems: "center",
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "linear-gradient(135deg, #FF9D5A, #E8742B)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18,
          }}>{s.icon}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#C84B26", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 3 }}>{s.label}</div>
            {s.lines.map((line, i) => (
              <div key={i} style={{ fontSize: 13, color: "#0B1F3A", fontWeight: 600, lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line}</div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onEdit(s.step)}
            style={{
              padding: "7px 12px", borderRadius: 8,
              background: "transparent", border: "1.5px solid rgba(232,116,43,0.30)",
              color: "#C84B26", fontSize: 11, fontWeight: 800, cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >Edit</button>
        </div>
      ))}
    </div>
  );
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  return raw;
}
