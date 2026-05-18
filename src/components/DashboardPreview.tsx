'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@clerk/nextjs'

const JOBS = [
  { name: 'Marcus T.', type: 'HVAC Repair', status: 'scheduled', time: 'Today 8:00 AM' },
  { name: 'Diane R.', type: 'Plumbing Estimate', status: 'pending_approval', time: 'Tomorrow 10:00 AM' },
  { name: 'Kevin S.', type: 'Electrical Repair', status: 'scheduled', time: 'Tomorrow 2:00 PM' },
  { name: 'Priya L.', type: 'Cleaning Appointment', status: 'scheduled', time: 'Thu 9:00 AM' },
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
  // Mirror the live /dashboard metric cards: Revenue (month) + Pending +
  // Upcoming + Customers. Older keys (calls, jobs, saved) are kept around
  // because the AI Receptionist and Invoicing tabs still reference them.
  const [stats, setStats] = useState({
    revenue: 12750,
    pending: 1,
    upcoming: 4,
    customers: 24,
    calls: 3,
    jobs: 2,
    saved: 18,
  })
  const [bumped, setBumped] = useState<string | null>(null)
  const [floatEl, setFloatEl] = useState<{ key: string; text: string } | null>(null)
  const [visible, setVisible] = useState(false)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
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
    // Realistic ambient bumps. Most ticks do nothing — feels live, stays
    // plausible. Revenue moves most often (money signals are the most
    // emotional); customers crawl up occasionally; pending/upcoming flex
    // in a believable range.
    const CAPS = { revenue: 16800, pending: 3, upcoming: 6, customers: 31, calls: 8, jobs: 5, saved: 26 }
    const id = setInterval(() => {
      const r = Math.random()
      setStats(s => {
        if (r < 0.30 && s.revenue < CAPS.revenue) {
          const inc = (Math.floor(Math.random() * 4) + 1) * 50
          trigger('revenue', `+$${inc}`)
          return { ...s, revenue: s.revenue + inc }
        }
        if (r < 0.42 && s.upcoming < CAPS.upcoming) {
          trigger('upcoming', '+1')
          return { ...s, upcoming: s.upcoming + 1, jobs: Math.min(s.jobs + 1, CAPS.jobs) }
        }
        if (r < 0.50 && s.customers < CAPS.customers) {
          trigger('customers', '+1')
          return { ...s, customers: s.customers + 1, calls: Math.min(s.calls + 1, CAPS.calls), saved: Math.min(s.saved + 1, CAPS.saved) }
        }
        if (r < 0.56 && s.pending < CAPS.pending) {
          trigger('pending', '+1')
          return { ...s, pending: s.pending + 1 }
        }
        return s
      })
    }, 9000)
    return () => clearInterval(id)
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
      key: 'pending',
      label: 'Pending Jobs',
      value: stats.pending,
      prefix: '',
      tone: 'teal' as const,
      icon: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4" /></>,
    },
    {
      key: 'upcoming',
      label: 'Upcoming Jobs',
      value: stats.upcoming,
      prefix: '',
      tone: 'teal' as const,
      icon: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
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

      {/* Dashboard mockup. borderRadius is forced on every corner (some
          browsers were rendering only the LEFT corners as rounded due to
          the 3D rotateY transform and isolation context — explicit
          per-corner values guarantee TR/BR aren't flat). */}
      <div
        ref={dashRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTilt({ x: 0, y: 0 })}
        style={{
          maxWidth: compact ? '100%' : 1040, margin: compact ? '0' : '0 auto 52px',
          position: 'relative', zIndex: 2,
          transform: compact
            ? 'perspective(1800px) rotateY(' + (-14 + tilt.y) + 'deg) rotateX(' + (4 + tilt.x) + 'deg) translateY(' + (visible ? 0 : 28) + 'px)'
            : 'perspective(1600px) rotateX(' + (tilt.x + (visible ? 0 : 8)) + 'deg) rotateY(' + tilt.y + 'deg) translateY(' + (visible ? 0 : 28) + 'px)',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.7s ease, transform 0.7s cubic-bezier(0.34,1,0.64,1)',
          borderRadius: 24,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          borderBottomLeftRadius: 24,
          borderBottomRightRadius: 24,
          boxShadow: '0 32px 80px rgba(11,31,58,0.14), 0 8px 32px rgba(232,116,43,0.10), 0 0 0 1px rgba(232,116,43,0.16)',
          background: '#ffffff',
          overflow: 'hidden',
          cursor: 'default',
          isolation: 'isolate',
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

        <div style={{ display: 'flex', minHeight: 488 }}>
          {/* -- Sidebar -- */}
          <aside style={{ width: 178, flexShrink: 0, background: '#ffffff', borderRight: '1px solid rgba(10,168,159,0.14)', display: 'flex', flexDirection: 'column', padding: '13px 10px' }}>
            {/* Logo */}
            <div style={{ padding: '2px 4px 12px', borderBottom: '1px solid rgba(10,168,159,0.1)', marginBottom: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <Image src="/logo.png" alt="BellAveGo" width={665} height={210} style={{ height: 38, width: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 2px 8px rgba(10,168,159,0.32))' }} />
              <div style={{ fontSize: 8, color: '#7AAAB2' }}>Mike&apos;s HVAC Co.</div>
            </div>

            <div style={{ fontSize: 7.5, fontWeight: 800, color: '#C84B26', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '0 5px', marginBottom: 4 }}>Workspace</div>

            {[
              { label: 'Command Center', dot: false },
              { label: 'AI Receptionist', dot: true },
              { label: 'Invoicing', dot: false },
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
                  { name: 'Mike R.', type: 'HVAC Repair', time: '2m ago', status: 'booked' },
                  { name: 'Sarah L.', type: 'Plumbing Issue', time: '18m ago', status: 'booked' },
                  { name: 'James W.', type: 'AC Not Cooling', time: '1h ago', status: 'saved' },
                  { name: 'Ana K.', type: 'Electrical Check', time: '2h ago', status: 'booked' },
                ].map((c, i, arr) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: i < arr.length - 1 ? '1px solid rgba(10,168,159,0.08)' : 'none' }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: c.status === 'booked' ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)', border: c.status === 'booked' ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, flexShrink: 0 }}>{c.status === 'booked' ? 'Cal' : 'Tel'}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#0B1F3A' }}>{c.name} . {c.type}</div>
                      <div style={{ fontSize: 8, color: '#7AAAB2' }}>{c.time}</div>
                    </div>
                    <span style={{ fontSize: 7.5, fontWeight: 700, padding: '2px 7px', borderRadius: 8, flexShrink: 0, ...(c.status === 'booked' ? { background: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0' } : { background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A' }) }}>{c.status === 'booked' ? 'Booked' : 'Saved'}</span>
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
                  { name: 'Sarah L.', service: 'Plumbing Fix', amount: '$320', status: 'paid' },
                  { name: 'Diane R.', service: 'Electrical', amount: '$210', status: 'sent' },
                  { name: 'Kevin S.', service: 'AC Tune-up', amount: '$150', status: 'sent' },
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
                    { label: 'Business name', value: 'Smith HVAC & Services' },
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

          {/* == COMMAND CENTER TAB (default) == */}
          {activeTab === 'Command Center' && <div>

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
                  <div key={s.key} style={{
                    background: cardBg,
                    border: `1px solid ${borderColor}`,
                    borderRadius: 11,
                    padding: '11px 12px',
                    position: 'relative',
                    overflow: 'visible',
                    boxShadow: bumped === s.key ? `${glow}, 0 0 0 2px ${eyebrowColor}55` : glow,
                    transition: 'box-shadow 0.3s ease',
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

            {/* 2-column middle row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 210px', gap: 9, marginBottom: 9 }}>

              {/* Left: Incoming + Jobs */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>

                {/* Incoming Requests */}
                <div style={{ background: '#ffffff', border: '1px solid rgba(10,168,159,0.14)', borderRadius: 11, padding: '11px 13px', boxShadow: '0 2px 10px rgba(7,27,58,0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#0B1F3A' }}>Incoming Requests</div>
                    <span style={{ fontSize: 7.5, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A' }}>1 pending</span>
                  </div>
                  <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 9, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#0B1F3A', marginBottom: 2 }}>Lighting Repair -- 9240 South Hoyne Ave</div>
                        <div style={{ fontSize: 9.5, color: '#4A7A80' }}>Customer requested tomorrow around 3:00 PM</div>
                      </div>
                      <span style={{ fontSize: 7.5, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A', whiteSpace: 'nowrap', flexShrink: 0 }}>Pending</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <div style={{ padding: '4px 11px', borderRadius: 6, background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#059669', fontSize: 9, fontWeight: 700 }}>Accept</div>
                      <div style={{ padding: '4px 11px', borderRadius: 6, background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', fontSize: 9, fontWeight: 700 }}>Decline</div>
                    </div>
                  </div>
                </div>

                {/* All Jobs */}
                <div style={{ background: '#ffffff', border: '1px solid rgba(10,168,159,0.14)', borderRadius: 11, padding: '11px 13px', boxShadow: '0 2px 10px rgba(7,27,58,0.05)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#0B1F3A', marginBottom: 9 }}>All Jobs</div>
                  {JOBS.map((j, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: i < JOBS.length - 1 ? '1px solid rgba(10,168,159,0.08)' : 'none' }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(10,168,159,0.1)', border: '1px solid rgba(10,168,159,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#0AA89F', flexShrink: 0 }}>
                        {j.name[0]}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: '#0B1F3A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.name} . {j.type}</div>
                        <div style={{ fontSize: 8, color: '#7AAAB2' }}>{j.time}</div>
                      </div>
                      <span style={{ fontSize: 7.5, fontWeight: 700, padding: '2px 7px', borderRadius: 8, flexShrink: 0, ...(j.status === 'scheduled' ? { background: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0' } : { background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A' }) }}>
                        {j.status === 'scheduled' ? 'Scheduled' : 'Pending'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: AI Receptionist + Quick Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>

                {/* AI Receptionist */}
                <div style={{ background: '#ffffff', border: '1px solid rgba(10,168,159,0.14)', borderRadius: 11, padding: '11px 12px', boxShadow: '0 2px 10px rgba(7,27,58,0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10 }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 5px rgba(34,197,94,0.5)', animation: 'dpDot 2s infinite' }} />
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#0B1F3A' }}>AI Receptionist</div>
                    <span style={{ marginLeft: 'auto', fontSize: 7.5, fontWeight: 700, padding: '2px 7px', borderRadius: 8, background: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0' }}>Online</span>
                  </div>
                  {[
                    { label: 'Calls today', value: stats.calls, key: 'calls', color: '#0AA89F' },
                    { label: 'Leads captured', value: stats.jobs, key: 'jobs', color: '#22C55E' },
                  ].map(row => (
                    <div key={row.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(10,168,159,0.08)' }}>
                      <div style={{ fontSize: 9, color: '#7AAAB2' }}>{row.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: row.color, animation: bumped === row.key ? 'dpBounce 0.38s ease' : 'none' }}>
                        {row.value}
                      </div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0' }}>
                    <div style={{ fontSize: 9, color: '#7AAAB2' }}>Approval SMS</div>
                    <span style={{ fontSize: 7.5, fontWeight: 700, padding: '2px 7px', borderRadius: 8, background: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0' }}>Connected</span>
                  </div>
                </div>

                {/* Quick Actions */}
                <div style={{ background: '#ffffff', border: '1px solid rgba(10,168,159,0.14)', borderRadius: 11, padding: '11px 12px', boxShadow: '0 2px 10px rgba(7,27,58,0.05)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#0B1F3A', marginBottom: 9 }}>Quick Actions</div>
                  {[
                    { label: 'Send an invoice', icon: 'Pay' },
                    { label: 'View settings', icon: 'Cfg' },
                  ].map((a, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 0', borderBottom: i < 1 ? '1px solid rgba(10,168,159,0.08)' : 'none' }}>
                      <div style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(10,168,159,0.08)', border: '1px solid rgba(10,168,159,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, flexShrink: 0 }}>
                        {a.icon}
                      </div>
                      <div style={{ fontSize: 10, color: '#0AA89F', fontWeight: 600 }}>{a.label}</div>
                    </div>
                  ))}
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
        </div>
      </div>

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
