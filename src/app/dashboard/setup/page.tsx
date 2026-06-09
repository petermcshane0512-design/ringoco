"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

/**
 * /dashboard/setup
 *
 * 2026-06-09 LEADS-ONLY REWRITE.
 *
 * Onboarding wizard for the post-pivot product. Collects the data we
 * need to (a) source the right leads, (b) personalize the auto-outreach
 * AI prompt sent to each homeowner as if from the contractor, (c) route
 * reply notifications to the right phone.
 *
 * 10 steps — Hormozi "unbreakable" onboarding so we never deliver
 * bad-fit leads or fire wrong-tone outreach:
 *
 *   1. Business name
 *   2. Owner first + last name
 *   3. Owner cell phone (for SMS reply alerts)
 *   4. Trade(s) served
 *   5. Service area: primary zip + radius
 *   6. Job types they WANT (residential service / install / commercial / emergency)
 *   7. Minimum job size they'll accept
 *   8. Years in business (used in outreach: "in business since 20XX")
 *   9. Unique value props (multi-select: financing, warranty, family-owned, etc.)
 *  10. Outreach tone (casual / professional / direct)
 *
 * On finish: POST /api/profile updates the row + generates the AI
 * outreach prompt template via /api/leads/generate-outreach-prompt.
 * Redirects to /dashboard/leads where the first lead drop will land.
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
  // 2026-06-09 17-step extension
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
  Handyman: [], // typically no mfr certs
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
const TONE_OPTIONS = [
  { value: "casual", label: "Casual / friendly", desc: "\"Hey Mike — saw your AC may be on the way out…\"" },
  { value: "professional", label: "Professional", desc: "\"Hello Mr. Smith — our records show your unit was installed in 2014…\"" },
  { value: "direct", label: "Direct / no-fluff", desc: "\"Mike — your AC is 11 yrs old. Free quote, today if you want.\"" },
];

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
  const [trades, setTrades] = useState<string[]>([]);
  const [primaryZip, setPrimaryZip] = useState("");
  const [radius, setRadius] = useState(25);
  const [jobTypes, setJobTypes] = useState<string[]>([]);
  const [minJobValue, setMinJobValue] = useState(0);
  const [yearsInBusiness, setYearsInBusiness] = useState<number | "">("");
  const [valueProps, setValueProps] = useState<string[]>([]);
  const [tone, setTone] = useState<string>("casual");
  // 2026-06-09 17-step extension
  const [subSpecialties, setSubSpecialties] = useState<string[]>([]);
  const [mfrCerts, setMfrCerts] = useState<string[]>([]);
  const [avgTicket, setAvgTicket] = useState(1500);
  const [workDays, setWorkDays] = useState<string[]>(["Mon","Tue","Wed","Thu","Fri","Sat"]);
  const [workStart, setWorkStart] = useState("07:00");
  const [workEnd, setWorkEnd] = useState("19:00");
  const [equipment, setEquipment] = useState<string[]>([]);
  const [idealCustomer, setIdealCustomer] = useState("");
  const [exclusions, setExclusions] = useState<string[]>([]);

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

    // Generate the AI outreach prompt template now that we have all the data
    try {
      await fetch("/api/leads/generate-outreach-prompt", { method: "POST" });
    } catch { /* non-fatal */ }

    router.push("/dashboard/leads?welcome=1");
  }

  if (loading) return <main style={{ padding: 40, color: "#0B1F3A", fontFamily: "system-ui" }}>Loading…</main>;

  const totalSteps = 17;
  const pct = Math.round((step / totalSteps) * 100);
  const primaryTrade = trades[0] || "HVAC";
  const subSpecOptions = SUB_SPECIALTY_BY_TRADE[primaryTrade] || SUB_SPECIALTY_BY_TRADE.HVAC;
  const mfrCertOptions = MFR_CERTS_BY_TRADE[primaryTrade] || [];
  const equipmentOptions = EQUIPMENT_BY_TRADE[primaryTrade] || EQUIPMENT_BY_TRADE.HVAC;

  return (
    <main style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #F2F9F5 0%, #E6F0EC 100%)",
      fontFamily: "'Inter', system-ui, sans-serif",
      color: "#0B1F3A",
      padding: "32px 16px 60px",
    }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <Image src="/logo.png" alt="BellAveGo" width={180} height={56} style={{ objectFit: "contain" }} />
          <div style={{ fontSize: 12, fontWeight: 700, color: "#4A6670" }}>Step {step} of {totalSteps}</div>
        </div>

        {/* Progress bar */}
        <div style={{ height: 6, background: "#DCE9E2", borderRadius: 99, overflow: "hidden", marginBottom: 28 }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg, #14B8A6, #06B6D4)", transition: "width 250ms ease" }} />
        </div>

        {/* Card */}
        <div style={{ background: "#fff", borderRadius: 18, padding: "30px 28px", boxShadow: "0 10px 40px rgba(11,31,58,0.08)", border: "1px solid rgba(94,234,212,0.18)" }}>
          {step === 1 && (
            <Step title="What's your business name?" desc="We'll use this as the sender name on every lead outreach email so it looks like it came from YOU.">
              <Input value={businessName} onChange={setBusinessName} placeholder="Mike's HVAC & Plumbing" autoFocus />
            </Step>
          )}

          {step === 2 && (
            <Step title="What's your name?" desc="So your auto-outreach emails sign off as you — not BellAveGo.">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Input value={firstName} onChange={setFirstName} placeholder="First name" autoFocus />
                <Input value={lastName} onChange={setLastName} placeholder="Last name" />
              </div>
            </Step>
          )}

          {step === 3 && (
            <Step title="What's the best cell phone to reach you?" desc="When a homeowner replies to one of your auto-outreach emails or texts, we'll fire a notification to this number within 60 seconds so you can call them back hot.">
              <Input value={ownerPhone} onChange={setOwnerPhone} placeholder="(555) 555-1234" type="tel" autoFocus />
            </Step>
          )}

          {step === 4 && (
            <Step title="What trade(s) do you serve?" desc="So we know which permits, aged units, and property events to flag as leads for you.">
              <Multi options={TRADE_OPTIONS} value={trades} onToggle={(v) => toggleArr(setTrades, trades, v)} />
            </Step>
          )}

          {step === 5 && (
            <Step title="What's your primary zip code + service radius?" desc="We deliver homeowner leads inside this circle every Monday. Bigger radius = more leads but lower density per zip.">
              <div style={{ display: "grid", gap: 12 }}>
                <Input value={primaryZip} onChange={(v) => setPrimaryZip(v.replace(/\D/g, "").slice(0, 5))} placeholder="Primary zip" autoFocus />
                <label style={{ fontSize: 13, fontWeight: 600, color: "#4A6670", display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                  Service radius
                  <span style={{ color: "#0B1F3A", fontWeight: 800 }}>{radius} miles</span>
                </label>
                <input type="range" min={5} max={75} step={5} value={radius} onChange={(e) => setRadius(parseInt(e.target.value, 10))} style={{ width: "100%" }} />
              </div>
            </Step>
          )}

          {step === 6 && (
            <Step title="What kinds of jobs do you actually want?" desc="So we send leads matching what you do — not random calls you'd say no to.">
              <Multi options={JOB_TYPE_OPTIONS} value={jobTypes} onToggle={(v) => toggleArr(setJobTypes, jobTypes, v)} />
            </Step>
          )}

          {step === 7 && (
            <Step title="What's the smallest job worth your time?" desc="We filter out tiny $50 service calls if you only want $500+ installs. Set $0 to receive everything.">
              <label style={{ fontSize: 13, fontWeight: 600, color: "#4A6670", display: "flex", justifyContent: "space-between" }}>
                Minimum job size
                <span style={{ color: "#0B1F3A", fontWeight: 800 }}>${minJobValue}</span>
              </label>
              <input type="range" min={0} max={5000} step={50} value={minJobValue} onChange={(e) => setMinJobValue(parseInt(e.target.value, 10))} style={{ width: "100%", marginTop: 8 }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#7AAAB2", marginTop: 4 }}>
                <span>$0 (all leads)</span>
                <span>$5,000+ (installs only)</span>
              </div>
            </Step>
          )}

          {step === 8 && (
            <Step title="How long have you been in business?" desc="We use this in your outreach email — credibility signal homeowners respond to.">
              <Input
                value={String(yearsInBusiness ?? "")}
                onChange={(v) => {
                  const n = parseInt(v.replace(/\D/g, ""), 10);
                  if (isNaN(n)) setYearsInBusiness("");
                  else setYearsInBusiness(Math.min(75, Math.max(0, n)));
                }}
                placeholder="e.g. 8"
                type="number"
                autoFocus
              />
              <div style={{ fontSize: 12, color: "#7AAAB2", marginTop: 6 }}>Years (round number is fine)</div>
            </Step>
          )}

          {step === 9 && (
            <Step title="What makes your business stand out?" desc="Check everything that applies. Your auto-outreach AI uses these to write emails that close — not generic spam.">
              <Multi options={VALUE_PROP_OPTIONS} value={valueProps} onToggle={(v) => toggleArr(setValueProps, valueProps, v)} />
            </Step>
          )}

          {step === 10 && (
            <Step title="Pick your outreach tone" desc="How AI talks to homeowners on your behalf. Pick what sounds most like YOU — they'll feel it.">
              <div style={{ display: "grid", gap: 10 }}>
                {TONE_OPTIONS.map((opt) => (
                  <label key={opt.value} style={{
                    display: "flex", gap: 12, alignItems: "flex-start",
                    padding: "14px 16px", borderRadius: 12,
                    border: tone === opt.value ? "2px solid #14B8A6" : "1.5px solid #DCE9E2",
                    background: tone === opt.value ? "rgba(94,234,212,0.10)" : "#fff",
                    cursor: "pointer",
                  }}>
                    <input type="radio" name="tone" value={opt.value} checked={tone === opt.value} onChange={() => setTone(opt.value)} style={{ marginTop: 4 }} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "#0B1F3A" }}>{opt.label}</div>
                      <div style={{ fontSize: 12, color: "#4A6670", marginTop: 3, fontStyle: "italic" }}>{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </Step>
          )}

          {step === 11 && (
            <Step title={`What ${primaryTrade.toLowerCase()} work do you specialize in?`} desc="Sub-specialties inside your trade. We'll filter leads to match — no point getting heat-pump leads if you only do AC, etc.">
              <Multi options={subSpecOptions} value={subSpecialties} onToggle={(v) => toggleArr(setSubSpecialties, subSpecialties, v)} />
            </Step>
          )}

          {step === 12 && mfrCertOptions.length > 0 && (
            <Step title="Manufacturer dealer status?" desc="Optional but huge — drives premium positioning in your outreach (e.g. 'Carrier Factory Authorized') and unlocks rebate conversations w/ homeowners.">
              <Multi options={mfrCertOptions} value={mfrCerts} onToggle={(v) => toggleArr(setMfrCerts, mfrCerts, v)} />
              <div style={{ fontSize: 11, color: "#7AAAB2", marginTop: 10 }}>Skip if you&rsquo;re not factory-authorized — no problem.</div>
            </Step>
          )}
          {step === 12 && mfrCertOptions.length === 0 && (
            <Step title="What's your average job size?" desc="Skipping mfr-cert step (not common in your trade). Let&rsquo;s nail down your typical ticket so we filter out small jobs.">
              <label style={{ fontSize: 13, fontWeight: 600, color: "#4A6670", display: "flex", justifyContent: "space-between" }}>
                Average job size
                <span style={{ color: "#0B1F3A", fontWeight: 800 }}>${avgTicket.toLocaleString()}</span>
              </label>
              <input type="range" min={100} max={20000} step={50} value={avgTicket} onChange={(e) => setAvgTicket(parseInt(e.target.value, 10))} style={{ width: "100%", marginTop: 8 }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#7AAAB2", marginTop: 4 }}>
                <span>$100</span><span>$20,000+</span>
              </div>
            </Step>
          )}

          {step === 13 && (
            <Step title="What's your average job size?" desc="Your typical ticket. Used to filter out homes too small/big for your sweet spot — better lead-customer fit = higher close rate.">
              <label style={{ fontSize: 13, fontWeight: 600, color: "#4A6670", display: "flex", justifyContent: "space-between" }}>
                Average job size
                <span style={{ color: "#0B1F3A", fontWeight: 800 }}>${avgTicket.toLocaleString()}</span>
              </label>
              <input type="range" min={100} max={20000} step={50} value={avgTicket} onChange={(e) => setAvgTicket(parseInt(e.target.value, 10))} style={{ width: "100%", marginTop: 8 }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#7AAAB2", marginTop: 4 }}>
                <span>$100 (small repairs)</span>
                <span>$20,000+ (whole-home installs)</span>
              </div>
            </Step>
          )}

          {step === 14 && (
            <Step title="What days + hours do you actually work?" desc="No point sending leads when you're off the clock. We hold them for your next working window.">
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#4A6670", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>Days</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {DAYS.map((d) => {
                    const active = workDays.includes(d);
                    return (
                      <button key={d} onClick={() => toggleArr(setWorkDays, workDays, d)} style={{
                        padding: "10px 14px", borderRadius: 10,
                        border: active ? "2px solid #14B8A6" : "1.5px solid #DCE9E2",
                        background: active ? "rgba(94,234,212,0.15)" : "#fff",
                        color: active ? "#0B1F3A" : "#4A6670",
                        fontSize: 13, fontWeight: 800, cursor: "pointer",
                      }}>{d}</button>
                    );
                  })}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#4A6670", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Start</div>
                  <input type="time" value={workStart} onChange={(e) => setWorkStart(e.target.value)} style={timeInput} />
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#4A6670", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>End</div>
                  <input type="time" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} style={timeInput} />
                </div>
              </div>
            </Step>
          )}

          {step === 15 && (
            <Step title="What equipment + licenses do you have?" desc="Lets us match you to leads that need your specific capabilities. EPA-cert tech? Send refrigerant work. Sewer-camera? Send drain leads.">
              <Multi options={equipmentOptions} value={equipment} onToggle={(v) => toggleArr(setEquipment, equipment, v)} />
            </Step>
          )}

          {step === 16 && (
            <Step title="Describe your IDEAL customer in 1 sentence" desc="No wrong answer. Free-text. Our 'lookalike' AI uses this to find more homeowners just like the ones you love working with.">
              <textarea
                value={idealCustomer}
                onChange={(e) => setIdealCustomer(e.target.value.slice(0, 280))}
                placeholder="e.g. Suburban homeowner, $400K+ house, willing to invest in quality, values long-term relationship, not a tire-kicker."
                rows={4}
                style={{
                  width: "100%", padding: "12px 14px",
                  fontSize: 14, fontWeight: 500,
                  border: "1.5px solid #DCE9E2", borderRadius: 11,
                  background: "#fff", color: "#0B1F3A", outline: "none",
                  fontFamily: "inherit", resize: "vertical",
                }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#7AAAB2", marginTop: 6 }}>
                <span>Optional but powerful</span>
                <span>{idealCustomer.length}/280</span>
              </div>
            </Step>
          )}

          {step === 17 && (
            <Step title="What kinds of jobs do you NOT want?" desc="Check anything we should NEVER send. We&rsquo;ll drop these from your feed before they even hit the dashboard.">
              <Multi options={["No commercial", "No new construction", "No warranty work", "No rental properties", "No mobile homes", "No properties >50mi", "No insurance jobs", "No DIY-help calls"]} value={exclusions} onToggle={(v) => toggleArr(setExclusions, exclusions, v)} />
            </Step>
          )}

          {error && (
            <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 10, background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}>
              {error}
            </div>
          )}

          {/* Nav buttons */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 28, gap: 10 }}>
            <button
              onClick={() => setStep(Math.max(1, step - 1))}
              disabled={step === 1 || saving}
              style={{
                padding: "11px 22px", borderRadius: 10,
                background: "transparent",
                border: "1.5px solid #DCE9E2",
                color: "#4A6670",
                fontSize: 13, fontWeight: 800, cursor: step === 1 ? "default" : "pointer",
                opacity: step === 1 ? 0.4 : 1,
              }}
            >
              Back
            </button>
            {step < totalSteps ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={!canAdvance(step, { businessName, firstName, lastName, ownerPhone, trades, primaryZip, jobTypes, valueProps, subSpecialties, workDays })}
                style={{
                  padding: "13px 28px", borderRadius: 10,
                  background: "linear-gradient(135deg, #14B8A6 0%, #06B6D4 100%)",
                  border: "none", color: "#fff", fontSize: 14, fontWeight: 900,
                  cursor: "pointer",
                  opacity: canAdvance(step, { businessName, firstName, lastName, ownerPhone, trades, primaryZip, jobTypes, valueProps, subSpecialties, workDays }) ? 1 : 0.4,
                  boxShadow: "0 6px 18px rgba(20,184,166,0.32)",
                }}
              >
                Continue →
              </button>
            ) : (
              <button
                onClick={finishOnboarding}
                disabled={saving}
                style={{
                  padding: "13px 28px", borderRadius: 10,
                  background: "linear-gradient(135deg, #22C55E 0%, #14B8A6 100%)",
                  border: "none", color: "#fff", fontSize: 14, fontWeight: 900,
                  cursor: "pointer",
                  boxShadow: "0 6px 18px rgba(34,197,94,0.32)",
                }}
              >
                {saving ? "Setting up your dashboard…" : "🚀 Start delivering my leads"}
              </button>
            )}
          </div>
        </div>

        <p style={{ textAlign: "center", marginTop: 20, fontSize: 12, color: "#4A6670" }}>
          {profile?.business_name ? `${profile.business_name} · ` : ""}First lead drop arrives within 24 hrs after setup.
        </p>
      </div>
    </main>
  );
}

