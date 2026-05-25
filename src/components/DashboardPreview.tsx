'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@clerk/nextjs'

// Canonical 4 appointments — same set surfaces across AI Receptionist (recent
// calls), Calendar mini-view, and the Jobs table. Demonstrates the power-user
// flow: every call the AI fields is auto-booked into the contractor's calendar
// without manual approval. No pending_approval status anywhere.
const JOBS = [
  { name: 'Marcus T.', type: 'HVAC Repair',         status: 'scheduled', time: 'Today 8:00 AM' },
  { name: 'Sarah L.',  type: "Furnace Won't Start", status: 'scheduled', time: 'Today 1:00 PM' },
  { name: 'Kevin S.',  type: 'Heat Pump Service',   status: 'scheduled', time: 'Tomorrow 9:00 AM' },
  { name: 'Ana K.',    type: 'Thermostat Install',  status: 'scheduled', time: 'Tomorrow 2:00 PM' },
]

const REPORTS = [
  { title: 'Welcome AI Consulting Report', date: 'March 1, 2026' },
  { title: 'Q1 2026 Growth Report', date: 'April 1, 2026' },
]

// Public AI demo number used everywhere on marketing pages — never a real
// tenant's auto-provisioned Twilio number.
const AI_DEMO_NUMBER = '(651) 467-7829'

