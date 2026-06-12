'use client'

import { useState } from 'react'
import { LEADS_PER_WEEK } from '@/lib/offer'

/**
 * AgentTeam (exported as ScoutTeam for import stability) — homepage section
 * itemizing the automated AI agents working every contractor's zip 24/7.
 *
 * 2026-06-12 per Peter: renamed scouts -> AGENTS, every "Peter" reference
 * removed, bios rewritten dense + technical so the system reads like it
 * genuinely out-hunts every other lead source. Enforcement agents lead.
 *
 * Each agent maps to a real cron / pipeline currently shipping. If one is
 * killed or renamed, update this list so the homepage stays honest.
 */

type Agent = { name: string; bio: string }

const AGENTS: Agent[] = [
  {
    name: 'Code Enforcement Agent',
    bio: 'Ingests your city’s building-violation feed every night through a direct data pipeline, runs NLP classification on each citation to tag the trade, geocodes it to your service rings, and surfaces only the OPEN cases within range — homes the city has ordered to repair, not yet resolved.',
  },
  {
    name: 'Hearings Intelligence Agent',
    bio: 'Monitors administrative-hearings dockets and entity-resolves respondents to property owners — pulling name, address, the cited code, and any fine on record. Flags the highest-pressure cases first so your top calls of the week are homeowners already on a deadline.',
  },
  {
    name: 'Inspection-Failure Agent',
    bio: 'Cross-references inspection-status records to detect properties that FAILED a city inspection and must be corrected and re-inspected. Scores each by recency and trade-fit so you reach the owner while the failure is still fresh and unbooked.',
  },
  {
    name: 'Permit Stream Agent',
    bio: 'Streams new building permits from city portals at 5am daily, parses the work description with keyword + semantic matching to your trade, and flags active projects in your zip before any competitor has even opened their inbox.',
  },
  {
    name: 'Storm & Insurance Agent',
    bio: 'Polls NOAA hail and wind data in near-real-time, intersects verified storm polygons with your service area, and surfaces homes inside the insurance-claim window — the exact moment roofing and exterior demand spikes.',
  },
  {
    name: 'Skip-Trace Agent',
    bio: 'Runs every flagged property through a multi-source skip-trace to attach a verified, line-typed phone number and owner identity — so you never burn a call on a dead number or the wrong person.',
  },
  {
    name: 'Intent-Scoring Agent',
    bio: 'Scores every lead 0–100 on a model weighing enforcement tier, deadline pressure, property value, equity, and signal recency — then ranks your queue so the homeowner most likely to close sits at the top.',
  },
  {
    name: 'Outreach-Writer Agent',
    bio: 'Generates a tailored SMS, email, and call opener per lead with a large language model, signed as your shop — referencing the exact signal that surfaced them. Copy-paste, tweak, or fire it as-is in under a minute.',
  },
  {
    name: 'Reply-Watcher Agent',
    bio: 'Reads inbound replies in real time, classifies intent, and pushes a notification to your phone the instant a homeowner signals yes — so the hot ones never cool off waiting in an inbox.',
  },
  {
    name: 'Exclusivity Agent',
    bio: 'Locks every delivered lead to a single owner. The moment a homeowner drops into your dashboard, they’re claimed and provably removed from every competitor in your trade and territory — never resold like a shared lead network.',
  },
  {
    name: 'Property-Intel Agent',
    bio: 'Enriches each lead with year built, square footage, beds/baths, estimated value, and owner equity from public records — so you can size the job and quote with confidence before you ever pick up the phone.',
  },
  {
    name: 'Geospatial Routing Agent',
    bio: 'Computes haversine distance from your shop and delivers leads closest-first, ring by ring from one mile out — so your day routes tight and your windshield time stays low.',
  },
  {
    name: 'Deliverability Agent',
    bio: 'Warms and rotates your sending infrastructure, monitors inbox-placement signals, and throttles volume per domain to keep your outreach landing in the primary inbox instead of spam.',
  },
  {
    name: 'Freshness Agent',
    bio: 'Re-checks enforcement status continuously and expires any lead whose violation gets resolved — so you never waste a call on a homeowner who already hired someone else.',
  },
  {
    name: 'Trade-Segmentation Agent',
    bio: 'Auto-buckets every prospect by trade with a classification model so the right contractor only ever sees the right leads — no roofing jobs sent to a plumber.',
  },
  {
    name: 'Learning Agent',
    bio: 'Runs a nightly feedback loop on real open, reply, and close outcomes — A/B testing message variants, killing losers, and reallocating tomorrow’s send toward whatever is actually converting. The system gets sharper every single day.',
  },
  {
    name: 'Sourcing Agent',
    bio: 'Mines mapping and business data sources every morning to expand coverage into new zips and trades, feeding the pipeline so your weekly drop never runs dry.',
  },
  {
    name: 'Uptime Sentinel',
    bio: 'Monitors every cron, API call, and data feed around the clock and self-heals or alerts the moment anything stalls — so your leads land on schedule whether or not anyone is watching.',
  },
]

