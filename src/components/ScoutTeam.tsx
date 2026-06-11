/**
 * ScoutTeam — homepage section that itemizes the 24 automated specialist
 * "scouts" working every contractor's zip 24/7.
 *
 * Purpose (Hormozi $100M Offers — specificity = credibility):
 * Old hero claim was abstract ("AI scrapes signals"). Owners pattern-match
 * "AI" to scam/spam — same reason the receptionist died (CLAUDE.md pivot
 * note: owners distrust AI on high-stakes work). Switching the framing from
 * "AI agents" to "specialist scouts doing concrete jobs" preserves the
 * tech-forward feel without spooking the 55yo plumber.
 *
 * Each scout entry maps to a real cron / agent / skill currently shipping:
 *   - Permit Watcher    -> scrape-permits-* crons
 *   - Storm Tracker     -> scrape-noaa-storms
 *   - Skip-Tracer       -> webhook + free-lead generate skip-trace
 *   - Pipeline Watcher  -> hot-lead-stalled-nudge (shipped 2026-06-10)
 *   ... (24 total)
 *
 * If a scout listed here is killed or renamed, update this list so the
 * homepage claim stays mechanically honest.
 */

import { LEADS_PER_WEEK } from '@/lib/offer'

type Scout = { name: string; verb: string }

const SCOUTS: Scout[] = [
  { name: 'Permit Watcher',          verb: "pulls building permits at city hall every night before you wake up" },
  { name: 'Storm Tracker',           verb: 'watches NOAA for hail strikes + insurance windows in your zip' },
  { name: 'Aging-System Scout',      verb: 'cross-references Census data to flag homes due for replacement' },
  { name: 'Move-In Hunter',          verb: 'pulls fresh property records the day a new homeowner closes' },
  { name: 'Skip-Tracer',             verb: 'verifies every phone number so you never waste a call' },
  { name: 'Intent Scorer',           verb: 'scores every lead 0-100 so you know who to call first' },
  { name: 'Pitch Writer',            verb: 'drafts an SMS + email + call opener tailored to each lead' },
  { name: 'Reply Watcher',           verb: 'reads every reply, alerts your phone when someone says yes' },
  { name: 'Delivery Sentinel',       verb: 'guarantees your weekly drop fires on time, every cycle' },
  { name: 'Deliverability Sentinel', verb: 'protects your shop from inboxes that block strangers' },
  { name: 'Copy Lab',                verb: 'A/B tests outreach variants daily and keeps what wins' },
  { name: 'Outreach Loader',         verb: 'keeps your weekly drop queue full so Monday 6am never misses' },
  { name: 'Email Verifier',          verb: 'pings every contact before send to kill bounce risk' },
  { name: 'Sender Bot',              verb: 'pushes the right campaign at the right hour, per timezone' },
  { name: 'Lead Sourcer',            verb: 'mines Google + Apollo for new prospects every morning' },
  { name: 'Ops Watcher',             verb: 'rolls up KPIs to a single dashboard you check in 30 sec' },
  { name: 'Reactivation Sweep',      verb: 'circles back to dormant prospects when their zip lights up' },
  { name: 'Retarget Bot',            verb: 'follows up on free-lead claimers who almost pulled the trigger' },
  { name: 'Hot Digest',              verb: 'every morning surfaces your 5 highest-intent prospects' },
  { name: 'Uptime Sentinel',         verb: 'monitors every cron + API call, alerts at 3am if anything stalls' },
  { name: 'Outreach Learner',        verb: 'updates the playbook from real reply outcomes — gets sharper monthly' },
  { name: 'Free-Lead Generator',     verb: 'pulls a real homeowner you can call right now before any signup' },
  { name: 'Trade Segmenter',         verb: 'auto-buckets prospects so the right shop sees the right leads' },
  { name: 'Pipeline Watcher',        verb: 'texts Peter when a prospect visits 2+ times so you call within 15 min' },
]

export default function ScoutTeam() {
  return (
    <section style={{
      padding: '72px clamp(16px, 5vw, 48px)',
      background: 'linear-gradient(180deg, #FFF8F0 0%, #FFFFFF 100%)',
    }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: '#C84B26', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 10 }}>
            24 scouts working your zip — while you sleep
          </div>
          <h2 style={{
            fontSize: 'clamp(28px, 3.4vw, 42px)',
            fontWeight: 900, letterSpacing: '-0.03em',
            margin: '0 0 14px', lineHeight: 1.08, color: '#0B1F3A',
          }}>
            We built a full research team for your service area. <span style={{
              background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 60%, #C84B26 100%)',
              WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
            }}>One shop gets all 24.</span>
          </h2>
          <p style={{ fontSize: 16, color: '#3D5A66', maxWidth: 700, margin: '0 auto', lineHeight: 1.55 }}>
            Every scout below runs every day in your zip code. Permits at 5am. Storms in real time. Phone numbers verified before you call. {LEADS_PER_WEEK} fresh leads land in your dashboard every Monday — yours alone.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 14,
        }}>
          {SCOUTS.map((s, i) => (
            <div key={s.name} style={{
              padding: '16px 18px',
              borderRadius: 14,
              background: '#FFFFFF',
              border: '1.5px solid rgba(232,116,43,0.18)',
              boxShadow: '0 4px 14px rgba(11,31,58,0.04)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: 'linear-gradient(135deg, #FF9D5A, #E8742B)',
                  color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 900,
                  flexShrink: 0,
                }}>
                  {String(i + 1).padStart(2, '0')}
                </div>
                <div style={{ fontSize: 14, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.01em' }}>
                  {s.name}
                </div>
              </div>
              <div style={{ fontSize: 12.5, color: '#4A6670', lineHeight: 1.5 }}>
                {s.verb}.
              </div>
            </div>
          ))}
        </div>

        <p style={{ textAlign: 'center', marginTop: 30, fontSize: 13, color: '#7AAAB2', maxWidth: 720, margin: '30px auto 0', lineHeight: 1.6 }}>
          We don&rsquo;t hide behind &ldquo;AI does it.&rdquo; Every scout above is a real
          system running on real data sources you can verify — city permits, NOAA,
          Census ACS, MLS, public property records. Boring work, done relentlessly,
          so you only do the part nobody else can: pick up the phone.
        </p>
      </div>
    </section>
  )
}
