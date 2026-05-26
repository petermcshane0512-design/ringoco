/**
 * Public appointment page — `/appointment/[token]`
 *
 * Homeowner clicks the link in the BellAveGo confirmation SMS and lands
 * here. NO LOGIN REQUIRED. The token (HMAC-signed) identifies the
 * appointment and is the only auth.
 *
 * Renders:
 *   - "Your appointment is confirmed."
 *   - Service + time + business name + business phone
 *   - "Need to reschedule? Tap to text us" — opens SMS pre-filled with a
 *     reschedule request to the contractor's BellAveGo number.
 *   - "Add to your calendar" — Google + Apple ICS download.
 *
 * Server component. Direct DB read with service role (bypasses tenant
 * isolation safely because the token cryptographically pins the
 * appointment id — no enumeration possible).
 */
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@supabase/supabase-js'
import { verifyAppointmentToken } from '@/lib/calendar/appointmentTokens'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type PageProps = {
  params: Promise<{ token: string }>
}

type AppointmentRecord = {
  id: string
  user_id: string
  scheduled_at: string | null
  scheduled_end_at: string | null
  duration_min: number | null
  customer_name: string | null
  customer_phone: string | null
  job_type: string | null
  address: string | null
  status: string
  business_name?: string | null
  business_phone?: string | null
  business_timezone?: string | null
}

async function loadAppointment(appointmentId: string): Promise<AppointmentRecord | null> {
  const { data, error } = await supabase
    .from('jobs')
    .select(`
      id, user_id, scheduled_at, scheduled_end_at, duration_min,
      customer_name, customer_phone, job_type, address, status
    `)
    .eq('id', appointmentId)
    .maybeSingle()
  if (error || !data) return null

  // Pull the contractor's business name + phone (their BellAveGo number)
  // so we can render "scheduled with <business>" + a tap-to-text link.
  const { data: profile } = await supabase
    .from('profiles')
    .select('business_name, twilio_number, timezone')
    .eq('user_id', data.user_id)
    .maybeSingle()

  return {
    ...data,
    business_name: profile?.business_name ?? null,
    business_phone: profile?.twilio_number ?? null,
    business_timezone: profile?.timezone ?? null,
  }
}

function formatDateTime(iso: string, tz: string): { day: string; time: string } {
  const d = new Date(iso)
  return {
    day: d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: tz }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz }),
  }
}