function canAdvance(step: number, s: { businessName: string; firstName: string; lastName: string; ownerPhone: string; trades: string[]; primaryZip: string; jobTypes: string[]; valueProps: string[]; subSpecialties: string[]; workDays: string[] }): boolean {
  if (step === 1) return s.businessName.trim().length > 1;
  if (step === 2) return s.firstName.trim().length > 0 && s.lastName.trim().length > 0;
  if (step === 3) return s.ownerPhone.replace(/\D/g, "").length === 10;
  if (step === 4) return s.trades.length > 0;
  if (step === 5) return s.primaryZip.length === 5;
  if (step === 6) return s.jobTypes.length > 0;
  if (step === 7) return true;
  if (step === 8) return true;
  if (step === 9) return s.valueProps.length > 0;
  if (step === 10) return true;
  if (step === 11) return s.subSpecialties.length > 0;
  if (step === 12) return true; // mfr certs optional OR avg-ticket slider always valid
  if (step === 13) return true; // avg ticket always valid
  if (step === 14) return s.workDays.length > 0;
  if (step === 15) return true; // equipment optional
  if (step === 16) return true; // ideal-customer optional
  if (step === 17) return true; // exclusions optional
  return true;
}

function Step({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 900, color: "#0B1F3A", letterSpacing: "-0.5px", margin: "0 0 8px", lineHeight: 1.2 }}>{title}</h1>
      <p style={{ fontSize: 14, color: "#4A6670", lineHeight: 1.55, margin: "0 0 22px" }}>{desc}</p>
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
        border: "1.5px solid #DCE9E2",
        borderRadius: 11,
        background: "#fff",
        outline: "none",
        color: "#0B1F3A",
      }}
    />
  );
}

const timeInput: React.CSSProperties = {
  width: "100%", padding: "12px 14px",
  fontSize: 15, fontWeight: 700,
  border: "1.5px solid #DCE9E2", borderRadius: 11,
  background: "#fff", color: "#0B1F3A", outline: "none",
};

function Multi({ options, value, onToggle }: { options: string[]; value: string[]; onToggle: (v: string) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
      {options.map((opt) => {
        const checked = value.includes(opt);
        return (
          <label key={opt} style={{
            display: "flex", alignItems: "center", gap: 9,
            padding: "11px 13px", borderRadius: 10,
            border: checked ? "2px solid #14B8A6" : "1.5px solid #DCE9E2",
            background: checked ? "rgba(94,234,212,0.10)" : "#fff",
            cursor: "pointer",
            fontSize: 13, fontWeight: 700, color: "#0B1F3A",
          }}>
            <input type="checkbox" checked={checked} onChange={() => onToggle(opt)} />
            {opt}
          </label>
        );
      })}
    </div>
  );
}
