'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import {
  LayoutDashboard, Phone, Briefcase, Users, Mic,
  Receipt, BarChart3, Settings, Bell, X,
  TrendingUp, CheckCircle, Clock, Zap,
} from 'lucide-react'

function AnimatedCounter({ target, prefix = '', suffix = '', duration = 1800 }: {
  target: number; prefix?: string; suffix?: string; duration?: number
}) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const started = useRef(false)

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true
        const start = Date.now()
        const tick = () => {
          const elapsed = Date.now() - start
          const progress = Math.min(elapsed / duration, 1)
          const eased = 1 - Math.pow(1 - progress, 3)
          setCount(Math.round(eased * target))
          if (progress < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }
    }, { threshold: 0.3 })
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [target, duration])

  return <span ref={ref}>{prefix}{count.toLocaleString()}{suffix}</span>
}

const AI_STEPS = [
  { icon: '📞', label: 'Incoming call', sub: 'Customer calling...', color: '#FF6F4F' },
  { icon: '🤖', label: 'AI answered', sub: 'Handling inquiry...', color: '#18AFA8' },
  { icon: '📅', label: 'Job booked', sub: 'Added to schedule', color: '#22C55E' },
  { icon: '💬', label: 'SMS sent', sub: 'Customer confirmed', color: '#6366F1' },
]

function AIWidget() {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setStep(s => (s + 1) % 4), 2200)
    return () => clearInterval(id)
  }, [])
  const current = AI_STEPS[step]
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
        <Zap size={12} color="#18AFA8" />
        <span style={{ fontSize: 10, fontWeight: 700, color: '#18AFA8', letterSpacing: '0.07em', textTransform: 'uppercase' }}>AI Receptionist</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 5px #22C55E' }} />
          <span style={{ fontSize: 9, color: '#22C55E', fontWeight: 600 }}>Live</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {AI_STEPS.map((s, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', borderRadius: 8,
            background: i === step ? `${s.color}18` : 'transparent',
            border: `1px solid ${i === step ? s.color + '44' : 'transparent'}`,
            opacity: i === step ? 1 : 0.32,
            transition: 'all 0.4s ease',
          }}>
            <span style={{ fontSize: 14 }}>{s.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>{s.label}</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)' }}>{s.sub}</div>
            </div>
            {i < step && <CheckCircle size={11} color="#22C55E" />}
            {i === step && (
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: s.color, animation: 'dbPulse 1s infinite' }} />
            )}
          </div>
        ))}
      </div>
      {/* invisible ref holder for the current step — suppress unused-var warning */}
      <span style={{ display: 'none' }}>{current.label}</span>
    </div>
  )
}

const REVENUE_DATA = [
  { month: 'Dec', value: 6800 }, { month: 'Jan', value: 8200 },
  { month: 'Feb', value: 7900 }, { month: 'Mar', value: 10400 },
  { month: 'Apr', value: 11800 }, { month: 'May', value: 12480 },
]
const MAX_VAL = 14000

