'use client'

import { useState } from 'react'
import { LEADS_PER_WEEK } from '@/lib/offer'

/**
 * AgentTeam (exported as ScoutTeam for import stability) — homepage section
 * itemizing the automated AI agents working every contractor's zip 24/7.
 *
 * 2026-06-12 per Peter:
 *   - renamed scouts -> AGENTS, every "Peter" reference removed
 *   - bios dense + technical so the system reads like it out-hunts every
 *     other lead source
 *   - SOURCE-AGNOSTIC: no public copy names the underlying data feeds
 *     (no "violation records", "hearings dockets", "permits", "NOAA",
 *     "Census", "MLS", "skip-trace provider", vendor names). Competitors
 *     must not be able to reverse-engineer the pipeline from the homepage.
 *     We describe the CAPABILITY (what the agent does), never the SOURCE.
 */

type Agent = { name: string; bio: string }

const AGENTS: Agent[] = [
  {
    name: 'Compliance Signal Agent',
    bio: 'Continuously detects homeowners in your area who are under a municipal obligation to get work done — classifies each by trade with NLP, geocodes it to your service rings, and surfaces only the live, unresolved cases within range.',
  },
  {
    name: 'Deadline Intelligence Agent',
    bio: 'Resolves time-pressured property situations to the actual owner and ranks them by urgency, so the top of your weekly queue is always the homeowners already on the clock to act.',
  },
  {
    name: 'High-Intent Detection Agent',
    bio: 'Runs entity resolution across proprietary signal sets to identify homeowners who must correct an issue and re-verify it — the ones actively looking for a contractor, not browsing.',
  },
  {
    name: 'Project Signal Agent',
    bio: 'Streams fresh project activity in your zip every morning, parses each with semantic + keyword matching to your exact trade, and flags it before a competitor has opened their inbox.',
  },
  {
    name: 'Weather-Window Agent',
    bio: 'Intersects verified severe-weather modeling with your service polygon in near-real-time to surface homes inside the high-demand repair window — the moment exterior work spikes.',
  },
  {
    name: 'Contact-Verification Agent',
    bio: 'Runs every flagged property through multi-source identity resolution to attach a verified, line-typed phone and confirmed owner — so you never burn a call on a dead number or the wrong person.',
  },
  {
    name: 'Intent-Scoring Agent',
    bio: 'Scores every lead 0–100 with a model weighing urgency, property value, owner equity, and signal recency, then ranks your queue so the homeowner most likely to close sits at the top.',
  },
  {
    name: 'Outreach-Writer Agent',
    bio: 'Generates a tailored SMS, email, and call opener per lead with a large language model, signed as your shop and referencing the exact reason they surfaced — ready to fire in under a minute.',
  },
  {
    name: 'Reply-Watcher Agent',
    bio: 'Reads inbound replies in real time, classifies intent, and pushes a notification to your phone the instant a homeowner signals yes — so the hot ones never cool off in an inbox.',
  },
  {
    name: 'Exclusivity Agent',
    bio: 'Locks every delivered lead to one owner. The instant a homeowner lands in your dashboard they’re claimed and provably removed from every competitor in your trade and territory — never resold like a shared lead network.',
  },
  {
    name: 'Property-Intel Agent',
    bio: 'Enriches each lead with year built, square footage, beds/baths, estimated value, and owner equity — so you can size the job and quote with confidence before you ever pick up the phone.',
  },
  {
    name: 'Geospatial Routing Agent',
    bio: 'Computes haversine distance from your shop and delivers leads closest-first, ring by ring from one mile out — so your day routes tight and your windshield time stays low.',
  },
  {
    name: 'Deliverability Agent',
    bio: 'Warms and rotates your sending infrastructure, monitors inbox-placement signals, and throttles volume to keep your outreach landing in the primary inbox instead of spam.',
  },
  {
    name: 'Freshness Agent',
    bio: 'Re-checks every lead’s status continuously and expires any whose situation gets resolved — so you never waste a call on a homeowner who already hired someone else.',
  },
  {
    name: 'Trade-Segmentation Agent',
    bio: 'Auto-buckets every prospect by trade with a classification model so the right contractor only ever sees the right leads — no roofing jobs sent to a plumber.',
  },
  {
    name: 'Learning Agent',
    bio: 'Runs a nightly feedback loop on real open, reply, and close outcomes — A/B testing message variants, killing losers, reallocating tomorrow’s send toward whatever is converting. Sharper every single day.',
  },
  {
    name: 'Coverage Expansion Agent',
    bio: 'Continuously widens the signal net into new zips and trades so your weekly drop never runs dry and your territory keeps filling.',
  },
  {
    name: 'Dedup & Suppression Agent',
    bio: 'Fingerprints every prospect across email, business, and domain so no homeowner is ever delivered twice and no contractor is ever contacted twice — the list stays clean at scale.',
  },
  {
    name: 'Equity & Affordability Agent',
    bio: 'Models each homeowner’s ability to pay from value and equity signals so you know, before the call, whether the job is a real ticket — quote with confidence, skip the tire-kickers.',
  },
  {
    name: 'Job-Value Estimator Agent',
    bio: 'Projects the likely job size at each property from a trade-tuned model, so every lead arrives with a dollar range and a clear reason it’s worth your time.',
  },
  {
    name: 'Pitch-Angle Agent',
    bio: 'Distills the single sharpest reason to call each homeowner into a one-line angle, so you open every conversation knowing exactly why this person needs you this week.',
  },
  {
    name: 'Timing Optimizer Agent',
    bio: 'Learns the hours and days your outreach gets opened and replied to per region, then schedules each send into the window most likely to land a response.',
  },
  {
    name: 'Quality-Control Agent',
    bio: 'Validates every lead before delivery — confirms it’s a real, in-range, deliverable property and quietly drops anything that doesn’t meet the bar, so your dashboard only holds leads worth working.',
  },
  {
    name: 'Uptime Sentinel',
    bio: 'Monitors every pipeline and data process around the clock and self-heals or alerts the moment anything stalls — so your leads land on schedule whether or not anyone is watching.',
  },
]

// Exported as ScoutTeam to keep page.tsx imports stable.
export default function ScoutTeam() {
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
            {AGENTS.length} agents run every night in your zip — finding the homeowners who actually need your work, scoring intent, verifying phones, and writing the outreach. {LEADS_PER_WEEK} verified leads land in your dashboard every week, yours alone. You do the one part software can&rsquo;t: pick up the phone.
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
                  {String(i + 1).padStart(2, '0')}
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
          Every agent above is real infrastructure running on our proprietary
          signal pipeline &mdash; built, tuned, and run relentlessly so you only ever
          do the part that closes the job: pick up the phone.
        </p>
      </div>
    </section>
  )
}