export default async function PublicAppointmentPage({ params }: PageProps) {
  const { token } = await params
  const verified = verifyAppointmentToken(token)

  if (!verified.ok) {
    return <ErrorState reason={verified.reason} />
  }

  const appt = await loadAppointment(verified.appointmentId)
  if (!appt || !appt.scheduled_at) {
    return <ErrorState reason="invalid" />
  }
  if (appt.status === 'cancelled') {
    return <CancelledState businessName={appt.business_name || 'the business'} businessPhone={appt.business_phone || null} />
  }

  const tz = appt.business_timezone || 'America/Chicago'
  const { day, time } = formatDateTime(appt.scheduled_at, tz)
  const endTime = appt.scheduled_end_at
    ? formatDateTime(appt.scheduled_end_at, tz).time
    : null

  const businessLabel = appt.business_name || 'BellAveGo'
  const businessPhone = appt.business_phone
  // SMS prefill — opens the contractor's BellAveGo Twilio number with a
  // pre-typed reschedule request. The AI / contractor handles it from there.
  const smsBody = `Hi! It's ${appt.customer_name || 'me'} — I need to reschedule my ${appt.job_type || 'appointment'} on ${day} at ${time}.`
  const smsHref = businessPhone
    ? `sms:${businessPhone.replace(/\s/g, '')}?body=${encodeURIComponent(smsBody)}`
    : undefined

  const callHref = businessPhone ? `tel:${businessPhone.replace(/\s/g, '')}` : undefined

  // ICS download — Google "add to calendar" URL for any device
  const icsTitle = encodeURIComponent(`${appt.job_type || 'Appointment'} with ${businessLabel}`)
  const icsStart = appt.scheduled_at.replace(/[-:]/g, '').replace(/\.\d{3}/, '').replace('Z', 'Z')
  const icsEnd   = appt.scheduled_end_at?.replace(/[-:]/g, '').replace(/\.\d{3}/, '').replace('Z', 'Z') ?? icsStart
  const icsDetails = encodeURIComponent(`Appointment confirmed with ${businessLabel}. Booked through BellAveGo.`)
  const icsLocation = encodeURIComponent(appt.address || '')
  const googleCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${icsTitle}&dates=${icsStart}/${icsEnd}&details=${icsDetails}&location=${icsLocation}`

  return (
    <main style={{ minHeight: '100dvh', background: 'linear-gradient(180deg, #F5FDFB 0%, #FFFFFF 100%)', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 540, margin: '0 auto', padding: '32px 22px 80px' }}>
        {/* Brand header */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
          <Image src="/brand/bellavego-logo.png" alt="BellAveGo" width={160} height={48} style={{ objectFit: 'contain' }} priority />
        </div>

        {/* Success badge */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '7px 14px', borderRadius: 99,
            background: '#ECFDF5', border: '1.5px solid #6EE7B7',
            fontSize: 12, fontWeight: 900, color: '#065F46',
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981' }} />
            Confirmed
          </span>
        </div>

        <h1 style={{ fontSize: 'clamp(26px, 5.5vw, 34px)', fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.03em', textAlign: 'center', margin: '0 0 8px' }}>
          You&apos;re booked with {businessLabel}.
        </h1>
        <p style={{ fontSize: 15, color: '#4A6670', textAlign: 'center', margin: '0 0 28px', lineHeight: 1.55 }}>
          Hi {appt.customer_name || 'there'} — here are your appointment details.
        </p>

        {/* Detail card */}
        <div style={{
          background: '#fff',
          border: '1.5px solid rgba(10,168,159,0.18)',
          borderRadius: 18,
          padding: '24px 24px',
          boxShadow: '0 12px 36px rgba(7,27,58,0.08)',
        }}>
          <DetailRow icon="🛠️" label="Service" value={appt.job_type || 'Appointment'} />
          <DetailRow icon="📅" label="Date"    value={day} />
          <DetailRow icon="🕐" label="Time"    value={endTime ? `${time} – ${endTime}` : time} />
          {appt.address && <DetailRow icon="📍" label="Address" value={appt.address} />}
          <DetailRow icon="🏢" label="With"    value={businessLabel} />
          {businessPhone && <DetailRow icon="📞" label="Phone" value={formatPhone(businessPhone)} link={callHref} />}
        </div>

        {/* Reschedule CTA */}
        {smsHref && (
          <div style={{
            marginTop: 22,
            padding: '20px 22px',
            background: 'linear-gradient(135deg, #FFF9F0 0%, #FFFFFF 60%)',
            border: '1.5px solid rgba(232,116,43,0.32)',
            borderRadius: 16,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#0B1F3A', marginBottom: 6 }}>
              Need to reschedule or cancel?
            </div>
            <p style={{ fontSize: 13, color: '#7C2D12', margin: '0 0 14px', lineHeight: 1.55 }}>
              No problem — tap below to text {businessLabel}. We&apos;ll get back to you fast.
            </p>
            <a
              href={smsHref}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '13px 24px', borderRadius: 12,
                background: 'linear-gradient(135deg, #FFD9A8 0%, #FF9D5A 50%, #E8742B 100%)',
                color: '#0B1F3A', fontSize: 15, fontWeight: 900,
                textDecoration: 'none',
                boxShadow: '0 10px 26px rgba(232,116,43,0.42)',
              }}
            >
              💬 Text to reschedule
            </a>
          </div>
        )}

        {/* Add-to-calendar */}
        <div style={{ marginTop: 22, textAlign: 'center' }}>
          <a
            href={googleCalUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '11px 20px', borderRadius: 11,
              background: '#fff', border: '1.5px solid rgba(10,168,159,0.22)',
              color: '#0B1F3A', fontSize: 13, fontWeight: 800,
              textDecoration: 'none',
            }}
          >
            📆 Add to my calendar
          </a>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 36, textAlign: 'center', fontSize: 11, color: '#7AAAB2', lineHeight: 1.6 }}>
          Powered by <Link href="/" style={{ color: '#0AA89F', fontWeight: 700, textDecoration: 'none' }}>BellAveGo</Link> — AI receptionist for home-service contractors.
        </div>
      </div>
    </main>
  )
}

// ─── sub-components ──────────────────────────────────────────────────

function DetailRow({ icon, label, value, link }: { icon: string; label: string; value: string; link?: string }) {
  const valueEl = link ? (
    <a href={link} style={{ color: '#0AA89F', textDecoration: 'none', fontWeight: 700 }}>{value}</a>
  ) : (
    <span style={{ color: '#0B1F3A', fontWeight: 700 }}>{value}</span>
  )
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 0',
      borderBottom: '1px solid rgba(10,168,159,0.10)',
    }}>
      <span style={{ fontSize: 20, width: 28, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: '#7AAAB2', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 14 }}>{valueEl}</div>
      </div>
    </div>
  )
}

function ErrorState({ reason }: { reason: 'invalid' | 'expired' | 'tampered' }) {
  const msg = reason === 'expired'
    ? 'This appointment link has expired. Text the business directly to look up your appointment.'
    : 'This appointment link is invalid. If you booked through BellAveGo, text the business directly.'
  return (
    <main style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 22, background: '#F5FDFB', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🔒</div>
        <h1 style={{ fontSize: 20, fontWeight: 900, color: '#0B1F3A', marginBottom: 8 }}>Link not valid</h1>
        <p style={{ fontSize: 14, color: '#4A6670', lineHeight: 1.55 }}>{msg}</p>
      </div>
    </main>
  )
}

function CancelledState({ businessName, businessPhone }: { businessName: string; businessPhone: string | null }) {
  return (
    <main style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 22, background: '#F5FDFB', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🚫</div>
        <h1 style={{ fontSize: 20, fontWeight: 900, color: '#0B1F3A', marginBottom: 8 }}>This appointment was cancelled</h1>
        <p style={{ fontSize: 14, color: '#4A6670', lineHeight: 1.55, marginBottom: 18 }}>
          If you didn&apos;t cancel it, reach out to {businessName} — they may have rescheduled.
        </p>
        {businessPhone && (
          <a
            href={`tel:${businessPhone.replace(/\s/g, '')}`}
            style={{
              display: 'inline-flex', padding: '11px 22px', borderRadius: 11,
              background: '#0AA89F', color: '#fff', fontSize: 14, fontWeight: 800,
              textDecoration: 'none',
            }}
          >
            Call {formatPhone(businessPhone)}
          </a>
        )}
      </div>
    </main>
  )
}

function formatPhone(p: string): string {
  const digits = p.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  return p
}