function RevenueChart() {
  const [animated, setAnimated] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const observer = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setAnimated(true); observer.disconnect() }
    }, { threshold: 0.3 })
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  return (
    <div ref={ref} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <TrendingUp size={12} color="#22C55E" />
          <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Revenue</span>
        </div>
        <span style={{ fontSize: 10, color: '#22C55E', fontWeight: 700 }}>+38% vs last mo.</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 72 }}>
        {REVENUE_DATA.map((d, i) => (
          <div key={d.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{
              width: '100%', borderRadius: '3px 3px 0 0',
              background: i === REVENUE_DATA.length - 1 ? '#22C55E' : '#18AFA8',
              opacity: i === REVENUE_DATA.length - 1 ? 1 : 0.5,
              height: animated ? `${(d.value / MAX_VAL) * 62}px` : '2px',
              transition: `height 0.85s cubic-bezier(0.34,1.56,0.64,1) ${i * 0.07}s`,
              boxShadow: i === REVENUE_DATA.length - 1 ? '0 0 10px rgba(34,197,94,0.45)' : 'none',
            }} />
            <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.35)', fontWeight: 500 }}>{d.month}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const CALLS = [
  { name: 'Marcus T.', type: 'HVAC', msg: 'AC not cooling, needs same-day service', status: 'Booked' },
  { name: 'Diane R.', type: 'Plumbing', msg: 'Leaking pipe under kitchen sink', status: 'Booked' },
  { name: 'Kevin S.', type: 'Electrical', msg: 'Breaker keeps tripping in garage', status: 'Booked' },
  { name: 'Priya L.', type: 'HVAC', msg: 'Annual furnace tune-up requested', status: 'Booked' },
  { name: 'Tom H.', type: 'Handyman', msg: 'Need 3 ceiling fans installed', status: 'Booked' },
]

const SCHEDULE = [
  { time: '8:00 AM', name: 'Marcus T.', type: 'HVAC Repair', color: '#18AFA8' },
  { time: '10:30 AM', name: 'Diane R.', type: 'Plumbing', color: '#6366F1' },
  { time: '12:00 PM', name: 'Lunch break', type: '', color: '#3D5A62' },
  { time: '1:00 PM', name: 'Kevin S.', type: 'Electrical', color: '#F59E0B' },
  { time: '3:30 PM', name: 'Priya L.', type: 'HVAC Tune-up', color: '#22C55E' },
]

const MODAL_TABS = ['AI Transcript', 'Customers', 'Invoices', 'Revenue']

const TRANSCRIPT = [
  { role: 'AI', msg: 'Thank you for calling Johnson HVAC, this is Bell — how can I help you today?' },
  { role: 'Caller', msg: "Hi, my AC stopped cooling last night and it's getting really hot. Can someone come out today?" },
  { role: 'AI', msg: "I'm so sorry to hear that! I can get a tech out to you today. Can I get your name and address?" },
  { role: 'Caller', msg: 'Marcus Thompson, 2847 Oak Ridge Drive.' },
  { role: 'AI', msg: "Perfect Marcus! I've got a slot open at 8 AM this morning. Does that work for you?" },
  { role: 'Caller', msg: 'Yes, 8 AM is great.' },
  { role: 'AI', msg: "You're all booked! You'll receive a text confirmation in just a moment. See you at 8!" },
]

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Dashboard', active: true },
  { icon: Phone, label: 'Call Log' },
  { icon: Briefcase, label: 'Jobs' },
  { icon: Users, label: 'Customers' },
  { icon: Mic, label: 'AI Receptionist' },
  { icon: Receipt, label: 'Invoices' },
  { icon: BarChart3, label: 'Revenue' },
  { icon: Settings, label: 'Settings' },
]