// Exported as ScoutTeam to keep page.tsx imports stable.
export default function ScoutTeam() {
  // Show the first 4 (enforcement agents lead); rest behind a toggle on
  // BOTH mobile and desktop.
  const [open, setOpen] = useState(false)
  const visible = open ? AGENTS : AGENTS.slice(0, 4)
  return (
    <section style={{
      padding: '72px clamp(16px, 5vw, 48px)',
      background: 'linear-gradient(180deg, #FFF8F0 0%, #FFFFFF 100%)',
    }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: '#C84B26', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 10 }}>
            {AGENTS.length} AI agents working your zip — while you sleep
          </div>
          <h2 style={{
            fontSize: 'clamp(28px, 3.4vw, 42px)',
            fontWeight: 900, letterSpacing: '-0.03em',
            margin: '0 0 14px', lineHeight: 1.08, color: '#0B1F3A',
          }}>
            An entire AI lead-gen team for your service area. <span style={{
              background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 60%, #C84B26 100%)',
              WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
            }}>One shop gets all of it.</span>
          </h2>
          <p style={{ fontSize: 16, color: '#3D5A66', maxWidth: 720, margin: '0 auto', lineHeight: 1.55 }}>
            These aren&rsquo;t buzzwords. Every agent below is a real system running every night in your zip &mdash; ingesting city records, scoring intent, skip-tracing phones, writing the outreach. {LEADS_PER_WEEK} verified homeowner leads land in your dashboard every week, yours alone. You do the one part software can&rsquo;t: pick up the phone.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 14,
        }}>
          {visible.map((a, i) => (
            <div key={a.name} style={{
              padding: '18px 20px',
              borderRadius: 14,
              background: '#FFFFFF',
              border: '1.5px solid rgba(232,116,43,0.18)',
              boxShadow: '0 4px 14px rgba(11,31,58,0.04)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 9,
                  background: 'linear-gradient(135deg, #FF9D5A, #E8742B)',
                  color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 900,
                  flexShrink: 0,
                }}>
                  {String((open ? i : i) + 1).padStart(2, '0')}
                </div>
                <div style={{ fontSize: 14.5, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.01em', lineHeight: 1.15 }}>
                  {a.name}
                </div>
                <span style={{
                  marginLeft: 'auto', flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontSize: 9, fontWeight: 900, color: '#15803D', letterSpacing: '0.08em',
                }}>
                  <i style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', display: 'inline-block' }} />
                  LIVE
                </span>
              </div>
              <div style={{ fontSize: 12.5, color: '#4A6670', lineHeight: 1.55 }}>
                {a.bio}
              </div>
            </div>
          ))}
        </div>

        {/* Show-all toggle — mobile + desktop. */}
        <div style={{ textAlign: 'center', marginTop: 22 }}>
          <button
            onClick={() => setOpen((x) => !x)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '12px 22px', borderRadius: 11, minHeight: 44,
              background: '#FFFFFF', border: '1.5px solid rgba(232,116,43,0.30)',
              color: '#C84B26', fontWeight: 800, fontSize: 14, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {open ? 'Show fewer' : `See all ${AGENTS.length} agents`}
            <span style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 180ms ease' }}>▾</span>
          </button>
        </div>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: '#7AAAB2', maxWidth: 720, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
          We don&rsquo;t hide behind &ldquo;AI does it.&rdquo; Every agent above runs on real,
          verifiable public records &mdash; city violations, hearings dockets, permits,
          NOAA, property data. Boring infrastructure, run relentlessly, so you only
          ever do the part that closes the job.
        </p>
      </div>
    </section>
  )
}