export default function DashboardPreview({ compact = false }: { compact?: boolean } = {}) {
  const { isSignedIn } = useAuth()
  const [activeTab, setActiveTab] = useState('Command Center')
  const [hoveredNav, setHoveredNav] = useState<string | null>(null)
  // Mirror the live /dashboard metric cards: Revenue (month) + Calls Today +
  // Calls This Week + Customers. Older keys (pending/upcoming/calls/jobs/saved)
  // are kept around because the AI Receptionist and Invoicing tabs + the
  // "All jobs" table further down still reference them.
  const [stats, setStats] = useState({
    revenue: 18430,
    callsToday: 5,
    callsThisWeek: 27,
    pending: 0,        // auto-booking on — never pending
    upcoming: 4,       // matches canonical JOBS list above
    customers: 124,
    calls: 5,
    jobs: 4,
    saved: 22,
  })
  const [bumped, setBumped] = useState<string | null>(null)
  const [floatEl, setFloatEl] = useState<{ key: string; text: string } | null>(null)
  const [visible, setVisible] = useState(false)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const [isHovered, setIsHovered] = useState(false)
  const dashRef = useRef<HTMLDivElement>(null)
  const sectionRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); obs.disconnect() }
    }, { threshold: 0.12 })
    if (sectionRef.current) obs.observe(sectionRef.current)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    // Slow, coordinated bump — feels like real production data, not a demo
    // animation. 10-minute initial wait, then every 6 minutes:
    //   +1 call answered (today + week tick together)
    //   +$1,000 revenue
    //   +1 BellAveGo appointment booked (upcoming counter)
    // Most prospects leave before 10 min so they see a fully static dashboard —
    // people who stay get one believable "live" bump every 6 min.
    const CAPS = { revenue: 50000, callsToday: 25, callsThisWeek: 80, upcoming: 24, customers: 180 }
    const INITIAL_WAIT_MS = 10 * 60 * 1000   // 10 minutes
    const TICK_INTERVAL_MS = 6 * 60 * 1000   // 6 minutes

    function singleBump() {
      setStats(s => {
        const newCallsToday  = Math.min(s.callsToday + 1, CAPS.callsToday)
        const newCallsWeek   = Math.min(s.callsThisWeek + 1, CAPS.callsThisWeek)
        const newRevenue     = Math.min(s.revenue + 1000, CAPS.revenue)
        const newUpcoming    = Math.min(s.upcoming + 1, CAPS.upcoming)
        return {
          ...s,
          callsToday: newCallsToday,
          callsThisWeek: newCallsWeek,
          revenue: newRevenue,
          upcoming: newUpcoming,
        }
      })
      trigger('callsToday', '+1 call · +$1K · +1 booking')
    }

    const firstTick = setTimeout(() => {
      singleBump()
      const id = setInterval(singleBump, TICK_INTERVAL_MS)
      // Stash the interval id on the timeout so the cleanup can find it
      ;(firstTick as unknown as { _interval?: ReturnType<typeof setInterval> })._interval = id
    }, INITIAL_WAIT_MS)

    return () => {
      clearTimeout(firstTick)
      const stashed = (firstTick as unknown as { _interval?: ReturnType<typeof setInterval> })._interval
      if (stashed) clearInterval(stashed)
    }
  }, [])

  function trigger(key: string, text: string) {
    setBumped(key)
    setFloatEl({ key, text })
    setTimeout(() => { setBumped(null); setFloatEl(null) }, 950)
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = dashRef.current?.getBoundingClientRect()
    if (!rect) return
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    setTilt({
      x: ((e.clientY - cy) / (rect.height / 2)) * -3,
      y: ((e.clientX - cx) / (rect.width / 2)) * 3,
    })
  }

  // Mirror /dashboard exactly: Revenue (orange/money tone), then three
  // operational cards on teal tone — Pending Jobs, Upcoming Jobs, Total
  // Customers. Each card carries an icon path that matches the live
  // dashboard's `metrics` array in src/app/dashboard/page.tsx.
  const statCards = [
    {
      key: 'revenue',
      label: 'BellAveGo Revenue · This Month',
      value: stats.revenue,
      prefix: '$',
      tone: 'orange' as const,
      icon: <><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></>,
    },
    {
      key: 'callsToday',
      label: 'BellAveGo Calls Answered Today',
      value: stats.callsToday,
      prefix: '',
      tone: 'teal' as const,
      icon: <><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></>,
    },
    {
      key: 'callsThisWeek',
      label: 'BellAveGo Calls Answered This Week',
      value: stats.callsThisWeek,
      prefix: '',
      tone: 'teal' as const,
      icon: <><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></>,
    },
    {
      key: 'customers',
      label: 'Total Customers',
      value: stats.customers,
      prefix: '',
      tone: 'teal' as const,
      icon: <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></>,
    },
  ]

  return (
    <section ref={sectionRef} style={{ background: compact ? 'transparent' : 'linear-gradient(160deg, #F5FCFA 0%, #E8F7F3 45%, #F0FAF7 100%)', padding: compact ? 0 : (isSignedIn ? '88px 24px 40px' : '88px 24px 72px'), position: 'relative', overflow: 'hidden' }}>
      <style>{`
        @keyframes dpFloatUp { 0%{opacity:1;transform:translateY(0) scale(1);} 100%{opacity:0;transform:translateY(-20px) scale(0.8);} }
        @keyframes dpBounce { 0%,100%{transform:scale(1);} 45%{transform:scale(1.12);} }
        @keyframes dpDot { 0%,100%{opacity:1;transform:scale(1);} 50%{opacity:0.5;transform:scale(1.45);} }
        @keyframes dpBadge { 0%,100%{box-shadow:0 0 0 0 rgba(10,168,159,0.3);} 70%{box-shadow:0 0 0 8px rgba(10,168,159,0);} }

        /* Per-section hover lift — sections inside the dashboard mockup
           rise slightly when hovered (NOT the whole dashboard). Soft shadow
           and 1.5% scale to feel responsive without being obnoxious. */
        .dp-hover-lift {
          transition: transform 0.25s cubic-bezier(0.34,1,0.64,1),
                      box-shadow 0.25s ease,
                      border-color 0.25s ease;
          will-change: transform;
        }
        .dp-hover-lift:hover {
          transform: translateY(-3px) scale(1.015);
          box-shadow: 0 14px 32px rgba(11,31,58,0.18),
                      0 4px 14px rgba(232,116,43,0.16),
                      0 0 0 1px rgba(232,116,43,0.30) !important;
          z-index: 10;
        }
      `}</style>

      {/* Subtle background */}
      {!compact && (
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '25%', left: '50%', transform: 'translate(-50%,-50%)', width: 900, height: 600, background: 'radial-gradient(ellipse, rgba(10,168,159,0.07) 0%, transparent 65%)' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(10,168,159,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(10,168,159,0.035) 1px, transparent 1px)', backgroundSize: '52px 52px' }} />
      </div>
      )}

      {/* Section header */}
      {!compact && (
      <div style={{ textAlign: 'center', marginBottom: 48, position: 'relative', zIndex: 2 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(10,168,159,0.1)', border: '1px solid rgba(10,168,159,0.28)', borderRadius: 20, padding: '6px 15px', marginBottom: 20, animation: 'dpBadge 2.6s infinite' }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#0AA89F', animation: 'dpDot 2s infinite' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#0AA89F', letterSpacing: '0.09em', textTransform: 'uppercase' }}>Live Platform Preview</span>
        </div>
        <h2 style={{ fontSize: 'clamp(26px, 3.6vw, 44px)', fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.03em', lineHeight: 1.1, margin: '0 0 14px' }}>
          See Exactly What Your<br />
          <span style={{ color: '#0AA89F' }}>Business Runs On</span>
        </h2>
        <p style={{ color: '#4A7A80', fontSize: 16, maxWidth: 520, margin: '0 auto' }}>
          AI-powered answering, booking, invoicing, and revenue tracking -- all in one operating system.
        </p>
      </div>
      )}

      {/* Dashboard mockup — two-layer structure.
          OUTER: rounded clip + box shadow. Owns the borderRadius and
                 overflow: hidden so all four corners are guaranteed
                 round in every browser, including Safari's 3D-transform
                 corner bleeding bug.
          INNER: the 3D-rotated content. Keeping transform separate
                 from the clip means the rotation can't push square
                 edges past the outer rounded mask. */}
      <div
        style={{
          maxWidth: compact ? '100%' : 1040,
          margin: compact ? '0' : '0 auto 52px',
          position: 'relative', zIndex: 2,
          borderRadius: 24,
          overflow: 'hidden',
          // Subtle baseline 3D tilt — gives the dashboard a "floating slab"
          // feel at rest. NO whole-dashboard hover effect — individual
          // sections inside lift on hover instead (see .dp-hover-lift CSS).
          perspective: 1400,
          boxShadow: '0 32px 80px rgba(11,31,58,0.14), 0 8px 32px rgba(232,116,43,0.10), 0 0 0 1px rgba(232,116,43,0.16)',
          background: '#ffffff',
          opacity: visible ? 1 : 0,
          transform: 'rotateX(-5deg) rotateY(2deg)',
          transformStyle: 'preserve-3d',
          transition: 'opacity 0.7s ease',
          isolation: 'isolate',
        }}
      >
      <div
        ref={dashRef}
        style={{
          position: 'relative',
          transform: 'translateY(' + (visible ? 0 : 28) + 'px)',
          transition: 'transform 0.7s cubic-bezier(0.34,1,0.64,1)',
          background: '#ffffff',
          cursor: 'default',
        }}
      >
        {/* Browser topbar */}
        <div style={{ height: 46, background: 'linear-gradient(135deg, #FFFFFF 0%, #FFF7EE 100%)', borderBottom: '1px solid rgba(232,116,43,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', flexShrink: 0, boxShadow: '0 1px 8px rgba(232,116,43,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid rgba(10,168,159,0.18)', background: '#F5FCFA', color: '#0B1F3A', fontSize: 9.5, fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}>{'<-'} Back to home</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#0B1F3A' }}>{activeTab}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#ECFDF5', border: '1px solid #A7F3D0', padding: '4px 11px', borderRadius: 16, fontSize: 9.5, fontWeight: 600, color: '#059669' }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 5px rgba(34,197,94,0.5)', animation: 'dpDot 2s infinite' }} />
            AI Online . (651) 467-7829
          </div>
        </div>

        <div className="dp-flex-wrap" style={{ display: 'flex', minHeight: 488 }}>
          {/* -- Sidebar (hidden on mobile via CSS; tabs move to bottom strip) -- */}
          <aside className="dp-sidebar" style={{ width: 178, flexShrink: 0, background: '#ffffff', borderRight: '1px solid rgba(10,168,159,0.14)', display: 'flex', flexDirection: 'column', padding: '13px 10px' }}>
            {/* Logo */}
            <div style={{ padding: '2px 4px 12px', borderBottom: '1px solid rgba(10,168,159,0.1)', marginBottom: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <Image src="/logo.png" alt="BellAveGo" width={665} height={210} style={{ height: 38, width: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 2px 8px rgba(10,168,159,0.32))' }} />
              <div style={{ fontSize: 8, color: '#7AAAB2' }}>Mike&apos;s HVAC Co.</div>
            </div>

            <div style={{ fontSize: 7.5, fontWeight: 800, color: '#C84B26', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '0 5px', marginBottom: 4 }}>Workspace</div>

            {[
              { label: 'Command Center',     dot: false },
              { label: 'AI Receptionist',    dot: true  },
              { label: 'Pro',                dot: false },
              { label: 'Invoicing',          dot: false },
              { label: 'Consulting Reports', dot: false },
              { label: 'Call Forwarding',    dot: false },
              { label: 'Calendar Sync',      dot: false },
            ].map(({ label, dot }) => {
              const active = activeTab === label
              const hovered = hoveredNav === label
              return (
                <div key={label} onClick={() => setActiveTab(label)} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px',
                  borderRadius: 7, marginBottom: 1, fontSize: 10, cursor: 'pointer',
                  background: active ? 'linear-gradient(90deg, rgba(232,116,43,0.10), rgba(20,184,166,0.06))' : hovered ? 'rgba(232,116,43,0.05)' : 'transparent',
                  borderLeft: active ? '2.5px solid #E8742B' : '2.5px solid transparent',
                  color: active ? '#C84B26' : hovered ? '#C84B26' : '#4A6670',
                  fontWeight: active ? 700 : hovered ? 600 : 500,
                  transition: 'all 0.15s ease', userSelect: 'none',
                }}
                  onMouseEnter={() => setHoveredNav(label)}
                  onMouseLeave={() => setHoveredNav(null)}
                >
                  {label}
                  {dot && <div style={{ marginLeft: 'auto', width: 5, height: 5, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 5px rgba(34,197,94,0.5)', animation: 'dpDot 2s infinite' }} />}
                </div>
              )
            })}

            <div style={{ fontSize: 7.5, fontWeight: 800, color: '#0AA89F', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '0 5px', margin: '10px 0 4px' }}>Account</div>
            <div onClick={() => setActiveTab('Settings')} style={{
              padding: '6px 8px', borderRadius: 7, fontSize: 10, cursor: 'pointer',
              color: activeTab === 'Settings' ? '#C84B26' : hoveredNav === 'Settings' ? '#C84B26' : '#4A6670',
              fontWeight: activeTab === 'Settings' ? 700 : hoveredNav === 'Settings' ? 600 : 500,
              background: activeTab === 'Settings' ? 'linear-gradient(90deg, rgba(232,116,43,0.10), rgba(20,184,166,0.06))' : hoveredNav === 'Settings' ? 'rgba(232,116,43,0.05)' : 'transparent',
              borderLeft: activeTab === 'Settings' ? '2.5px solid #E8742B' : '2.5px solid transparent',
              transition: 'all 0.15s ease', userSelect: 'none',
            }}
              onMouseEnter={() => setHoveredNav('Settings')}
              onMouseLeave={() => setHoveredNav(null)}
            >Settings</div>

            <div style={{ marginTop: 'auto', paddingTop: 10, borderTop: '1px solid rgba(10,168,159,0.1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 5px' }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 5px rgba(34,197,94,0.5)', animation: 'dpDot 2s infinite' }} />
                <span style={{ fontSize: 8, color: '#059669', fontWeight: 700 }}>AI Online . 24/7</span>
              </div>
            </div>
          </aside>

          {/* -- Main content -- warm cream gradient matches the live dashboard */}
          <div style={{ flex: 1, padding: '13px 14px', overflowX: 'hidden', minWidth: 0, background: 'radial-gradient(600px 300px at 88% 6%, rgba(255,217,168,0.32), transparent 70%), radial-gradient(500px 400px at 0% 100%, rgba(94,234,212,0.18), transparent 70%), linear-gradient(165deg, #FFF7EE 0%, #FFFAF3 50%, #FEF1DF 100%)', overflowY: 'auto' }}>

          {/* == AI RECEPTIONIST TAB == */}
          {activeTab === 'AI Receptionist' && (
            <div>
              <div style={{ background: 'linear-gradient(135deg, rgba(10,168,159,0.08), rgba(10,168,159,0.04))', border: '1px solid rgba(10,168,159,0.18)', borderRadius: 11, padding: '11px 14px', marginBottom: 11, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22C55E', animation: 'dpDot 2s infinite' }} />
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#0B1F3A' }}>AI Receptionist -- Online</div>
                    <div style={{ fontSize: 8.5, color: '#7AAAB2', marginTop: 1 }}>Answering calls 24/7 . (651) 467-7829</div>
                  </div>
                </div>
                <span style={{ fontSize: 8, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0' }}>Active</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 9, marginBottom: 11 }}>
                {[
                  { label: 'Calls Today', value: stats.calls, accent: '#0AA89F', key: 'calls' },
                  { label: 'Jobs Booked', value: stats.jobs, accent: '#22C55E', key: 'jobs' },
                  { label: 'Calls Saved', value: stats.saved, accent: '#8B5CF6', key: 'saved' },
                ].map(s => (
                  <div key={s.label} style={{ background: '#fff', border: '1px solid rgba(10,168,159,0.14)', borderRadius: 10, padding: '10px 12px', position: 'relative', overflow: 'hidden', boxShadow: bumped === s.key ? '0 0 0 2px ' + s.accent + '55' : '0 2px 8px rgba(7,27,58,0.05)', transition: 'box-shadow 0.3s' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2.5, background: s.accent, borderRadius: '10px 10px 0 0' }} />
                    <div style={{ fontSize: 8, fontWeight: 700, color: '#7AAAB2', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#0B1F3A', lineHeight: 1, animation: bumped === s.key ? 'dpBounce 0.38s ease' : 'none' }}>{s.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: '#fff', border: '1px solid rgba(10,168,159,0.14)', borderRadius: 11, padding: '11px 13px', marginBottom: 9, boxShadow: '0 2px 8px rgba(7,27,58,0.05)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#0B1F3A', marginBottom: 9 }}>Recent Calls</div>
                {[
                  { name: 'Ana K.',    type: 'Thermostat Install',  time: '2m ago',  when: 'Tomorrow 2:00 PM' },
                  { name: 'Kevin S.',  type: 'Heat Pump Service',   time: '18m ago', when: 'Tomorrow 9:00 AM' },
                  { name: 'Sarah L.',  type: "Furnace Won't Start", time: '1h ago',  when: 'Today 1:00 PM' },
                  { name: 'Marcus T.', type: 'HVAC Repair',         time: '2h ago',  when: 'Today 8:00 AM' },
                ].map((c, i, arr) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: i < arr.length - 1 ? '1px solid rgba(10,168,159,0.08)' : 'none' }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, flexShrink: 0, color: '#0B1F3A' }}>AI</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#0B1F3A' }}>{c.name} · {c.type}</div>
                      <div style={{ fontSize: 8, color: '#7AAAB2' }}>{c.time} · auto-booked for {c.when}</div>
                    </div>
                    <span style={{ fontSize: 7.5, fontWeight: 800, padding: '2px 7px', borderRadius: 8, flexShrink: 0, background: 'linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B)', color: '#0B1F3A', letterSpacing: '0.04em' }}>AUTO-BOOKED</span>
                  </div>
                ))}
              </div>
              <div style={{ background: '#fff', border: '1px solid rgba(10,168,159,0.14)', borderRadius: 11, padding: '11px 13px', boxShadow: '0 2px 8px rgba(7,27,58,0.05)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#0B1F3A', marginBottom: 9 }}>AI Configuration</div>
                {[
                  { label: 'Answer after', value: '12 seconds' },
                  { label: 'Tone', value: 'Professional & Friendly' },
                  { label: 'SMS job summaries', value: 'Enabled' },
                  { label: 'Auto-booking', value: 'Enabled' },
                ].map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: i < 3 ? '1px solid rgba(10,168,159,0.08)' : 'none' }}>
                    <div style={{ fontSize: 9.5, color: '#4A7A80' }}>{s.label}</div>
                    <div style={{ fontSize: 9.5, fontWeight: 700, color: '#0AA89F' }}>{s.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* == INVOICING TAB == */}
          {activeTab === 'Invoicing' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 9, marginBottom: 11 }}>
                {[
                  { label: 'Total Invoiced', value: `$${stats.revenue.toLocaleString()}`, accent: '#F59E0B', key: 'revenue' },
                  { label: 'Paid', value: String(stats.jobs), accent: '#22C55E', key: 'jobs' },
                  { label: 'Pending', value: '3', accent: '#0AA89F', key: '' },
                ].map(s => (
                  <div key={s.label} style={{ background: '#fff', border: '1px solid rgba(10,168,159,0.14)', borderRadius: 10, padding: '10px 12px', position: 'relative', overflow: 'hidden', boxShadow: (s.key && bumped === s.key) ? '0 0 0 2px ' + s.accent + '55' : '0 2px 8px rgba(7,27,58,0.05)', transition: 'box-shadow 0.3s' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2.5, background: s.accent, borderRadius: '10px 10px 0 0' }} />
                    <div style={{ fontSize: 8, fontWeight: 700, color: '#7AAAB2', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#0B1F3A', lineHeight: 1, animation: s.key && bumped === s.key ? 'dpBounce 0.38s ease' : 'none' }}>{s.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: '#fff', border: '1px solid rgba(10,168,159,0.14)', borderRadius: 11, padding: '11px 13px', marginBottom: 9, boxShadow: '0 2px 8px rgba(7,27,58,0.05)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#0B1F3A', marginBottom: 10 }}>New Invoice</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  {[{ label: 'Customer', value: 'John Smith' }, { label: 'Amount', value: '$350.00' }].map(f => (
                    <div key={f.label}>
                      <div style={{ fontSize: 8, fontWeight: 700, color: '#7AAAB2', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>{f.label}</div>
                      <div style={{ padding: '6px 8px', borderRadius: 7, border: '1px solid rgba(10,168,159,0.2)', background: '#F5FDFB', fontSize: 9.5, color: '#0B1F3A' }}>{f.value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 8, fontWeight: 700, color: '#7AAAB2', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>Service</div>
                  <div style={{ padding: '6px 8px', borderRadius: 7, border: '1px solid rgba(10,168,159,0.2)', background: '#F5FDFB', fontSize: 9.5, color: '#0B1F3A' }}>AC tune-up + refrigerant recharge</div>
                </div>
                <div style={{ padding: '7px 12px', borderRadius: 8, background: 'linear-gradient(135deg, #22C55E, #16A34A)', color: '#fff', fontSize: 10, fontWeight: 700, textAlign: 'center', boxShadow: '0 2px 10px rgba(34,197,94,0.3)', cursor: 'default' }}>Send Invoice {'->'}</div>
              </div>
              <div style={{ background: '#fff', border: '1px solid rgba(10,168,159,0.14)', borderRadius: 11, padding: '11px 13px', boxShadow: '0 2px 8px rgba(7,27,58,0.05)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#0B1F3A', marginBottom: 9 }}>Recent Invoices</div>
                {[
                  { name: 'Marcus T.', service: 'HVAC Repair', amount: '$485', status: 'paid' },
                  { name: 'Sarah L.', service: 'Furnace Repair', amount: '$320', status: 'paid' },
                  { name: 'Diane R.', service: 'AC Tune-up', amount: '$210', status: 'sent' },
                  { name: 'Kevin S.', service: 'Heat Pump Install', amount: '$3,850', status: 'sent' },
                ].map((inv, i, arr) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: i < arr.length - 1 ? '1px solid rgba(10,168,159,0.08)' : 'none' }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(10,168,159,0.1)', border: '1px solid rgba(10,168,159,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: '#0AA89F', flexShrink: 0 }}>{inv.name[0]}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 9.5, fontWeight: 600, color: '#0B1F3A' }}>{inv.name} . {inv.service}</div>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#0B1F3A' }}>{inv.amount}</div>
                    <span style={{ fontSize: 7.5, fontWeight: 700, padding: '2px 7px', borderRadius: 8, flexShrink: 0, ...(inv.status === 'paid' ? { background: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0' } : { background: 'rgba(10,168,159,0.08)', color: '#0AA89F', border: '1px solid rgba(10,168,159,0.22)' }) }}>{inv.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* == SETTINGS TAB == */}
          {activeTab === 'Settings' && (
            <div>
              <div style={{ background: '#fff', border: '1px solid rgba(10,168,159,0.14)', borderRadius: 11, padding: '11px 13px', marginBottom: 9, boxShadow: '0 2px 8px rgba(7,27,58,0.05)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#0B1F3A', marginBottom: 10 }}>Business Profile</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { label: 'Business name', value: "Mike's HVAC & Cooling" },
                    { label: 'Business type', value: 'HVAC' },
                    { label: 'Phone number', value: '(651) 467-7829' },
                    { label: 'Business hours', value: '8 AM - 6 PM' },
                  ].map(f => (
                    <div key={f.label}>
                      <div style={{ fontSize: 8, fontWeight: 700, color: '#7AAAB2', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>{f.label}</div>
                      <div style={{ padding: '6px 8px', borderRadius: 7, border: '1px solid rgba(10,168,159,0.2)', background: '#F5FDFB', fontSize: 9.5, color: '#0B1F3A' }}>{f.value}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ background: '#fff', border: '1px solid rgba(10,168,159,0.14)', borderRadius: 11, padding: '11px 13px', marginBottom: 9, boxShadow: '0 2px 8px rgba(7,27,58,0.05)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#0B1F3A', marginBottom: 9 }}>AI Receptionist Settings</div>
                {[
                  { label: 'Answer after', value: '12 seconds', toggle: false },
                  { label: 'SMS job summaries', on: true, toggle: true },
                  { label: 'Auto-book appointments', on: true, toggle: true },
                  { label: 'Invoice on completion', on: true, toggle: true },
                  { label: 'Google review requests', on: false, toggle: true },
                ].map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < 4 ? '1px solid rgba(10,168,159,0.08)' : 'none' }}>
                    <div style={{ fontSize: 9.5, color: '#4A7A80' }}>{s.label}</div>
                    {s.toggle ? (
                      <div style={{ width: 28, height: 15, borderRadius: 8, background: s.on ? '#22C55E' : '#D1D5DB', position: 'relative', flexShrink: 0 }}>
                        <div style={{ position: 'absolute', top: 2, left: s.on ? 15 : 2, width: 11, height: 11, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                      </div>
                    ) : (
                      <div style={{ fontSize: 9.5, fontWeight: 700, color: '#0AA89F' }}>{s.value}</div>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ background: 'linear-gradient(135deg, rgba(10,168,159,0.06), rgba(10,168,159,0.1))', border: '1px solid rgba(10,168,159,0.18)', borderRadius: 11, padding: '12px 13px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#0B1F3A', marginBottom: 2 }}>Subscription · Growth Plan</div>
                    <div style={{ fontSize: 8.5, color: '#4A7A80' }}>30-day money-back guarantee</div>
                  </div>
                  <span style={{ fontSize: 8, fontWeight: 700, padding: '3px 9px', borderRadius: 10, background: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0', flexShrink: 0 }}>Active</span>
                </div>
              </div>
            </div>
          )}

          {/* == PRO TAB == */}
          {activeTab === 'Pro' && (
            <div>
              <div style={{ background: 'linear-gradient(135deg, rgba(232,116,43,0.06), rgba(232,116,43,0.02))', border: '1px solid rgba(232,116,43,0.22)', borderRadius: 11, padding: '12px 14px', marginBottom: 11 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 7.5, fontWeight: 800, color: '#C84B26', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 99, background: 'rgba(232,116,43,0.12)', border: '1px solid rgba(232,116,43,0.30)' }}>Pro</span>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: '#0B1F3A' }}>Your AI office manager</div>
                </div>
                <div style={{ fontSize: 9, color: '#4A6670', lineHeight: 1.55 }}>Chases stale quotes day 2 / 7 / 14, recovers past-due invoices, requests Google reviews on completed jobs, watches reputation.</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 9 }}>
                {[
                  { title: 'Quote Hunter',    sub: '14 follow-ups sent this month',  stat: '$3,420', label: 'recovered' },
                  { title: 'AI Collections',  sub: '6 past-due invoices chasing',     stat: '$1,180', label: 'collected' },
                  { title: 'Review Manager',  sub: 'Auto-asks on every completed job', stat: '+8',     label: 'new reviews' },
                  { title: 'Reputation',      sub: '4.7★ avg across 3 platforms',     stat: 'Healthy', label: 'status' },
                ].map(c => (
                  <div key={c.title} style={{ background: '#fff', border: '1px solid rgba(232,116,43,0.16)', borderRadius: 10, padding: '11px 12px', boxShadow: '0 2px 8px rgba(7,27,58,0.05)' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#0B1F3A', marginBottom: 2 }}>{c.title}</div>
                    <div style={{ fontSize: 8, color: '#7AAAB2', marginBottom: 7 }}>{c.sub}</div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: '#C84B26', letterSpacing: '-0.4px' }}>{c.stat}</div>
                    <div style={{ fontSize: 7.5, color: '#8B5A3D', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, marginTop: 1 }}>{c.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* == CONSULTING REPORTS TAB == */}
          {activeTab === 'Consulting Reports' && (
            <div>
              <div style={{ background: 'linear-gradient(160deg, #FFF6EE 0%, #FFFFFF 100%)', border: '1px solid rgba(232,116,43,0.24)', borderRadius: 11, padding: '12px 14px', marginBottom: 11 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg, #FF9D5A, #E8742B)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 8px rgba(232,116,43,0.35)' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <line x1="9" y1="13" x2="15" y2="13"/>
                      <line x1="9" y1="17" x2="13" y2="17"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, fontWeight: 800, color: '#0B1F3A' }}>BellAveGo Consulting Reports</div>
                    <div style={{ fontSize: 8, color: '#8B5A3D', marginTop: 1, fontWeight: 600 }}>Your quarterly growth advisor — delivered as a PDF</div>
                  </div>
                </div>
              </div>
              <div style={{ background: '#fff', border: '1px solid rgba(232,116,43,0.16)', borderRadius: 11, overflow: 'hidden', boxShadow: '0 2px 8px rgba(232,116,43,0.06)' }}>
                {[
                  { title: 'Welcome AI Consulting Report',  date: 'March 1, 2026', tag: 'Delivered' },
                  { title: 'Q1 2026 Growth Report',         date: 'April 1, 2026', tag: 'Delivered' },
                  { title: 'May 2026 Revenue Intelligence', date: 'May 1, 2026',  tag: 'Delivered' },
                  { title: 'Q2 2026 Growth Report',         date: 'July 1, 2026', tag: 'Scheduled' },
                ].map((r, i, arr) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', borderBottom: i < arr.length - 1 ? '1px solid rgba(232,116,43,0.10)' : 'none' }}>
                    <div style={{ flex: 1, fontSize: 10, fontWeight: 700, color: '#0B1F3A' }}>{r.title}</div>
                    <div style={{ fontSize: 8.5, color: '#8B5A3D' }}>{r.date}</div>
                    <span style={{ fontSize: 7, fontWeight: 700, padding: '2px 6px', borderRadius: 8, background: r.tag === 'Delivered' ? 'rgba(34,197,94,0.10)' : 'rgba(232,116,43,0.10)', color: r.tag === 'Delivered' ? '#15803D' : '#C84B26', border: r.tag === 'Delivered' ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(232,116,43,0.30)' }}>{r.tag}</span>
                    <div style={{ padding: '3px 9px', borderRadius: 6, background: r.tag === 'Delivered' ? 'linear-gradient(135deg, #FF9D5A, #E8742B)' : 'rgba(232,116,43,0.10)', color: r.tag === 'Delivered' ? '#fff' : '#C84B26', fontSize: 8, fontWeight: 800, boxShadow: r.tag === 'Delivered' ? '0 2px 6px rgba(232,116,43,0.35)' : 'none' }}>{r.tag === 'Delivered' ? 'View →' : 'Pending'}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* == CALL FORWARDING TAB == */}
          {activeTab === 'Call Forwarding' && (
            <div>
              <div style={{ background: 'linear-gradient(135deg, rgba(10,168,159,0.06), rgba(10,168,159,0.02))', border: '1px solid rgba(10,168,159,0.22)', borderRadius: 11, padding: '12px 14px', marginBottom: 11 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 7.5, fontWeight: 800, color: '#0AA89F', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 99, background: 'rgba(10,168,159,0.10)', border: '1px solid rgba(10,168,159,0.30)' }}>Forwarding</span>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: '#0B1F3A' }}>Send missed calls to BellAveGo</div>
                </div>
                <div style={{ fontSize: 9, color: '#4A6670', lineHeight: 1.5 }}>Conditional forwarding sends only the calls you can&apos;t answer to your AI receptionist — keeps your real cell number with you.</div>
              </div>
              <div style={{ background: '#fff', border: '1px solid rgba(10,168,159,0.14)', borderRadius: 11, padding: '12px 14px', boxShadow: '0 2px 8px rgba(7,27,58,0.05)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#0B1F3A', marginBottom: 10 }}>Setup status</div>
                {[
                  { step: 1, label: 'AI number provisioned',         val: AI_DEMO_NUMBER, done: true  },
                  { step: 2, label: 'Carrier auto-detected',         val: 'Verizon Wireless', done: true  },
                  { step: 3, label: 'Forwarding code dialed',        val: '**61* ' + AI_DEMO_NUMBER + '#',  done: true  },
                  { step: 4, label: 'Test call verified',            val: 'Last test 2h ago', done: true  },
                ].map(s => (
                  <div key={s.step} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', borderBottom: '1px solid rgba(10,168,159,0.08)' }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: s.done ? '#22C55E' : '#E5E7EB', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 900, flexShrink: 0 }}>
                      {s.done ? '✓' : s.step}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#0B1F3A' }}>{s.label}</div>
                      <div style={{ fontSize: 8.5, color: '#7AAAB2', marginTop: 1 }}>{s.val}</div>
                    </div>
                    <span style={{ fontSize: 7.5, fontWeight: 700, padding: '2px 7px', borderRadius: 8, background: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0' }}>Done</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* == CALENDAR SYNC TAB == */}
          {activeTab === 'Calendar Sync' && (
            <div>
              <div style={{ background: 'linear-gradient(135deg, #FFF9F0 0%, #FFFFFF 60%)', border: '1px solid rgba(232,116,43,0.24)', borderRadius: 11, padding: '12px 14px', marginBottom: 11 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 7.5, fontWeight: 800, color: '#C84B26', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 99, background: 'rgba(232,116,43,0.12)', border: '1px solid rgba(232,116,43,0.30)' }}>Calendar</span>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: '#0B1F3A' }}>Live appointment booking</div>
                </div>
                <div style={{ fontSize: 9, color: '#4A6670', lineHeight: 1.5 }}>Connect once and the AI offers your real open times to callers — no double-booking, travel buffer baked in.</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 9, marginBottom: 11 }}>
                {[
                  { name: 'Google Calendar',   color: '#4285F4', glyph: 'G', status: 'Connected', live: true  },
                  { name: 'Microsoft Outlook', color: '#0078D4', glyph: 'O', status: 'Available',  live: false },
                  { name: 'Calendly',          color: '#006BFF', glyph: 'C', status: 'Available',  live: false },
                ].map(p => (
                  <div key={p.name} style={{ background: '#fff', border: p.live ? '1.5px solid #22C55E' : '1px solid rgba(10,168,159,0.16)', borderRadius: 11, padding: '12px 10px', textAlign: 'center', boxShadow: '0 2px 8px rgba(7,27,58,0.05)' }}>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: p.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 16, margin: '0 auto 8px', boxShadow: '0 4px 10px rgba(11,31,58,0.18)' }}>{p.glyph}</div>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#0B1F3A', marginBottom: 4 }}>{p.name}</div>
                    <span style={{ display: 'inline-block', fontSize: 7.5, fontWeight: 700, padding: '2px 7px', borderRadius: 8, background: p.live ? '#ECFDF5' : 'rgba(10,168,159,0.06)', color: p.live ? '#059669' : '#0AA89F', border: p.live ? '1px solid #A7F3D0' : '1px solid rgba(10,168,159,0.22)' }}>{p.status}</span>
                  </div>
                ))}
              </div>

              {/* Mini week view — fake HVAC schedule. Orange blocks were
                  auto-booked by BellAveGo's AI receptionist; blue blocks
                  are pre-existing Google Calendar events. */}
              <div style={{ background: '#fff', border: '1px solid rgba(10,168,159,0.14)', borderRadius: 11, overflow: 'hidden', boxShadow: '0 2px 8px rgba(7,27,58,0.05)' }}>
                {/* Header — month + legend */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderBottom: '1px solid rgba(10,168,159,0.10)', background: 'linear-gradient(135deg, #FFFFFF 0%, #FFFAF3 100%)' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#0B1F3A', letterSpacing: '-0.2px' }}>May 18 – May 22 · This week</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: '#4285F4' }} />
                      <span style={{ fontSize: 7.5, fontWeight: 700, color: '#4A6670' }}>Google</span>
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: 'linear-gradient(135deg, #FF9D5A, #E8742B)' }} />
                      <span style={{ fontSize: 7.5, fontWeight: 700, color: '#C84B26' }}>BellAveGo auto-booked</span>
                    </div>
                  </div>
                </div>
                {/* 5-day grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', borderTop: '1px solid rgba(10,168,159,0.08)' }}>
                  {[
                    {
                      // TODAY — first 2 calendar events match the 4 AI-booked
                      // canonical customers shown in the AI Receptionist tab + Jobs table.
                      day: 'Mon', date: '18',
                      events: [
                        { time: '8:00 AM', title: 'HVAC Repair · Marcus T.',         source: 'bavg'   },
                        { time: '1:00 PM', title: "Furnace Won't Start · Sarah L.",  source: 'bavg'   },
                      ],
                    },
                    {
                      day: 'Tue', date: '19',
                      events: [
                        { time: '9:00 AM', title: 'Heat Pump Service · Kevin S.',    source: 'bavg'   },
                        { time: '2:00 PM', title: 'Thermostat Install · Ana K.',     source: 'bavg'   },
                      ],
                    },
                    {
                      day: 'Wed', date: '20',
                      events: [
                        { time: '12:00 PM', title: 'Lunch with Pat',                 source: 'google' },
                        { time: '3:00 PM',  title: 'Supplier pickup',                source: 'google' },
                      ],
                    },
                    {
                      day: 'Thu', date: '21',
                      events: [
                        { time: '10:00 AM', title: 'Truck inspection',               source: 'google' },
                      ],
                    },
                    {
                      day: 'Fri', date: '22',
                      events: [
                        { time: '8:00 AM', title: 'Team huddle',                     source: 'google' },
                      ],
                    },
                  ].map((col, i, arr) => (
                    <div key={col.day} style={{ borderRight: i < arr.length - 1 ? '1px solid rgba(10,168,159,0.08)' : 'none', padding: '8px 6px', minHeight: 130 }}>
                      <div style={{ textAlign: 'center', marginBottom: 7 }}>
                        <div style={{ fontSize: 7, fontWeight: 800, color: '#7AAAB2', textTransform: 'uppercase', letterSpacing: '0.10em' }}>{col.day}</div>
                        <div style={{ fontSize: 13, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.4px', lineHeight: 1 }}>{col.date}</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {col.events.map((ev, j) => {
                          const isBavg = ev.source === 'bavg'
                          return (
                            <div key={j} style={{
                              borderRadius: 5,
                              padding: '4px 6px',
                              background: isBavg
                                ? 'linear-gradient(135deg, rgba(255,157,90,0.95), rgba(232,116,43,0.95))'
                                : 'rgba(66,133,244,0.92)',
                              color: '#fff',
                              borderLeft: isBavg ? '3px solid #C84B26' : '3px solid #1A73E8',
                              boxShadow: isBavg
                                ? '0 2px 6px rgba(232,116,43,0.32)'
                                : '0 2px 5px rgba(66,133,244,0.28)',
                            }}>
                              <div style={{ fontSize: 7, fontWeight: 800, letterSpacing: '0.05em', opacity: 0.92 }}>{ev.time}</div>
                              <div style={{ fontSize: 8.5, fontWeight: 700, lineHeight: 1.2, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.title}</div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Footer summary */}
                <div style={{ padding: '7px 12px', borderTop: '1px solid rgba(10,168,159,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(232,116,43,0.04)' }}>
                  <span style={{ fontSize: 8, fontWeight: 700, color: '#8B5A3D' }}>10 appointments this week</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 8, fontWeight: 800, color: '#C84B26' }}>
                    <span style={{ width: 6, height: 6, borderRadius: 2, background: 'linear-gradient(135deg, #FF9D5A, #E8742B)' }} />
                    4 auto-booked by AI · Saved you ~80 min
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* == COMMAND CENTER TAB (default) ==
              Mirrors /dashboard exactly: Calendar Sync banner, 4 metric
              cards, 2-col layout (Incoming Requests + All Jobs +
              Consulting Reports on the left; AI Receptionist status +
              Quick actions on the right). */}
          {activeTab === 'Command Center' && <div>

            {/* Calendar Sync banner — mini version of the real one. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', marginBottom: 11, background: 'linear-gradient(135deg, #FFF9F0 0%, #FFFFFF 60%)', border: '1px solid rgba(232,116,43,0.32)', borderRadius: 10, boxShadow: '0 4px 12px rgba(232,116,43,0.08)' }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 3px 8px rgba(232,116,43,0.32)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0B1F3A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 1 }}>
                  <span style={{ fontSize: 7, fontWeight: 900, color: '#C84B26', background: 'rgba(232,116,43,0.12)', padding: '1.5px 5px', borderRadius: 99, letterSpacing: '0.14em', textTransform: 'uppercase' }}>New</span>
                  <span style={{ fontSize: 10.5, fontWeight: 800, color: '#0B1F3A', letterSpacing: '-0.02em' }}>Connect your calendar so the AI offers real time slots</span>
                </div>
                <div style={{ fontSize: 8, color: '#4A6670', lineHeight: 1.4 }}>Google Calendar · Microsoft Outlook · Calendly</div>
              </div>
              <div style={{ padding: '5px 10px', borderRadius: 7, background: 'linear-gradient(135deg, #0AA89F 0%, #0D8F87 100%)', color: '#fff', fontSize: 9, fontWeight: 800, flexShrink: 0, boxShadow: '0 3px 8px rgba(10,168,159,0.32)' }}>Connect →</div>
            </div>


            {/* Stat cards — match the live dashboard exactly: warm white
                gradient bg, eyebrow label + colored icon box on top, big
                gradient stat number below. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 9, marginBottom: 11 }}>
              {statCards.map(s => {
                const isOrange = s.tone === 'orange'
                const eyebrowColor = isOrange ? '#C84B26' : '#0AA89F'
                const iconStroke  = isOrange ? '#E8742B' : '#0AA89F'
                const iconBg      = isOrange ? 'rgba(232,116,43,0.12)' : 'rgba(20,184,166,0.10)'
                const iconBorder  = isOrange ? 'rgba(232,116,43,0.30)' : 'rgba(20,184,166,0.30)'
                const glow = isOrange
                  ? '0 4px 16px rgba(232,116,43,0.14), 0 12px 32px rgba(232,116,43,0.10), inset 0 1px 0 rgba(255,255,255,0.8)'
                  : '0 4px 16px rgba(20,184,166,0.10), 0 12px 32px rgba(11,31,58,0.06), inset 0 1px 0 rgba(255,255,255,0.8)'
                const numberGradient = isOrange
                  ? 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 60%, #C84B26 100%)'
                  : 'linear-gradient(135deg, #14B8A6 0%, #0AA89F 100%)'
                const cardBg = isOrange
                  ? 'linear-gradient(160deg, #FFFFFF 0%, #FFF7EE 100%)'
                  : 'linear-gradient(160deg, #FFFFFF 0%, #F0FBF8 100%)'
                const borderColor = isOrange ? 'rgba(232,116,43,0.28)' : 'rgba(20,184,166,0.24)'
                return (
                  <div key={s.key} className="dp-hover-lift" style={{
                    background: cardBg,
                    border: `1px solid ${borderColor}`,
                    borderRadius: 11,
                    padding: '11px 12px',
                    position: 'relative',
                    overflow: 'visible',
                    boxShadow: bumped === s.key ? `${glow}, 0 0 0 2px ${eyebrowColor}55` : glow,
                  }}>
                    {/* Row 1 — eyebrow label + icon */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                      <div style={{ fontSize: 8, fontWeight: 800, color: eyebrowColor, textTransform: 'uppercase', letterSpacing: '0.10em', lineHeight: 1.25, flex: 1 }}>{s.label}</div>
                      <div style={{ width: 22, height: 22, borderRadius: 7, background: iconBg, border: `1px solid ${iconBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={iconStroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{s.icon}</svg>
                      </div>
                    </div>
                    {/* Row 2 — big gradient stat number */}
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <div style={{
                        fontSize: 22,
                        fontWeight: 900,
                        background: numberGradient,
                        WebkitBackgroundClip: 'text',
                        backgroundClip: 'text',
                        color: 'transparent',
                        WebkitTextFillColor: 'transparent',
                        letterSpacing: '-0.5px',
                        lineHeight: 1,
                        fontVariantNumeric: 'tabular-nums',
                        animation: bumped === s.key ? 'dpBounce 0.38s ease' : 'none',
                        filter: isOrange ? 'drop-shadow(0 2px 6px rgba(232,116,43,0.30))' : 'drop-shadow(0 2px 4px rgba(20,184,166,0.25))',
                      }}>
                        {s.prefix}{s.value.toLocaleString()}
                      </div>
                      {floatEl?.key === s.key && (
                        <span style={{
                          position: 'absolute',
                          top: -2,
                          right: -22,
                          fontSize: 9,
                          fontWeight: 800,
                          color: eyebrowColor,
                          animation: 'dpFloatUp 0.85s ease forwards',
                          pointerEvents: 'none',
                          whiteSpace: 'nowrap',
                        }}>{floatEl.text}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* 2-column middle row — left: tables. right: sidebar widgets. */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 210px', gap: 9, marginBottom: 9 }}>

              {/* Left col — Incoming requests (table) + All jobs (table) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>

                {/* Auto-booking status banner — replaces "Incoming requests" since
                    this contractor has auto-booking turned on. No queue, no approval
                    step, just a live status that the AI is handling everything. */}
                <div className="dp-hover-lift" style={{ background: 'linear-gradient(135deg, #FFF9F0 0%, #FFFFFF 65%)', border: '1.5px solid rgba(232,116,43,0.32)', borderRadius: 11, boxShadow: '0 4px 14px rgba(232,116,43,0.12)', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 9, background: 'linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 9px rgba(232,116,43,0.32)' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0B1F3A" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 800, color: '#C84B26', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Auto-booking ON</div>
                        <div style={{ fontSize: 9.5, color: '#4A6670', marginTop: 1 }}>AI books straight to your calendar &middot; no approval needed</div>
                      </div>
                    </div>
                    <span style={{ fontSize: 7, fontWeight: 800, padding: '3px 8px', borderRadius: 10, background: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0', letterSpacing: '0.06em' }}>4 BOOKED TODAY</span>
                  </div>
                </div>

                {/* All jobs — table-style, mirrors live dashboard */}
                <div className="dp-hover-lift" style={{ background: '#ffffff', border: '1px solid rgba(10,168,159,0.14)', borderRadius: 11, boxShadow: '0 2px 10px rgba(7,27,58,0.05)', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 13px', borderBottom: '1px solid rgba(10,168,159,0.08)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#0B1F3A' }}>All jobs</div>
                    <span style={{ fontSize: 7.5, color: '#7AAAB2', fontWeight: 600 }}>{stats.upcoming} total</span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'rgba(10,168,159,0.03)' }}>
                        <th style={{ fontSize: 7, fontWeight: 800, color: '#7AAAB2', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', padding: '5px 10px' }}>Customer</th>
                        <th style={{ fontSize: 7, fontWeight: 800, color: '#7AAAB2', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', padding: '5px 10px' }}>Service</th>
                        <th style={{ fontSize: 7, fontWeight: 800, color: '#7AAAB2', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', padding: '5px 10px' }}>Scheduled</th>
                        <th style={{ fontSize: 7, fontWeight: 800, color: '#7AAAB2', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', padding: '5px 10px' }}>Amount</th>
                        <th style={{ fontSize: 7, fontWeight: 800, color: '#7AAAB2', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', padding: '5px 10px' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { name: 'Marcus T.', svc: 'HVAC Repair',         when: 'Today 8:00 AM',     amount: '$485',   status: 'auto' },
                        { name: 'Sarah L.',  svc: "Furnace Won't Start", when: 'Today 1:00 PM',     amount: '$640',   status: 'auto' },
                        { name: 'Kevin S.',  svc: 'Heat Pump Service',   when: 'Tomorrow 9:00 AM',  amount: '$3,850', status: 'auto' },
                        { name: 'Ana K.',    svc: 'Thermostat Install',  when: 'Tomorrow 2:00 PM',  amount: '$425',   status: 'auto' },
                      ].map((row, i, arr) => {
                        const pill = { bg: 'rgba(232,116,43,0.10)', color: '#C84B26', border: 'rgba(232,116,43,0.32)', label: 'AI Auto-Booked' }
                        return (
                          <tr key={i} style={{ borderTop: i === 0 ? 'none' : '1px solid rgba(10,168,159,0.06)' }}>
                            <td style={{ fontSize: 9, fontWeight: 700, color: '#0B1F3A', padding: '6px 10px' }}>{row.name}</td>
                            <td style={{ fontSize: 9, color: '#4A6670', padding: '6px 10px' }}>{row.svc}</td>
                            <td style={{ fontSize: 9, color: '#4A6670', padding: '6px 10px' }}>{row.when}</td>
                            <td style={{ fontSize: 9, fontWeight: 700, color: '#0B1F3A', padding: '6px 10px' }}>{row.amount}</td>
                            <td style={{ padding: '6px 10px' }}>
                              <span style={{ display: 'inline-block', fontSize: 7, fontWeight: 700, padding: '2px 7px', borderRadius: 8, background: pill.bg, color: pill.color, border: `1px solid ${pill.border}` }}>{pill.label}</span>
                            </td>
                          </tr>
                        )
                      }).slice(0, JOBS.length)}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Right col — AI Receptionist status + Quick actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>

                {/* AI Receptionist — mirrors real dashboard structure */}
                <div className="dp-hover-lift" style={{ background: '#ffffff', border: '1px solid rgba(10,168,159,0.14)', borderRadius: 11, boxShadow: '0 2px 10px rgba(7,27,58,0.05)', overflow: 'hidden' }}>
                  <div style={{ background: 'linear-gradient(135deg, #FFFFFF 0%, #F0FBF8 100%)', padding: '9px 11px', borderBottom: '1px solid rgba(20,184,166,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(20,184,166,0.12)', border: '1px solid rgba(20,184,166,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0AA89F" strokeWidth="2">
                          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                        </svg>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#0B1F3A' }}>AI Receptionist</div>
                        <div style={{ fontSize: 7.5, color: '#4A6670', marginTop: 1 }}>24/7 · {AI_DEMO_NUMBER}</div>
                      </div>
                    </div>
                    <span style={{ fontSize: 7, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0' }}>Live</span>
                  </div>
                  <div style={{ padding: '6px 11px' }}>
                    {[
                      { label: 'Status', val: 'Connected · listening' },
                      { label: 'Approval SMS to', val: '(555) 010-3318' },
                      { label: 'Calls today', val: String(stats.calls) },
                      { label: 'Leads captured (mo)', val: String(stats.jobs) },
                    ].map((row, i, arr) => (
                      <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < arr.length - 1 ? '1px solid rgba(232,116,43,0.08)' : 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#FF9D5A' }} />
                          <span style={{ fontSize: 8.5, color: '#4A6670' }}>{row.label}</span>
                        </div>
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#0B1F3A', fontVariantNumeric: 'tabular-nums' }}>{row.val}</span>
                      </div>
                    ))}
                    <div style={{ marginTop: 9, background: 'linear-gradient(135deg, #0AA89F, #18AFA8)', color: '#fff', fontSize: 9, fontWeight: 700, padding: '7px 10px', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, boxShadow: '0 3px 9px rgba(10,168,159,0.25)' }}>
                      Configure Receptionist →
                    </div>
                  </div>
                </div>

                {/* Quick actions — mirrors real dashboard's 3 items */}
                <div className="dp-hover-lift" style={{ background: '#ffffff', border: '1px solid rgba(10,168,159,0.14)', borderRadius: 11, boxShadow: '0 2px 10px rgba(7,27,58,0.05)', overflow: 'hidden' }}>
                  <div style={{ padding: '9px 11px', borderBottom: '1px solid rgba(10,168,159,0.08)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#0B1F3A' }}>Quick actions</div>
                  </div>
                  <div style={{ padding: '4px 11px 6px' }}>
                    {[
                      { label: 'Send an invoice',  icon: <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" /></> },
                      { label: 'View settings',    icon: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" /></> },
                      { label: 'Go to home page', icon: <><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></> },
                    ].map((a, i, arr) => (
                      <div key={a.label} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', borderBottom: i < arr.length - 1 ? '1px solid rgba(10,168,159,0.06)' : 'none' }}>
                        <div style={{ width: 20, height: 20, borderRadius: 5, background: 'rgba(10,168,159,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#0AA89F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{a.icon}</svg>
                        </div>
                        <div style={{ fontSize: 9, color: '#0B1F3A', fontWeight: 600, flex: 1 }}>{a.label}</div>
                        <span style={{ fontSize: 9, color: '#0AA89F', fontWeight: 700 }}>→</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Consulting Reports — sunset orange palette */}
            <div style={{ background: 'linear-gradient(160deg, #FFF6EE 0%, #FFFFFF 100%)', border: '1px solid rgba(232,116,43,0.22)', borderRadius: 11, padding: '11px 13px', boxShadow: '0 2px 10px rgba(232,116,43,0.10), 0 0 0 1px rgba(232,116,43,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 7, fontWeight: 800, color: '#E8742B', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '2px 6px', borderRadius: 99, background: 'rgba(232,116,43,0.10)', border: '1px solid rgba(232,116,43,0.28)' }}>Consulting</span>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#0B1F3A' }}>BellAveGo Consulting Reports</div>
                </div>
                <span style={{ fontSize: 7.5, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(232,116,43,0.10)', color: '#C84B26', border: '1px solid rgba(232,116,43,0.30)' }}>2 reports</span>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                {/* Banner */}
                <div style={{ flex: '0 0 auto', background: 'linear-gradient(135deg, rgba(232,116,43,0.10), rgba(255,157,90,0.16))', border: '1px solid rgba(232,116,43,0.28)', borderRadius: 8, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8, maxWidth: 230 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 6, background: 'linear-gradient(135deg, #FF9D5A, #E8742B)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 10px rgba(232,116,43,0.35)' }}>
                    <span style={{ fontSize: 12, color: '#fff' }}>Rep</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 8.5, fontWeight: 700, color: '#0B1F3A', lineHeight: 1.3 }}>Your personal growth advisor</div>
                    <div style={{ fontSize: 7.5, color: '#8B5A3D', marginTop: 1, fontWeight: 600 }}>Quarterly · network-wide insights</div>
                  </div>
                </div>

                {/* Report rows */}
                <div style={{ flex: 1 }}>
                  {REPORTS.map((r, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: i < REPORTS.length - 1 ? '1px solid rgba(232,116,43,0.10)' : 'none' }}>
                      <div style={{ flex: 1, fontSize: 9, fontWeight: 600, color: '#0B1F3A' }}>{r.title}</div>
                      <div style={{ fontSize: 8, color: '#8B5A3D' }}>{r.date}</div>
                      <span style={{ fontSize: 7.5, fontWeight: 700, padding: '2px 6px', borderRadius: 8, background: 'rgba(34,197,94,0.10)', color: '#15803D', border: '1px solid rgba(34,197,94,0.3)', flexShrink: 0 }}>Delivered</span>
                      <div style={{ padding: '2px 8px', borderRadius: 6, background: 'linear-gradient(135deg, #FF9D5A, #E8742B)', color: '#fff', fontSize: 8, fontWeight: 800, flexShrink: 0, boxShadow: '0 2px 6px rgba(232,116,43,0.35)' }}>View</div>
                    </div>
                  ))}
                  <div style={{ marginTop: 6, padding: '5px 8px', background: 'rgba(232,116,43,0.06)', borderRadius: 7, border: '1px dashed rgba(232,116,43,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 8.5, fontWeight: 700, color: '#0B1F3A' }}>Next report · Q2 2026</div>
                      <div style={{ fontSize: 7.5, color: '#8B5A3D' }}>Due July 1, 2026</div>
                    </div>
                    <span style={{ fontSize: 7.5, fontWeight: 800, padding: '2px 6px', borderRadius: 8, background: 'rgba(232,116,43,0.14)', color: '#C84B26', border: '1px solid rgba(232,116,43,0.30)' }}>Upcoming</span>
                  </div>
                </div>
              </div>
            </div>
          </div>}
          </div>

          {/* Mobile-only tab strip — hidden on desktop via CSS. Replaces the
              left sidebar (which is display:none on mobile so the data
              actually fits in the frame). Horizontal scrollable pills,
              same activeTab state — clicking still flips the mock content.
              Right-edge fade gradient + animated chevron tell the user
              there's more to swipe through. */}
          <div className="dp-mobile-tabs-wrap">
            <div className="dp-mobile-tabs">
              {[
                { label: 'Command Center' },
                { label: 'AI Receptionist', dot: true },
                { label: 'Pro' },
                { label: 'Invoicing' },
                { label: 'Consulting Reports' },
                { label: 'Call Forwarding' },
                { label: 'Calendar Sync' },
                { label: 'Settings' },
              ].map(({ label, dot }) => {
                const active = activeTab === label
                return (
                  <button
                    key={label}
                    onClick={() => setActiveTab(label)}
                    style={{
                      padding: '7px 12px', borderRadius: 999, border: 'none',
                      fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      background: active ? 'linear-gradient(135deg, #FF9D5A, #E8742B)' : 'rgba(255,255,255,0.7)',
                      color: active ? '#fff' : '#4A6670',
                      boxShadow: active ? '0 4px 12px rgba(232,116,43,0.32)' : 'none',
                      whiteSpace: 'nowrap', flexShrink: 0,
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                    }}
                  >
                    {label}
                    {dot && <span style={{ width: 5, height: 5, borderRadius: '50%', background: active ? '#fff' : '#22C55E' }} />}
                  </button>
                )
              })}
            </div>
            {/* Swipe affordance — pulsing right-arrow circle (mobile only via CSS) */}
            <span className="dp-swipe-hint" aria-hidden>›</span>
          </div>
        </div>
      </div>{/* /inner 3D-transformed */}
      </div>{/* /outer rounded clip + shadow */}

      {/* CTAs -- hidden when signed in or in compact mode */}
      {!isSignedIn && !compact && (
        <>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 20, position: 'relative', zIndex: 2 }}>
            <Link href="/sign-up" style={{ padding: '14px 36px', background: 'linear-gradient(135deg, #22C55E, #16A34A)', color: '#fff', fontWeight: 900, fontSize: 15, borderRadius: 11, textDecoration: 'none', boxShadow: '0 4px 22px rgba(34,197,94,0.38)', letterSpacing: '-0.01em' }}>
              Get started {'->'}
            </Link>
            <Link href="/sign-in" style={{ padding: '14px 28px', background: '#ffffff', color: '#0B1F3A', fontWeight: 700, fontSize: 15, borderRadius: 11, border: '1px solid rgba(10,168,159,0.22)', textDecoration: 'none', boxShadow: '0 2px 12px rgba(7,27,58,0.07)' }}>
              Sign In to Dashboard
            </Link>
          </div>
          <p style={{ textAlign: 'center', color: '#7AAAB2', fontSize: 13, margin: 0, position: 'relative', zIndex: 2 }}>
            Built for service businesses doing $100k-$4M in annual revenue.
          </p>
        </>
      )}
    </section>
  )
}