export default function DashboardPreview() {
  const [showModal, setShowModal] = useState(false)
  const [activeTab, setActiveTab] = useState(0)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const dashRef = useRef<HTMLDivElement>(null)

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = dashRef.current?.getBoundingClientRect()
    if (!rect) return
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = (e.clientX - cx) / (rect.width / 2)
    const dy = (e.clientY - cy) / (rect.height / 2)
    setTilt({ x: dy * -4, y: dx * 4 })
  }

  return (
    <section style={{ background: '#071B3A', padding: '88px 24px 72px', position: 'relative', overflow: 'hidden' }}>
      <style>{`
        @keyframes dbPulse { 0%,100%{opacity:1;transform:scale(1);} 50%{opacity:0.5;transform:scale(1.4);} }
        @keyframes dbCallScroll { 0%{transform:translateY(0);} 100%{transform:translateY(-50%);} }
        @keyframes dbBadgePulse { 0%,100%{box-shadow:0 0 0 0 rgba(24,175,168,0.45);} 70%{box-shadow:0 0 0 9px rgba(24,175,168,0);} }
      `}</style>

      {/* BG grid */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(24,175,168,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(24,175,168,0.07) 1px, transparent 1px)', backgroundSize: '48px 48px', pointerEvents: 'none' }} />
      {/* BG glow */}
      <div style={{ position: 'absolute', top: '35%', left: '50%', transform: 'translate(-50%,-50%)', width: 900, height: 600, background: 'radial-gradient(ellipse, rgba(24,175,168,0.11) 0%, transparent 65%)', pointerEvents: 'none' }} />

      {/* Section header */}
      <div style={{ textAlign: 'center', marginBottom: 52, position: 'relative', zIndex: 2 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(24,175,168,0.12)', border: '1px solid rgba(24,175,168,0.35)', borderRadius: 20, padding: '6px 15px', marginBottom: 22, animation: 'dbBadgePulse 2.5s infinite' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#18AFA8' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#18AFA8', letterSpacing: '0.09em', textTransform: 'uppercase' }}>Live Platform Preview</span>
        </div>
        <h2 style={{ fontSize: 'clamp(28px, 4vw, 46px)', fontWeight: 900, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 14, margin: '0 0 14px' }}>
          See Exactly What Your<br />
          <span style={{ color: '#18AFA8' }}>Business Runs On</span>
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 16, maxWidth: 520, margin: '0 auto' }}>
          AI-powered answering, booking, invoicing, and revenue tracking — all in one operating system.
        </p>
      </div>

      {/* Dashboard mockup */}
      <div
        ref={dashRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTilt({ x: 0, y: 0 })}
        style={{
          maxWidth: 1060, margin: '0 auto 52px',
          position: 'relative', zIndex: 2,
          transform: `perspective(1400px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          transition: 'transform 0.14s ease',
          borderRadius: 16,
          boxShadow: '0 48px 120px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.07)',
          background: '#0D2847',
          overflow: 'hidden',
          cursor: 'default',
        }}
      >
        {/* Top bar */}
        <div style={{ background: '#071B3A', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '11px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Good morning, Mike 👋</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Tuesday, May 6</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ position: 'relative' }}>
              <Bell size={15} color="rgba(255,255,255,0.45)" />
              <div style={{ position: 'absolute', top: -2, right: -2, width: 7, height: 7, background: '#FF6F4F', borderRadius: '50%' }} />
            </div>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #18AFA8 0%, #071B3A 100%)', border: '2px solid rgba(24,175,168,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: '#fff' }}>M</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex' }}>
          {/* Sidebar */}
          <div style={{ width: 170, flexShrink: 0, background: '#071B3A', borderRight: '1px solid rgba(255,255,255,0.07)', padding: '16px 0', display: 'flex', flexDirection: 'column', minHeight: 460 }}>
            <div style={{ padding: '0 14px 16px' }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#18AFA8', letterSpacing: '-0.02em' }}>BellAveGo</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', marginTop: 2 }}>Mike&apos;s HVAC Co.</div>
            </div>
            {NAV_ITEMS.map(({ icon: Icon, label, active }) => (
              <div key={label} style={{
                display: 'flex', alignItems: 'center', gap: 9, padding: '7px 14px', marginBottom: 1,
                background: active ? 'rgba(24,175,168,0.14)' : 'transparent',
                borderLeft: `2px solid ${active ? '#18AFA8' : 'transparent'}`,
              }}>
                <Icon size={13} color={active ? '#18AFA8' : 'rgba(255,255,255,0.35)'} />
                <span style={{ fontSize: 11, fontWeight: active ? 700 : 400, color: active ? '#18AFA8' : 'rgba(255,255,255,0.35)' }}>{label}</span>
              </div>
            ))}
            <div style={{ marginTop: 'auto', padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 5px #22C55E' }} />
              <span style={{ fontSize: 9, color: '#22C55E', fontWeight: 600 }}>AI Online · 24/7</span>
            </div>
          </div>

          {/* Main panel */}
          <div style={{ flex: 1, padding: '16px 18px', overflowX: 'hidden', minWidth: 0 }}>
            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
              {[
                { label: 'Calls Today', target: 38, prefix: '', icon: '📞', color: '#18AFA8' },
                { label: 'Jobs Booked', target: 14, prefix: '', icon: '📅', color: '#22C55E' },
                { label: 'Revenue', target: 12480, prefix: '$', icon: '💰', color: '#F59E0B' },
                { label: 'Missed → Saved', target: 22, prefix: '', icon: '🛡️', color: '#6366F1' },
              ].map(s => (
                <div key={s.label} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '11px 12px' }}>
                  <div style={{ fontSize: 16, marginBottom: 4 }}>{s.icon}</div>
                  <div style={{ fontSize: 19, fontWeight: 800, color: s.color, lineHeight: 1, marginBottom: 3 }}>
                    <AnimatedCounter target={s.target} prefix={s.prefix} />
                  </div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.38)', fontWeight: 500 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Middle: call feed + schedule */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              {/* Live call feed */}
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '12px 14px', height: 186, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 5px #22C55E' }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Live Call Feed</span>
                </div>
                <div style={{ overflow: 'hidden', height: 148 }}>
                  <div style={{ animation: 'dbCallScroll 14s linear infinite' }}>
                    {[...CALLS, ...CALLS].map((c, i) => (
                      <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(24,175,168,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: '#18AFA8' }}>{c.name[0]}</span>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name} · {c.type}</div>
                          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.38)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.msg}</div>
                        </div>
                        <span style={{ fontSize: 8, color: '#22C55E', fontWeight: 700, flexShrink: 0 }}>{c.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Schedule */}
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '12px 14px', height: 186, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10 }}>
                  <Clock size={11} color="rgba(255,255,255,0.45)" />
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Today&apos;s Schedule</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {SCHEDULE.map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.35)', fontWeight: 600, width: 46, flexShrink: 0 }}>{s.time}</span>
                      <div style={{ flex: 1, height: 20, borderRadius: 4, background: `${s.color}1A`, border: `1px solid ${s.color}44`, display: 'flex', alignItems: 'center', paddingLeft: 7 }}>
                        <span style={{ fontSize: 9, fontWeight: 600, color: s.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {s.name}{s.type ? ` · ${s.type}` : ''}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Bottom: AI widget + revenue chart */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <AIWidget />
              <RevenueChart />
            </div>
          </div>
        </div>
      </div>

      {/* CTAs */}
      <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 20, position: 'relative', zIndex: 2 }}>
        <Link href="/sign-up" style={{ padding: '14px 36px', background: '#22C55E', color: '#fff', fontWeight: 900, fontSize: 15, borderRadius: 11, textDecoration: 'none', boxShadow: '0 4px 22px rgba(34,197,94,0.38)', letterSpacing: '-0.01em' }}>
          Start Free Trial — 14 Days →
        </Link>
        <button
          onClick={() => setShowModal(true)}
          style={{ padding: '14px 28px', background: 'rgba(255,255,255,0.07)', color: '#fff', fontWeight: 700, fontSize: 15, borderRadius: 11, border: '1px solid rgba(255,255,255,0.17)', cursor: 'pointer', backdropFilter: 'blur(8px)' }}
        >
          Explore Full Dashboard
        </button>
      </div>
      <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.28)', fontSize: 13, margin: 0, position: 'relative', zIndex: 2 }}>
        Built for service businesses with 1–15 employees doing $100k–$4M in annual revenue.
      </p>

      {/* Modal */}
      {showModal && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(5px)' }}
        >
          <div style={{ background: '#0D2847', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, width: '100%', maxWidth: 680, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 48px 120px rgba(0,0,0,0.75)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 22px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>Full Dashboard Explorer</span>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
                <X size={17} color="rgba(255,255,255,0.45)" />
              </button>
            </div>
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '0 22px' }}>
              {MODAL_TABS.map((t, i) => (
                <button key={t} onClick={() => setActiveTab(i)} style={{ padding: '11px 16px', background: 'none', border: 'none', borderBottom: `2px solid ${activeTab === i ? '#18AFA8' : 'transparent'}`, color: activeTab === i ? '#18AFA8' : 'rgba(255,255,255,0.38)', fontWeight: activeTab === i ? 700 : 500, fontSize: 12, cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap' }}>
                  {t}
                </button>
              ))}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '22px' }}>
              {activeTab === 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: 'rgba(24,175,168,0.1)', border: '1px solid rgba(24,175,168,0.22)', borderRadius: 9, marginBottom: 18 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#18AFA8' }}>Marcus T. — HVAC · Today 7:52 AM · 1m 34s · ✅ Booked</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {TRANSCRIPT.map((line, i) => (
                      <div key={i} style={{ display: 'flex', gap: 10, flexDirection: line.role === 'AI' ? 'row' : 'row-reverse' }}>
                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: line.role === 'AI' ? 'rgba(24,175,168,0.18)' : 'rgba(255,255,255,0.08)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: 11 }}>{line.role === 'AI' ? '🤖' : '👤'}</span>
                        </div>
                        <div style={{ maxWidth: '76%', padding: '9px 13px', borderRadius: 11, background: line.role === 'AI' ? 'rgba(24,175,168,0.1)' : 'rgba(255,255,255,0.05)', border: `1px solid ${line.role === 'AI' ? 'rgba(24,175,168,0.2)' : 'rgba(255,255,255,0.07)'}` }}>
                          <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.8)', lineHeight: 1.55 }}>{line.msg}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {activeTab === 1 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    { name: 'Marcus Thompson', jobs: 3, spent: '$1,240', last: 'Today' },
                    { name: 'Diane Rodriguez', jobs: 7, spent: '$3,890', last: 'Yesterday' },
                    { name: 'Kevin Stubbs', jobs: 2, spent: '$680', last: '3 days ago' },
                    { name: 'Priya Lakshmi', jobs: 5, spent: '$2,100', last: '1 week ago' },
                    { name: 'Tom Harris', jobs: 4, spent: '$1,560', last: '2 weeks ago' },
                    { name: 'Sandra Kim', jobs: 9, spent: '$4,320', last: '3 weeks ago' },
                  ].map(c => (
                    <div key={c.name} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 11, padding: '13px 14px' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 5 }}>{c.name}</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)' }}>{c.jobs} jobs · {c.spent} total</div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>Last visit: {c.last}</div>
                    </div>
                  ))}
                </div>
              )}
              {activeTab === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { id: '#1042', name: 'Marcus T.', amount: '$320', status: 'Paid', date: 'Today' },
                    { id: '#1041', name: 'Diane R.', amount: '$180', status: 'Paid', date: 'Yesterday' },
                    { id: '#1040', name: 'Kevin S.', amount: '$475', status: 'Sent', date: '2 days ago' },
                    { id: '#1039', name: 'Priya L.', amount: '$220', status: 'Paid', date: '3 days ago' },
                    { id: '#1038', name: 'Tom H.', amount: '$540', status: 'Paid', date: '4 days ago' },
                  ].map(inv => (
                    <div key={inv.id} style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 9, padding: '11px 14px', gap: 12 }}>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', fontWeight: 600, width: 36 }}>{inv.id}</span>
                      <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#fff' }}>{inv.name}</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#22C55E' }}>{inv.amount}</span>
                      <span style={{ fontSize: 9, padding: '3px 8px', borderRadius: 5, background: inv.status === 'Paid' ? 'rgba(34,197,94,0.14)' : 'rgba(245,158,11,0.14)', color: inv.status === 'Paid' ? '#22C55E' : '#F59E0B', fontWeight: 700 }}>{inv.status}</span>
                      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', width: 70, textAlign: 'right' }}>{inv.date}</span>
                    </div>
                  ))}
                </div>
              )}
              {activeTab === 3 && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 18 }}>
                    {[
                      { label: 'This Month', value: '$12,480', change: '+38%', color: '#22C55E' },
                      { label: 'Last Month', value: '$9,040', change: '+22%', color: '#18AFA8' },
                      { label: 'YTD', value: '$58,300', change: '+41%', color: '#F59E0B' },
                    ].map(s => (
                      <div key={s.label} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 11, padding: '14px' }}>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.38)', marginBottom: 4 }}>{s.label}</div>
                        <div style={{ fontSize: 19, fontWeight: 800, color: s.color, marginBottom: 3 }}>{s.value}</div>
                        <div style={{ fontSize: 9, color: '#22C55E', fontWeight: 700 }}>{s.change} vs prior period</div>
                      </div>
                    ))}
                  </div>
                  <RevenueChart />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
